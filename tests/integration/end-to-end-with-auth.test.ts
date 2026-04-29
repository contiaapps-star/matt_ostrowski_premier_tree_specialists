import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app/app.js';
import { leads, outboundMessages } from '../../app/db/schema.js';
import { CSRF_COOKIE_NAME } from '../../app/services/auth.service.js';
import { intakeRateLimiter } from '../../app/middleware/rate-limit.js';
import { createTestSession, getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';

describe('end-to-end with real auth + CSRF', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('login → dashboard → click lead → approve → outbound dispatched & visible in stats', async () => {
    const db = getDb();
    const id = insertLead(db, {
      status: 'awaiting_review',
      customerName: 'Sharon Kobal',
      customerEmail: 'sharon@example.com',
      responseText: 'Hi Sharon — thanks for reaching out!',
      scopeRaw: 'Stump grinding 3 stumps in backyard',
      scopeCategory: 'stump_grinding',
      confidenceScore: 0.85,
    });

    const app = createApp();

    // Real session (skip test bypass).
    const session = createTestSession();
    const cookieHeader = `pts_session=${session.cookieValue}; ${CSRF_COOKIE_NAME}=${session.csrfToken}`;

    // 1. Hit workspace with real session.
    const dashRes = await app.request('/', {
      headers: {
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
        accept: 'text/html',
      },
    });
    expect(dashRes.status).toBe(200);
    const dashHtml = await dashRes.text();
    expect(dashHtml).toContain('Sharon Kobal');

    // 2. Open lead detail.
    const detailRes = await app.request(`/leads/${id}`, {
      headers: {
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
        accept: 'text/html',
      },
    });
    expect(detailRes.status).toBe(200);
    const detailHtml = await detailRes.text();
    expect(detailHtml).toContain('data-testid="lead-detail-page"');

    // 3. Approve with proper CSRF token.
    const approveRes = await app.request(`/leads/${id}/approve`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': session.csrfToken,
        'x-csrf-test-mode': '1',
        'x-skip-test-bypass': '1',
      },
    });
    expect(approveRes.status).toBe(200);

    // 4. DB updated.
    const updated = db.select().from(leads).where(eq(leads.id, id)).all()[0]!;
    expect(updated.status).toBe('manually_sent');
    expect(updated.responseSentBy).toBe(session.user.email);

    // 5. Trigger dispatch (so outbound_messages get created in stub mode).
    const dispatchRes = await app.request(`/leads/${id}/dispatch-now`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': session.csrfToken,
        'x-csrf-test-mode': '1',
        'x-skip-test-bypass': '1',
      },
    });
    expect(dispatchRes.status).toBe(200);

    const outbound = db.select().from(outboundMessages).where(eq(outboundMessages.leadId, id)).all();
    expect(outbound.length).toBeGreaterThanOrEqual(1);

    // 6. Workspace KPI strip reflects new manually_sent lead.
    const statsRes = await app.request('/', {
      headers: {
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
        accept: 'text/html',
      },
    });
    expect(statsRes.status).toBe(200);
    const statsHtml = await statsRes.text();
    expect(statsHtml).toContain('data-testid="kpi-strip"');
  });

  it('hits 100 ingests in parallel without race conditions or duplicates (with rate limiter bypassed via per-IP keys)', async () => {
    const app = createApp();
    intakeRateLimiter.reset();
    const promises = [];
    const expectedSecret = process.env.WEBSITE_FORM_WEBHOOK_SECRET ?? 'test-webhook-secret';

    for (let i = 0; i < 100; i++) {
      promises.push(
        app.request('/api/intake/website-form', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // The rate limiter keys on the source IP — set unique IPs so 100
            // parallel requests do NOT share a single 60-token bucket.
            'x-forwarded-for': `10.0.0.${i % 250}`,
          },
          body: JSON.stringify({
            name: `Customer ${i}`,
            phone: `(216) 555-${String(1000 + i).padStart(4, '0')}`,
            email: `c${i}@example.com`,
            zip: '44113',
            service_type: 'trimming',
            message: 'Need quote',
            secret: expectedSecret,
          }),
        }),
      );
    }
    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.status === 201);
    expect(successes.length).toBe(100);

    const db = getDb();
    const allLeads = db.select().from(leads).all();
    expect(allLeads.length).toBe(100);
  });
});
