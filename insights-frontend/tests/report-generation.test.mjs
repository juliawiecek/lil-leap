import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
const { App } = await import('../src/app/app.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const {
  REPORT_FILES, MAX_REPORT_DAYS, attachmentFilename, reportFailureMessage, reportRangeError, utcDate,
} = await import('../src/app/live-reports.ts');

const csv = 'instrument_symbol,trade_count\nAAPL,7\nJPM,4\n';
const october = { startDate: '2026-10-01', endDate: '2026-10-16' };
const kinds = ['instrument-report', 'client-segment-report', 'trading-activity-report'];

function fakeReports(result = csv) {
  const calls = [];
  const service = {
    generate: async (kind, range) => {
      calls.push({ kind, range });
      if (result instanceof Error) throw result;
      return { filename: `${kind}_${range.startDate}_${range.endDate}.csv`, csv: result };
    },
  };
  return { calls, service };
}

function app(t, reports) {
  const instance = component(t, App, reports ? [{ provide: REPORT_FILES, useValue: reports.service }] : []);
  const download = t.mock.method(instance, 'download', () => {});
  return { instance, download };
}

test('report ranges must have both dates, be ordered, real, and at most a year long', () => {
  assert.match(reportRangeError('', '2026-10-16'), /Select both a start date and an end date/);
  assert.match(reportRangeError('2026-10-01', ''), /Select both/);
  assert.match(reportRangeError('2026-02-30', '2026-03-01'), /valid start and end dates/);
  assert.match(reportRangeError('10/01/2026', '2026-10-16'), /valid start and end dates/);
  assert.match(reportRangeError('2026-10-16', '2026-10-01'), /on or before the end date/);
  assert.equal(reportRangeError('2026-10-16', '2026-10-16'), '');
  assert.equal(reportRangeError('2025-01-01', '2026-01-01'), '', `${MAX_REPORT_DAYS} days inclusive is allowed`);
  assert.match(reportRangeError('2025-01-01', '2026-01-02'), /at most 366 days/);
});

test('UTC dates do not shift with the local time zone', () => {
  const lateEvening = new Date('2026-10-19T23:30:00-05:00');
  assert.equal(utcDate(lateEvening), '2026-10-20');
  assert.equal(utcDate(lateEvening, 29), '2026-09-21');
});

test('the reports page always starts with a valid 30-day range ending today', t => {
  const { instance } = app(t);
  assert.equal(instance.reportEnd(), utcDate());
  assert.equal(instance.reportStart(), utcDate(new Date(), 29));
  assert.equal(instance.reportDateError(), '');
});

for (const [index, kind] of kinds.entries()) {
  test(`${kind} is requested with the selected range and downloaded with the server filename`, async t => {
    const reports = fakeReports();
    const { instance, download } = app(t, reports);
    instance.reportStart.set(october.startDate); instance.reportEnd.set(october.endDate);
    const entry = instance.reportCatalog[index];
    assert.equal(entry.kind, kind);
    await instance.generateReport(entry);
    assert.deepEqual(reports.calls, [{ kind, range: october }]);
    const report = instance.exports()[0];
    assert.equal(report.name, entry.name);
    assert.equal(report.rows, 2);
    assert.equal(report.csv, csv);
    assert.equal(report.filename, `${kind}_2026-10-01_2026-10-16.csv`);
    assert.equal(report.period, '2026-10-01 – 2026-10-16');
    assert.equal(download.mock.callCount(), 1);
    assert.equal(download.mock.calls[0].arguments[0], report);
    assert.match(instance.notice(), new RegExp(`${entry.name} generated for 2026-10-01`));
    assert.equal(instance.generating(), null);
  });
}

test('missing or inverted dates never reach the report service', async t => {
  const reports = fakeReports();
  const { instance, download } = app(t, reports);
  for (const [start, end] of [['', '2026-10-16'], ['2026-10-01', ''], ['2026-10-16', '2026-10-01']]) {
    instance.reportStart.set(start); instance.reportEnd.set(end);
    await instance.generateReport(instance.reportCatalog[0]);
    assert.equal(instance.notice(), instance.reportDateError());
    assert.notEqual(instance.notice(), '');
  }
  assert.deepEqual(reports.calls, []);
  assert.deepEqual(instance.exports(), []);
  assert.equal(download.mock.callCount(), 0);
});

test('an empty period still downloads the header-only CSV and says no trades matched', async t => {
  const { instance, download } = app(t, fakeReports('instrument_symbol,trade_count\n'));
  await instance.generateReport(instance.reportCatalog[0]);
  assert.equal(instance.exports()[0].rows, 0);
  assert.equal(download.mock.callCount(), 1);
  assert.match(instance.notice(), /no trades were executed between/);
});

for (const [status, message] of [
  [400, /rejected the selected dates/], [401, /session has expired/], [403, /not permitted/],
  [500, /could not be generated/], [undefined, /could not be generated/],
]) {
  test(`a ${status ?? 'network'} failure shows a fixed message and records nothing`, async t => {
    const failure = Object.assign(new Error('password=do-not-display'), { status });
    const { instance, download } = app(t, fakeReports(failure));
    await instance.generateReport(instance.reportCatalog[2]);
    assert.match(instance.notice(), message);
    assert.equal(instance.notice().includes('do-not-display'), false);
    assert.deepEqual(instance.exports(), []);
    assert.equal(download.mock.callCount(), 0);
    assert.equal(instance.generating(), null);
  });
}

