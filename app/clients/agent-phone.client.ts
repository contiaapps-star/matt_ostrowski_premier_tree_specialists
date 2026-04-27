import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as appConfig, type Config } from '../config.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { logger } from '../lib/logger.js';

export interface SmsSendParams {
  to: string;
  body: string;
  useImessage?: boolean;
}

export interface SmsSendResult {
  providerMessageId: string;
  channelUsed: 'sms' | 'imessage';
}

export interface SmsClient {
  send(params: SmsSendParams): Promise<SmsSendResult>;
}

export class SmsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsAuthError';
  }
}

export class SmsRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SmsRequestError';
    this.status = status;
  }
}

interface AgentPhoneOptions {
  apiKey: string;
  fromNumber: string;
  enableImessage: boolean;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export class AgentPhoneLiveClient implements SmsClient {
  private readonly apiKey: string;
  private readonly fromNumber: string;
  private readonly enableImessage: boolean;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: AgentPhoneOptions) {
    this.apiKey = opts.apiKey;
    this.fromNumber = opts.fromNumber;
    this.enableImessage = opts.enableImessage;
    this.baseUrl = (opts.baseUrl ?? 'https://api.agentphone.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? [1_000, 5_000, 30_000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    if (!this.apiKey) {
      throw new SmsAuthError('AGENT_PHONE_API_KEY is empty; cannot call live client');
    }
    const channel: 'sms' | 'imessage' =
      this.enableImessage && params.useImessage !== false ? 'imessage' : 'sms';
    const body = {
      from: this.fromNumber,
      to: params.to,
      message: params.body,
      channel,
    };

    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await this.callOnce(body, channel);
      } catch (err) {
        lastErr = err;
        if (err instanceof SmsAuthError) throw err;
        if (
          err instanceof SmsRequestError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 429
        ) {
          throw err;
        }
        if (attempt === this.maxAttempts - 1) break;
        const wait = this.backoffMs[attempt] ?? this.backoffMs[this.backoffMs.length - 1] ?? 1_000;
        logger.warn({ attempt: attempt + 1, wait, err }, 'agent-phone retrying');
        await this.sleep(wait);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('agent-phone send failed');
  }

  private async callOnce(
    body: Record<string, unknown>,
    channel: 'sms' | 'imessage',
  ): Promise<SmsSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
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
      throw new SmsAuthError(`agent-phone auth failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new SmsRequestError(res.status, `agent-phone http ${res.status}: ${text}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
    const id = json.id ?? json.messageId ?? `ap_${generateUuidV7()}`;
    return { providerMessageId: id, channelUsed: channel };
  }
}

interface TwilioOptions {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export class TwilioLiveClient implements SmsClient {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: TwilioOptions) {
    this.accountSid = opts.accountSid;
    this.authToken = opts.authToken;
    this.fromNumber = opts.fromNumber;
    this.baseUrl = (opts.baseUrl ?? 'https://api.twilio.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? [1_000, 5_000, 30_000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    if (!this.accountSid || !this.authToken) {
      throw new SmsAuthError('TWILIO credentials missing');
    }
    const formBody = new URLSearchParams({
      From: this.fromNumber,
      To: params.to,
      Body: params.body,
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await this.callOnce(formBody);
      } catch (err) {
        lastErr = err;
        if (err instanceof SmsAuthError) throw err;
        if (
          err instanceof SmsRequestError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 429
        ) {
          throw err;
        }
        if (attempt === this.maxAttempts - 1) break;
        const wait = this.backoffMs[attempt] ?? this.backoffMs[this.backoffMs.length - 1] ?? 1_000;
        logger.warn({ attempt: attempt + 1, wait, err }, 'twilio retrying');
        await this.sleep(wait);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('twilio send failed');
  }

  private async callOnce(formBody: URLSearchParams): Promise<SmsSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.baseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody.toString(),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      const text = await safeReadText(res);
      throw new SmsAuthError(`twilio auth failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new SmsRequestError(res.status, `twilio http ${res.status}: ${text}`);
    }
    const json = (await res.json().catch(() => ({}))) as { sid?: string };
    const id = json.sid ?? `tw_${generateUuidV7()}`;
    return { providerMessageId: id, channelUsed: 'sms' };
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

interface SmsStubOptions {
  outFile?: string;
  inMemory?: boolean;
  enableImessage?: boolean;
}

interface SmsStubRecord {
  providerMessageId: string;
  to: string;
  body: string;
  channel: 'sms' | 'imessage';
  sentAt: string;
}

export class SmsStubClient implements SmsClient {
  private readonly outFile: string | null;
  private readonly enableImessage: boolean;
  private readonly memory: SmsStubRecord[] = [];

  constructor(opts: SmsStubOptions = {}) {
    if (opts.inMemory === true) {
      this.outFile = null;
    } else {
      this.outFile = opts.outFile ?? resolve(process.cwd(), 'tmp', 'stub-sms.jsonl');
    }
    this.enableImessage = opts.enableImessage ?? true;
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const channel: 'sms' | 'imessage' =
      this.enableImessage && params.useImessage !== false ? 'imessage' : 'sms';
    const id = `stub_${generateUuidV7()}`;
    const record: SmsStubRecord = {
      providerMessageId: id,
      to: params.to,
      body: params.body,
      channel,
      sentAt: new Date().toISOString(),
    };
    this.memory.push(record);
    if (this.outFile) {
      try {
        mkdirSync(dirname(this.outFile), { recursive: true });
        appendFileSync(this.outFile, `${JSON.stringify(record)}\n`, 'utf-8');
      } catch (err) {
        logger.warn({ err }, 'sms stub failed to write jsonl');
      }
    }
    return { providerMessageId: id, channelUsed: channel };
  }

  getRecords(): SmsStubRecord[] {
    return [...this.memory];
  }
}

export function createSmsClient(cfg: Config = appConfig): SmsClient {
  if (cfg.INTEGRATION_MODE === 'stub') {
    return new SmsStubClient({ enableImessage: cfg.ENABLE_IMESSAGE });
  }
  if (cfg.SMS_PROVIDER === 'twilio') {
    return new TwilioLiveClient({
      accountSid: cfg.AGENT_PHONE_API_KEY,
      authToken: cfg.AGENT_PHONE_API_KEY,
      fromNumber: cfg.AGENT_PHONE_NUMBER,
    });
  }
  return new AgentPhoneLiveClient({
    apiKey: cfg.AGENT_PHONE_API_KEY,
    fromNumber: cfg.AGENT_PHONE_NUMBER,
    enableImessage: cfg.ENABLE_IMESSAGE,
  });
}
