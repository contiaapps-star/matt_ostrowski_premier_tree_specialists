import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { agentMailMessages, appSettings } from '../../app/db/schema.js';
import { getDb, getSqlite, setupFreshDb, teardownDb } from './_helpers.js';

const BOOTSTRAP_KEY = 'agent_mail_bootstrap';

function fixtureRaw(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
}

function setBootstrapWithSecret(secret: string | null): void {
  const db = getDb();
  const value = JSON.stringify({
    inboxId: 'inbox_test_001',
    inboxAddress: 'premier3-pts-agent@agentmail.to',
    webhookId: 'webhook_test_001',
    webhookUrl: 'http://localhost/api/intake/agentmail-webhook',
    webhookSecret: secret ?? undefined,
  });
  const existing = db.select().from(appSettings).where(eq(appSettings.key, BOOTSTRAP_KEY)).all();
  if (existing.length === 0) {
    db.insert(appSettings).values({ key: BOOTSTRAP_KEY, value, updatedAt: new Date() }).run();
  } else {
    db.update(appSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.key, BOOTSTRAP_KEY))
      .run();
  }
}

function signedHeaders(rawBody: string, secret: string): Record<string, string> {
  const sig = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return {
    'content-type': 'application/json',
    'x-agentmail-signature': `sha256=${sig}`,
  };
}

async function postWebhook(rawBody: string, headers: Record<string, string>) {
  const app = createApp();
  return await app.request('/api/intake/agentmail-webhook', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('POST /api/intake/agentmail-webhook', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('archives + parses an LSA email and creates a lead', async () => {
    const secret = 'whsec_test_lsa';
    setBootstrapWithSecret(secret);

    const rawBody = fixtureRaw('agentmail-lsa.json');
    const res = await postWebhook(rawBody, signedHeaders(rawBody, secret));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      archive_id: string;
      lead_id: string | null;
      parse_status: string;
    };
    expect(body.ok).toBe(true);
    expect(body.parse_status).toBe('parsed');
    expect(body.lead_id).toMatch(/^[0-9a-f-]{36}$/);

    const sqlite = getSqlite();
    const archive = sqlite
      .prepare(
        'SELECT detected_source, parse_status, lead_id, from_address FROM agent_mail_messages WHERE id = ?',
      )
      .get(body.archive_id) as {
      detected_source: string;
      parse_status: string;
      lead_id: string;
      from_address: string;
    };
    expect(archive.detected_source).toBe('google_lsa_email');
    expect(archive.parse_status).toBe('parsed');
    expect(archive.lead_id).toBe(body.lead_id);
    expect(archive.from_address).toBe('noreply@google-business.com');

    const lead = sqlite
      .prepare('SELECT customer_name, source FROM leads WHERE id = ?')
      .get(body.lead_id!) as { customer_name: string; source: string };
    expect(lead.customer_name).toBe('Diane Owens');
    expect(lead.source).toBe('google_lsa_email');
  });

  it('archives unparseable email with parse_status=unparseable and no lead', async () => {
    const secret = 'whsec_test_garbage';
    setBootstrapWithSecret(secret);

    const rawBody = fixtureRaw('agentmail-garbage.json');
    const res = await postWebhook(rawBody, signedHeaders(rawBody, secret));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      archive_id: string;
      lead_id: string | null;
      parse_status: string;
    };
    expect(body.lead_id).toBeNull();
    expect(body.parse_status).toBe('unparseable');

    const sqlite = getSqlite();
    const archive = sqlite
      .prepare(
        'SELECT detected_source, parse_status, lead_id, parse_error FROM agent_mail_messages WHERE id = ?',
      )
      .get(body.archive_id) as {
      detected_source: string;
      parse_status: string;
      lead_id: string | null;
      parse_error: string | null;
    };
    expect(archive.detected_source).toBe('unknown');
    expect(archive.parse_status).toBe('unparseable');
    expect(archive.lead_id).toBeNull();
    expect(archive.parse_error).toContain('unknown_source');

    // No lead should have been created.
    const leadCount = (
      sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }
    ).n;
    expect(leadCount).toBe(0);
  });

  it('rejects webhook with invalid signature', async () => {
    const secret = 'whsec_test_invalid';
    setBootstrapWithSecret(secret);
    const rawBody = fixtureRaw('agentmail-lsa.json');
    const res = await postWebhook(rawBody, {
      'content-type': 'application/json',
      'x-agentmail-signature': 'sha256=deadbeef',
    });
    expect(res.status).toBe(401);

    const sqlite = getSqlite();
    const archived = (
      sqlite.prepare('SELECT COUNT(*) AS n FROM agent_mail_messages').get() as { n: number }
    ).n;
    expect(archived).toBe(0);
  });

  it('is idempotent on duplicate agentmail_message_id', async () => {
    const secret = 'whsec_test_idempotent';
    setBootstrapWithSecret(secret);

    const rawBody = fixtureRaw('agentmail-answerforce.json');
    const headers = signedHeaders(rawBody, secret);

    const first = await postWebhook(rawBody, headers);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { archive_id: string; duplicate?: boolean };
    expect(firstBody.duplicate).toBeFalsy();

    const second = await postWebhook(rawBody, headers);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { archive_id: string; duplicate?: boolean };
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.archive_id).toBe(firstBody.archive_id);

    const sqlite = getSqlite();
    const count = (
      sqlite.prepare('SELECT COUNT(*) AS n FROM agent_mail_messages').get() as { n: number }
    ).n;
    expect(count).toBe(1);
  });

  it('skips signature verification when no secret is configured (dev mode)', async () => {
    setBootstrapWithSecret(null);
    const rawBody = fixtureRaw('agentmail-lsa.json');
    const res = await postWebhook(rawBody, { 'content-type': 'application/json' });
    expect(res.status).toBe(200);
  });
});
