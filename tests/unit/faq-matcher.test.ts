import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, getSqlite } from '../../app/db/client.js';
import { resetZipCache } from '../../app/lib/zip-lookup.js';
import { intakeRateLimiter } from '../../app/middleware/rate-limit.js';
import { findRelevantFaqs } from '../../app/services/faq-matcher.service.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

function setup(): void {
  closeDb();
  resetZipCache();
  intakeRateLimiter.reset();
  const db = getDb();
  const sqlite = getSqlite();
  sqlite.pragma('foreign_keys = ON');
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  runSeed(db);
}

function teardown(): void {
  closeDb();
  resetZipCache();
}

describe('findRelevantFaqs', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it('ranks Oak Season top for an oak-trim message', () => {
    const faqs = findRelevantFaqs('I have an oak tree to trim, please give me a quote', 'trimming');
    expect(faqs.length).toBeGreaterThan(0);
    expect(faqs[0]!.category).toBe('oak_season');
  });

  it('ranks Service Area top for "what is your service area"', () => {
    const faqs = findRelevantFaqs("what's your service area", 'other');
    expect(faqs.length).toBeGreaterThan(0);
    expect(faqs[0]!.category).toBe('service_area');
  });

  it('returns Service Types match for a "remove a maple" inquiry', () => {
    const faqs = findRelevantFaqs('Looking to remove a maple in the front yard', 'removal');
    expect(faqs.length).toBeGreaterThan(0);
    const categories = faqs.map((f) => f.category);
    expect(categories).toContain('service_types');
  });

  it('matches the emergency FAQ when scope_category=emergency (category bonus)', () => {
    const faqs = findRelevantFaqs('Need help with a fallen tree', 'emergency');
    expect(faqs.length).toBeGreaterThan(0);
    expect(faqs[0]!.category).toBe('emergency');
  });

  it('caps results at topN (default 3)', () => {
    const faqs = findRelevantFaqs(
      'oak trim service area emergency certified schedule services offer remove',
      'other',
    );
    expect(faqs.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for completely unrelated text', () => {
    const faqs = findRelevantFaqs('xyzzy frobnicate quux', 'other');
    expect(faqs).toEqual([]);
  });

  it('handles null/undefined inputs gracefully', () => {
    expect(findRelevantFaqs(null, null)).toEqual([]);
    expect(findRelevantFaqs(undefined, undefined)).toEqual([]);
    expect(findRelevantFaqs('', '')).toEqual([]);
  });
});
