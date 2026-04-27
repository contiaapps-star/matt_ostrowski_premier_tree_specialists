import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, leads, leadSourceEvents } from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { extractLeadData } from '../../app/services/extraction.service.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';

interface SeedSpec {
  source: 'google_lsa_email' | 'website_form' | 'answerforce_email';
  scopeRaw: string;
  parsedName?: string | null;
  parsedPhone?: string | null;
  parsedEmail?: string | null;
  parsedCity?: string | null;
  parsedZip?: string | null;
  customerPhoneE164?: string | null;
  customerEmail?: string | null;
  customerZip?: string | null;
  customerCity?: string | null;
  customerName?: string | null;
  status?: 'ingested' | 'extracted' | 'auto_sent';
}

function seedIngestedLead(spec: SeedSpec): string {
  const db = getDb();
  const leadId = generateUuidV7();
  const now = new Date();

  db.insert(leads)
    .values({
      id: leadId,
      receivedAt: now,
      source: spec.source,
      dedupPhoneE164: spec.customerPhoneE164 ?? null,
      status: spec.status ?? 'ingested',
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
            location: spec.parsedCity ? `${spec.parsedCity}, OH ${spec.parsedZip ?? ''}` : null,
            scope_raw: spec.scopeRaw,
          },
        };

  db.insert(leadSourceEvents)
    .values({
      id: generateUuidV7(),
      leadId,
      source: spec.source,
      receivedAt: now,
      rawPayload: JSON.stringify(payload),
    })
    .run();

  db.insert(auditLog)
    .values({
      id: generateUuidV7(),
      leadId,
      actor: 'system',
      action: 'ingested',
      details: JSON.stringify({ source: spec.source }),
    })
    .run();

  return leadId;
}

describe('extractLeadData (INTEGRATION_MODE=stub)', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('extracts the Diane Owens oak-trim lead → status=extracted, scope_category=trimming, county=Cuyahoga', async () => {
    const id = seedIngestedLead({
      source: 'google_lsa_email',
      scopeRaw: 'I have a big oak tree that I would like to have looked at. It will probably need trimming and I need a quote.',
      parsedName: 'Diane Owens',
      parsedPhone: '(216) 555-0001',
      customerPhoneE164: '+12165550001',
      customerName: 'Diane Owens',
      parsedCity: 'Cleveland',
      parsedZip: '44113',
    });

    const result = await extractLeadData(id);
    expect(result.status).toBe('extracted');
    expect(result.scopeCategory).toBe('trimming');
    expect(result.outOfServiceArea).toBe(false);

    const all = getDb().select().from(leads).all();
    const me = all.find((l) => l.id === id)!;
    expect(me.customerName).toBe('Diane Owens');
    expect(me.customerPhoneE164).toBe('+12165550001');
    expect(me.customerCity).toBe('Cleveland');
    expect(me.customerZip).toBe('44113');
    expect(me.serviceAreaCounty).toBe('Cuyahoga');
    expect(me.outOfServiceArea).toBe(false);
    expect(me.scopeCategory).toBe('trimming');
    expect(me.scopeSummary).toBeTruthy();
    expect(me.status).toBe('extracted');
    expect(me.confidenceScore).toBeGreaterThanOrEqual(0.5);
  });

  it('flags emergency-storm lead with escalation_triggered=true and status=extracted', async () => {
    const id = seedIngestedLead({
      source: 'answerforce_email',
      scopeRaw: 'Need emergency tree removal — large oak limb fell on roof during storm last night.',
      parsedName: 'Marilyn Hornig',
      parsedPhone: '(440) 555-0003',
      customerPhoneE164: '+14405550003',
      customerName: 'Marilyn Hornig',
      parsedCity: 'Rocky River',
      parsedZip: '44116',
    });

    const result = await extractLeadData(id);
    expect(result.status).toBe('extracted');
    expect(result.scopeCategory).toBe('emergency');

    const all = getDb().select().from(leads).all();
    const me = all.find((l) => l.id === id)!;
    expect(me.escalationTriggered).toBe(true);
    expect(me.escalationReason).toContain('emergency');
    expect(me.status).toBe('extracted');
  });

  it('marks Florida 33101 lead as out_of_service_area=true (still status=extracted)', async () => {
    const id = seedIngestedLead({
      source: 'website_form',
      scopeRaw: 'Hi, looking for tree trimming services for a few palm trees in my yard. Miami 33101',
      parsedName: 'Lisa Garcia',
      parsedPhone: '(305) 555-0060',
      parsedEmail: 'lgarcia@example.com',
      parsedCity: 'Miami',
      parsedZip: '33101',
      customerPhoneE164: '+13055550060',
      customerEmail: 'lgarcia@example.com',
      customerZip: '33101',
    });

    const result = await extractLeadData(id);
    expect(result.status).toBe('extracted');
    expect(result.outOfServiceArea).toBe(true);

    const all = getDb().select().from(leads).all();
    const me = all.find((l) => l.id === id)!;
    expect(me.outOfServiceArea).toBe(true);
    expect(me.serviceAreaCounty).toBeNull();
    expect(me.customerZip).toBe('33101');
  });

  it('flags incomplete website form (no phone, no email) as manually_flagged with audit log', async () => {
    const id = seedIngestedLead({
      source: 'website_form',
      scopeRaw: '__incomplete_form__ Quote please',
    });

    const result = await extractLeadData(id);
    expect(result.status).toBe('manually_flagged');

    const all = getDb().select().from(leads).all();
    const me = all.find((l) => l.id === id)!;
    expect(me.status).toBe('manually_flagged');

    const audits = getDb().select().from(auditLog).all();
    const flagged = audits.filter((a) => a.leadId === id && a.action === 'manually_flagged');
    expect(flagged.length).toBe(1);
    const detail = JSON.parse(flagged[0]!.details ?? '{}') as { reason?: string };
    expect(detail.reason).toBe('missing_critical_contact_info');
  });

  it('is idempotent: leads with status != ingested are not reprocessed', async () => {
    const id = seedIngestedLead({
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
      customerName: 'Barbara Wells',
      status: 'extracted',
    });

    const before = getDb().select().from(leads).all().find((l) => l.id === id)!;
    const result = await extractLeadData(id);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('status_is_extracted');

    const after = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(after.status).toBe(before.status);
    expect(after.scopeCategory).toBe(before.scopeCategory);
    expect(after.scopeSummary).toBe(before.scopeSummary);

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === id);
    const extractedActions = audits.filter((a) => a.action === 'extracted');
    expect(extractedActions.length).toBe(0);
  });
});
