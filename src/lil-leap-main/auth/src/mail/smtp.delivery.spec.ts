import { Logger } from '@nestjs/common';
import { AddressInfo, Server, Socket, createServer } from 'node:net';
import { SmtpDelivery, dotStuff, firstReply, smtpConfigFromEnv } from './smtp.delivery';

const DEFAULT_REPLIES: Record<string, string> = {
  EHLO: '250-fake.local greets you\r\n250 8BITMIME',
  MAIL: '250 sender ok',
  RCPT: '250 recipient ok',
  DATA: '354 end data with <CR><LF>.<CR><LF>',
  QUIT: '221 bye',
};

/** A minimal SMTP server on a local port that records what it was sent, like Mailpit would. */
class FakeSmtpServer {
  readonly commands: string[] = [];
  data = '';
  private readonly server: Server;
  private buffer = '';
  private inData = false;

  /** A reply of HANGUP closes the connection instead; greet=false never says hello (a hung server). */
  constructor(
    private readonly replies: Record<string, string> = {},
    private readonly greet = true,
  ) {
    this.server = createServer((socket) => this.accept(socket));
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return (this.server.address() as AddressInfo).port;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private accept(socket: Socket): void {
    socket.setEncoding('utf8');
    if (this.greet) {
      socket.write('220 fake.local ESMTP\r\n');
    }
    socket.on('data', (chunk: string) => this.receive(socket, chunk));
  }

  private receive(socket: Socket, chunk: string): void {
    this.buffer += chunk;
    if (this.inData) {
      this.receiveData(socket);
      return;
    }
    let lineEnd = this.buffer.indexOf('\r\n');
    while (lineEnd >= 0 && !this.inData) {
      this.answer(socket, this.buffer.slice(0, lineEnd));
      this.buffer = this.buffer.slice(lineEnd + 2);
      lineEnd = this.buffer.indexOf('\r\n');
    }
  }

  private receiveData(socket: Socket): void {
    const end = this.buffer.indexOf('\r\n.\r\n');
    if (end < 0) {
      return;
    }
    this.data = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + 5);
    this.inData = false;
    socket.write('250 queued\r\n');
  }

  private answer(socket: Socket, line: string): void {
    this.commands.push(line);
    const verb = line.split(/[ :]/)[0].toUpperCase();
    this.inData = verb === 'DATA';
    if (this.replies[verb] === 'HANGUP') {
      socket.destroy();
      return;
    }
    socket.write(`${this.replies[verb] ?? DEFAULT_REPLIES[verb] ?? '502 unknown'}\r\n`);
    if (verb === 'QUIT') {
      socket.end();
    }
  }
}

const message = { to: 'trader@example.com', subject: 'Reset your NextTrade password', body: 'Hello\n.hidden line\nBye' };

describe('SmtpDelivery', () => {
  let server: FakeSmtpServer;

  afterEach(async () => {
    delete process.env.MAIL_FROM;
    await server?.stop();
  });

  const deliveryFor = async (replies: Record<string, string> = {}) => {
    server = new FakeSmtpServer(replies);
    const port = await server.start();
    return new SmtpDelivery({ host: '127.0.0.1', port, timeoutMs: 2000 });
  };

  it('walks the SMTP conversation and hands over the whole message', async () => {
    const delivery = await deliveryFor();

    await delivery.send(message);

    expect(server.commands).toEqual([
      'EHLO nexttrade.local',
      'MAIL FROM:<no-reply@nexttrade.local>',
      'RCPT TO:<trader@example.com>',
      'DATA',
      'QUIT',
    ]);
    expect(server.data).toContain('To: trader@example.com\r\n');
    expect(server.data).toContain('Subject: Reset your NextTrade password\r\n');
    expect(server.data).toContain('\r\nHello\r\n');
  });

  it('dot-stuffs body lines that start with a full stop, so they cannot end the message early', async () => {
    const delivery = await deliveryFor();

    await delivery.send(message);

    expect(server.data).toContain('\r\n..hidden line\r\n');
  });

  it('uses MAIL_FROM as the envelope sender', async () => {
    process.env.MAIL_FROM = 'Demo Desk <desk@nexttrade.test>';
    const delivery = await deliveryFor();

    await delivery.send(message);

    expect(server.commands).toContain('MAIL FROM:<desk@nexttrade.test>');
    expect(server.data).toContain('From: Demo Desk <desk@nexttrade.test>\r\n');
  });

  it('fails when the server rejects the recipient, and sends no message', async () => {
    const delivery = await deliveryFor({ RCPT: '550 no such user' });

    await expect(delivery.send(message)).rejects.toThrow('SMTP server replied 550, expected 250 or 251.');
    expect(server.commands).not.toContain('DATA');
  });

  it('fails, rather than hanging, when the server never answers', async () => {
    server = new FakeSmtpServer({}, false);
    const port = await server.start();

    await expect(new SmtpDelivery({ host: '127.0.0.1', port, timeoutMs: 200 }).send(message)).rejects.toThrow(
      'SMTP server did not answer in time.',
    );
  });

  it('fails when the server hangs up mid-conversation', async () => {
    const delivery = await deliveryFor({ MAIL: 'HANGUP' });

    await expect(delivery.send(message)).rejects.toThrow('SMTP connection closed.');
  });

  it('fails when nothing is listening on the SMTP port', async () => {
    server = new FakeSmtpServer();
    const port = await server.start();
    await server.stop();

    await expect(new SmtpDelivery({ host: '127.0.0.1', port, timeoutMs: 2000 }).send(message)).rejects.toThrow();
  });

  it('logs where the email went but not its content', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockReturnValue(undefined);
    const delivery = await deliveryFor();

    await delivery.send(message);

    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('127.0.0.1');
    expect(logged).not.toContain('trader@example.com');
    log.mockRestore();
  });
});

describe('SMTP helpers', () => {
  it('firstReply waits for the final line of a multi-line reply', () => {
    expect(firstReply('250-first\r\n250-second\r\n')).toBeNull();
    expect(firstReply('250-first\r\n250 last\r\nleftover')).toEqual({ code: 250, end: 21 });
    expect(firstReply('221\r\n')).toEqual({ code: 221, end: 5 });
    expect(firstReply('220 partial')).toBeNull();
  });

  it('dotStuff doubles a leading full stop and leaves other lines alone', () => {
    expect(dotStuff('a\r\n.b\r\nc.d')).toBe('a\r\n..b\r\nc.d');
  });

  it('reads SMTP_HOST and SMTP_PORT, defaulting to a local Mailpit', () => {
    expect(smtpConfigFromEnv()).toEqual({ host: 'localhost', port: 1025, timeoutMs: 10_000 });

    process.env.SMTP_HOST = 'mailpit';
    process.env.SMTP_PORT = '2525';
    expect(smtpConfigFromEnv()).toMatchObject({ host: 'mailpit', port: 2525 });
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
  });
});
