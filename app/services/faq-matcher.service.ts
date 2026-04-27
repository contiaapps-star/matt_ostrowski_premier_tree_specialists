import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { type FaqEntry, faqEntries } from '../db/schema.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface FindFaqsOpts {
  db?: DrizzleDb;
  topN?: number;
}

interface ScoredFaq {
  faq: FaqEntry;
  score: number;
}

/**
 * Score each FAQ entry: +1 per FAQ keyword present in scopeRaw (case-insensitive
 * substring), +5 if FAQ category equals scope_category. Returns top-N FAQs with
 * score > 0, sorted by score DESC then priority DESC.
 */
export function findRelevantFaqs(
  scopeRaw: string | null | undefined,
  scopeCategory: string | null | undefined,
  opts: FindFaqsOpts = {},
): FaqEntry[] {
  const db = opts.db ?? getDb();
  const topN = opts.topN ?? 3;

  const all = db.select().from(faqEntries).where(eq(faqEntries.active, true)).all();
  if (all.length === 0) return [];

  const lowerScope = (scopeRaw ?? '').toLowerCase();
  const category = scopeCategory ?? '';

  const scored: ScoredFaq[] = all.map((faq) => {
    const keywords = (faq.keywords ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    let score = 0;
    for (const kw of keywords) {
      if (lowerScope.includes(kw.toLowerCase())) score += 1;
    }
    if (category && faq.category === category) score += 5;
    return { faq, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.faq.priority ?? 0) - (a.faq.priority ?? 0);
    })
    .slice(0, topN)
    .map((s) => s.faq);
}
