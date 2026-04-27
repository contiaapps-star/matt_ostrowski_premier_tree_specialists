import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { setupFreshDb, teardownDb } from './_helpers.js';

describe('GET /health', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('returns 200 with the expected JSON shape', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'ok',
      integration_mode: 'stub',
      db_ok: true,
    });
    expect(typeof body.version).toBe('string');
    expect((body.version as string).length).toBeGreaterThan(0);
    expect(typeof body.uptime_seconds).toBe('number');
    expect(typeof body.timestamp).toBe('string');
    // last_intake_at may be null in a fresh DB
    expect(['string', 'object']).toContain(typeof body.last_intake_at);
  });

  it('uses application/json content-type', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.headers.get('content-type') ?? '').toMatch(/application\/json/);
  });
});
