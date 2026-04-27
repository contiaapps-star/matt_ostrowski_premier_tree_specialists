import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import bcrypt from 'bcryptjs';
import { closeDb, getDb, getSqlite } from '../../app/db/client.js';
import { auditLog, leads, leadSourceEvents, outboundMessages, sessions, users, type User } from '../../app/db/schema.js';
import { resetZipCache } from '../../app/lib/zip-lookup.js';
import { intakeRateLimiter } from '../../app/middleware/rate-limit.js';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildCookieValue,
  generateCsrfToken,
  resetLoginFailureTracker,
} from '../../app/services/auth.service.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { clearStatsCache } from '../../app/services/stats.service.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

/**
 * Migrate + seed reference data (zips, FAQ, users) for tests, but DO NOT
 * pre-load any demo leads. Tests assert against a clean leads table.
 */
export function setupFreshDb(): void {
  closeDb();
  resetZipCache();
  intakeRateLimiter.reset();
  resetLoginFailureTracker();
  clearStatsCache();
  const db = getDb();
  const sqlite = getSqlite();
  sqlite.pragma('foreign_keys = ON');
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  runSeed(db);
  db.delete(outboundMessages).run();
  db.delete(auditLog).run();
  db.delete(leadSourceEvents).run();
  db.delete(leads).run();
  db.delete(sessions).run();
}

export function teardownDb(): void {
  closeDb();
  resetZipCache();
  resetLoginFailureTracker();
  clearStatsCache();
}

export interface TestSession {
  user: User;
  sessionId: string;
  cookieValue: string;
  csrfToken: string;
  cookieHeader: string;
}

/**
 * Create a fully-authenticated session for a seeded user. Use this when a
 * test needs to opt OUT of the legacy `x-demo-user` bypass and exercise
 * the real auth flow. The returned `cookieHeader` can be passed straight
 * to `app.request(url, { headers: { cookie: session.cookieHeader } })`.
 */
export function createTestSession(
  email: string = 'matt@premiertreesllc.com',
  password: string = 'ChangeMe123!',
): TestSession {
  const db = getDb();
  let user = db.select().from(users).where(eq(users.email, email)).all()[0] as User | undefined;
  if (!user) {
    const id = generateUuidV7();
    db.insert(users)
      .values({
        id,
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        displayName: email,
        role: 'call_taker',
      })
      .run();
    user = db.select().from(users).where(eq(users.email, email)).all()[0] as User;
  }

  const sessionId = generateUuidV7();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt }).run();
  const cookieValue = buildCookieValue(sessionId);
  const csrfToken = generateCsrfToken();
  const cookieHeader = `${SESSION_COOKIE_NAME}=${cookieValue}; ${CSRF_COOKIE_NAME}=${csrfToken}`;
  return { user, sessionId, cookieValue, csrfToken, cookieHeader };
}

export { getDb, getSqlite };
