import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../app/db/schema.js';
import { leads, leadSourceEvents } from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(() => {
  sqlite.close();
});

function insertLead(): string {
  const id = generateUuidV7();
  db.insert(leads)
    .values({
      id,
      receivedAt: new Date(),
      source: 'website_form',
      scopeRaw: 'sample',
    })
    .run();
  return id;
}

function insertEvent(leadId: string): string {
  const id = generateUuidV7();
  db.insert(leadSourceEvents)
    .values({
      id,
      leadId,
      source: 'website_form',
      receivedAt: new Date(),
      rawPayload: '{}',
    })
    .run();
  return id;
}

describe('foreign keys', () => {
  it('CASCADE: deleting a lead removes its source events', () => {
    const leadId = insertLead();
    insertEvent(leadId);
    insertEvent(leadId);

    const before = sqlite
      .prepare('SELECT count(*) c FROM lead_source_events WHERE lead_id = ?')
      .get(leadId) as { c: number };
    expect(before.c).toBe(2);

    db.delete(leads).where(eq(leads.id, leadId)).run();

    const after = sqlite
      .prepare('SELECT count(*) c FROM lead_source_events WHERE lead_id = ?')
      .get(leadId) as { c: number };
    expect(after.c).toBe(0);
  });

  it('rejects inserting a lead_source_event with a non-existent lead_id', () => {
    expect(() => insertEvent('00000000-0000-7000-8000-000000000000')).toThrow(
      /FOREIGN KEY/i,
    );
  });

  it('foreign_keys PRAGMA is ON', () => {
    const row = sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });
});
