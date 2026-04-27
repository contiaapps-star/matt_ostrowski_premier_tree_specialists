import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as appConfig, type Config } from '../config.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { logger } from '../lib/logger.js';

export interface EmailSendParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailClient {
  send(params: EmailSendParams): Promise<EmailSendResult>;
}

export class SendGridAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendGridAuthError';
  }
}

export class SendGridRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SendGridRequestError';
    this.status = status;
  }
}

interface LiveOptions {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export class SendGridLiveClient implements EmailClient {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: LiveOptions) {
    this.apiKey = opts.apiKey;
    this.fromAddress = opts.fromAddress;
    this.fromName = opts.fromName;
    this.baseUrl = (opts.baseUrl ?? 'https://api.sendgrid.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? [1_000, 5_000, 30_000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!this.apiKey) {
      throw new SendGridAuthError('SENDGRID_API_KEY is empty; cannot call live client');
    }
    const body = {
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: this.fromAddress, name: this.fromName },
      subject: params.subject,
      content: [
        { type: 'text/plain', value: params.text },
        { type: 'text/html', value: params.html },
      ],
    };

    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await this.callOnce(body);
      } catch (err) {
        lastErr = err;
        if (err instanceof SendGridAuthError) throw err;
        if (
          err instanceof SendGridRequestError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 429
        ) {
          throw err;
        }
        if (attempt === this.maxAttempts - 1) break;
        const wait = this.backoffMs[attempt] ?? this.backoffMs[this.backoffMs.length - 1] ?? 1_000;
        logger.warn({ attempt: attempt + 1, wait, err }, 'sendgrid retrying');
        await this.sleep(wait);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('sendgrid send failed');
  }

  private async callOnce(body: Record<string, unknown>): Promise<EmailSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v3/mail/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      const text = await safeReadText(res);
      throw new SendGridAuthError(`sendgrid auth failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new SendGridRequestError(res.status, `sendgrid http ${res.status}: ${text}`);
    }
    const messageId = res.headers.get('x-message-id') ?? `sg_${generateUuidV7()}`;
    return { providerMessageId: messageId };
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

interface StubOptions {
  outFile?: string;
  inMemory?: boolean;
}

interface StubRecord {
  providerMessageId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: string;
}

export class SendGridStubClient implements EmailClient {
  private readonly outFile: string | null;
  private readonly memory: StubRecord[] = [];

  constructor(opts: StubOptions = {}) {
    if (opts.inMemory === true) {
      this.outFile = null;
    } else {
      this.outFile = opts.outFile ?? resolve(process.cwd(), 'tmp', 'stub-emails.jsonl');
    }
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const id = `stub_${generateUuidV7()}`;
    const record: StubRecord = {
      providerMessageId: id,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      sentAt: new Date().toISOString(),
    };
    this.memory.push(record);
    if (this.outFile) {
      try {
        mkdirSync(dirname(this.outFile), { recursive: true });
        appendFileSync(this.outFile, `${JSON.stringify(record)}\n`, 'utf-8');
      } catch (err) {
        logger.warn({ err }, 'sendgrid stub failed to write jsonl');
      }
    }
    return { providerMessageId: id };
  }

  getRecords(): StubRecord[] {
    return [...this.memory];
  }
}

export function createEmailClient(cfg: Config = appConfig): EmailClient {
  if (cfg.INTEGRATION_MODE === 'stub') {
    return new SendGridStubClient();
  }
  return new SendGridLiveClient({
    apiKey: cfg.SENDGRID_API_KEY,
    fromAddress: cfg.EMAIL_FROM_ADDRESS,
    fromName: cfg.EMAIL_FROM_NAME,
  });
}
