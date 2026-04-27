import { describe, expect, it, vi } from 'vitest';
import {
  ArboStarAuthError,
  ArboStarLiveClient,
  ArboStarRequestError,
  ArboStarStubClient,
  createArboStarClient,
} from '../../app/clients/arbostar.client.js';
import { __testing as dispatcherTesting } from '../../app/services/outbound-dispatcher.service.js';
import type { Lead } from '../../app/db/schema.js';

function makeLiveClient(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof ArboStarLiveClient>[0]> = {},
) {
  return new ArboStarLiveClient({
    companyId: 'demo',
    apiKey: 'test-key',
    fetchImpl,
    backoffMs: [0, 0, 0, 0],
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

const VALID_PAYLOAD = {
  name: 'Diane Owens',
  email: 'diane@example.com',
  phone: '+12165550001',
  address: '5234 Detroit Ave',
  city: 'Cleveland',
  state: 'OH',
  postal: '44113',
  country: 'US',
  details: 'Trim quote',
  address_notes: 'Source: Google LSA Email',
};

describe('ArboStarStubClient', () => {
  it('records payload + returns fake requestId', async () => {
    const stub = new ArboStarStubClient({ inMemory: true });
    const out = await stub.createRequest(VALID_PAYLOAD);
    expect(out.requestId).toMatch(/^stub_arbostar_/);
    expect(stub.getRecords()[0]!.payload).toEqual(VALID_PAYLOAD);
  });

  it('throws when fail flag is set (used to simulate retries failing)', async () => {
    const stub = new ArboStarStubClient({ inMemory: true, fail: true });
    await expect(stub.createRequest(VALID_PAYLOAD)).rejects.toBeInstanceOf(ArboStarRequestError);
  });
});

describe('ArboStarLiveClient', () => {
  it('parses request_id from a 200 response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ request_id: 'arb_abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    const out = await client.createRequest(VALID_PAYLOAD);
    expect(out.requestId).toBe('arb_abc');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('hits the company-specific URL', async () => {
    const fetchImpl = vi.fn(
      async (url: string | URL) => {
        const u = typeof url === 'string' ? url : url.toString();
        expect(u).toBe('https://demo.arbostar.com/api/requests/create');
        return new Response(JSON.stringify({ request_id: 'arb_x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    await client.createRequest(VALID_PAYLOAD);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx (up to 4 attempts)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: 'arb_recovered' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    const out = await client.createRequest(VALID_PAYLOAD);
    expect(out.requestId).toBe('arb_recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws ArboStarRequestError on 400 without retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }));
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    await expect(client.createRequest(VALID_PAYLOAD)).rejects.toBeInstanceOf(ArboStarRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws ArboStarAuthError when companyId or apiKey missing', async () => {
    const client = makeLiveClient(vi.fn() as unknown as typeof fetch, { apiKey: '' });
    await expect(client.createRequest(VALID_PAYLOAD)).rejects.toBeInstanceOf(ArboStarAuthError);
  });
});

describe('createArboStarClient factory', () => {
  it('returns the stub when INTEGRATION_MODE=stub', () => {
    const cfg = {
      INTEGRATION_MODE: 'stub',
      ARBOSTAR_COMPANY_ID: '',
      ARBOSTAR_API_KEY: '',
    } as unknown as Parameters<typeof createArboStarClient>[0];
    expect(createArboStarClient(cfg)).toBeInstanceOf(ArboStarStubClient);
  });

  it('returns the live client when INTEGRATION_MODE=live', () => {
    const cfg = {
      INTEGRATION_MODE: 'live',
      ARBOSTAR_COMPANY_ID: 'co1',
      ARBOSTAR_API_KEY: 'k',
    } as unknown as Parameters<typeof createArboStarClient>[0];
    expect(createArboStarClient(cfg)).toBeInstanceOf(ArboStarLiveClient);
  });
});

describe('ArboStar field mapping (snapshot)', () => {
  it('maps a fully-populated lead into the expected payload', () => {
    const now = new Date('2026-04-27T12:00:00Z');
    const lead: Lead = {
      id: 'lead-x',
      receivedAt: now,
      source: 'google_lsa_email',
      dedupPhoneE164: '+12165550001',
      status: 'auto_sent',
      customerName: 'Diane Owens',
      customerPhoneE164: '+12165550001',
      customerEmail: 'diane@example.com',
      customerAddress: '5234 Detroit Ave',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
      outOfServiceArea: false,
      scopeRaw: 'I have a big oak tree that I would like to have looked at.',
      scopeCategory: 'trimming',
      scopeSummary: 'Estimate for trimming a large oak tree',
      confidenceScore: 0.92,
      confidenceReasoning: 'high',
      escalationTriggered: false,
      escalationReason: null,
      responseText: 'Reply',
      responseSentAt: now,
      responseSentBy: 'auto',
      arbostarRequestId: null,
      arbostarSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    } as Lead;

    const payload = dispatcherTesting.buildArboStarPayload(lead);
    expect(payload).toEqual({
      name: 'Diane Owens',
      email: 'diane@example.com',
      phone: '+12165550001',
      address: '5234 Detroit Ave',
      city: 'Cleveland',
      state: 'OH',
      postal: '44113',
      country: 'US',
      details:
        'Original message: I have a big oak tree that I would like to have looked at.\n\nSummary: Estimate for trimming a large oak tree\n\nCategory: trimming',
      address_notes: 'Source: Google LSA Email',
    });
  });

  it('uses the answerforce label when source is answerforce_email', () => {
    const lead = {
      id: 'l',
      receivedAt: new Date(),
      source: 'answerforce_email',
      dedupPhoneE164: null,
      status: 'auto_sent',
      customerName: null,
      customerPhoneE164: null,
      customerEmail: null,
      customerAddress: null,
      customerCity: null,
      customerZip: null,
      serviceAreaCounty: null,
      outOfServiceArea: false,
      scopeRaw: 'after-hours call',
      scopeCategory: null,
      scopeSummary: null,
      confidenceScore: 0.5,
      confidenceReasoning: null,
      escalationTriggered: false,
      escalationReason: null,
      responseText: null,
      responseSentAt: null,
      responseSentBy: null,
      arbostarRequestId: null,
      arbostarSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Lead;
    const payload = dispatcherTesting.buildArboStarPayload(lead);
    expect(payload.address_notes).toBe('Source: AnswerForce');
    expect(payload.state).toBe('OH');
    expect(payload.country).toBe('US');
  });
});
