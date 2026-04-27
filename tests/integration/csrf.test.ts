import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { createTestSession, getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';
import { CSRF_COOKIE_NAME } from '../../app/services/auth.service.js';

function buildCookieHeader(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('csrf — leads mutation routes', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('returns 403 on POST /leads/:id/approve when CSRF token is missing (with x-csrf-test-mode=1)', async () => {
    const db = getDb();
    const id = insertLead(db, { status: 'awaiting_review', responseText: 'Draft' });
    const session = createTestSession();
    const app = createApp();
    const res = await app.request(`/leads/${id}/approve`, {
      method: 'POST',
      headers: {
        cookie: session.cookieHeader,
        'x-csrf-test-mode': '1',
      },
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 when submitted CSRF token does not match cookie', async () => {
    const db = getDb();
    const id = insertLead(db, { status: 'awaiting_review', responseText: 'Draft' });
    const session = createTestSession();
    const app = createApp();
    const res = await app.request(`/leads/${id}/approve`, {
      method: 'POST',
      headers: {
        cookie: session.cookieHeader,
        'x-csrf-token': 'this-is-the-wrong-token',
        'x-csrf-test-mode': '1',
      },
    });
    expect(res.status).toBe(403);
  });

  it('succeeds when matching CSRF token is supplied via header', async () => {
    const db = getDb();
    const id = insertLead(db, { status: 'awaiting_review', responseText: 'Draft' });
    const session = createTestSession();
    const cookieHeader = buildCookieHeader({
      pts_session: session.cookieValue,
      [CSRF_COOKIE_NAME]: session.csrfToken,
    });
    const app = createApp();
    const res = await app.request(`/leads/${id}/approve`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': session.csrfToken,
        'x-csrf-test-mode': '1',
      },
    });
    expect(res.status).toBe(200);
  });

  it('succeeds when matching CSRF token is supplied via _csrf form field', async () => {
    const db = getDb();
    const id = insertLead(db, {
      status: 'awaiting_review',
      responseText: 'Original draft',
    });
    const session = createTestSession();
    const cookieHeader = buildCookieHeader({
      pts_session: session.cookieValue,
      [CSRF_COOKIE_NAME]: session.csrfToken,
    });
    const app = createApp();
    const res = await app.request(`/leads/${id}/edit-and-send`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrf-test-mode': '1',
      },
      body: new URLSearchParams({
        response_text: 'Edited body of the response.',
        _csrf: session.csrfToken,
      }).toString(),
    });
    expect(res.status).toBe(200);
  });
});
