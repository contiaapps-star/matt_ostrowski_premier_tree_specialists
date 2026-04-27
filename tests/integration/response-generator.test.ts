import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenRouterClient } from '../../app/clients/openrouter.client.js';
import { auditLog, leads, leadSourceEvents } from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { generateResponse } from '../../app/services/response-generator.service.js';
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
  status?: 'extracted' | 'awaiting_review' | 'auto_sent' | 'manually_flagged';
  escalationTriggered?: boolean;
  escalationReason?: string | null;
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
      status: spec.status ?? 'extracted',
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
      escalationTriggered: spec.escalationTriggered ?? false,
      escalationReason: spec.escalationReason ?? null,
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

describe('generateResponse (INTEGRATION_MODE=stub)', () => {
  beforeEach(() => {
    counter = 0;
    setupFreshDb();
  });
  afterEach(() => teardownDb());

  it('routes oak-trim Cleveland (high confidence, complete data) → auto_sent with oak season verbiage', async () => {
    const id = seedExtractedLead({
      source: 'google_lsa_email',
      customerName: 'Diane Owens',
      customerPhoneE164: '+12165550001',
      customerEmail: 'diane@example.com',
      customerAddress: '5234 Detroit Ave',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      outOfServiceArea: false,
      scopeRaw:
        'I have a big oak tree that I would like to have looked at. It will probably need trimming and I need a quote.',
      scopeCategory: 'trimming',
      scopeSummary: 'Estimate for trimming a large oak tree',
      confidenceScore: 1.0,
    });

    const result = await generateResponse(id);
    expect(result.status).toBe('auto_sent');
    expect(result.finalConfidence).toBeGreaterThanOrEqual(0.8);
    expect(result.responseTextSet).toBe(true);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('auto_sent');
    expect(me.responseText).toBeTruthy();
    expect(me.responseText).toContain('Oak season is currently closed until November');
    expect(me.confidenceScore).toBeGreaterThanOrEqual(0.8);
  });

  it('routes "tree on roof" emergency lead → manually_flagged with escalation_reason mentioning "tree on roof", response_text NULL', async () => {
    const id = seedExtractedLead({
      source: 'answerforce_email',
      customerName: 'Storm Caller',
      customerPhoneE164: '+14405559999',
      customerCity: 'Rocky River',
      customerZip: '44116',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw: 'A tree fell on my roof during the storm last night, please help.',
      scopeCategory: 'emergency',
      scopeSummary: 'Tree on roof — storm damage',
      confidenceScore: 1.0,
    });

    const result = await generateResponse(id);
    expect(result.status).toBe('manually_flagged');
    expect(result.escalationTriggered).toBe(true);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('manually_flagged');
    expect(me.escalationTriggered).toBe(true);
    expect(me.escalationReason).toBeTruthy();
    expect(me.escalationReason!.toLowerCase()).toContain('tree on roof');
    expect(me.responseText).toBeNull();

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === id);
    const escalation = audits.find((a) => a.action === 'escalation_detected');
    expect(escalation).toBeTruthy();
    const routed = audits.find((a) => a.action === 'routed_manually_flagged');
    expect(routed).toBeTruthy();
  });

  it('routes plant-health medium-confidence lead → awaiting_review with response_text present', async () => {
    const id = seedExtractedLead({
      source: 'website_form',
      customerName: 'Logan Davis',
      customerPhoneE164: '+14405550005',
      customerEmail: 'ldavis@example.com',
      customerAddress: '12 Brunswick Ln',
      customerCity: 'Brunswick',
      customerZip: '44212',
      serviceAreaCounty: 'Medina',
      outOfServiceArea: false,
      scopeRaw: 'Plant health care consultation for sick maple',
      scopeCategory: 'plant_health',
      scopeSummary: 'PHC consultation for ailing maple',
      confidenceScore: 1.0,
    });

    const result = await generateResponse(id);
    expect(result.status).toBe('awaiting_review');
    expect(result.responseTextSet).toBe(true);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('awaiting_review');
    expect(me.responseText).toBeTruthy();
    expect(me.confidenceScore).toBeGreaterThanOrEqual(0.5);
    expect(me.confidenceScore).toBeLessThan(0.8);
  });

  it('routes Florida out-of-area lead → awaiting_review even when LLM confidence is high (override)', async () => {
    const id = seedExtractedLead({
      source: 'website_form',
      customerName: 'Lisa Garcia',
      customerPhoneE164: '+13055550060',
      customerEmail: 'lgarcia@example.com',
      customerAddress: '200 Ocean Drive',
      customerCity: 'Miami',
      customerZip: '33101',
      serviceAreaCounty: null,
      outOfServiceArea: true,
      scopeRaw: 'Hi, looking for tree trimming services for a few palm trees in my yard. Miami 33101',
      scopeCategory: 'trimming',
      scopeSummary: 'Tree trimming for palm trees',
      confidenceScore: 1.0,
    });

    const result = await generateResponse(id);
    expect(result.status).toBe('awaiting_review');
    expect(result.responseTextSet).toBe(true);
    expect(result.finalConfidence).toBeGreaterThanOrEqual(0.8);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('awaiting_review');
    expect(me.responseText).toBeTruthy();
  });

  it('routes a low-confidence lead (LLM says 0.35) → manually_flagged with response_text NULL', async () => {
    const id = seedExtractedLead({
      source: 'website_form',
      customerName: 'low_confidence_marker User',
      customerPhoneE164: '+14405551111',
      customerEmail: 'unclear@example.com',
      customerAddress: '1 Unknown St',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      outOfServiceArea: false,
      scopeRaw: 'low_confidence_marker quote please',
      scopeCategory: 'other',
      scopeSummary: 'Generic quote request',
      confidenceScore: 1.0,
    });

    const result = await generateResponse(id);
    expect(result.status).toBe('manually_flagged');
    expect(result.responseTextSet).toBe(false);
    expect(result.finalConfidence).toBeLessThan(0.5);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('manually_flagged');
    expect(me.responseText).toBeNull();
    expect(me.confidenceScore).toBeLessThan(0.5);
  });

  it('falls back to manually_flagged with reason=llm_unavailable when LLM fails', async () => {
    const id = seedExtractedLead({
      source: 'website_form',
      customerName: 'Will Fail',
      customerPhoneE164: '+14405552222',
      customerEmail: 'fail@example.com',
      customerAddress: '99 Fail Rd',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      scopeRaw: 'Need a tree trim quote, nothing fancy.',
      scopeCategory: 'trimming',
      scopeSummary: 'Trim quote',
      confidenceScore: 1.0,
    });

    let attempts = 0;
    const failingClient: OpenRouterClient = {
      async complete() {
        attempts += 1;
        throw new Error('simulated llm failure');
      },
    };

    const result = await generateResponse(id, { llm: failingClient });
    expect(result.status).toBe('manually_flagged');
    expect(result.reason).toBe('llm_unavailable');
    expect(attempts).toBeGreaterThanOrEqual(1);

    const me = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(me.status).toBe('manually_flagged');
    expect(me.responseText).toBeNull();

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === id);
    const failure = audits.find((a) => a.action === 'response_generation_failed');
    expect(failure).toBeTruthy();
    const detail = JSON.parse(failure!.details ?? '{}') as { reason?: string };
    expect(detail.reason).toBe('llm_unavailable');
  });

  it('skips leads not in extracted status', async () => {
    const id = seedExtractedLead({
      scopeRaw: 'Trim quote',
      customerName: 'Already Sent',
      customerPhoneE164: '+14405553333',
      customerEmail: 'sent@example.com',
      customerAddress: '1 Sent St',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      scopeCategory: 'trimming',
      scopeSummary: 'Trim',
      confidenceScore: 1.0,
      status: 'auto_sent',
    });

    const result = await generateResponse(id);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('status_is_auto_sent');
  });
});
