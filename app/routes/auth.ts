import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  authenticate,
  destroySession,
  generateCsrfToken,
  validateSession,
} from '../services/auth.service.js';
import { loginPage } from '../views/pages/login.html.js';

export const authRoute = new Hono();

const DEV_SEED_CREDENTIALS = {
  email: 'matt@premiertreesllc.com',
  password: 'ChangeMe123!',
};

function devCredentialsForLoginPage() {
  return config.NODE_ENV === 'production' ? DEV_SEED_CREDENTIALS : DEV_SEED_CREDENTIALS;
}

function ensureCsrfCookie(c: Parameters<typeof setCookie>[0]): string {
  const existing = getCookie(c, CSRF_COOKIE_NAME);
  if (existing && existing.length >= 16) return existing;
  const token = generateCsrfToken();
  setCookie(c, CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'Lax',
    path: '/',
    secure: config.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
  });
  return token;
}

authRoute.get('/login', (c) => {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionCookie) {
    const valid = validateSession(sessionCookie);
    if (valid) {
      return c.redirect('/dashboard');
    }
  }
  const csrfToken = ensureCsrfCookie(c);
  return c.html(loginPage({ csrfToken, devCredentials: devCredentialsForLoginPage() }));
});

authRoute.post('/login', async (c) => {
  const csrfToken = ensureCsrfCookie(c);

  let formBody: Record<string, unknown>;
  try {
    formBody = (await c.req.parseBody()) as Record<string, unknown>;
  } catch {
    return c.html(
      loginPage({
        csrfToken,
        devCredentials: devCredentialsForLoginPage(),
        errorMessage: 'Could not parse the form. Please try again.',
      }),
      400,
    );
  }

  const submittedCsrf = typeof formBody._csrf === 'string' ? formBody._csrf : null;
  const cookieCsrf = getCookie(c, CSRF_COOKIE_NAME) ?? null;
  if (!submittedCsrf || !cookieCsrf || submittedCsrf !== cookieCsrf) {
    return c.html(
      loginPage({
        csrfToken,
        devCredentials: devCredentialsForLoginPage(),
        errorMessage: 'Form session expired. Please try again.',
      }),
      403,
    );
  }

  const email = typeof formBody.email === 'string' ? formBody.email.trim() : '';
  const password = typeof formBody.password === 'string' ? formBody.password : '';

  if (!email || !password) {
    return c.html(
      loginPage({
        csrfToken,
        devCredentials: devCredentialsForLoginPage(),
        email,
        errorMessage: 'Email and password are both required.',
      }),
      400,
    );
  }

  const result = await authenticate(email, password);

  if (!result.ok) {
    if (result.reason === 'rate_limited') {
      const seconds = Math.ceil((result.retryAfterMs ?? 15 * 60 * 1000) / 1000);
      logger.warn({ email }, 'login rate-limited');
      return c.html(
        loginPage({
          csrfToken,
          devCredentials: devCredentialsForLoginPage(),
          email,
          rateLimitedUntilSeconds: seconds,
          errorMessage: 'Too many failed attempts. Try again later.',
        }),
        429,
      );
    }
    logger.info({ email }, 'login failed: invalid credentials');
    return c.html(
      loginPage({
        csrfToken,
        devCredentials: devCredentialsForLoginPage(),
        email,
        errorMessage: 'Invalid email or password.',
      }),
      401,
    );
  }

  setCookie(c, SESSION_COOKIE_NAME, result.cookieValue, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: config.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
  });

  logger.info({ user_id: result.user.id, email: result.user.email }, 'login success');
  return c.redirect('/dashboard');
});

authRoute.post('/logout', (c) => {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionCookie) {
    try {
      destroySession(sessionCookie);
    } catch (err) {
      logger.warn({ err }, 'logout: destroy session failed (continuing)');
    }
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.redirect('/login');
});
