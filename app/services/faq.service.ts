import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import type * as schema from '../db/schema.js';
import { appSettings, faqEntries } from '../db/schema.js';
import { logger } from '../lib/logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

const KEY_FAQ_MARKDOWN = 'faq_markdown';

export const DEFAULT_FAQ_MARKDOWN = `## Can you trim my oak tree?
Thank you for reaching out! We can absolutely schedule an estimate appointment. Oak trimming season in Ohio is closed April–October to prevent oak wilt disease. We schedule oak trimming November–March only. If you'd like an estimate now, it would be valid for the next season once confirmed.

## Do you serve my area?
We serve two regions in Ohio:
- Northeast Ohio: Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit
- Central Ohio: Delaware, Fairfield, Franklin, Licking, Madison, Pickaway, Union

If your ZIP code is outside these areas a team member will let you know.

## I have an emergency / a tree on my house
We provide 24/7 emergency tree service. Please call us immediately at (216) 245-8908 (Cleveland) or (614) 526-2266 (Columbus).

## Are you certified and insured?
Yes — Premier Tree Specialists employs ISA-certified arborists with 80+ years of combined experience and full insurance coverage.

## When can you come out?
Once we receive your inquiry our team will reach out shortly to schedule a complimentary estimate at a time that works for you.

## What services do you offer?
We offer tree trimming, pruning, removal, stump grinding, plant health care, and ISA-certified arborist consultations across Northeast and Central Ohio.

## How much does it cost?
We provide free on-site estimates so we can quote accurately based on tree size, condition, and access. We never quote prices over phone or email — every property is different.
`;

interface ServiceDeps {
  db?: DrizzleDb;
}

function readRow(db: DrizzleDb, key: string): string | null {
  try {
    const rows = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
    if (rows.length === 0) return null;
    return rows[0]!.value;
  } catch (err) {
    logger.warn({ err, key }, 'app_settings read failed');
    return null;
  }
}

function writeRow(db: DrizzleDb, key: string, value: string): void {
  const now = new Date();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
  if (existing.length === 0) {
    db.insert(appSettings).values({ key, value, updatedAt: now }).run();
  } else {
    db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run();
  }
}

function buildMarkdownFromEntries(db: DrizzleDb): string {
  try {
    const rows = db.select().from(faqEntries).where(eq(faqEntries.active, true)).all();
    if (rows.length === 0) return '';
    return rows.map((r) => `## ${r.question.trim()}\n${r.answer.trim()}\n`).join('\n');
  } catch {
    return '';
  }
}

/**
 * Returns the FAQ markdown the AI uses as canonical context.
 * Falls back to entries-derived markdown if no markdown is stored,
 * then to the built-in default.
 */
export function getFaqMarkdown(deps: ServiceDeps = {}): string {
  const db = deps.db ?? getDb();
  const stored = readRow(db, KEY_FAQ_MARKDOWN);
  if (stored !== null && stored.trim().length > 0) return stored;
  const fromEntries = buildMarkdownFromEntries(db);
  if (fromEntries.trim().length > 0) return fromEntries;
  return DEFAULT_FAQ_MARKDOWN;
}

export function setFaqMarkdown(value: string, deps: ServiceDeps = {}): string {
  const db = deps.db ?? getDb();
  const cleaned = typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';
  writeRow(db, KEY_FAQ_MARKDOWN, cleaned);
  return cleaned;
}

export const __testing = { KEY_FAQ_MARKDOWN };
