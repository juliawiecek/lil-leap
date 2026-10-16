import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clients, trades, filterTrades, summarize, buckets, csvCell, activityFor } from '../src/app/insights-data.ts';
const filters={start:'2026-09-01',end:'2026-09-22',asset:'All',market:'All',segment:'All'};
test('volume excludes nonfilled orders and reconciles across asset classes and chart groupings',()=>{
 const rows=filterTrades(trades,filters), total=summarize(rows);
 assert.ok(rows.length>0); assert.ok(rows.some(t=>t.status!=='Filled'));
 assert.equal(total.volume,rows.filter(t=>t.status==='Filled').reduce((sum,t)=>sum+t.quantity*t.price,0));
 for(const cadence of ['Daily','Weekly','Monthly','Yearly']) assert.ok(Math.abs(buckets(rows,cadence).reduce((s,b)=>s+b.value,0)-total.volume)<.001);
 const classes=['Equities','FX','Crypto'].reduce((s,asset)=>s+summarize(filterTrades(trades,{...filters,asset})).volume,0);
 assert.ok(Math.abs(classes-total.volume)<.001);
});
test('filters intersect and include the end date; empty data produces finite zero metrics',()=>{
 const rows=filterTrades(trades,{...filters,asset:'Equities',market:'US',segment:'Under $10K'});
 assert.ok(rows.length>0);
 for(const t of rows){assert.equal(t.asset,'Equities');assert.equal(t.market,'US');assert.equal(clients.find(c=>c.id===t.clientId).segment,'Under $10K');}
 assert.ok(filterTrades(trades,{...filters,start:'2026-09-22',end:'2026-09-22'}).length>0);
 const empty=filterTrades(trades,{...filters,start:'2027-01-01',end:'2027-01-31'});
 assert.deepEqual(summarize(empty),{volume:0,orders:0,fills:0,active:0,average:0});
});
test('sample orders have unique identifiers and cannot precede client registration',()=>{
 assert.equal(new Set(trades.map(t=>t.id)).size,trades.length);
 for(const t of trades)assert.ok(t.submitted.slice(0,10)>=clients.find(c=>c.id===t.clientId).joined);
});
test('CSV escapes quotes, commas, newlines and spreadsheet formulas',()=>{
 assert.equal(csvCell('a,"b"\nc'),'"a,""b""\nc"');
 assert.equal(csvCell('=1+1'),'"\'=1+1"');
 assert.equal(csvCell('@SUM(A1)'),'"\'@SUM(A1)"');
});


test('CSV handles absent, structured and scalar values', () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell({ amount: 3 }), '"{""amount"":3}"');
  assert.equal(csvCell(42), '"42"');
  assert.equal(csvCell(false), '"false"');
});

test('segment filtering excludes trades whose client is unknown', () => {
  const row = { ...trades[0], clientId: 'unknown', submitted: '2026-09-10T12:00:00Z' };
  assert.deepEqual(filterTrades([row], { ...filters, segment: 'Under $10K' }), []);
  assert.deepEqual(filterTrades([row], filters), [row]);
});

test('client activity distinguishes recent, past and absent fills', () => {
  const fill = trades.find(row => row.status === 'Filled');
  const date = fill.submitted.slice(0, 10);
  assert.equal(activityFor(fill.clientId, date, date), 'Active');
  assert.equal(activityFor(fill.clientId, '2027-01-01', '2027-01-31'), 'Occasional');
  assert.equal(activityFor('unknown', date, date), 'Dormant');
});
