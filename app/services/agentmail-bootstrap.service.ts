import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  type AgentMailClientPort,
  AgentMailRequestError,
  createAgentMailClient,
} from '../clients/agentmail.client.js';
import { config as appConfig, type Config } from '../config.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { appSettings } from '../db/schema.js';
import { logger } from '../lib/logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface AgentMailBootstrapState {
  inboxId: string;
  inboxAddress: string;
  webhookId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

const KEY = 'agent_mail_bootstrap';

export function readBootstrapState(db: DrizzleDb = getDb()): AgentMailBootstrapState | null {
  try {
    const rows = db.select().from(appSettings).where(eq(appSettings.key, KEY)).all();
    if (rows.length === 0) return null;
    const parsed = JSON.parse(rows[0]!.value) as AgentMailBootstrapState;
    if (!parsed.inboxId || !parsed.inboxAddress) return null;
    return parsed;
  } catch (err) {
    logger.warn({ err }, '[agentmail-bootstrap] failed to read state');
    return null;
  }
}

function writeBootstrapState(db: DrizzleDb, state: AgentMailBootstrapState): void {
  const json = JSON.stringify(state);
  const existing = db.select().from(appSettings).where(eq(appSettings.key, KEY)).all();
  const now = new Date();
  if (existing.length === 0) {
    db.insert(appSettings).values({ key: KEY, value: json, updatedAt: now }).run();
  } else {
    db.update(appSettings).set({ value: json, updatedAt: now }).where(eq(appSettings.key, KEY)).run();
  }
}

export interface BootstrapDeps {
  db?: DrizzleDb;
  client?: AgentMailClientPort | null;
  config?: Config;
}

export interface BootstrapResult {
  status: 'skipped' | 'reused' | 'provisioned' | 'partial' | 'error';
  state?: AgentMailBootstrapState;
  reason?: string;
}

/**
 * Provisions the AgentMail inbox + webhook idempotently. Safe to call on
 * every server boot — re-uses any inbox/webhook already registered with the
 * AgentMail account, and persists IDs locally so we don't need to re-list
 * on subsequent boots.
 *
 * Behavior:
 *   - No API key                → status 'skipped'
 *   - Cached state in DB        → status 'reused'  (no remote calls)
 *   - Inbox/webhook on remote   → status 'provisioned' (ids cached locally)
 *   - Webhook URL not available → status 'partial' (inbox provisioned, no webhook)
 */
