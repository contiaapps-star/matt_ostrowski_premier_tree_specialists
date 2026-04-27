import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterAuthError,
  OpenRouterLiveClient,
  OpenRouterRequestError,
  OpenRouterStubClient,
  createOpenRouterClient,
} from '../../app/clients/openrouter.client.js';

describe('OpenRouterStubClient', () => {
  it('returns the matching fixture for the Diane Owens / oak prompt', async () => {
    const stub = new OpenRouterStubClient();
    const out = await stub.complete({ system: 'sys', user: 'Customer Diane Owens — big oak tree trimming' });
    expect(out.parsedJson).toBeDefined();
    const json = out.parsedJson as { extracted: { name: string }; scope_category: string };
    expect(json.extracted.name).toBe('Diane Owens');
    expect(json.scope_category).toBe('trimming');
  });

  it('returns the Florida fixture when the prompt mentions zip 33101', async () => {
    const stub = new OpenRouterStubClient();
    const out = await stub.complete({ system: 'sys', user: 'Trim service for 33101 area' });
    const json = out.parsedJson as { extracted: { state: string }; scope_category: string };
    expect(json.extracted.state).toBe('FL');
  });

  it('returns the emergency fixture when both "storm" and "limb" appear', async () => {
    const stub = new OpenRouterStubClient();
    const out = await stub.complete({
      system: 'sys',
      user: 'Customer report: a storm dropped a large limb on the roof',
    });
    const json = out.parsedJson as { scope_category: string };
    expect(json.scope_category).toBe('emergency');
  });

  it('returns a generic fake when nothing matches', async () => {
    const stub = new OpenRouterStubClient();
    const out = await stub.complete({ system: 'sys', user: 'totally unrelated content xyz' });
    const json = out.parsedJson as { scope_category: string; extracted: { phone: string | null } };
    expect(json.scope_category).toBe('other');
    expect(json.extracted.phone).toBeNull();
  });
});

describe('OpenRouterLiveClient', () => {
  function makeClient(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof OpenRouterLiveClient>[0]> = {}) {
    return new OpenRouterLiveClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v1',
      defaultModel: 'test-model',
      fetchImpl,
      backoffMs: [0, 0, 0],
      sleep: () => Promise.resolve(),
      ...overrides,
    });
  }

  it('parses a successful JSON response', async () => {
    const payload = { choices: [{ message: { content: '{"ok":true}' } }] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.complete({ system: 's', user: 'u' });
    expect(out.content).toBe('{"ok":true}');
    expect(out.parsedJson).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const success = { choices: [{ message: { content: '{"retried":true}' } }] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(success), { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.complete({ system: 's', user: 'u' });
    expect(out.parsedJson).toEqual({ retried: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and eventually succeeds', async () => {
    const success = { choices: [{ message: { content: '{"recovered":1}' } }] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(success), { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.complete({ system: 's', user: 'u' });
    expect(out.parsedJson).toEqual({ recovered: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws OpenRouterAuthError on 401 and does NOT retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 401 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(OpenRouterAuthError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries on persistent 500', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws OpenRouterAuthError when API key is empty (live)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch, { apiKey: '' });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(OpenRouterAuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createOpenRouterClient factory', () => {
  it('returns the stub client when INTEGRATION_MODE=stub', () => {
    const cfg = {
      INTEGRATION_MODE: 'stub',
      OPENROUTER_API_KEY: 'x',
      OPENROUTER_BASE_URL: 'https://example.test/api/v1',
      OPENROUTER_MODEL: 'm',
    } as unknown as Parameters<typeof createOpenRouterClient>[0];
    const c = createOpenRouterClient(cfg);
    expect(c).toBeInstanceOf(OpenRouterStubClient);
  });

  it('returns the live client when INTEGRATION_MODE=live', () => {
    const cfg = {
      INTEGRATION_MODE: 'live',
      OPENROUTER_API_KEY: 'x',
      OPENROUTER_BASE_URL: 'https://example.test/api/v1',
      OPENROUTER_MODEL: 'm',
    } as unknown as Parameters<typeof createOpenRouterClient>[0];
    const c = createOpenRouterClient(cfg);
    expect(c).toBeInstanceOf(OpenRouterLiveClient);
  });
});
