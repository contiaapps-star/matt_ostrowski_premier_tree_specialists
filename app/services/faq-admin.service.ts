import { asc, desc, eq, like, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { type FaqEntry, faqEntries } from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface FaqAdminDeps {
  db?: DrizzleDb;
}

export interface FaqWriteInput {
  category: string;
  question: string;
  answer: string;
  keywords: string;
  priority?: number;
  active?: boolean;
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampPriority(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  if (i < 0) return 0;
  if (i > 9999) return 9999;
  return i;
}

export function listFaqs(deps: FaqAdminDeps = {}): FaqEntry[] {
  const db = deps.db ?? getDb();
  return db
    .select()
    .from(faqEntries)
    .orderBy(desc(faqEntries.priority), asc(faqEntries.category))
    .all() as FaqEntry[];
}

export function searchFaqs(query: string, deps: FaqAdminDeps = {}): FaqEntry[] {
  const db = deps.db ?? getDb();
  const q = trim(query);
  if (q.length === 0) return listFaqs({ db });
  const needle = `%${q.toLowerCase()}%`;
  const rows = db
    .select()
    .from(faqEntries)
    .where(
      or(
        like(faqEntries.category, needle),
        like(faqEntries.question, needle),
        like(faqEntries.keywords, needle),
      ),
    )
    .orderBy(desc(faqEntries.priority), asc(faqEntries.category))
    .all() as FaqEntry[];
  return rows;
}

export function getFaq(id: string, deps: FaqAdminDeps = {}): FaqEntry | null {
  const db = deps.db ?? getDb();
  const rows = db.select().from(faqEntries).where(eq(faqEntries.id, id)).all();
  return rows.length > 0 ? (rows[0] as FaqEntry) : null;
}

export class FaqValidationError extends Error {
  field: 'category' | 'question' | 'answer';
  constructor(field: 'category' | 'question' | 'answer', message: string) {
    super(message);
    this.field = field;
    this.name = 'FaqValidationError';
  }
}

function validate(input: FaqWriteInput): {
  category: string;
  question: string;
  answer: string;
  keywords: string;
  priority: number;
  active: boolean;
} {
  const category = trim(input.category);
  const question = trim(input.question);
  const answer = trim(input.answer);
  if (category.length === 0) throw new FaqValidationError('category', 'Category is required');
  if (question.length === 0) throw new FaqValidationError('question', 'Question is required');
  if (answer.length === 0) throw new FaqValidationError('answer', 'Answer is required');
  return {
    category,
    question,
    answer,
    keywords: trim(input.keywords),
    priority: clampPriority(input.priority),
    active: input.active === undefined ? true : Boolean(input.active),
  };
}

export function createFaq(input: FaqWriteInput, deps: FaqAdminDeps = {}): FaqEntry {
  const db = deps.db ?? getDb();
  const v = validate(input);
  const now = new Date();
  const row = {
    id: generateUuidV7(),
    category: v.category,
    question: v.question,
    answer: v.answer,
    keywords: v.keywords,
    priority: v.priority,
    active: v.active,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(faqEntries).values(row).run();
  return row as FaqEntry;
}

export function updateFaq(id: string, input: FaqWriteInput, deps: FaqAdminDeps = {}): FaqEntry | null {
  const db = deps.db ?? getDb();
  const existing = getFaq(id, { db });
  if (!existing) return null;
  const v = validate(input);
  const now = new Date();
  db.update(faqEntries)
    .set({
      category: v.category,
      question: v.question,
      answer: v.answer,
      keywords: v.keywords,
      priority: v.priority,
      active: v.active,
      updatedAt: now,
    })
    .where(eq(faqEntries.id, id))
    .run();
  return getFaq(id, { db });
}

export function deleteFaq(id: string, deps: FaqAdminDeps = {}): boolean {
  const db = deps.db ?? getDb();
  const existing = getFaq(id, { db });
  if (!existing) return false;
  db.delete(faqEntries).where(eq(faqEntries.id, id)).run();
  return true;
}
