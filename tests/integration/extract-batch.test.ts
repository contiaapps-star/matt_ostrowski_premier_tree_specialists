import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, leads, leadSourceEvents } from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { processIngestedLeads } from '../../app/services/extraction-batch.service.js';
import { createApp } from '../../app/app.js';
import { config } from '../../app/config.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';

interface SeedSpec {
  source: 'google_lsa_email' | 'website_form' | 'answerforce_email';
  scopeRaw: string;
  customerPhoneE164?: string | null;
  customerEmail?: string | null;
  customerZip?: string | null;
  customerCity?: string | null;
  customerName?: string | null;
  parsedName?: string | null;
  parsedPhone?: string | null;
  parsedEmail?: string | null;
  parsedCity?: string | null;
  parsedZip?: string | null;
}

let counter = 0;
function seed(spec: SeedSpec): string {
  const db = getDb();
  const id = generateUuidV7();
  counter += 1;
  const now = new Date(Date.UTC(2026, 3, 26, 12, 0, counter, 0));

  db.insert(leads)
    .values({
      id,
      receivedAt: now,
      source: spec.source,
      dedupPhoneE164: spec.customerPhoneE164 ?? null,
      status: 'ingested',
      customerName: spec.customerName ?? null,
      customerPhoneE164: spec.customerPhoneE164 ?? null,
      customerEmail: spec.customerEmail ?? null,
      customerZip: spec.customerZip ?? null,
      customerCity: spec.customerCity ?? null,
      scopeRaw: spec.scopeRaw,
    })
    .run();

  const payload =
    spec.source === 'website_form'
      ? {
          name: spec.parsedName ?? null,
          email: spec.parsedEmail ?? null,
          phone: spec.parsedPhone ?? null,
          city: spec.parsedCity ?? null,
          zip: spec.parsedZip ?? null,
          message: spec.scopeRaw,
        }
      : {
          raw_email: '...',
          parsed: {
            name: spec.parsedName ?? null,
            phone: spec.parsedPhone ?? null,
            location: null,
            scope_raw: spec.scopeRaw,
          },
        };

  db.insert(leadSourceEvents)
    .values({
      id: generateUuidV7(),
      leadId: id,
      source: spec.source,
      receivedAt: now,
      rawPayload: JSON.stringify(payload),
    })
    .run();

  db.insert(auditLog)
    .values({
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'ingested',
      details: '{}',
    })
    .run();

  return id;
}

describe('processIngestedLeads (batch)', () => {
  beforeEach(() => {
    counter = 0;
    setupFreshDb();
  });
  afterEach(() => teardownDb());

  it('processes all 5 ingested leads, leaving each in extracted or manually_flagged', async () => {
    const ids = [
      seed({
        source: 'google_lsa_email',
        scopeRaw: 'I have a big oak tree that I would like to have trimmed.',
        parsedName: 'Diane Owens',
        parsedPhone: '(216) 555-0001',
        customerPhoneE164: '+12165550001',
        customerName: 'Diane Owens',
        parsedCity: 'Cleveland',
        parsedZip: '44113',
      }),
      seed({
        source: 'website_form',
        scopeRaw: 'Bedford Heights — tree removal in front yard',
        parsedName: 'Barbara Wells',
        parsedPhone: '(440) 555-0002',
        parsedEmail: 'bwells@example.com',
        parsedCity: 'Bedford Heights',
        parsedZip: '44146',
        customerPhoneE164: '+14405550002',
        customerEmail: 'bwells@example.com',
        customerZip: '44146',
      }),
      seed({
        source: 'answerforce_email',
        scopeRaw: 'large oak limb fell on roof during storm',
        parsedName: 'Marilyn Hornig',
        parsedPhone: '(440) 555-0003',
        customerPhoneE164: '+14405550003',
        customerName: 'Marilyn Hornig',
        parsedCity: 'Rocky River',
        parsedZip: '44116',
      }),
      seed({
        source: 'website_form',
        scopeRaw: 'Miami 33101 — palm trim please',
        parsedName: 'Lisa Garcia',
        parsedPhone: '(305) 555-0060',
        parsedEmail: 'lgarcia@example.com',
        parsedCity: 'Miami',
        parsedZip: '33101',
        customerPhoneE164: '+13055550060',
        customerEmail: 'lgarcia@example.com',
        customerZip: '33101',
      }),
      seed({
        source: 'website_form',
        scopeRaw: '__incomplete_form__ Quote please',
      }),
    ];

    const result = await processIngestedLeads();
    expect(result.processed).toBe(5);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(0);

    const rows = getDb().select().from(leads).all();
    const ours = rows.filter((r) => ids.includes(r.id));
    expect(ours.length).toBe(5);
    for (const r of ours) {
      expect(['extracted', 'manually_flagged']).toContain(r.status);
    }

    const stillIngested = ours.filter((r) => r.status === 'ingested');
    expect(stillIngested).toHaveLength(0);
  });

  it('does not reprocess leads in non-ingested statuses', async () => {
    const id = seed({
      source: 'website_form',
      scopeRaw: 'Bedford Heights — tree removal in front yard',
      parsedName: 'Barbara Wells',
      parsedPhone: '(440) 555-0002',
      parsedEmail: 'bwells@example.com',
      parsedCity: 'Bedford Heights',
      parsedZip: '44146',
      customerPhoneE164: '+14405550002',
      customerEmail: 'bwells@example.com',
      customerZip: '44146',
    });
    await processIngestedLeads();
    const second = await processIngestedLeads();
    expect(second.processed).toBe(0);

    const me = getDb().select().from(leads).all().find((r) => r.id === id)!;
    expect(me.status).toBe('extracted');
  });
});

describe('POST /api/admin/extract-batch', () => {
  beforeEach(() => {
    counter = 0;
    setupFreshDb();
  });
  afterEach(() => teardownDb());

  it('returns 401 when X-Admin-Token is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/extract-batch', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Admin-Token does not match SESSION_SECRET', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/extract-batch', {
      method: 'POST',
      headers: { 'x-admin-token': 'wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with batch result when token matches', async () => {
    seed({
      source: 'google_lsa_email',
      scopeRaw: 'I have a big oak tree that I would like to have trimmed.',
      parsedName: 'Diane Owens',
      parsedPhone: '(216) 555-0001',
      customerPhoneE164: '+12165550001',
      customerName: 'Diane Owens',
      parsedCity: 'Cleveland',
      parsedZip: '44113',
    });

    const app = createApp();
    const res = await app.request('/api/admin/extract-batch', {
      method: 'POST',
      headers: { 'x-admin-token': config.SESSION_SECRET ?? '' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; succeeded: number };
    expect(body.processed).toBe(1);
    expect(body.succeeded).toBe(1);
  });
});
