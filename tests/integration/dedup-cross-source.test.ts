import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { config } from '../../app/config.js';
import { getSqlite, setupFreshDb, teardownDb } from './_helpers.js';

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
}

describe('dedup across sources', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('website-form then LSA email with same phone within 30min => one lead, two source events', async () => {
    const app = createApp();

    // 1) Website form with Diane's phone — same as the LSA fixture
    const websiteRes = await app.request('/api/intake/website-form', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Diane Owens',
        email: 'diane@example.com',
        phone: '(216) 555-0001',
        zip: '44113',
        service_type: 'Tree trimming',
        message: 'Initial inquiry from website',
        secret: config.WEBSITE_FORM_WEBHOOK_SECRET,
      }),
    });
    expect(websiteRes.status).toBe(201);
    const websiteBody = (await websiteRes.json()) as { lead_id: string; is_new: boolean };
    expect(websiteBody.is_new).toBe(true);

    // 2) LSA email with same phone, within 30 minutes
    const lsaRes = await app.request('/api/intake/lsa-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw_email: fixture('lsa-oak-trim.txt') }),
    });
    expect(lsaRes.status).toBe(201);
    const lsaBody = (await lsaRes.json()) as { lead_id: string; is_new: boolean };
    expect(lsaBody.is_new).toBe(false);
    expect(lsaBody.lead_id).toBe(websiteBody.lead_id);

    const sqlite = getSqlite();
    const leadCount = sqlite.prepare('SELECT count(*) c FROM leads').get() as { c: number };
    expect(leadCount.c).toBe(1);

    const events = sqlite
      .prepare('SELECT source FROM lead_source_events WHERE lead_id = ? ORDER BY received_at')
      .all(websiteBody.lead_id) as { source: string }[];
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.source)).toEqual(['website_form', 'google_lsa_email']);
  });
});
