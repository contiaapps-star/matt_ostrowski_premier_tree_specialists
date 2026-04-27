import { describe, expect, it, vi } from 'vitest';
import {
  SendGridAuthError,
  SendGridLiveClient,
  SendGridRequestError,
  SendGridStubClient,
  createEmailClient,
} from '../../app/clients/sendgrid.client.js';

function makeLiveClient(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof SendGridLiveClient>[0]> = {},
) {
  return new SendGridLiveClient({
    apiKey: 'test-key',
    fromAddress: 'info@premiertreesllc.com',
    fromName: 'Premier Tree Specialists',
    fetchImpl,
    backoffMs: [0, 0, 0],
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

describe('SendGridStubClient', () => {
  it('records the email payload in memory and returns a fake providerMessageId', async () => {
    const stub = new SendGridStubClient({ inMemory: true });
    const out = await stub.send({
      to: 'test@premiertreesllc.com',
      subject: 'sub',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(out.providerMessageId).toMatch(/^stub_/);
    const recs = stub.getRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0]!.to).toBe('test@premiertreesllc.com');
    expect(recs[0]!.html).toBe('<p>hi</p>');
  });
});

describe('SendGridLiveClient', () => {
  it('returns a successful providerMessageId from response headers', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('', {
          status: 202,
          headers: { 'x-message-id': 'sg_abc123' },
        }),
    );
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    const out = await client.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(out.providerMessageId).toBe('sg_abc123');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(
        new Response('', { status: 202, headers: { 'x-message-id': 'sg_ok' } }),
      );
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    const out = await client.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(out.providerMessageId).toBe('sg_ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(
        new Response('', { status: 202, headers: { 'x-message-id': 'sg_recover' } }),
      );
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    const out = await client.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(out.providerMessageId).toBe('sg_recover');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws SendGridAuthError on 401 and does NOT retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 401 }));
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    await expect(
      client.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toBeInstanceOf(SendGridAuthError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a non-429 4xx (e.g. 400 invalid request)', async () => {
    const fetchImpl = vi.fn(async () => new Response('invalid', { status: 400 }));
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch);
    await expect(
      client.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toBeInstanceOf(SendGridRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws SendGridAuthError without calling fetch when API key is empty', async () => {
    const fetchImpl = vi.fn();
    const client = makeLiveClient(fetchImpl as unknown as typeof fetch, { apiKey: '' });
    await expect(
      client.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toBeInstanceOf(SendGridAuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createEmailClient factory', () => {
  it('returns the stub when INTEGRATION_MODE=stub', () => {
    const cfg = {
      INTEGRATION_MODE: 'stub',
      SENDGRID_API_KEY: '',
      EMAIL_FROM_ADDRESS: 'a@b.com',
      EMAIL_FROM_NAME: 'X',
    } as unknown as Parameters<typeof createEmailClient>[0];
    expect(createEmailClient(cfg)).toBeInstanceOf(SendGridStubClient);
  });
  it('returns the live client when INTEGRATION_MODE=live', () => {
    const cfg = {
      INTEGRATION_MODE: 'live',
      SENDGRID_API_KEY: 'k',
      EMAIL_FROM_ADDRESS: 'a@b.com',
      EMAIL_FROM_NAME: 'X',
    } as unknown as Parameters<typeof createEmailClient>[0];
    expect(createEmailClient(cfg)).toBeInstanceOf(SendGridLiveClient);
  });
});
