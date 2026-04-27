import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArboStarStubClient } from '../../app/clients/arbostar.client.js';
import { SendGridStubClient } from '../../app/clients/sendgrid.client.js';
import { SmsStubClient } from '../../app/clients/agent-phone.client.js';
import {
  auditLog,
  leads,
  leadSourceEvents,
  outboundMessages,
} from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { dispatchLead } from '../../app/services/outbound-dispatcher.service.js';
import { resetEmailValidatorCache } from '../../app/services/email-validator.service.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';

interface SeedSpec {
  source?: 'google_lsa_email' | 'website_form' | 'answerforce_email';
  status?: 'auto_sent' | 'manually_sent';
  customerName?: string | null;
  customerPhoneE164?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerZip?: string | null;
  serviceAreaCounty?: string | null;
  outOfServiceArea?: boolean;
  scopeRaw?: string;
  scopeCategory?: string | null;
  scopeSummary?: string | null;
  responseText?: string | null;
}

function pick<T>(spec: Record<string, unknown>, key: string, fallback: T): T {
  return key in spec ? (spec[key] as T) : fallback;
}

let counter = 0;
function seedReadyToDispatch(spec: SeedSpec): string {
  const db = getDb();
  const id = generateUuidV7();
  counter += 1;
  const receivedAt = new Date(Date.UTC(2026, 3, 27, 12, 0, counter, 0));

  const specRecord = spec as unknown as Record<string, unknown>;

  db.insert(leads)
    .values({
      id,
      receivedAt,
      source: spec.source ?? 'google_lsa_email',
      dedupPhoneE164: pick<string | null>(specRecord, 'customerPhoneE164', '+12165550001'),
      status: spec.status ?? 'auto_sent',
      customerName: pick<string | null>(specRecord, 'customerName', 'Diane Owens'),
      customerPhoneE164: pick<string | null>(specRecord, 'customerPhoneE164', '+12165550001'),
      customerEmail: pick<string | null>(specRecord, 'customerEmail', 'diane@premiertreesllc.com'),
      customerAddress: pick<string | null>(specRecord, 'customerAddress', '5234 Detroit Ave'),
      customerCity: pick<string | null>(specRecord, 'customerCity', 'Cleveland'),
      customerZip: pick<string | null>(specRecord, 'customerZip', '44113'),
      serviceAreaCounty: pick<string | null>(specRecord, 'serviceAreaCounty', 'Cuyahoga'),
      outOfServiceArea: spec.outOfServiceArea ?? false,
      scopeRaw: spec.scopeRaw ?? 'Big oak tree trim quote',
      scopeCategory: pick<string | null>(specRecord, 'scopeCategory', 'trimming'),
      scopeSummary: pick<string | null>(specRecord, 'scopeSummary', 'oak trim'),
      responseText: pick<string | null>(
        specRecord,
        'responseText',
        'Hi Diane — thank you for reaching out!',
      ),
      responseSentAt: receivedAt,
      responseSentBy: spec.status === 'manually_sent' ? 'user@premiertreesllc.com' : 'auto',
    })
    .run();

  db.insert(leadSourceEvents)
    .values({
      id: generateUuidV7(),
      leadId: id,
      source: spec.source ?? 'google_lsa_email',
      receivedAt,
      rawPayload: JSON.stringify({ scope: spec.scopeRaw ?? 'fixture' }),
    })
    .run();

  return id;
}

