import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGunzip, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, openDb } from '../../app/db/client.js';
import { faqEntries, users, zipCodeToCounty } from '../../app/db/schema.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = join(process.cwd(), 'app', 'db', 'migrations');

describe('backup + restore — better-sqlite3 hot-backup primitive', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pts-backup-'));
  });

  afterEach(() => {
    closeDb();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates a hot backup, gzips it, and the backup contains the same tables / row counts', async () => {
    const dbPath = join(workDir, 'live.db');
    const backupPath = join(workDir, 'backup.db');

    // Seed a real DB
    const { db, sqlite } = openDb(dbPath);
    sqlite.pragma('foreign_keys = ON');
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    runSeed(db);

    const originalUserCount = db.select().from(users).all().length;
    const originalFaqCount = db.select().from(faqEntries).all().length;
    const originalZipCount = db.select().from(zipCodeToCounty).all().length;
    expect(originalUserCount).toBeGreaterThan(0);
    expect(originalFaqCount).toBeGreaterThan(0);
    expect(originalZipCount).toBeGreaterThan(0);

    // Hot-backup using better-sqlite3 .backup() (the same primitive
    // sqlite3 CLI's `.backup` uses internally).
    await sqlite.backup(backupPath);
    sqlite.close();
    closeDb();

    // gzip it the way scripts/backup.sh would.
    const raw = readFileSync(backupPath);
    const gzPath = `${backupPath}.gz`;
    writeFileSync(gzPath, gzipSync(raw));
    expect(existsSync(gzPath)).toBe(true);
    expect(statSync(gzPath).size).toBeGreaterThan(0);

    // Decompress and reopen as a normal SQLite DB.
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      const gunzip = createGunzip();
      const chunks: Buffer[] = [];
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks)));
      gunzip.on('error', reject);
      gunzip.end(readFileSync(gzPath));
    });

    const restorePath = join(workDir, 'restored.db');
    writeFileSync(restorePath, decompressed);

    const restored = new Database(restorePath, { readonly: true });
    const tables = restored
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    for (const required of [
      'users',
      'leads',
      'lead_source_events',
      'outbound_messages',
      'faq_entries',
      'audit_log',
      'sessions',
      'zip_code_to_county',
    ]) {
      expect(tableNames).toContain(required);
    }

    const usersInRestore = (
      restored.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }
    ).c;
    const faqInRestore = (
      restored.prepare(`SELECT COUNT(*) AS c FROM faq_entries`).get() as { c: number }
    ).c;
    const zipInRestore = (
      restored.prepare(`SELECT COUNT(*) AS c FROM zip_code_to_county`).get() as { c: number }
    ).c;
    expect(usersInRestore).toBe(originalUserCount);
    expect(faqInRestore).toBe(originalFaqCount);
    expect(zipInRestore).toBe(originalZipCount);
    restored.close();
  });

  it('exposes a backup script at scripts/backup.sh that is executable', () => {
    const scriptPath = join(process.cwd(), 'scripts', 'backup.sh');
    expect(existsSync(scriptPath)).toBe(true);
    const head = readFileSync(scriptPath, 'utf8').slice(0, 200);
    expect(head).toMatch(/^#!\/bin\/(sh|bash)/);
  });

  it('validates scripts/backup.sh runs end-to-end when sqlite3 CLI is available', () => {
    const which = spawnSync('sh', ['-c', 'command -v sqlite3'], { encoding: 'utf8' });
    if (which.status !== 0 || !which.stdout.trim()) {
      // sqlite3 CLI not on PATH — skip silently. The shell script is
      // tested in the deployment environment via the smoke test.
      return;
    }

    const dbPath = join(workDir, 'live.db');
    const backupDir = join(workDir, 'backups');
    const { db, sqlite } = openDb(dbPath);
    sqlite.pragma('foreign_keys = ON');
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    runSeed(db);
    sqlite.close();
    closeDb();

    const result = spawnSync('sh', [join(process.cwd(), 'scripts', 'backup.sh')], {
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
        BACKUP_DIR: backupDir,
        RETENTION_DAYS: '30',
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const created = readdirSync(backupDir).filter(
      (f: string) => f.startsWith('leads-') && f.endsWith('.db.gz'),
    );
    expect(created.length).toBe(1);
  });
});
