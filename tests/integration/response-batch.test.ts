import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { config } from '../../app/config.js';
import { auditLog, leads, leadSourceEvents } from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { processExtractedLeads } from '../../app/services/response-batch.service.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';

interface SeedSpec {
  source?: 'google_lsa_email' | 'website_form' | 'answerforce_email';
  scopeRaw: string;
  customerName?: string | null;
  customerPhoneE164?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerZip?: string | null;
  serviceAreaCounty?: string | null;
  outOfServiceArea?: boolean;
  scopeCategory?: string | null;
  scopeSummary?: string | null;
  confidenceScore?: number | null;
}

let counter = 0;
function seedExtractedLead(spec: SeedSpec): string {
  const db = getDb();
  const id = generateUuidV7();
  counter += 1;
  const receivedAt = new Date(Date.UTC(2026, 3, 27, 12, 0, counter, 0));

  db.insert(leads)
    .values({
      id,
      receivedAt,
      source: spec.source ?? 'website_form',
      dedupPhoneE164: spec.customerPhoneE164 ?? null,
      status: 'extracted',
      customerName: spec.customerName ?? null,
      customerPhoneE164: spec.customerPhoneE164 ?? null,
      customerEmail: spec.customerEmail ?? null,
      customerAddress: spec.customerAddress ?? null,
      customerCity: spec.customerCity ?? null,
      customerZip: spec.customerZip ?? null,
      serviceAreaCounty: spec.serviceAreaCounty ?? null,
      outOfServiceArea: spec.outOfServiceArea ?? false,
      scopeRaw: spec.scopeRaw,
      scopeCategory: spec.scopeCategory ?? null,
      scopeSummary: spec.scopeSummary ?? null,
      confidenceScore: spec.confidenceScore ?? 1.0,
    })
    .run();

  db.insert(leadSourceEvents)
    .values({
      id: generateUuidV7(),
      leadId: id,
      source: spec.source ?? 'website_form',
      receivedAt,
      rawPayload: JSON.stringify({ scope: spec.scopeRaw }),
    })
    .run();

  db.insert(auditLog)
    .values({
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'extracted',
      details: '{}',
    })
    .run();

  return id;
}

describe('processExtractedLeads (batch response generation)', () => {
  beforeEach(() => {
    counter = 0;
    setupFreshDb();
  });
  afterEach(() => teardownDb());

  it('routes 5 extracted leads to the correct statuses based on fixtures', async () => {
    const auto = seedExtractedLead({
      source: 'google_lsa_email',
      customerName: 'Diane Owens',
      customerPhoneE164: '+12165550001',
      customerEmail: 'diane@example.com',
      customerAddress: '5234 Detroit Ave',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw:
        'I have a big oak tree that I would like to have looked at. It will probably need trimming and I need a quote.',
      scopeCategory: 'trimming',
      scopeSummary: 'Estimate for trimming a large oak tree',
      confidenceScore: 1.0,
    });

    const review = seedExtractedLead({
      source: 'website_form',
      customerName: 'Logan Davis',
      customerPhoneE164: '+14405550005',
      customerEmail: 'ldavis@example.com',
      customerAddress: '12 Brunswick Ln',
      customerCity: 'Brunswick',
      customerZip: '44212',
      serviceAreaCounty: 'Medina',
      scopeRaw: 'Plant health care consultation for sick maple',
      scopeCategory: 'plant_health',
      scopeSummary: 'PHC consultation for ailing maple',
      confidenceScore: 1.0,
    });

    const oosa = seedExtractedLead({
      source: 'website_form',
      customerName: 'Lisa Garcia',
      customerPhoneE164: '+13055550060',
      customerEmail: 'lgarcia@example.com',
      customerAddress: '200 Ocean Drive',
      customerCity: 'Miami',
      customerZip: '33101',
      serviceAreaCounty: null,
      outOfServiceArea: true,
      scopeRaw: 'Tree trimming for palm trees in my yard. Miami 33101',
      scopeCategory: 'trimming',
      scopeSummary: 'Palm tree trimming',
      confidenceScore: 1.0,
    });

    const lowConf = seedExtractedLead({
      source: 'website_form',
      customerName: 'low_confidence_marker User',
      customerPhoneE164: '+14405551111',
      customerEmail: 'unclear@example.com',
      customerAddress: '1 Unknown St',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw: 'low_confidence_marker quote please',
      scopeCategory: 'other',
      scopeSummary: 'Generic quote request',
      confidenceScore: 1.0,
    });

    const escalated = seedExtractedLead({
      source: 'answerforce_email',
      customerName: 'Storm Caller',
      customerPhoneE164: '+14405559999',
      customerCity: 'Rocky River',
      customerZip: '44116',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw: 'A tree fell on my roof during last night storm. Please come immediately.',
      scopeCategory: 'emergency',
      scopeSummary: 'Storm damage — tree on roof',
      confidenceScore: 1.0,
    });

    const result = await processExtractedLeads();
    expect(result.processed).toBe(5);
    expect(result.succeeded).toBe(5);
    expect(result.failed).toBe(0);

    const rows = getDb().select().from(leads).all();
    const find = (id: string) => rows.find((r) => r.id === id)!;

    expect(find(auto).status).toBe('auto_sent');
    expect(find(auto).responseText).toContain('Oak season is currently closed');

    expect(find(review).status).toBe('awaiting_review');
    expect(find(review).responseText).toBeTruthy();

    expect(find(oosa).status).toBe('awaiting_review');
    expect(find(oosa).responseText).toBeTruthy();

    expect(find(lowConf).status).toBe('manually_flagged');
    expect(find(lowConf).responseText).toBeNull();

    expect(find(escalated).status).toBe('manually_flagged');
    expect(find(escalated).escalationTriggered).toBe(true);
    expect(find(escalated).responseText).toBeNull();
  });

  it('does not reprocess leads in non-extracted statuses', async () => {
    const id = seedExtractedLead({
      customerName: 'Diane Owens',
      customerPhoneE164: '+12165550001',
      customerEmail: 'diane@example.com',
      customerAddress: '5234 Detroit Ave',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw: 'big oak tree trim quote',
      scopeCategory: 'trimming',
      scopeSummary: 'oak trim',
      confidenceScore: 1.0,
    });

    const first = await processExtractedLeads();
    expect(first.processed).toBe(1);

    const second = await processExtractedLeads();
    expect(second.processed).toBe(0);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('auto_sent');
  });
});

describe('POST /api/admin/generate-responses', () => {
  beforeEach(() => {
    counter = 0;
    setupFreshDb();
  });
  afterEach(() => teardownDb());

  it('returns 401 when X-Admin-Token is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/generate-responses', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Admin-Token does not match SESSION_SECRET', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/generate-responses', {
      method: 'POST',
      headers: { 'x-admin-token': 'wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with batch result when token matches', async () => {
    seedExtractedLead({
      customerName: 'Diane Owens',
      customerPhoneE164: '+12165550001',
      customerEmail: 'diane@example.com',
      customerAddress: '5234 Detroit Ave',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw: 'big oak tree trim',
      scopeCategory: 'trimming',
      scopeSummary: 'oak trim',
      confidenceScore: 1.0,
    });

    const app = createApp();
    const res = await app.request('/api/admin/generate-responses', {
      method: 'POST',
      headers: { 'x-admin-token': config.SESSION_SECRET ?? '' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; succeeded: number };
    expect(body.processed).toBe(1);
    expect(body.succeeded).toBe(1);
  });
});
