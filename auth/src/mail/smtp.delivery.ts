import { Injectable, Logger } from '@nestjs/common';
import { Socket, connect } from 'node:net';
import { MailDelivery, MailMessage, envelopeAddress, formatMessage, mailSender } from './mail-message';

const DEFAULT_SMTP_HOST = 'localhost';
const DEFAULT_SMTP_PORT = 1025;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface SmtpConfig {
  host: string;
  port: number;
  timeoutMs: number;
}

/** SMTP_HOST / SMTP_PORT, defaulting to a Mailpit on this machine. */
export function smtpConfigFromEnv(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST ?? DEFAULT_SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? DEFAULT_SMTP_PORT),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

interface SmtpReply {
  code: number;
}

/** A line starting with "." would end the DATA section early, so SMTP doubles it (RFC 5321 4.5.2). */
export function dotStuff(message: string): string {
  return message
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

/**
 * The first complete reply in `buffer`: its code and the index just past it, or null if it hasn't
 * fully arrived. A reply's final line is "NNN text" (or "NNN"); "NNN-text" lines continue it (RFC 5321 4.2.1).
 */
export function firstReply(buffer: string): { code: number; end: number } | null {
  let lineStart = 0;
  let lineEnd = buffer.indexOf('\r\n', lineStart);
  while (lineEnd >= 0) {
    if (buffer.charAt(lineStart + 3) !== '-') {
      return { code: Number(buffer.slice(lineStart, lineStart + 3)), end: lineEnd + 2 };
    }
    lineStart = lineEnd + 2;
    lineEnd = buffer.indexOf('\r\n', lineStart);
  }
  return null;
}

/** One SMTP conversation over a plain TCP socket: write a command, await the reply. */
class SmtpSession {
  private buffer = '';
  private readonly replies: SmtpReply[] = [];
  private waiter: { resolve: (reply: SmtpReply) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.receive(chunk));
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('timeout', () => this.fail(new Error('SMTP server did not answer in time.')));
    socket.on('close', () => this.fail(new Error('SMTP connection closed.')));
  }

  /** Waits for a reply with one of the expected codes, e.g. the 220 greeting. */
  async expect(...codes: number[]): Promise<void> {
    const reply = await this.nextReply();
    if (!codes.includes(reply.code)) {
      throw new Error(`SMTP server replied ${reply.code}, expected ${codes.join(' or ')}.`);
    }
  }

  async command(line: string, ...codes: number[]): Promise<void> {
    this.socket.write(`${line}\r\n`);
    await this.expect(...codes);
  }

  close(): void {
    this.socket.destroy();
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let reply = firstReply(this.buffer);
    while (reply) {
      this.deliver({ code: reply.code });
      this.buffer = this.buffer.slice(reply.end);
      reply = firstReply(this.buffer);
    }
  }

  private deliver(reply: SmtpReply): void {
    const waiter = this.waiter;
    this.waiter = null;
    if (waiter) {
      waiter.resolve(reply);
    } else {
      this.replies.push(reply);
    }
  }

  private fail(error: Error): void {
    this.failure ??= error;
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(this.failure);
  }

  private nextReply(): Promise<SmtpReply> {
    const queued = this.replies.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }
}

function openSocket(config: SmtpConfig): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: config.host, port: config.port });
    socket.setTimeout(config.timeoutMs);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out.'));
    });
  });
}

/**
 * MAIL_DELIVERY=smtp, for dev laptops: hands each email to an SMTP server, normally Mailpit
 * (inbox at http://localhost:8025). Plain SMTP without TLS or login, which is all Mailpit needs;
 * not meant for a real mail provider. Written on node:net so the VM build needs no new package.
 */
@Injectable()
export class SmtpDelivery implements MailDelivery {
  private readonly logger = new Logger(SmtpDelivery.name);

  constructor(private readonly config: SmtpConfig = smtpConfigFromEnv()) {}

  async send(message: MailMessage): Promise<void> {
    const from = mailSender();
    const content = formatMessage(message, from);
    const session = new SmtpSession(await openSocket(this.config));
    try {
      await session.expect(220);
      await session.command('EHLO nexttrade.local', 250);
      await session.command(`MAIL FROM:<${envelopeAddress(from)}>`, 250);
      await session.command(`RCPT TO:<${message.to}>`, 250, 251);
      await session.command('DATA', 354);
      await session.command(`${dotStuff(content)}\r\n.`, 250);
      await session.command('QUIT', 221);
      this.logger.log(`Email handed to SMTP server ${this.config.host}:${this.config.port}`);
    } finally {
      session.close();
    }
  }
}
