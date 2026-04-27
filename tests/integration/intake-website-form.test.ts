import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { config } from '../../app/config.js';
import { getSqlite, setupFreshDb, teardownDb } from './_helpers.js';

function fixture(name: string): unknown {
  const raw = readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
  return JSON.parse(raw);
}

async function postWebsite(body: unknown) {
  const app = createApp();
  return await app.request('/api/intake/website-form', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/intake/website-form', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('happy path: persists Barbara Wells lead, looks up county, status=ingested', async () => {
    const body = fixture('website-form-quote.json') as Record<string, unknown>;
    const res = await postWebsite({ ...body, secret: config.WEBSITE_FORM_WEBHOOK_SECRET });
    expect(res.status).toBe(201);
    const respBody = (await res.json()) as { lead_id: string; is_new: boolean };
    expect(respBody.is_new).toBe(true);

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare(
        `SELECT customer_name, customer_email, customer_phone_e164, customer_zip,
                service_area_county, out_of_service_area, status, scope_raw, source
         FROM leads WHERE id = ?`,
      )
      .get(respBody.lead_id) as {
      customer_name: string;
      customer_email: string;
      customer_phone_e164: string;
      customer_zip: string;
      service_area_county: string;
      out_of_service_area: number;
      status: string;
      scope_raw: string;
      source: string;
    };
    expect(lead.customer_name).toBe('Barbara Wells');
    expect(lead.customer_email).toBe('bwells@example.com');
    expect(lead.customer_phone_e164).toBe('+12165550040');
    expect(lead.customer_zip).toBe('44113');
    expect(lead.service_area_county).toBe('Cuyahoga');
    expect(lead.out_of_service_area).toBe(0);
    expect(lead.status).toBe('ingested');
    expect(lead.source).toBe('website_form');
    expect(lead.scope_raw).toContain('Tree removal');
    expect(lead.scope_raw).toContain('large pine');
  });

  it('returns 401 for incorrect webhook secret and does NOT persist', async () => {
    const body = fixture('website-form-quote.json') as Record<string, unknown>;
    const res = await postWebsite({ ...body, secret: 'wrong-secret' });
    expect(res.status).toBe(401);

    const sqlite = getSqlite();
    const count = sqlite.prepare('SELECT count(*) c FROM leads').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('returns 400 for invalid body shape (missing required fields)', async () => {
    const res = await postWebsite({ name: 'X', secret: config.WEBSITE_FORM_WEBHOOK_SECRET });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');

    const sqlite = getSqlite();
    const count = sqlite.prepare('SELECT count(*) c FROM leads').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('out-of-service-area zip flags lead as out_of_service_area=1', async () => {
    const body = fixture('website-form-out-of-area.json') as Record<string, unknown>;
    const res = await postWebsite({ ...body, secret: config.WEBSITE_FORM_WEBHOOK_SECRET });
    expect(res.status).toBe(201);
    const respBody = (await res.json()) as { lead_id: string };

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare(
        'SELECT customer_zip, service_area_county, out_of_service_area FROM leads WHERE id = ?',
      )
      .get(respBody.lead_id) as {
      customer_zip: string;
      service_area_county: string | null;
      out_of_service_area: number;
    };
    expect(lead.customer_zip).toBe('33101');
    expect(lead.service_area_county).toBeNull();
    expect(lead.out_of_service_area).toBe(1);
  });

  it('handles missing email (empty string) — persists with null email', async () => {
    const body = fixture('website-form-missing-email.json') as Record<string, unknown>;
    const res = await postWebsite({ ...body, secret: config.WEBSITE_FORM_WEBHOOK_SECRET });
    expect(res.status).toBe(201);
    const respBody = (await res.json()) as { lead_id: string };

    const sqlite = getSqlite();
    const lead = sqlite
      .prepare('SELECT customer_email, customer_name FROM leads WHERE id = ?')
      .get(respBody.lead_id) as { customer_email: string | null; customer_name: string };
    expect(lead.customer_email).toBeNull();
    expect(lead.customer_name).toBe('Henry Park');
  });
});
