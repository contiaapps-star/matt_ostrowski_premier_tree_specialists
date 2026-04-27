import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { config } from '../../app/config.js';
import { setupFreshDb, teardownDb } from './_helpers.js';

describe('intake rate limit (60 req/min per IP)', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('rejects the 61st through 70th request from the same IP with 429', async () => {
    const app = createApp();

    const make = (i: number) =>
      app.request('/api/intake/website-form', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.42',
        },
        body: JSON.stringify({
          name: `Tester ${i}`,
          email: `t${i}@example.com`,
          phone: `(216) 555-${String(1000 + i).padStart(4, '0')}`,
          zip: '44113',
          service_type: 'Tree trimming',
          message: `Test ${i}`,
          secret: config.WEBSITE_FORM_WEBHOOK_SECRET,
        }),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 70; i++) {
      const res = await make(i);
      statuses.push(res.status);
    }

    const successCount = statuses.filter((s) => s === 201).length;
    const rateLimitedCount = statuses.filter((s) => s === 429).length;

    expect(successCount).toBe(60);
    expect(rateLimitedCount).toBe(10);
  });
});
