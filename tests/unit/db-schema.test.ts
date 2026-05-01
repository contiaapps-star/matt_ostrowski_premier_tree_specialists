import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../app/db/schema.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

const EXPECTED_TABLES = [
  'leads',
  'lead_source_events',
  'outbound_messages',
  'faq_entries',
  'audit_log',
  'users',
  'sessions',
  'zip_code_to_county',
  'app_settings',
  'agent_mail_messages',
];

const EXPECTED_INDEXES = [
  'leads_dedup_phone_idx',
  'leads_status_idx',
  'leads_received_at_idx',
  'leads_source_idx',
  'lead_source_events_lead_id_idx',
  'outbound_messages_lead_id_idx',
  'outbound_messages_status_idx',
  'faq_entries_category_idx',
  'faq_entries_active_idx',
  'audit_log_lead_id_idx',
  'audit_log_created_at_idx',
  'users_email_unique',
  'sessions_user_id_idx',
  'sessions_expires_at_idx',
  'zip_code_to_county_county_idx',
  'zip_code_to_county_region_idx',
  'agent_mail_messages_agentmail_message_id_unique',
  'agent_mail_messages_received_at_idx',
  'agent_mail_messages_parse_status_idx',
  'agent_mail_messages_lead_id_idx',
];

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(() => {
  sqlite.close();
});

describe('database schema', () => {
  it('creates all expected tables', () => {
    const rows = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`)
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual([...EXPECTED_TABLES].sort());
  });

  it('creates all expected indexes', () => {
    const rows = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((r) => r.name));
    for (const expected of EXPECTED_INDEXES) {
      expect(names.has(expected), `missing index: ${expected}`).toBe(true);
    }
  });

  it('leads table has the expected columns', () => {
    const rows = sqlite.prepare(`PRAGMA table_info('leads')`).all() as Array<{ name: string }>;
    const cols = new Set(rows.map((r) => r.name));
    for (const expected of [
      'id',
      'received_at',
      'source',
      'dedup_phone_e164',
      'status',
      'customer_name',
      'customer_phone_e164',
      'customer_email',
      'customer_address',
      'customer_city',
      'customer_zip',
      'service_area_county',
      'out_of_service_area',
      'scope_raw',
      'scope_category',
      'scope_summary',
      'confidence_score',
      'confidence_reasoning',
      'escalation_triggered',
      'escalation_reason',
      'response_text',
      'response_sent_at',
      'response_sent_by',
      'arbostar_request_id',
      'arbostar_synced_at',
      'created_at',
      'updated_at',
    ]) {
      expect(cols.has(expected), `leads missing column ${expected}`).toBe(true);
    }
  });

  it('users.email has a unique index', () => {
    const idx = sqlite
      .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name='users_email_unique'`)
      .get() as { sql: string } | undefined;
    expect(idx?.sql ?? '').toMatch(/UNIQUE/i);
  });
});
