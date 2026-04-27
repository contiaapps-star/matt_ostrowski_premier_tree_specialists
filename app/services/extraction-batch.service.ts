import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { leads } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import type { OpenRouterClient } from '../clients/openrouter.client.js';
import { extractLeadData, type ExtractionResult } from './extraction.service.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface BatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: ExtractionResult[];
  errors: Array<{ leadId: string; error: string }>;
}

interface BatchDeps {
  db?: DrizzleDb;
  llm?: OpenRouterClient;
  limit?: number;
}

export async function processIngestedLeads(deps: BatchDeps = {}): Promise<BatchResult> {
  const db = deps.db ?? getDb();
  const limit = deps.limit ?? 50;

  const ingested = db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.status, 'ingested'))
    .orderBy(asc(leads.receivedAt))
    .limit(limit)
    .all();

  const result: BatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
    errors: [],
  };

  for (const row of ingested) {
    result.processed += 1;
    try {
      const r = await extractLeadData(row.id, { db, llm: deps.llm });
      result.results.push(r);
      if (r.status === 'extracted' || r.status === 'manually_flagged') {
        result.succeeded += 1;
      } else if (r.status === 'failed') {
        result.failed += 1;
        result.errors.push({ leadId: row.id, error: r.reason ?? 'unknown' });
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ leadId: row.id, error: message });
      logger.error({ err, leadId: row.id }, 'batch extraction error');
    }
  }

  return result;
}
