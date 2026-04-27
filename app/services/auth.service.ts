import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, lt } from 'drizzle-orm';
import { config } from '../config.js';
import { getDb } from '../db/client.js';
import { sessions, users, type Session, type User } from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';

export const SESSION_COOKIE_NAME = 'pts_session';
export const CSRF_COOKIE_NAME = 'pts_csrf';
export const SESSION_TTL_DAYS = 7;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_WINDOW_MS = 15 * 60 * 1000;

const NEW_USER_BCRYPT_COST = 12;

interface FailureRecord {
  attempts: number[];
  blockedUntil: number;
}

const failureMap = new Map<string, FailureRecord>();

export interface AuthResult {
  ok: true;
  user: User;
  cookieValue: string;
  sessionId: string;
}

export interface AuthFailure {
  ok: false;
  reason: 'invalid_credentials' | 'rate_limited';
  retryAfterMs?: number;
}

function sessionSecret(): string {
  const secret = config.SESSION_SECRET;
  if (!secret || secret.length < 8) {
    if (config.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be configured in production');
    }
    return 'dev-fallback-session-secret-do-not-use-in-prod';
  }
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('hex');
}

function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function buildCookieValue(sessionId: string): string {
  const sig = sign(sessionId);
  return `${sessionId}.${sig}`;
}

export function parseCookieValue(cookieValue: string): string | null {
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [id, sig] = parts;
  if (!id || !sig) return null;
  const expected = sign(id);
  if (!safeStringEqual(sig, expected)) return null;
  return id;
}

export function generateCsrfToken(): string {
  return randomBytes(24).toString('hex');
}

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function pruneOldFailures(record: FailureRecord, now: number): void {
  const cutoff = now - LOGIN_BLOCK_WINDOW_MS;
  record.attempts = record.attempts.filter((t) => t >= cutoff);
}

export function isLoginBlocked(email: string, now: number = Date.now()): boolean {
  const key = emailKey(email);
  const record = failureMap.get(key);
  if (!record) return false;
  if (record.blockedUntil > now) return true;
  pruneOldFailures(record, now);
  if (record.attempts.length === 0) {
    failureMap.delete(key);
    return false;
  }
  return false;
}

function recordFailure(email: string, now: number = Date.now()): void {
  const key = emailKey(email);
  const record = failureMap.get(key) ?? { attempts: [], blockedUntil: 0 };
  pruneOldFailures(record, now);
  record.attempts.push(now);
  if (record.attempts.length >= MAX_FAILED_LOGIN_ATTEMPTS) {
    record.blockedUntil = now + LOGIN_BLOCK_WINDOW_MS;
  }
  failureMap.set(key, record);
}

function clearFailures(email: string): void {
  failureMap.delete(emailKey(email));
}

export function resetLoginFailureTracker(): void {
  failureMap.clear();
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, NEW_USER_BCRYPT_COST);
}

export async function authenticate(
  email: string,
  password: string,
  now: number = Date.now(),
): Promise<AuthResult | AuthFailure> {
  const key = emailKey(email);

  if (isLoginBlocked(key, now)) {
    const record = failureMap.get(key);
    return {
      ok: false,
      reason: 'rate_limited',
      retryAfterMs: record ? Math.max(0, record.blockedUntil - now) : LOGIN_BLOCK_WINDOW_MS,
    };
  }

  const db = getDb();
  const found = db.select().from(users).where(eq(users.email, key)).all();
  const user = (found[0] as User | undefined) ?? null;

  if (!user) {
    // Run a fake hash to keep timing roughly constant.
    await bcrypt.compare(password, '$2a$10$invalidsaltinvalidsaltinvalu1cZnKjW8U7w6mC5WxJk8r9qE0h8K');
    recordFailure(key, now);
    return { ok: false, reason: 'invalid_credentials' };
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    recordFailure(key, now);
    return { ok: false, reason: 'invalid_credentials' };
  }

  clearFailures(key);

  const sessionId = generateUuidV7();
  const expiresAt = new Date(now + SESSION_TTL_MS);
  db.insert(sessions)
    .values({
      id: sessionId,
      userId: user.id,
      expiresAt,
    })
    .run();

  return {
    ok: true,
    user,
    cookieValue: buildCookieValue(sessionId),
    sessionId,
  };
}

export interface ValidatedSession {
  session: Session;
  user: User;
}

export function validateSession(
  cookieValue: string | undefined,
  now: number = Date.now(),
): ValidatedSession | null {
  if (!cookieValue) return null;
  const sessionId = parseCookieValue(cookieValue);
  if (!sessionId) return null;

  const db = getDb();
  const rows = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
  const session = (rows[0] as Session | undefined) ?? null;
  if (!session) return null;
  if (session.expiresAt.getTime() <= now) {
    db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }

  const userRows = db.select().from(users).where(eq(users.id, session.userId)).all();
  const user = (userRows[0] as User | undefined) ?? null;
  if (!user) {
    db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }

  return { session, user };
}

export function destroySession(sessionIdOrCookie: string): void {
  const sessionId = sessionIdOrCookie.includes('.')
    ? parseCookieValue(sessionIdOrCookie)
    : sessionIdOrCookie;
  if (!sessionId) return;
  const db = getDb();
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function purgeExpiredSessions(now: number = Date.now()): number {
  const db = getDb();
  const cutoff = new Date(now);
  const result = db.delete(sessions).where(lt(sessions.expiresAt, cutoff)).run();
  return Number((result as { changes?: number }).changes ?? 0);
}

export function createSessionForUser(
  userId: string,
  now: number = Date.now(),
): { sessionId: string; cookieValue: string; expiresAt: Date } {
  const db = getDb();
  const sessionId = generateUuidV7();
  const expiresAt = new Date(now + SESSION_TTL_MS);
  db.insert(sessions).values({ id: sessionId, userId, expiresAt }).run();
  return { sessionId, cookieValue: buildCookieValue(sessionId), expiresAt };
}
