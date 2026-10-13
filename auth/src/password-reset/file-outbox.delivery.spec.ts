import { Logger } from '@nestjs/common';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { FileOutboxDelivery, buildMessage, outboxDirectory } from './file-outbox.delivery';

jest.mock('node:fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn() }));

const resetLink = 'http://localhost:4200/reset-password?token=sample-link-value';

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

  it('writes one owner-only .eml file per reset into the outbox folder', async () => {
    await new FileOutboxDelivery().send('trader@example.com', resetLink);

    expect(mkdirMock).toHaveBeenCalledWith(resolve('test-outbox'), { recursive: true });
    const [filePath, content, options] = writeFileMock.mock.calls[0];
    expect(filePath.startsWith(join(resolve('test-outbox'), ''))).toBe(true);
    expect(filePath).toMatch(/\.eml$/);
    expect(content).toContain('To: trader@example.com\r\n');
    expect(content).toContain(resetLink);
    expect(options).toEqual({ mode: 0o600, flag: 'wx' });
  });

  it('logs the file name but never the link', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockReturnValue(undefined);

    await new FileOutboxDelivery().send('trader@example.com', resetLink);

    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('.eml');
    expect(logged).not.toContain('sample-link-value');
    log.mockRestore();
  });

  it('refuses an address containing a line break, so no extra headers can be injected', async () => {
    await expect(new FileOutboxDelivery().send('a@example.com\r\nBcc: b@example.com', resetLink)).rejects.toThrow(/line break/);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('defaults the outbox to ./outbox', () => {
    delete process.env.PASSWORD_RESET_OUTBOX_DIR;

    expect(outboxDirectory()).toBe(resolve('outbox'));
  });
});

describe('buildMessage', () => {
  it('addresses the user and includes the link and its 20-minute expiry', () => {
    const message = buildMessage('trader@example.com', resetLink);

    expect(message).toContain('To: trader@example.com\r\n');
    expect(message).toContain('Subject: Reset your NextTrade password\r\n');
    expect(message).toContain(`\r\n${resetLink}\r\n`);
    expect(message).toContain('expires in 20 minutes');
  });
});
