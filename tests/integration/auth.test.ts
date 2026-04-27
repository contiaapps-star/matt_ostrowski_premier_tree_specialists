import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app/app.js';
import { sessions } from '../../app/db/schema.js';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  generateCsrfToken,
  resetLoginFailureTracker,
} from '../../app/services/auth.service.js';
import { createTestSession, getDb, setupFreshDb, teardownDb } from './_helpers.js';

function parseSetCookie(headerValue: string | null | undefined): Record<string, string> {
  if (!headerValue) return {};
  // Hono / Workers split multiple cookies with comma. We need a naive split that ignores
  // commas inside Expires=... attributes — simplest: split on /,\s*(?=[A-Za-z0-9_]+=)/
  const result: Record<string, string> = {};
  const parts = headerValue.split(/,\s*(?=[A-Za-z0-9_-]+=)/);
  for (const cookieStr of parts) {
    const firstSemi = cookieStr.indexOf(';');
    const kv = firstSemi >= 0 ? cookieStr.slice(0, firstSemi) : cookieStr;
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    const name = kv.slice(0, eq).trim();
    const value = kv.slice(eq + 1).trim();
    result[name] = value;
  }
  return result;
}

async function getCsrfFromLogin(
  app: ReturnType<typeof createApp>,
): Promise<{ csrf: string; cookieHeader: string }> {
  const res = await app.request('/login');
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookies = parseSetCookie(setCookie);
  const csrf = cookies[CSRF_COOKIE_NAME];
  expect(csrf).toBeDefined();
  const cookieHeader = `${CSRF_COOKIE_NAME}=${csrf}`;
  return { csrf: csrf!, cookieHeader };
}

describe('auth — login flow', () => {
  beforeEach(() => {
    setupFreshDb();
    resetLoginFailureTracker();
  });
  afterEach(() => teardownDb());

  it('GET /login returns the login form with a CSRF cookie', async () => {
    const app = createApp();
    const res = await app.request('/login');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="login-form"');
    expect(html).toContain('data-testid="login-email"');
    expect(html).toContain('data-testid="login-password"');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${CSRF_COOKIE_NAME}=`);
  });

  it('POST /login with valid creds creates a session, sets cookie, and redirects to /dashboard', async () => {
    const app = createApp();
    const { csrf, cookieHeader } = await getCsrfFromLogin(app);

    const res = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
      },
      body: new URLSearchParams({
        email: 'matt@premiertreesllc.com',
        password: 'ChangeMe123!',
        _csrf: csrf,
      }).toString(),
      redirect: 'manual',
    });
    expect([301, 302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('/dashboard');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');

    // session row created
    const db = getDb();
    const sessionRows = db.select().from(sessions).all();
    expect(sessionRows.length).toBeGreaterThan(0);
  });

  it('POST /login with invalid password returns 401 with error message and no session', async () => {
    const app = createApp();
    const { csrf, cookieHeader } = await getCsrfFromLogin(app);
    const res = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
      },
      body: new URLSearchParams({
        email: 'matt@premiertreesllc.com',
        password: 'WrongPassword',
        _csrf: csrf,
      }).toString(),
    });
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('data-testid="login-error"');
    expect(html).toContain('Invalid email or password');
  });

  it('POST /logout destroys the session and clears the cookie', async () => {
    const app = createApp();
    const session = createTestSession();

    const res = await app.request('/logout', {
      method: 'POST',
      headers: {
        cookie: session.cookieHeader,
        'x-skip-test-bypass': '1',
      },
      redirect: 'manual',
    });
    expect([301, 302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('/login');

    const db = getDb();
    const remaining = db.select().from(sessions).where(eq(sessions.id, session.sessionId)).all();
    expect(remaining.length).toBe(0);
  });

  it('GET /dashboard without a session redirects to /login', async () => {
    const app = createApp();
    const res = await app.request('/dashboard', {
      headers: { 'x-skip-test-bypass': '1', accept: 'text/html' },
      redirect: 'manual',
    });
    expect([301, 302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('GET /dashboard with a valid session returns 200 HTML', async () => {
    const app = createApp();
    const session = createTestSession();
    const res = await app.request('/dashboard', {
      headers: {
        cookie: session.cookieHeader,
        'x-skip-test-bypass': '1',
        accept: 'text/html',
      },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="dashboard-page"');
  });

  it('blocks login after 5 failed attempts within 15 min for the same email', async () => {
    const app = createApp();

    for (let i = 0; i < 5; i++) {
      const { csrf, cookieHeader } = await getCsrfFromLogin(app);
      const res = await app.request('/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: cookieHeader,
          'x-skip-test-bypass': '1',
        },
        body: new URLSearchParams({
          email: 'matt@premiertreesllc.com',
          password: 'BadPassword',
          _csrf: csrf,
        }).toString(),
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt — even with correct password — must be blocked.
    const { csrf, cookieHeader } = await getCsrfFromLogin(app);
    const res = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
      },
      body: new URLSearchParams({
        email: 'matt@premiertreesllc.com',
        password: 'ChangeMe123!',
        _csrf: csrf,
      }).toString(),
    });
    expect(res.status).toBe(429);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('too many');
  });
});

describe('auth — CSRF on login form', () => {
  beforeEach(() => {
    setupFreshDb();
    resetLoginFailureTracker();
  });
  afterEach(() => teardownDb());

  it('rejects POST /login when CSRF token is missing', async () => {
    const app = createApp();
    // Get CSRF cookie but submit without a matching token.
    const seed = await app.request('/login');
    const setCookie = seed.headers.get('set-cookie') ?? '';
    const csrfMatch = setCookie.match(new RegExp(`${CSRF_COOKIE_NAME}=([^;,]+)`));
    expect(csrfMatch).toBeTruthy();
    const cookieHeader = `${CSRF_COOKIE_NAME}=${csrfMatch![1]}`;

    const res = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
      },
      body: new URLSearchParams({
        email: 'matt@premiertreesllc.com',
        password: 'ChangeMe123!',
      }).toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects POST /login when submitted CSRF token does not match cookie', async () => {
    const app = createApp();
    const seed = await app.request('/login');
    const setCookie = seed.headers.get('set-cookie') ?? '';
    const csrfMatch = setCookie.match(new RegExp(`${CSRF_COOKIE_NAME}=([^;,]+)`));
    expect(csrfMatch).toBeTruthy();
    const cookieHeader = `${CSRF_COOKIE_NAME}=${csrfMatch![1]}`;

    const res = await app.request('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader,
        'x-skip-test-bypass': '1',
      },
      body: new URLSearchParams({
        email: 'matt@premiertreesllc.com',
        password: 'ChangeMe123!',
        _csrf: generateCsrfToken(),
      }).toString(),
    });
    expect(res.status).toBe(403);
  });
});