test('report generation is single-flight and ignores responses after teardown', async t => {
  let finish;
  const calls = [];
  const service = { generate: (kind) => { calls.push(kind); return new Promise(resolve => { finish = resolve; }); } };
  const { instance, download } = app(t, { service });
  const first = instance.generateReport(instance.reportCatalog[0]);
  assert.equal(instance.generating(), 'instrument-report');
  await instance.generateReport(instance.reportCatalog[1]);
  assert.deepEqual(calls, ['instrument-report']);
  instance.ngOnDestroy();
  finish({ filename: 'late.csv', csv });
  await first;
  assert.deepEqual(instance.exports(), []);
  assert.equal(download.mock.callCount(), 0);
});

test('without a report service the page explains that generation is unavailable', async t => {
  const { instance } = app(t);
  await instance.generateReport(instance.reportCatalog[0]);
  assert.match(instance.notice(), /unavailable/);
});

test('the rendered reports page requires both dates before any report can be generated', async t => {
  const reports = fakeReports();
  const fixture = await render(t, App, {}, [
    { provide: AuthService, useValue: { userRole: 'ANALYST', email: 'analyst@nexttrade.local' } },
    { provide: REPORT_FILES, useValue: reports.service },
  ]);
  const instance = fixture.componentInstance;
  t.mock.method(instance, 'download', () => {});
  instance.navigate('Reports'); fixture.detectChanges();
  await fixture.whenStable(); fixture.detectChanges();
  const host = fixture.nativeElement;
  const buttons = () => kinds.map(kind => host.querySelector(`[data-testid="generate-${kind}"]`));

  assert.equal(host.querySelectorAll('.report-card').length, 3);
  assert.equal(host.querySelector('.date-range'), null, 'the dashboard date filter is replaced by the report period');
  for (const id of ['report-start', 'report-end']) {
    const field = host.querySelector(`[data-testid="${id}"]`);
    assert.equal(field.required, true);
    assert.equal(field.type, 'date');
  }
  assert.equal(host.querySelector('[data-testid="report-start"]').value, instance.reportStart());
  assert.ok(buttons().every(b => !b.disabled));
  assert.equal(host.querySelector('[data-testid="report-date-error"]'), null);

  input(fixture, '[data-testid="report-start"]', '');
  assert.equal(instance.reportStart(), '');
  assert.match(host.querySelector('[data-testid="report-date-error"]').textContent, /Select both/);
  assert.ok(buttons().every(b => b.disabled));
  assert.equal(host.querySelector('[data-testid="report-end"]').getAttribute('aria-invalid'), 'true');

  input(fixture, '[data-testid="report-start"]', '2026-10-01');
  input(fixture, '[data-testid="report-end"]', '2026-10-16');
  assert.equal(host.querySelector('[data-testid="report-date-error"]'), null);
  buttons()[2].click();
  await new Promise(resolve => setImmediate(resolve)); fixture.detectChanges();
  assert.deepEqual(reports.calls, [{ kind: 'trading-activity-report', range: october }]);
  assert.match(host.textContent, /Trading Activity Report/);
  assert.match(host.textContent, /2026-10-01 – 2026-10-16/);
});

test('the configured report provider GETs CSV text with both dates and keeps the server filename', async t => {
  const { createEnvironmentInjector, Injector, runInInjectionContext } = await import('@angular/core');
  const { HttpClient, HttpHeaders, HttpResponse } = await import('@angular/common/http');
  const { of } = await import('rxjs');
  const { appConfig } = await import('../src/app/app.config.ts');
  const requests = [];
  let disposition = 'attachment; filename="instrument-report_2026-10-01_2026-10-16.csv"';
  const http = { get: (url, options) => {
    requests.push({ url, options });
    return of(new HttpResponse({ body: csv, headers: new HttpHeaders(disposition ? { 'Content-Disposition': disposition } : {}) }));
  } };
  const injector = createEnvironmentInjector([{ provide: HttpClient, useValue: http }], Injector.NULL);
  t.after(() => injector.destroy());
  const provider = appConfig.providers.find(item => item.provide === REPORT_FILES);
  const files = runInInjectionContext(injector, () => provider.useFactory());

  assert.deepEqual(await files.generate('instrument-report', october),
    { filename: 'instrument-report_2026-10-01_2026-10-16.csv', csv });
  assert.deepEqual(requests[0], {
    url: '/api/v1/reports/generate/instrument-report',
    options: { params: october, responseType: 'text', observe: 'response' },
  });
  disposition = null;
  assert.equal((await files.generate('client-segment-report', october)).filename,
    'client-segment-report_2026-10-01_2026-10-16.csv');
});

test('attachment filenames prefer the encoded form and fall back safely', () => {
  assert.equal(attachmentFilename(`attachment; filename="a.csv"; filename*=UTF-8''b%20c.csv`, 'x.csv'), 'b c.csv');
  assert.equal(attachmentFilename('attachment; filename=plain.csv', 'x.csv'), 'plain.csv');
  assert.equal(attachmentFilename(`attachment; filename*=UTF-8''%E0%A4%A`, 'x.csv'), 'x.csv');
  assert.equal(attachmentFilename(null, 'x.csv'), 'x.csv');
  assert.equal(reportFailureMessage(null), 'The report could not be generated. Please try again.');
});
