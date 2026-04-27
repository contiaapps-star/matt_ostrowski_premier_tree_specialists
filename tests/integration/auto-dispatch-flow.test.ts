import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, leads, outboundMessages } from '../../app/db/schema.js';
import { replayFixture } from '../../app/services/intake-replay.service.js';
import { processIngestedLeads } from '../../app/services/extraction-batch.service.js';
import { processExtractedLeads } from '../../app/services/response-batch.service.js';
import { resetEmailValidatorCache } from '../../app/services/email-validator.service.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';

describe('auto-dispatch flow (replay → extract → generate → dispatch)', () => {
  beforeEach(() => {
    setupFreshDb();
    resetEmailValidatorCache();
  });
  afterEach(() => teardownDb());

  it('LSA oak-trim falls into auto_sent and dispatches automatically', async () => {
    const replay = await replayFixture('lsa-oak-trim');
    expect(replay.status).toBe(201);
    const replayBody = replay.body as { lead_id: string };
    const leadId = replayBody.lead_id;

    await processIngestedLeads();
    await processExtractedLeads();

    const finalRow = getDb().select().from(leads).all().find((l) => l.id === leadId)!;
    expect(finalRow.status).toBe('auto_sent');
    expect(finalRow.responseText).toBeTruthy();
    expect(finalRow.responseSentAt).toBeTruthy();
    expect(finalRow.responseSentBy).toBe('auto');
    expect(finalRow.arbostarRequestId).toMatch(/^stub_arbostar_/);

    const messages = getDb()
      .select()
      .from(outboundMessages)
      .all()
      .filter((m) => m.leadId === leadId);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.channel === 'email' && m.status === 'sent')).toBe(true);

    const audits = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.leadId === leadId);
    expect(audits.find((a) => a.action === 'dispatched_outbound')).toBeTruthy();
    expect(audits.find((a) => a.action === 'arbostar_synced')).toBeTruthy();
  });
});
