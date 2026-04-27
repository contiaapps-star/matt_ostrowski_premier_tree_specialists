import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, getSqlite } from '../../app/db/client.js';
import { users } from '../../app/db/schema.js';
import { bootstrapAdminIfNeeded } from '../../app/lib/admin-bootstrap.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { loadConfig } from '../../app/config.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

function freshSchema(): void {
  closeDb();
  const db = getDb();
  const sqlite = getSqlite();
  sqlite.pragma('foreign_keys = ON');
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  // Wipe users so each test starts from an empty users table.
  db.delete(users).run();
}

function makeConfig(overrides: Record<string, string> = {}): ReturnType<typeof loadConfig> {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    SESSION_SECRET: 'test-secret-at-least-16-chars-long',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

function userCount(): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .all()[0];
  return Number(row?.count ?? 0);
}

describe('admin-bootstrap', () => {
  beforeEach(() => {
    freshSchema();
  });

  afterEach(() => {
    closeDb();
  });

  it('creates admin user when users table is empty and env vars are set', async () => {
    const cfg = makeConfig({
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'super-secret-pw',
      ADMIN_DISPLAY_NAME: 'Acme Admin',
    });

    const result = bootstrapAdminIfNeeded(getDb(), cfg);

    expect(result.action).toBe('created');
    expect(result.email).toBe('admin@example.com');
    expect(userCount()).toBe(1);

    const created = getDb().select().from(users).all()[0];
    expect(created?.email).toBe('admin@example.com');
    expect(created?.displayName).toBe('Acme Admin');
    expect(created?.role).toBe('admin');
    expect(await bcrypt.compare('super-secret-pw', created?.passwordHash ?? '')).toBe(true);
  });

  it('lowercases admin email on creation', () => {
    const cfg = makeConfig({
      ADMIN_EMAIL: 'Matt@PremierTreesLLC.com',
      ADMIN_PASSWORD: 'pw',
    });
    const result = bootstrapAdminIfNeeded(getDb(), cfg);
    expect(result.action).toBe('created');
    const created = getDb().select().from(users).all()[0];
    expect(created?.email).toBe('matt@premiertreesllc.com');
  });

  it('skips when users table is empty but env vars are not set', () => {
    const cfg = makeConfig();
    const result = bootstrapAdminIfNeeded(getDb(), cfg);

    expect(result.action).toBe('skipped_no_env');
    expect(userCount()).toBe(0);
  });

  it('skips when at least one user already exists, even if env vars are set', () => {
    getDb()
      .insert(users)
      .values({
        id: generateUuidV7(),
        email: 'existing@example.com',
        passwordHash: bcrypt.hashSync('orig-pw', 4),
        displayName: 'Existing',
        role: 'admin',
      })
      .run();
    expect(userCount()).toBe(1);

    const cfg = makeConfig({
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'super-secret-pw',
    });

    const result = bootstrapAdminIfNeeded(getDb(), cfg);

    expect(result.action).toBe('skipped_has_users');
    expect(userCount()).toBe(1);

    const stillExisting = getDb().select().from(users).all()[0];
    expect(stillExisting?.email).toBe('existing@example.com');
  });

  it('is idempotent: running twice when env is set creates exactly one user', () => {
    const cfg = makeConfig({
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'pw',
    });

    const first = bootstrapAdminIfNeeded(getDb(), cfg);
    const second = bootstrapAdminIfNeeded(getDb(), cfg);

    expect(first.action).toBe('created');
    expect(second.action).toBe('skipped_has_users');
    expect(userCount()).toBe(1);
  });

  it('config rejects email-without-password (and vice versa)', () => {
    expect(() => makeConfig({ ADMIN_EMAIL: 'admin@example.com' })).toThrow(/ADMIN_EMAIL and ADMIN_PASSWORD/);
    expect(() => makeConfig({ ADMIN_PASSWORD: 'pw' })).toThrow(/ADMIN_EMAIL and ADMIN_PASSWORD/);
  });
});