describe('dispatchLead (INTEGRATION_MODE=stub)', () => {
  beforeEach(() => {
    counter = 0;
    setupFreshDb();
    resetEmailValidatorCache();
  });
  afterEach(() => teardownDb());

  it('LSA auto_sent with email + phone → email + ArboStar synced', async () => {
    const id = seedReadyToDispatch({
      source: 'google_lsa_email',
      customerEmail: 'diane@premiertreesllc.com',
      customerPhoneE164: '+12165550001',
    });

    const emailClient = new SendGridStubClient({ inMemory: true });
    const smsClient = new SmsStubClient({ inMemory: true, enableImessage: true });
    const arboStarClient = new ArboStarStubClient({ inMemory: true });

    const result = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false); // LSA → only email primary, no SMS
    expect(result.arboStarSynced).toBe(true);
    expect(result.errors).toEqual([]);

    const messages = getDb()
      .select()
      .from(outboundMessages)
      .all()
      .filter((m) => m.leadId === id);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.channel).toBe('email');
    expect(messages[0]!.status).toBe('sent');
    expect(messages[0]!.providerMessageId).toMatch(/^stub_/);

    expect(emailClient.getRecords()).toHaveLength(1);
    expect(arboStarClient.getRecords()).toHaveLength(1);

    const lead = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(lead.arbostarRequestId).toMatch(/^stub_arbostar_/);
    expect(lead.arbostarSyncedAt).toBeTruthy();

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === id);
    expect(audits.find((a) => a.action === 'arbostar_synced')).toBeTruthy();
    expect(audits.find((a) => a.action === 'dispatched_outbound')).toBeTruthy();
  });

  it('Website form lead with email + phone → SMS primary + email follow-up + ArboStar', async () => {
    const id = seedReadyToDispatch({
      source: 'website_form',
      customerEmail: 'logan@premiertreesllc.com',
      customerPhoneE164: '+14405550005',
    });

    const emailClient = new SendGridStubClient({ inMemory: true });
    const smsClient = new SmsStubClient({ inMemory: true, enableImessage: true });
    const arboStarClient = new ArboStarStubClient({ inMemory: true });

    const result = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(true);
    expect(result.arboStarSynced).toBe(true);

    const messages = getDb()
      .select()
      .from(outboundMessages)
      .all()
      .filter((m) => m.leadId === id);
    expect(messages).toHaveLength(2);
    const channels = messages.map((m) => m.channel).sort();
    expect(channels).toEqual(['email', 'imessage']);
    expect(messages.every((m) => m.status === 'sent')).toBe(true);
  });

  it('Website form with undeliverable email → SMS sent, email failed with reason=undeliverable_email, ArboStar still synced', async () => {
    const id = seedReadyToDispatch({
      source: 'website_form',
      customerEmail: 'test@test.com', // blacklisted
      customerPhoneE164: '+14405550005',
    });

    const emailClient = new SendGridStubClient({ inMemory: true });
    const smsClient = new SmsStubClient({ inMemory: true, enableImessage: true });
    const arboStarClient = new ArboStarStubClient({ inMemory: true });

    const result = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(result.emailSent).toBe(false);
    expect(result.smsSent).toBe(true);
    expect(result.arboStarSynced).toBe(true);

    const messages = getDb()
      .select()
      .from(outboundMessages)
      .all()
      .filter((m) => m.leadId === id);
    const emailMsg = messages.find((m) => m.channel === 'email')!;
    expect(emailMsg.status).toBe('failed');
    expect(emailMsg.errorMessage).toContain('undeliverable_email');

    const smsMsg = messages.find((m) => m.channel === 'imessage' || m.channel === 'sms')!;
    expect(smsMsg.status).toBe('sent');

    expect(emailClient.getRecords()).toHaveLength(0);
    expect(arboStarClient.getRecords()).toHaveLength(1);
  });

  it('AnswerForce lead with no email → 0 channels sent, lead.status=failed, no ArboStar push', async () => {
    const id = seedReadyToDispatch({
      source: 'answerforce_email',
      customerEmail: null,
      customerPhoneE164: '+14405559999',
      customerName: 'Storm Caller',
    });

    const emailClient = new SendGridStubClient({ inMemory: true });
    const smsClient = new SmsStubClient({ inMemory: true, enableImessage: true });
    const arboStarClient = new ArboStarStubClient({ inMemory: true });

    const result = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(result.emailSent).toBe(false);
    expect(result.smsSent).toBe(false);
    expect(result.arboStarSynced).toBe(false);

    const lead = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(lead.status).toBe('failed');
    expect(lead.arbostarRequestId).toBeNull();

    expect(arboStarClient.getRecords()).toHaveLength(0);

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === id);
    expect(audits.find((a) => a.action === 'dispatch_failed')).toBeTruthy();
    expect(audits.find((a) => a.action === 'dispatched_outbound')).toBeTruthy();
  });

  it('idempotency: calling dispatchLead twice on the same lead does not re-send', async () => {
    const id = seedReadyToDispatch({
      source: 'google_lsa_email',
      customerEmail: 'diane@premiertreesllc.com',
      customerPhoneE164: '+12165550001',
    });

    const emailClient = new SendGridStubClient({ inMemory: true });
    const smsClient = new SmsStubClient({ inMemory: true, enableImessage: true });
    const arboStarClient = new ArboStarStubClient({ inMemory: true });

    const r1 = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(r1.emailSent).toBe(true);

    const r2 = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe('already_dispatched');

    expect(emailClient.getRecords()).toHaveLength(1);
    expect(arboStarClient.getRecords()).toHaveLength(1);

    const messages = getDb()
      .select()
      .from(outboundMessages)
      .all()
      .filter((m) => m.leadId === id);
    expect(messages).toHaveLength(1);
  });

  it('ArboStar fails all retries → outbound stays sent, lead stays auto_sent, audit logs arbostar_sync_failed', async () => {
    const id = seedReadyToDispatch({
      source: 'google_lsa_email',
      customerEmail: 'diane@premiertreesllc.com',
      customerPhoneE164: '+12165550001',
    });

    const emailClient = new SendGridStubClient({ inMemory: true });
    const smsClient = new SmsStubClient({ inMemory: true, enableImessage: true });
    const arboStarClient = new ArboStarStubClient({ inMemory: true, fail: true });

    const result = await dispatchLead(id, { emailClient, smsClient, arboStarClient });
    expect(result.emailSent).toBe(true);
    expect(result.arboStarSynced).toBe(false);

    const lead = getDb().select().from(leads).all().find((l) => l.id === id)!;
    expect(lead.status).toBe('auto_sent');
    expect(lead.arbostarRequestId).toBeNull();

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === id);
    expect(audits.find((a) => a.action === 'arbostar_sync_failed')).toBeTruthy();
    expect(audits.find((a) => a.action === 'dispatched_outbound')).toBeTruthy();

    const messages = getDb()
      .select()
      .from(outboundMessages)
      .all()
      .filter((m) => m.leadId === id);
    expect(messages.some((m) => m.status === 'sent')).toBe(true);
  });

  it('skips dispatch when lead is not in auto_sent or manually_sent', async () => {
    const db = getDb();
    const id = generateUuidV7();
    const now = new Date();
    db.insert(leads)
      .values({
        id,
        receivedAt: now,
        source: 'website_form',
        status: 'awaiting_review',
        customerEmail: 'someone@premiertreesllc.com',
        customerPhoneE164: '+12165550001',
        scopeRaw: 'review me',
        responseText: 'draft',
      })
      .run();
    db.insert(leadSourceEvents)
      .values({
        id: generateUuidV7(),
        leadId: id,
        source: 'website_form',
        receivedAt: now,
        rawPayload: '{}',
      })
      .run();

    const result = await dispatchLead(id);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('status_is_awaiting_review');
  });
});
