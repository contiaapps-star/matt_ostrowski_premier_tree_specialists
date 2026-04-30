import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as appConfig, type Config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface OpenRouterCompleteParams {
  model?: string;
  system: string;
  user: string;
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenRouterCompleteResult {
  content: string;
  parsedJson?: unknown;
}

export interface OpenRouterClient {
  complete(params: OpenRouterCompleteParams): Promise<OpenRouterCompleteResult>;
}

export class OpenRouterAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterAuthError';
  }
}

export class OpenRouterRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenRouterRequestError';
    this.status = status;
  }
}

interface LiveOptions {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export class OpenRouterLiveClient implements OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: LiveOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.defaultModel = opts.defaultModel;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? [1_000, 3_000, 9_000];
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async complete(params: OpenRouterCompleteParams): Promise<OpenRouterCompleteResult> {
    if (!this.apiKey) {
      throw new OpenRouterAuthError('OPENROUTER_API_KEY is empty; cannot call live client');
    }

    const body: Record<string, unknown> = {
      model: params.model ?? this.defaultModel,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
    };
    if (params.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'extraction', strict: true, schema: params.jsonSchema },
      };
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await this.callOnce(body);
      } catch (err) {
        lastErr = err;
        if (err instanceof OpenRouterAuthError) throw err;
        if (err instanceof OpenRouterRequestError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
        if (attempt === this.maxAttempts - 1) break;
        const wait = this.backoffMs[attempt] ?? this.backoffMs[this.backoffMs.length - 1] ?? 1_000;
        logger.warn({ attempt: attempt + 1, wait, err }, 'openrouter retrying');
        await this.sleep(wait);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('openrouter call failed');
  }

  private async callOnce(body: Record<string, unknown>): Promise<OpenRouterCompleteResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
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
      throw new OpenRouterAuthError(`openrouter auth failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new OpenRouterRequestError(res.status, `openrouter http ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json?.choices?.[0]?.message?.content ?? '';
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      parsedJson = undefined;
    }
    return { content, parsedJson };
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

interface GenericDraft {
  response_text: string;
  confidence: number;
  confidence_reasoning: string;
  escalation_recheck: boolean;
}

/**
 * Build a brand-appropriate generic draft when the stub has no specific
 * fixture for the customer. Pulls the first name from the prompt's "Lead
 * extracted data" block so the draft addresses the customer correctly,
 * mentions oak season if the original message contains "oak", and hints at
 * out-of-service-area when flagged in the prompt.
 */
function buildGenericResponseDraft(prompt: string): GenericDraft {
  const nameLine = /-\s*Name:\s*([^\n]+)/i.exec(prompt);
  const fullName = nameLine?.[1]?.trim() ?? '';
  const firstName =
    !fullName || /^\(unknown\)?$/i.test(fullName) ? '' : fullName.split(/\s+/)[0] ?? '';
  const greeting = firstName ? `Hi ${firstName}` : 'Hi there';

  const lower = prompt.toLowerCase();
  const isOutOfArea = /out of service area:\s*yes/i.test(prompt);
  const mentionsOak = /\boak\b/.test(lower);

  const oakNote = mentionsOak
    ? ' Oak trimming season in Ohio runs November through March only — we can still book an estimate now and schedule the work for next season.'
    : '';
  const areaLine = isOutOfArea
    ? ' Unfortunately your address looks to be outside our Cleveland and Columbus service areas — apologies for the inconvenience.'
    : ' One of our team members will reach out shortly to schedule a complimentary on-site estimate.';

  const response_text =
    `${greeting} — thanks for reaching out to Premier Tree Specialists!${areaLine}${oakNote}\n\n` +
    'Our ISA-certified arborists carry 80+ years of combined experience and full insurance. ' +
    'Reply to this message or call us at (216) 245-8908 (Cleveland) or (614) 526-2266 (Columbus) ' +
    'if you need anything sooner.\n\n— Premier Tree Specialists Team';

  return {
    response_text,
    confidence: isOutOfArea ? 0.55 : 0.82,
    confidence_reasoning: firstName
      ? 'Generic draft used (no specific FAQ match); customer first name extracted; tone aligns with brand voice.'
      : 'Generic draft used (no customer name available); tone aligns with brand voice.',
    escalation_recheck: false,
  };
}

interface StubOptions {
  fixturesDir?: string;
}

interface StubRule {
  match: string[];
  fixture: string;
}

export class OpenRouterStubClient implements OpenRouterClient {
  private readonly fixturesDir: string;
  private cachedRules: StubRule[] | null = null;
  private cachedFixtures: Map<string, OpenRouterCompleteResult> = new Map();

  constructor(opts: StubOptions = {}) {
    this.fixturesDir = opts.fixturesDir ?? resolve(process.cwd(), 'tests', 'fixtures', 'llm');
  }

  async complete(params: OpenRouterCompleteParams): Promise<OpenRouterCompleteResult> {
    const promptLower = params.user.toLowerCase();
    const rules = this.loadRules();

    for (const rule of rules) {
      const allMatch = rule.match.every((needle) => promptLower.includes(needle.toLowerCase()));
      if (allMatch) {
        return this.loadFixture(rule.fixture);
      }
    }

    // Generate-response task: when no specific fixture matched the customer
    // name, return a brand-appropriate draft addressing whoever we can
    // extract from the prompt by first name. Without this fallback, manual
    // "Try regenerate again" on demo leads (which exercise unmatched names)
    // returns extraction-shaped JSON, fails the response schema check, and
    // leaves the lead with an empty draft.
    if (promptLower.includes('[task: generate_response]')) {
      const result = buildGenericResponseDraft(params.user);
      return { content: JSON.stringify(result), parsedJson: result };
    }

    const generic = {
      extracted: {
        name: null,
        phone: null,
        email: null,
        address: null,
        city: null,
        state: null,
        zip: null,
      },
      scope_summary: 'unparsed lead',
      scope_category: 'other',
      missing_critical_fields: ['name', 'phone', 'email', 'address'],
    };
    const content = JSON.stringify(generic);
    return { content, parsedJson: generic };
  }

  private loadRules(): StubRule[] {
    if (this.cachedRules) return this.cachedRules;
    const path = resolve(this.fixturesDir, 'index.json');
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as { rules: StubRule[] };
    this.cachedRules = parsed.rules;
    return this.cachedRules;
  }

  private loadFixture(name: string): OpenRouterCompleteResult {
    const cached = this.cachedFixtures.get(name);
    if (cached) return cached;
    const path = resolve(this.fixturesDir, name);
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    const result: OpenRouterCompleteResult = { content: raw, parsedJson: parsed };
    this.cachedFixtures.set(name, result);
    return result;
  }
}

export function createOpenRouterClient(cfg: Config = appConfig): OpenRouterClient {
  if (cfg.INTEGRATION_MODE === 'stub') {
    return new OpenRouterStubClient();
  }
  return new OpenRouterLiveClient({
    apiKey: cfg.OPENROUTER_API_KEY,
    baseUrl: cfg.OPENROUTER_BASE_URL,
    defaultModel: cfg.OPENROUTER_MODEL,
  });
}
