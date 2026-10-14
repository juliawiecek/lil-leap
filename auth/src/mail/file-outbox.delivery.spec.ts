import { Logger } from '@nestjs/common';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { FileOutboxDelivery, outboxDirectory } from './file-outbox.delivery';

jest.mock('node:fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn() }));

const message = {
  to: 'trader@example.com',
  subject: 'Reset your NextTrade password',
  body: 'Open http://localhost:4200/reset-password?token=sample-link-value',
};

describe('FileOutboxDelivery', () => {
  const mkdirMock = mkdir as jest.Mock;
  const writeFileMock = writeFile as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PASSWORD_RESET_OUTBOX_DIR = 'test-outbox';
  });

  afterAll(() => {
    delete process.env.PASSWORD_RESET_OUTBOX_DIR;
  });

  it('writes one owner-only .eml file per email with the right recipient and subject', async () => {
    await new FileOutboxDelivery().send(message);

    expect(mkdirMock).toHaveBeenCalledWith(resolve('test-outbox'), { recursive: true });
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [filePath, content, options] = writeFileMock.mock.calls[0];
    expect(filePath.startsWith(join(resolve('test-outbox'), ''))).toBe(true);
    expect(filePath).toMatch(/\.eml$/);
    expect(content).toContain('To: trader@example.com\r\n');
    expect(content).toContain('Subject: Reset your NextTrade password\r\n');
    expect(content).toContain('sample-link-value');
    expect(options).toEqual({ mode: 0o600, flag: 'wx' });
  });

  it('logs the file name but never the content', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockReturnValue(undefined);

    await new FileOutboxDelivery().send(message);

    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('.eml');
    expect(logged).not.toContain('sample-link-value');
    log.mockRestore();
  });

  it('refuses a recipient containing a line break, so no extra headers can be injected', async () => {
    await expect(new FileOutboxDelivery().send({ ...message, to: 'a@example.com\r\nBcc: b@example.com' })).rejects.toThrow(
      /line break/,
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('defaults the outbox to ./outbox', () => {
    delete process.env.PASSWORD_RESET_OUTBOX_DIR;

    expect(outboxDirectory()).toBe(resolve('outbox'));
  });
});
