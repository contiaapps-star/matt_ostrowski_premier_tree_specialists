import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { getSqlite, setupFreshDb, teardownDb } from './_helpers.js';

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
}

async function postAf(rawEmail: string) {
  const app = createApp();
  return await app.request('/api/intake/answerforce-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw_email: rawEmail }),
  });
}

describe('POST /api/intake/answerforce-email', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('persists a lead from answerforce-emergency.txt', async () => {
    const res = await postAf(fixture('answerforce-emergency.txt'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lead_id: string; is_new: boolean };
    expect(body.is_new).toBe(true);

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare(
        'SELECT customer_name, dedup_phone_e164, source, status, scope_raw FROM leads WHERE id = ?',
      )
      .get(body.lead_id) as {
      customer_name: string;
      dedup_phone_e164: string;
      source: string;
      status: string;
      scope_raw: string;
    };
    expect(lead.customer_name).toBe('Marilyn Hornig');
    expect(lead.dedup_phone_e164).toBe('+14405550003');
    expect(lead.source).toBe('answerforce_email');
    expect(lead.status).toBe('ingested');
    expect(lead.scope_raw).toContain('emergency tree removal');

    const event = sqlite
      .prepare('SELECT raw_payload FROM lead_source_events WHERE lead_id = ?')
      .get(body.lead_id) as { raw_payload: string };
    const payload = JSON.parse(event.raw_payload) as { raw_email: string };
    expect(payload.raw_email).toContain('Marilyn Hornig');
  });

  it('persists a lead from answerforce-cleveland.txt', async () => {
    const res = await postAf(fixture('answerforce-cleveland.txt'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lead_id: string; is_new: boolean };
    expect(body.is_new).toBe(true);

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare('SELECT customer_name, dedup_phone_e164 FROM leads WHERE id = ?')
      .get(body.lead_id) as { customer_name: string; dedup_phone_e164: string };
    expect(lead.customer_name).toBe('John Stepanek');
    expect(lead.dedup_phone_e164).toBe('+12165550030');
  });

  it('returns 400 for content that is not AnswerForce', async () => {
    const res = await postAf('From: someone@example.com\nSubject: Hello\n\nHi there.');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unparseable_answerforce_email');
  });
});
