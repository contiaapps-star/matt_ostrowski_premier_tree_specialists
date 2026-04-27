import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { leads } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import type { OpenRouterClient } from '../clients/openrouter.client.js';
import {
  generateResponse,
  type ResponseGenerationResult,
} from './response-generator.service.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ResponseBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: ResponseGenerationResult[];
  errors: Array<{ leadId: string; error: string }>;
}

interface BatchDeps {
  db?: DrizzleDb;
  llm?: OpenRouterClient;
  limit?: number;
}

export async function processExtractedLeads(deps: BatchDeps = {}): Promise<ResponseBatchResult> {
  const db = deps.db ?? getDb();
  const limit = deps.limit ?? 50;

  const extracted = db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.status, 'extracted'))
    .orderBy(asc(leads.receivedAt))
    .limit(limit)
    .all();

  const result: ResponseBatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
    errors: [],
  };

  for (const row of extracted) {
    result.processed += 1;
    try {
      const r = await generateResponse(row.id, { db, llm: deps.llm });
      result.results.push(r);
      if (r.status === 'failed') {
        result.failed += 1;
        result.errors.push({ leadId: row.id, error: r.reason ?? 'unknown' });
      } else {
        result.succeeded += 1;
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ leadId: row.id, error: message });
      logger.error({ err, leadId: row.id }, 'batch response-gen error');
    }
  }

  return result;
}
