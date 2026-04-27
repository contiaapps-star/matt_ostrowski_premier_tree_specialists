import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Config } from '../config.js';
import * as schema from '../db/schema.js';
import { users } from '../db/schema.js';
import { logger } from './logger.js';
import { generateUuidV7 } from './uuid.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

const BCRYPT_COST = 12;

export interface BootstrapResult {
  action: 'created' | 'skipped_has_users' | 'skipped_no_env';
  email?: string;
}

/**
 * Create the initial admin user from ADMIN_EMAIL/ADMIN_PASSWORD env vars
 * if and only if the users table is empty. Idempotent: re-running on a
 * populated DB is a no-op. Designed to recover from a fresh Railway deploy
 * where the seed script never ran.
 */
export function bootstrapAdminIfNeeded(db: DrizzleDb, cfg: Config): BootstrapResult {
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .all()[0];
  const userCount = Number(countRow?.count ?? 0);

  if (userCount > 0) {
    return { action: 'skipped_has_users' };
  }

  const email = cfg.ADMIN_EMAIL.trim().toLowerCase();
  const password = cfg.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn(
      'users table is empty and ADMIN_EMAIL/ADMIN_PASSWORD are not set — login will fail until an admin is created',
    );
    return { action: 'skipped_no_env' };
  }

  const id = generateUuidV7();
  db.insert(users)
    .values({
      id,
      email,
      passwordHash: bcrypt.hashSync(password, BCRYPT_COST),
      displayName: cfg.ADMIN_DISPLAY_NAME,
      role: 'admin',
    })
    .run();

  logger.info({ email, displayName: cfg.ADMIN_DISPLAY_NAME }, 'bootstrapped admin user from env');
  return { action: 'created', email };
}
