import { describe, it, expect } from 'vitest';
import { createApp } from '../../app/app.js';

describe('GET /health', () => {
  const app = createApp();

  it('returns 200 with the expected JSON shape', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'ok',
      integration_mode: 'stub',
    });
    expect(typeof body.version).toBe('string');
    expect((body.version as string).length).toBeGreaterThan(0);
  });

  it('uses application/json content-type', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('content-type') ?? '').toMatch(/application\/json/);
  });
});
