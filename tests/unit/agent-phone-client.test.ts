import { describe, expect, it, vi } from 'vitest';
import {
  AgentPhoneLiveClient,
  SmsAuthError,
  SmsRequestError,
  SmsStubClient,
  TwilioLiveClient,
  createSmsClient,
} from '../../app/clients/agent-phone.client.js';

function makeAgent(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof AgentPhoneLiveClient>[0]> = {},
) {
  return new AgentPhoneLiveClient({
    apiKey: 'test-key',
    fromNumber: '+12162458908',
    enableImessage: true,
    fetchImpl,
    backoffMs: [0, 0, 0],
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

describe('SmsStubClient', () => {
  it('records the message in memory and returns a fake id', async () => {
    const stub = new SmsStubClient({ inMemory: true, enableImessage: true });
    const out = await stub.send({ to: '+12165550001', body: 'hello', useImessage: true });
    expect(out.providerMessageId).toMatch(/^stub_/);
    expect(out.channelUsed).toBe('imessage');
    const recs = stub.getRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0]!.to).toBe('+12165550001');
    expect(recs[0]!.channel).toBe('imessage');
  });

  it('falls back to sms when imessage is disabled', async () => {
    const stub = new SmsStubClient({ inMemory: true, enableImessage: false });
    const out = await stub.send({ to: '+12165550001', body: 'hello' });
    expect(out.channelUsed).toBe('sms');
  });
});

describe('AgentPhoneLiveClient', () => {
  it('returns providerMessageId from a successful response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'ap_xyz' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = makeAgent(fetchImpl as unknown as typeof fetch);
    const out = await client.send({ to: '+12165550001', body: 'hi', useImessage: true });
    expect(out.providerMessageId).toBe('ap_xyz');
    expect(out.channelUsed).toBe('imessage');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'ap_recovered' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const client = makeAgent(fetchImpl as unknown as typeof fetch);
    const out = await client.send({ to: '+12165550001', body: 'hi' });
    expect(out.providerMessageId).toBe('ap_recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws SmsAuthError on 401 without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 401 }));
    const client = makeAgent(fetchImpl as unknown as typeof fetch);
    await expect(client.send({ to: '+12165550001', body: 'x' })).rejects.toBeInstanceOf(
      SmsAuthError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws SmsRequestError on 400 without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad request', { status: 400 }));
    const client = makeAgent(fetchImpl as unknown as typeof fetch);
    await expect(client.send({ to: '+12165550001', body: 'x' })).rejects.toBeInstanceOf(
      SmsRequestError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws SmsAuthError without calling fetch when api key is empty', async () => {
    const fetchImpl = vi.fn();
    const client = makeAgent(fetchImpl as unknown as typeof fetch, { apiKey: '' });
    await expect(client.send({ to: '+12165550001', body: 'x' })).rejects.toBeInstanceOf(
      SmsAuthError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses sms channel when imessage flag is disabled in config', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'ap_sms' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = makeAgent(fetchImpl as unknown as typeof fetch, { enableImessage: false });
    const out = await client.send({ to: '+12165550001', body: 'x', useImessage: true });
    expect(out.channelUsed).toBe('sms');
  });
});

describe('TwilioLiveClient', () => {
  it('sends via twilio Messages api and returns sid', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ sid: 'SMabc' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = new TwilioLiveClient({
      accountSid: 'ACtest',
      authToken: 'tok',
      fromNumber: '+12162458908',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: [0, 0, 0],
      sleep: () => Promise.resolve(),
    });
    const out = await client.send({ to: '+12165550001', body: 'hi' });
    expect(out.providerMessageId).toBe('SMabc');
    expect(out.channelUsed).toBe('sms');
  });
});

describe('createSmsClient factory', () => {
  it('returns the stub when INTEGRATION_MODE=stub', () => {
    const cfg = {
      INTEGRATION_MODE: 'stub',
      AGENT_PHONE_API_KEY: '',
      AGENT_PHONE_NUMBER: '',
      SMS_PROVIDER: 'agent_phone',
      ENABLE_IMESSAGE: true,
    } as unknown as Parameters<typeof createSmsClient>[0];
    expect(createSmsClient(cfg)).toBeInstanceOf(SmsStubClient);
  });
  it('returns AgentPhoneLiveClient in live mode with agent_phone provider', () => {
    const cfg = {
      INTEGRATION_MODE: 'live',
      AGENT_PHONE_API_KEY: 'k',
      AGENT_PHONE_NUMBER: '+1',
      SMS_PROVIDER: 'agent_phone',
      ENABLE_IMESSAGE: true,
    } as unknown as Parameters<typeof createSmsClient>[0];
    expect(createSmsClient(cfg)).toBeInstanceOf(AgentPhoneLiveClient);
  });
  it('returns TwilioLiveClient in live mode when SMS_PROVIDER=twilio', () => {
    const cfg = {
      INTEGRATION_MODE: 'live',
      AGENT_PHONE_API_KEY: 'k',
      AGENT_PHONE_NUMBER: '+1',
      SMS_PROVIDER: 'twilio',
      ENABLE_IMESSAGE: false,
    } as unknown as Parameters<typeof createSmsClient>[0];
    expect(createSmsClient(cfg)).toBeInstanceOf(TwilioLiveClient);
  });
});
