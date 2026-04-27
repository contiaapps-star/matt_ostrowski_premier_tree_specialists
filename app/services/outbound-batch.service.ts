import { and, asc, eq, inArray, notExists } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { type Config, config as appConfig } from '../config.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { auditLog, leads } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import type { ArboStarClient } from '../clients/arbostar.client.js';
import type { EmailClient } from '../clients/sendgrid.client.js';
import type { SmsClient } from '../clients/agent-phone.client.js';
import { type DispatchResult, dispatchLead } from './outbound-dispatcher.service.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DispatchBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: DispatchResult[];
  errors: Array<{ leadId: string; error: string }>;
}

interface BatchDeps {
  db?: DrizzleDb;
  emailClient?: EmailClient;
  smsClient?: SmsClient;
  arboStarClient?: ArboStarClient;
  cfg?: Config;
  limit?: number;
}

const DISPATCHED_OUTBOUND_ACTION = 'dispatched_outbound';

export async function dispatchPendingLeads(deps: BatchDeps = {}): Promise<DispatchBatchResult> {
  const db = deps.db ?? getDb();
  const cfg = deps.cfg ?? appConfig;
  const limit = deps.limit ?? 50;

  // Find leads in dispatchable status that have NOT yet been dispatched.
  const candidateRows = db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        inArray(leads.status, ['auto_sent', 'manually_sent']),
        notExists(
          db
            .select()
            .from(auditLog)
            .where(
              and(
                eq(auditLog.leadId, leads.id),
                eq(auditLog.action, DISPATCHED_OUTBOUND_ACTION),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(leads.receivedAt))
    .limit(limit)
    .all();

  const result: DispatchBatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
    errors: [],
  };

  for (const row of candidateRows) {
    result.processed += 1;
    try {
      const r = await dispatchLead(row.id, {
        db,
        cfg,
        emailClient: deps.emailClient,
        smsClient: deps.smsClient,
        arboStarClient: deps.arboStarClient,
      });
      result.results.push(r);
      if (r.skipped) {
        // Skipped leads aren't counted as success or failure; idempotency.
        continue;
      }
      if (r.emailSent || r.smsSent) {
        result.succeeded += 1;
      } else {
        result.failed += 1;
        result.errors.push({
          leadId: row.id,
          error: r.errors.map((e) => `${e.stage}:${e.message}`).join('; ') || 'no_channel_sent',
        });
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ leadId: row.id, error: message });
      logger.error({ err, leadId: row.id }, 'batch dispatch error');
    }
  }

  return result;
}