export async function bootstrapAgentMail(deps: BootstrapDeps = {}): Promise<BootstrapResult> {
  const cfg = deps.config ?? appConfig;
  const db = deps.db ?? getDb();

  if (!cfg.AGENT_MAIL_API_KEY) {
    logger.info('[agentmail-bootstrap] AGENT_MAIL_API_KEY empty — skipping');
    return { status: 'skipped', reason: 'no_api_key' };
  }

  const cached = readBootstrapState(db);
  if (cached && cached.webhookId) {
    logger.info(
      { inboxId: cached.inboxId, address: cached.inboxAddress, webhookId: cached.webhookId },
      '[agentmail-bootstrap] inbox already provisioned — reusing cached state',
    );
    return { status: 'reused', state: cached };
  }

  const client = deps.client ?? createAgentMailClient(cfg);
  if (!client) {
    return { status: 'skipped', reason: 'no_client' };
  }

  const desiredEmail = `${cfg.AGENT_MAIL_USERNAME}@${cfg.AGENT_MAIL_DOMAIN}`;

  let inboxId = cached?.inboxId;
  let inboxAddress = cached?.inboxAddress ?? desiredEmail;

  if (!inboxId) {
    try {
      const inbox = await client.createInbox({
        username: cfg.AGENT_MAIL_USERNAME,
        domain: cfg.AGENT_MAIL_DOMAIN,
        displayName: cfg.AGENT_MAIL_DISPLAY_NAME,
        clientId: 'pts-prod',
      });
      inboxId = inbox.id;
      inboxAddress = inbox.email || desiredEmail;
      logger.info({ inboxId, address: inboxAddress }, '[agentmail-bootstrap] inbox provisioned');
    } catch (err) {
      // 409 → inbox already exists on the AgentMail account; recover by listing.
      if (err instanceof AgentMailRequestError && err.status === 409) {
        try {
          const inboxes = await client.listInboxes();
          const match = inboxes.find((i) => i.email.toLowerCase() === desiredEmail.toLowerCase());
          if (!match) {
            logger.error({ err }, '[agentmail-bootstrap] 409 on create but no matching inbox found');
            return { status: 'error', reason: '409_but_no_match' };
          }
          inboxId = match.id;
          inboxAddress = match.email;
          logger.info({ inboxId, address: inboxAddress }, '[agentmail-bootstrap] inbox already existed — reusing');
        } catch (listErr) {
          logger.error({ err: listErr }, '[agentmail-bootstrap] failed to list inboxes after 409');
          return { status: 'error', reason: 'list_inboxes_failed' };
        }
      } else {
        logger.error({ err }, '[agentmail-bootstrap] failed to create inbox');
        return { status: 'error', reason: 'create_inbox_failed' };
      }
    }
  }

  if (!inboxId) {
    return { status: 'error', reason: 'no_inbox_id' };
  }

  // Webhook is optional — if PUBLIC_BASE_URL is unset (e.g. local dev) we
  // persist the inbox state and skip webhook registration.
  if (!cfg.PUBLIC_BASE_URL) {
    const partialState: AgentMailBootstrapState = { inboxId, inboxAddress };
    writeBootstrapState(db, partialState);
    logger.warn(
      '[agentmail-bootstrap] PUBLIC_BASE_URL empty — skipping webhook registration',
    );
    return { status: 'partial', state: partialState, reason: 'no_public_base_url' };
  }

  const webhookUrl = `${cfg.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/intake/agentmail-webhook`;
  let webhookId: string | undefined;
  let webhookSecret: string | undefined;

  try {
    const existing = await client.listWebhooks();
    const match = existing.find((w) => w.url === webhookUrl);
    if (match) {
      webhookId = match.id;
      webhookSecret = match.secret; // typically undefined on list — fall back to env
      logger.info({ webhookId, webhookUrl }, '[agentmail-bootstrap] webhook already registered — reusing');
    } else {
      const created = await client.createWebhook({
        url: webhookUrl,
        eventTypes: ['message.received'],
        inboxIds: [inboxId],
      });
      webhookId = created.id;
      webhookSecret = created.secret;
      logger.info({ webhookId, webhookUrl }, '[agentmail-bootstrap] webhook registered');
    }
  } catch (err) {
    logger.error({ err, webhookUrl }, '[agentmail-bootstrap] webhook registration failed');
    const partialState: AgentMailBootstrapState = { inboxId, inboxAddress };
    writeBootstrapState(db, partialState);
    return { status: 'partial', state: partialState, reason: 'webhook_failed' };
  }

  const finalState: AgentMailBootstrapState = {
    inboxId,
    inboxAddress,
    webhookId,
    webhookUrl,
    webhookSecret,
  };
  writeBootstrapState(db, finalState);
  return { status: 'provisioned', state: finalState };
}

/**
 * Resolves the address to surface in /settings. Order:
 *   1. AGENT_MAIL_ADDRESS env (manual override)
 *   2. cached bootstrap state (inboxAddress)
 *   3. derived from AGENT_MAIL_USERNAME@AGENT_MAIL_DOMAIN if API key set
 *   4. empty string → renders "Pending" placeholder
 */
export function resolveAgentMailAddress(deps: BootstrapDeps = {}): string {
  const cfg = deps.config ?? appConfig;
  if (cfg.AGENT_MAIL_ADDRESS && cfg.AGENT_MAIL_ADDRESS.trim().length > 0) {
    return cfg.AGENT_MAIL_ADDRESS.trim();
  }
  const db = deps.db ?? getDb();
  const cached = readBootstrapState(db);
  if (cached?.inboxAddress) return cached.inboxAddress;
  if (cfg.AGENT_MAIL_API_KEY) {
    return `${cfg.AGENT_MAIL_USERNAME}@${cfg.AGENT_MAIL_DOMAIN}`;
  }
  return '';
}

/**
 * Resolves the webhook signing secret. Webhook payload verification reads
 * this. Falls back to the cached state when there is no env override.
 */
export function resolveAgentMailWebhookSecret(deps: BootstrapDeps = {}): string {
  const db = deps.db ?? getDb();
  const cached = readBootstrapState(db);
  return cached?.webhookSecret ?? '';
}
