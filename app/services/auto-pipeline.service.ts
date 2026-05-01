import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { extractLeadData } from './extraction.service.js';
import { generateResponse } from './response-generator.service.js';

export interface AutoPipelineResult {
  leadId: string;
  ranExtraction: boolean;
  ranResponseGen: boolean;
  finalStatus?: string;
  error?: string;
}

/**
 * Drives a freshly-ingested lead all the way through the pipeline:
 *   ingested → extract (LLM) → extracted → response gen (LLM) → auto_sent | awaiting_review | manually_flagged
 *
 * `generateResponse` already does inline auto-dispatch when the routing
 * decision is `auto_sent` (calls dispatch which fires email + SMS + ArboStar
 * push), so by the time this returns, the lead is fully handled.
 *
 * Errors at any step are logged but don't throw — the lead still lives in
 * the DB at whatever the latest persisted status was, and the team can pick
 * it up from /dashboard. This is meant to be invoked fire-and-forget from
 * intake handlers (LSA, AnswerForce, website-form, AgentMail webhook).
 */
export async function runAutoPipelineForLead(leadId: string): Promise<AutoPipelineResult> {
  const result: AutoPipelineResult = {
    leadId,
    ranExtraction: false,
    ranResponseGen: false,
  };

  try {
    const extraction = await extractLeadData(leadId);
    result.ranExtraction = true;
    if (extraction.status !== 'extracted') {
      result.finalStatus = extraction.status;
      logger.info({ leadId, status: extraction.status }, '[auto-pipeline] extraction non-extracted; stopping');
      return result;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = `extraction_failed: ${message}`;
    logger.error({ err, leadId }, '[auto-pipeline] extraction threw');
    return result;
  }

  try {
    const response = await generateResponse(leadId);
    result.ranResponseGen = true;
    result.finalStatus = response.status;
    logger.info(
      { leadId, status: response.status, dispatch: response.dispatch?.dispatched },
      '[auto-pipeline] complete',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = `response_gen_failed: ${message}`;
    logger.error({ err, leadId }, '[auto-pipeline] response-gen threw');
  }

  return result;
}

/**
 * Fire-and-forget wrapper. Use this from HTTP handlers that should respond
 * immediately (200 to AgentMail, 201 to webhook callers) without waiting
 * for the LLM round-trip.
 *
 * In NODE_ENV=test the pipeline is suppressed by default so existing intake
 * tests keep asserting the post-ingest state (status='ingested') without
 * fighting an async LLM call. Tests that want to exercise the full pipeline
 * call `runAutoPipelineForLead` directly.
 */
export function triggerAutoPipeline(leadId: string): void {
  if (config.NODE_ENV === 'test') return;
  // Defensive: never let an async pipeline crash crash the process.
  void runAutoPipelineForLead(leadId).catch((err) => {
    logger.error({ err, leadId }, '[auto-pipeline] unhandled rejection');
  });
}
