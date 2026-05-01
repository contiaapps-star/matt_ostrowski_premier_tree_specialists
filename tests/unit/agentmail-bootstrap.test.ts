import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentMailRequestError,
  AgentMailStubClient,
  type AgentMailClientPort,
} from '../../app/clients/agentmail.client.js';
import {
  bootstrapAgentMail,
  readBootstrapState,
  resolveAgentMailAddress,
} from '../../app/services/agentmail-bootstrap.service.js';
import { setupFreshDb, teardownDb, getDb } from '../integration/_helpers.js';
import type { Config } from '../../app/config.js';

function buildCfg(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'test',
    PORT: 5000,
    SESSION_SECRET: 'test-session-secret-123456',
    INTEGRATION_MODE: 'live',
    DATABASE_PATH: ':memory:',
    OPENROUTER_API_KEY: '',
    OPENROUTER_MODEL: 'google/gemini-2.5-flash',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    CONFIDENCE_AUTO_SEND_THRESHOLD: 0.8,
    CONFIDENCE_DRAFT_THRESHOLD: 0.5,
    SENDGRID_API_KEY: '',
    EMAIL_FROM_ADDRESS: 'info@premiertreesllc.com',
    EMAIL_FROM_NAME: 'Premier Tree Specialists',
    AGENT_PHONE_API_KEY: '',
    AGENT_PHONE_NUMBER: '',
    SMS_PROVIDER: 'agent_phone',
    ENABLE_IMESSAGE: true,
    ARBOSTAR_COMPANY_ID: '',
    ARBOSTAR_API_KEY: '',
    GMAIL_INBOUND_ADDRESS: '',
    GMAIL_OAUTH_REFRESH_TOKEN: '',
    LSA_EMAIL_FROM: 'noreply@google-business.com',
    ANSWERFORCE_EMAIL_FROM: 'notifications@answerforce.com',
    EMAIL_POLL_INTERVAL_SECONDS: 60,
    AGENT_MAIL_ADDRESS: '',
    AGENT_MAIL_API_KEY: 'am_test_key',
    AGENT_MAIL_USERNAME: 'premier3-pts-agent',
    AGENT_MAIL_DOMAIN: 'agentmail.to',
    AGENT_MAIL_DISPLAY_NAME: 'Premier Tree Specialists Agent',
    PUBLIC_BASE_URL: 'https://example.test',
    WEBSITE_FORM_WEBHOOK_SECRET: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    ADMIN_DISPLAY_NAME: 'Admin',
    RESEED_ON_BOOT: false,
    ...overrides,
  } as Config;
}

describe('bootstrapAgentMail', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('skips when AGENT_MAIL_API_KEY is empty', async () => {
    const cfg = buildCfg({ AGENT_MAIL_API_KEY: '' });
    const client = new AgentMailStubClient();
    const result = await bootstrapAgentMail({ db: getDb(), client, config: cfg });
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_api_key');
  });

  it('provisions inbox + webhook on first run and caches the state', async () => {
    const cfg = buildCfg();
    const client = new AgentMailStubClient();
    const result = await bootstrapAgentMail({ db: getDb(), client, config: cfg });
    expect(result.status).toBe('provisioned');
    expect(result.state?.inboxAddress).toBe('premier3-pts-agent@agentmail.to');
    expect(result.state?.webhookUrl).toBe('https://example.test/api/intake/agentmail-webhook');
    expect(result.state?.webhookSecret).toMatch(/^whsec_/);

    const cached = readBootstrapState(getDb());
    expect(cached?.inboxId).toBe(result.state?.inboxId);
    expect(cached?.webhookSecret).toBe(result.state?.webhookSecret);
  });

  it('returns reused on second run without hitting the client', async () => {
    const cfg = buildCfg();
    const client = new AgentMailStubClient();
    await bootstrapAgentMail({ db: getDb(), client, config: cfg });

    let called = 0;
    const tracked: AgentMailClientPort = {
      createInbox: async () => {
        called++;
        return { id: 'x', email: 'x@x.com' };
      },
      listInboxes: async () => {
        called++;
        return [];
      },
      listWebhooks: async () => {
        called++;
        return [];
      },
      createWebhook: async () => {
        called++;
        return { id: 'x', url: 'x', eventTypes: [] };
      },
    };
    const second = await bootstrapAgentMail({ db: getDb(), client: tracked, config: cfg });
    expect(second.status).toBe('reused');
    expect(called).toBe(0);
  });

  it('recovers from inbox 409 by listing and reusing the existing inbox', async () => {
    const cfg = buildCfg();
    const conflictingClient: AgentMailClientPort = {
      createInbox: async () => {
        throw new AgentMailRequestError(409, 'inbox already exists');
      },
      listInboxes: async () => [
        { id: 'inbox_existing_42', email: 'premier3-pts-agent@agentmail.to' },
      ],
      listWebhooks: async () => [],
      createWebhook: async () => ({
        id: 'webhook_new',
        url: 'https://example.test/api/intake/agentmail-webhook',
        eventTypes: ['message.received'],
        secret: 'whsec_new',
      }),
    };
    const result = await bootstrapAgentMail({ db: getDb(), client: conflictingClient, config: cfg });
    expect(result.status).toBe('provisioned');
    expect(result.state?.inboxId).toBe('inbox_existing_42');
  });

  it('returns partial when PUBLIC_BASE_URL is empty (no webhook registration)', async () => {
    const cfg = buildCfg({ PUBLIC_BASE_URL: '' });
    const client = new AgentMailStubClient();
    const result = await bootstrapAgentMail({ db: getDb(), client, config: cfg });
    expect(result.status).toBe('partial');
    expect(result.reason).toBe('no_public_base_url');
    expect(result.state?.inboxAddress).toBe('premier3-pts-agent@agentmail.to');
    expect(result.state?.webhookId).toBeUndefined();
  });
});

describe('resolveAgentMailAddress', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('prefers explicit AGENT_MAIL_ADDRESS env override', () => {
    const cfg = buildCfg({ AGENT_MAIL_ADDRESS: 'manual@override.test' });
    expect(resolveAgentMailAddress({ db: getDb(), config: cfg })).toBe('manual@override.test');
  });

  it('falls back to derived username@domain when API key is set', () => {
    const cfg = buildCfg({ AGENT_MAIL_ADDRESS: '' });
    expect(resolveAgentMailAddress({ db: getDb(), config: cfg })).toBe(
      'premier3-pts-agent@agentmail.to',
    );
  });

  it('returns empty string when no API key is configured', () => {
    const cfg = buildCfg({ AGENT_MAIL_ADDRESS: '', AGENT_MAIL_API_KEY: '' });
    expect(resolveAgentMailAddress({ db: getDb(), config: cfg })).toBe('');
  });
});
