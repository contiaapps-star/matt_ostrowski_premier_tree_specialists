import { config as appConfig, type Config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface AgentMailInbox {
  id: string;
  email: string;
  displayName?: string;
}

export interface AgentMailWebhook {
  id: string;
  url: string;
  eventTypes: string[];
  inboxIds?: string[];
  /** Only present immediately after creation. */
  secret?: string;
}

export interface CreateInboxParams {
  username: string;
  domain: string;
  displayName?: string;
  clientId?: string;
}

export interface CreateWebhookParams {
  url: string;
  eventTypes: string[];
  inboxIds?: string[];
}

export interface AgentMailClientPort {
  createInbox(params: CreateInboxParams): Promise<AgentMailInbox>;
  listInboxes(): Promise<AgentMailInbox[]>;
  listWebhooks(): Promise<AgentMailWebhook[]>;
  createWebhook(params: CreateWebhookParams): Promise<AgentMailWebhook>;
}

export class AgentMailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentMailAuthError';
  }
}

export class AgentMailRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AgentMailRequestError';
    this.status = status;
  }
}

interface LiveOptions {
  apiKey: string;
}

/**
 * Thin wrapper over the official `agentmail` SDK. We import lazily so the
 * package is only required when INTEGRATION_MODE=live and AGENT_MAIL_API_KEY
 * is set — keeping `npm test` green even when the SDK is missing locally.
 */
export class AgentMailLiveClient implements AgentMailClientPort {
  private readonly apiKey: string;
  private clientPromise: Promise<unknown> | null = null;

  constructor(opts: LiveOptions) {
    this.apiKey = opts.apiKey;
  }

  private async client(): Promise<{
    inboxes: {
      create: (args: Record<string, unknown>) => Promise<unknown>;
      list: (args?: Record<string, unknown>) => Promise<unknown>;
    };
    webhooks: {
      create: (args: Record<string, unknown>) => Promise<unknown>;
      list: (args?: Record<string, unknown>) => Promise<unknown>;
    };
  }> {
    if (!this.apiKey) {
      throw new AgentMailAuthError('AGENT_MAIL_API_KEY is empty; cannot call live client');
    }
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = (await import('agentmail')) as {
          AgentMailClient: new (args: { apiKey: string }) => unknown;
        };
        return new mod.AgentMailClient({ apiKey: this.apiKey });
      })();
    }
    return (await this.clientPromise) as never;
  }

  async createInbox(params: CreateInboxParams): Promise<AgentMailInbox> {
    const c = await this.client();
    const raw = (await c.inboxes.create({
      username: params.username,
      domain: params.domain,
      displayName: params.displayName,
      clientId: params.clientId,
    })) as { id?: string; inboxId?: string; email?: string; address?: string; displayName?: string };
    return normalizeInbox(raw);
  }

  async listInboxes(): Promise<AgentMailInbox[]> {
    const c = await this.client();
    const raw = (await c.inboxes.list()) as { inboxes?: unknown[]; data?: unknown[] } | unknown[];
    const arr = Array.isArray(raw) ? raw : (raw.inboxes ?? raw.data ?? []);
    return (arr as Array<Record<string, unknown>>).map((i) => normalizeInbox(i));
  }

  async listWebhooks(): Promise<AgentMailWebhook[]> {
    const c = await this.client();
    const raw = (await c.webhooks.list()) as { webhooks?: unknown[]; data?: unknown[] } | unknown[];
    const arr = Array.isArray(raw) ? raw : (raw.webhooks ?? raw.data ?? []);
    return (arr as Array<Record<string, unknown>>).map((w) => normalizeWebhook(w));
  }

  async createWebhook(params: CreateWebhookParams): Promise<AgentMailWebhook> {
    const c = await this.client();
    const raw = (await c.webhooks.create({
      url: params.url,
      eventTypes: params.eventTypes,
      inboxIds: params.inboxIds,
    })) as Record<string, unknown>;
    return normalizeWebhook(raw);
  }
}

function normalizeInbox(raw: Record<string, unknown>): AgentMailInbox {
  const id = String(raw.id ?? raw.inboxId ?? '');
  const email = String(raw.email ?? raw.address ?? '');
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : undefined;
  return { id, email, displayName };
}

function normalizeWebhook(raw: Record<string, unknown>): AgentMailWebhook {
  const id = String(raw.id ?? raw.webhookId ?? '');
  const url = String(raw.url ?? '');
  const eventTypes = Array.isArray(raw.eventTypes) ? (raw.eventTypes as string[]) : [];
  const inboxIds = Array.isArray(raw.inboxIds) ? (raw.inboxIds as string[]) : undefined;
  const secret = typeof raw.secret === 'string' ? raw.secret : undefined;
  return { id, url, eventTypes, inboxIds, secret };
}

interface StubState {
  inboxes: AgentMailInbox[];
  webhooks: AgentMailWebhook[];
}

export class AgentMailStubClient implements AgentMailClientPort {
  private readonly state: StubState;

  constructor(seed?: Partial<StubState>) {
    this.state = {
      inboxes: seed?.inboxes ?? [],
      webhooks: seed?.webhooks ?? [],
    };
  }

  async createInbox(params: CreateInboxParams): Promise<AgentMailInbox> {
    const email = `${params.username}@${params.domain}`;
    const existing = this.state.inboxes.find((i) => i.email === email);
    if (existing) {
      const err = new AgentMailRequestError(409, `inbox already exists: ${email}`);
      throw err;
    }
    const inbox: AgentMailInbox = {
      id: `inbox_stub_${this.state.inboxes.length + 1}`,
      email,
      displayName: params.displayName,
    };
    this.state.inboxes.push(inbox);
    return inbox;
  }

  async listInboxes(): Promise<AgentMailInbox[]> {
    return [...this.state.inboxes];
  }

  async listWebhooks(): Promise<AgentMailWebhook[]> {
    return this.state.webhooks.map((w) => ({ ...w, secret: undefined }));
  }

  async createWebhook(params: CreateWebhookParams): Promise<AgentMailWebhook> {
    const webhook: AgentMailWebhook = {
      id: `webhook_stub_${this.state.webhooks.length + 1}`,
      url: params.url,
      eventTypes: params.eventTypes,
      inboxIds: params.inboxIds,
      secret: `whsec_stub_${this.state.webhooks.length + 1}`,
    };
    this.state.webhooks.push(webhook);
    return webhook;
  }

  getState(): StubState {
    return {
      inboxes: [...this.state.inboxes],
      webhooks: [...this.state.webhooks],
    };
  }
}

export function createAgentMailClient(cfg: Config = appConfig): AgentMailClientPort | null {
  if (cfg.INTEGRATION_MODE === 'stub') {
    logger.debug('[agentmail-client] stub mode — no remote calls');
    return new AgentMailStubClient();
  }
  if (!cfg.AGENT_MAIL_API_KEY) {
    logger.warn('[agentmail-client] live mode but AGENT_MAIL_API_KEY empty — returning null');
    return null;
  }
  return new AgentMailLiveClient({ apiKey: cfg.AGENT_MAIL_API_KEY });
}
