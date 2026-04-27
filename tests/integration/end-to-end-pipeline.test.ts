import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { leads } from '../../app/db/schema.js';
import { replayFixture } from '../../app/services/intake-replay.service.js';
import { processIngestedLeads } from '../../app/services/extraction-batch.service.js';
import { processExtractedLeads } from '../../app/services/response-batch.service.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';

describe('end-to-end pipeline (intake → extract → response)', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('replays LSA oak-trim → extract-batch → generate-responses → auto_sent with oak season verbiage', async () => {
    const replay = await replayFixture('lsa-oak-trim');
    expect(replay.status).toBe(201);
    const replayBody = replay.body as { lead_id: string; is_new: boolean };
    expect(replayBody.is_new).toBe(true);
    const leadId = replayBody.lead_id;

    const ingestedRow = getDb().select().from(leads).all().find((l) => l.id === leadId)!;
    expect(ingestedRow.status).toBe('ingested');

    const extractResult = await processIngestedLeads();
    expect(extractResult.failed).toBe(0);
    expect(extractResult.succeeded).toBeGreaterThanOrEqual(1);

    const extractedRow = getDb().select().from(leads).all().find((l) => l.id === leadId)!;
    expect(extractedRow.status).toBe('extracted');
    expect(extractedRow.customerName).toBe('Diane Owens');
    expect(extractedRow.scopeCategory).toBe('trimming');
    expect(extractedRow.serviceAreaCounty).toBe('Cuyahoga');
    expect(extractedRow.outOfServiceArea).toBe(false);
    expect(extractedRow.confidenceScore).toBeGreaterThanOrEqual(0.99);

    const respResult = await processExtractedLeads();
    expect(respResult.failed).toBe(0);
    expect(respResult.succeeded).toBeGreaterThanOrEqual(1);

    const finalRow = getDb().select().from(leads).all().find((l) => l.id === leadId)!;
    expect(finalRow.status).toBe('auto_sent');
    expect(finalRow.responseText).toBeTruthy();
    expect(finalRow.responseText).toContain('Oak season is currently closed until November');
    expect(finalRow.confidenceScore).toBeGreaterThanOrEqual(0.8);
  });

  it('replays answerforce-emergency → extract → response → manually_flagged with escalation_reason', async () => {
    const replay = await replayFixture('answerforce-emergency');
    expect(replay.status).toBe(201);
    const replayBody = replay.body as { lead_id: string; is_new: boolean };
    const leadId = replayBody.lead_id;

    await processIngestedLeads();
    await processExtractedLeads();

    const finalRow = getDb().select().from(leads).all().find((l) => l.id === leadId)!;
    expect(finalRow.status).toBe('manually_flagged');
    expect(finalRow.escalationTriggered).toBe(true);
    expect(finalRow.escalationReason).toBeTruthy();
    expect(finalRow.responseText).toBeNull();
  });
});
