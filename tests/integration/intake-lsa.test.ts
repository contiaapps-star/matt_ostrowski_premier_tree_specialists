import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { getSqlite, setupFreshDb, teardownDb } from './_helpers.js';

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
}

async function postLsa(rawEmail: string) {
  const app = createApp();
  return await app.request('/api/intake/lsa-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw_email: rawEmail }),
  });
}

describe('POST /api/intake/lsa-email', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('persists a lead from lsa-oak-trim.txt', async () => {
    const res = await postLsa(fixture('lsa-oak-trim.txt'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lead_id: string; is_new: boolean };
    expect(body.lead_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.is_new).toBe(true);

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare('SELECT customer_name, dedup_phone_e164, source, status, scope_raw FROM leads WHERE id = ?')
      .get(body.lead_id) as {
      customer_name: string;
      dedup_phone_e164: string;
      source: string;
      status: string;
      scope_raw: string;
    };
    expect(lead.customer_name).toBe('Diane Owens');
    expect(lead.dedup_phone_e164).toBe('+12165550001');
    expect(lead.source).toBe('google_lsa_email');
    expect(lead.status).toBe('ingested');
    expect(lead.scope_raw).toContain('big oak tree');

    const event = sqlite
      .prepare('SELECT raw_payload FROM lead_source_events WHERE lead_id = ?')
      .get(body.lead_id) as { raw_payload: string };
    const payload = JSON.parse(event.raw_payload) as { raw_email: string; parsed: unknown };
    expect(payload.raw_email).toContain('Diane Owens');
    expect(payload.parsed).toBeTruthy();

    const audit = sqlite
      .prepare('SELECT action FROM audit_log WHERE lead_id = ?')
      .get(body.lead_id) as { action: string };
    expect(audit.action).toBe('ingested');
  });

  it('persists a lead from lsa-removal-large-tree.txt', async () => {
    const res = await postLsa(fixture('lsa-removal-large-tree.txt'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lead_id: string; is_new: boolean };
    expect(body.is_new).toBe(true);

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare('SELECT customer_name, dedup_phone_e164 FROM leads WHERE id = ?')
      .get(body.lead_id) as { customer_name: string; dedup_phone_e164: string };
    expect(lead.customer_name).toBe('Patricia Smith');
    expect(lead.dedup_phone_e164).toBe('+14405550020');
  });

  it('persists a lead from lsa-no-phone.txt with null dedup_phone', async () => {
    const res = await postLsa(fixture('lsa-no-phone.txt'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lead_id: string; is_new: boolean };
    expect(body.is_new).toBe(true);

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare('SELECT customer_name, dedup_phone_e164 FROM leads WHERE id = ?')
      .get(body.lead_id) as { customer_name: string; dedup_phone_e164: string | null };
    expect(lead.customer_name).toBe('Robert Johnson');
    expect(lead.dedup_phone_e164).toBeNull();
  });

  it('returns 400 for non-LSA email content', async () => {
    const res = await postLsa('From: random@example.com\nSubject: Hi\n\nJust saying hello.');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unparseable_lsa_email');
  });

  it('returns 400 for missing raw_email field', async () => {
    const app = createApp();
    const res = await app.request('/api/intake/lsa-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
