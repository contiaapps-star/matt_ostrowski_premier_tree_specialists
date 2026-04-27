import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as appConfig, type Config } from '../config.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { logger } from '../lib/logger.js';

export interface ArboStarLeadPayload {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal: string;
  country: string;
  details: string;
  address_notes: string;
}

export interface ArboStarCreateResult {
  requestId: string;
}

export interface ArboStarClient {
  createRequest(params: ArboStarLeadPayload): Promise<ArboStarCreateResult>;
}

export class ArboStarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArboStarAuthError';
  }
}

export class ArboStarRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ArboStarRequestError';
    this.status = status;
  }
}

interface LiveOptions {
  companyId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrlOverride?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export class ArboStarLiveClient implements ArboStarClient {
  private readonly companyId: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: LiveOptions) {
    this.companyId = opts.companyId;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.baseUrl =
      opts.baseUrlOverride ?? `https://${opts.companyId}.arbostar.com/api/requests/create`;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxAttempts = opts.maxAttempts ?? 4;
    this.backoffMs = opts.backoffMs ?? [1_000, 5_000, 30_000, 300_000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async createRequest(params: ArboStarLeadPayload): Promise<ArboStarCreateResult> {
    if (!this.apiKey || !this.companyId) {
      throw new ArboStarAuthError('ArboStar credentials missing (companyId or apiKey)');
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await this.callOnce(params);
      } catch (err) {
        lastErr = err;
        if (err instanceof ArboStarAuthError) throw err;
        if (
          err instanceof ArboStarRequestError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 429
        ) {
          throw err;
        }
        if (attempt === this.maxAttempts - 1) break;
        const wait = this.backoffMs[attempt] ?? this.backoffMs[this.backoffMs.length - 1] ?? 1_000;
        logger.warn({ attempt: attempt + 1, wait, err }, 'arbostar retrying');
        await this.sleep(wait);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('arbostar request failed');
  }

  private async callOnce(payload: ArboStarLeadPayload): Promise<ArboStarCreateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      const text = await safeReadText(res);
      throw new ArboStarAuthError(`arbostar auth failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new ArboStarRequestError(res.status, `arbostar http ${res.status}: ${text}`);
    }
    const json = (await res.json().catch(() => ({}))) as {
      request_id?: string;
      id?: string | number;
      data?: { request_id?: string; id?: string | number };
    };
    const id =
      json.request_id ??
      (json.id !== undefined ? String(json.id) : undefined) ??
      json.data?.request_id ??
      (json.data?.id !== undefined ? String(json.data.id) : undefined) ??
      `as_${generateUuidV7()}`;
    return { requestId: id };
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
  fail?: boolean;
}

interface ArboStarStubRecord {
  requestId: string;
  payload: ArboStarLeadPayload;
  sentAt: string;
}

export class ArboStarStubClient implements ArboStarClient {
  private readonly outFile: string | null;
  private readonly memory: ArboStarStubRecord[] = [];
  private readonly forceFail: boolean;

  constructor(opts: StubOptions = {}) {
    if (opts.inMemory === true) {
      this.outFile = null;
    } else {
      this.outFile = opts.outFile ?? resolve(process.cwd(), 'tmp', 'stub-arbostar.jsonl');
    }
    this.forceFail = opts.fail === true;
  }

  async createRequest(params: ArboStarLeadPayload): Promise<ArboStarCreateResult> {
    if (this.forceFail) {
      throw new ArboStarRequestError(503, 'arbostar stub forced to fail');
    }
    const requestId = `stub_arbostar_${generateUuidV7()}`;
    const record: ArboStarStubRecord = {
      requestId,
      payload: params,
      sentAt: new Date().toISOString(),
    };
    this.memory.push(record);
    if (this.outFile) {
      try {
        mkdirSync(dirname(this.outFile), { recursive: true });
        appendFileSync(this.outFile, `${JSON.stringify(record)}\n`, 'utf-8');
      } catch (err) {
        logger.warn({ err }, 'arbostar stub failed to write jsonl');
      }
    }
    return { requestId };
  }

  getRecords(): ArboStarStubRecord[] {
    return [...this.memory];
  }
}

export function createArboStarClient(cfg: Config = appConfig): ArboStarClient {
  if (cfg.INTEGRATION_MODE === 'stub') {
    return new ArboStarStubClient();
  }
  return new ArboStarLiveClient({
    companyId: cfg.ARBOSTAR_COMPANY_ID,
    apiKey: cfg.ARBOSTAR_API_KEY,
  });
}
