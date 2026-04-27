import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../app/db/schema.js';
import { leads } from '../../app/db/schema.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  runSeed(db);
});

afterEach(() => {
  sqlite.close();
});

describe('seeded data shape', () => {
  it('orders 8 leads chronologically by received_at', () => {
    const all = db.select().from(leads).orderBy(asc(leads.receivedAt)).all();
    expect(all).toHaveLength(8);
  });

  it('lead 1 (Diane Owens) has scope_category=trimming and city=Cleveland', () => {
    const row = db
      .select()
      .from(leads)
      .where(eq(leads.customerName, 'Diane Owens'))
      .get();
    expect(row).toBeDefined();
    expect(row?.scopeCategory).toBe('trimming');
    expect(row?.customerCity).toBe('Cleveland');
    expect(row?.customerZip).toBe('44113');
    expect(row?.serviceAreaCounty).toBe('Cuyahoga');
  });

  it('lead 6 (out-of-state Florida ZIP) has out_of_service_area=true', () => {
    const row = db
      .select()
      .from(leads)
      .where(eq(leads.customerZip, '33101'))
      .get();
    expect(row).toBeDefined();
    expect(row?.outOfServiceArea).toBe(true);
    expect(row?.serviceAreaCounty).toBeNull();
  });

  it('lead 3 (Marilyn Hornig — emergency) has escalation_triggered=true', () => {
    const row = db
      .select()
      .from(leads)
      .where(eq(leads.customerName, 'Marilyn Hornig'))
      .get();
    expect(row).toBeDefined();
    expect(row?.escalationTriggered).toBe(true);
    expect(row?.scopeCategory).toBe('emergency');
    expect(row?.status).toBe('awaiting_review');
  });

  it('every lead has a corresponding lead_source_event', () => {
    const rows = sqlite
      .prepare(
        `SELECT l.id AS lead_id, e.id AS event_id
         FROM leads l LEFT JOIN lead_source_events e ON e.lead_id = l.id`,
      )
      .all() as Array<{ lead_id: string; event_id: string | null }>;
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r.event_id, `lead ${r.lead_id} missing source event`).not.toBeNull();
    }
  });

  it('seeds at least 5 zips for every county and tags region correctly', () => {
    const rows = sqlite
      .prepare(
        `SELECT county, region, count(*) c FROM zip_code_to_county GROUP BY county, region`,
      )
      .all() as Array<{ county: string; region: string; c: number }>;
    expect(rows.length).toBe(14);
    for (const r of rows) {
      expect(r.c).toBeGreaterThanOrEqual(5);
      expect(['northeast_ohio', 'central_ohio']).toContain(r.region);
    }
  });

  it('Cleveland 44113 maps to Cuyahoga / northeast_ohio', () => {
    const row = sqlite
      .prepare(`SELECT county, region FROM zip_code_to_county WHERE zip='44113'`)
      .get() as { county: string; region: string } | undefined;
    expect(row?.county).toBe('Cuyahoga');
    expect(row?.region).toBe('northeast_ohio');
  });
});
