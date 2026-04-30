import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { type Config, config as appConfig } from '../config.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { type Lead, auditLog, leads } from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { logger } from '../lib/logger.js';
import { createOpenRouterClient, type OpenRouterClient } from '../clients/openrouter.client.js';
import type { ArboStarClient } from '../clients/arbostar.client.js';
import type { EmailClient } from '../clients/sendgrid.client.js';
import type { SmsClient } from '../clients/agent-phone.client.js';
import { detectEscalation } from './escalation-detector.service.js';
import { getFaqMarkdown } from './faq.service.js';
import { dispatchLead, type DispatchResult } from './outbound-dispatcher.service.js';
import { getAiSettings, getBusinessRules } from './settings.service.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export type ResponseFinalStatus =
  | 'auto_sent'
  | 'awaiting_review'
  | 'manually_flagged'
  | 'skipped'
  | 'failed';

export interface ResponseGenerationResult {
  leadId: string;
  status: ResponseFinalStatus;
  reason?: string;
  finalConfidence?: number;
  llmConfidence?: number;
  responseTextSet?: boolean;
  escalationTriggered?: boolean;
  dispatch?: DispatchResult;
}

interface LlmResponse {
  response_text: string;
  confidence: number;
  confidence_reasoning: string;
  escalation_recheck: boolean;
}

const SYSTEM_PROMPT =
  'You are a customer-service agent for Premier Tree Specialists, a residential and commercial tree care company in Cleveland and Columbus, Ohio. ' +
  'Your goal is to send a helpful, knowledgeable, professional first response to inquiries — sounding like an ISA-certified arborist, not a chatbot. ' +
  'NEVER promise scheduling — always say the team will call to schedule. ' +
  "NEVER mention pricing in dollars — say 'we'll provide a free estimate'. " +
  'ALWAYS mention ISA-certified arborist credentials when relevant. ' +
  "Sign off as 'Premier Tree Specialists Team'. " +
  'If you cannot confidently respond, set confidence below 0.5.';

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['response_text', 'confidence', 'confidence_reasoning', 'escalation_recheck'],
  properties: {
    response_text: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    confidence_reasoning: { type: 'string' },
    escalation_recheck: { type: 'boolean' },
  },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildResponsePrompt(lead: Lead, faqMarkdown: string): string {
  const dataLines: string[] = [
    `- Name: ${lead.customerName ?? '(unknown)'}`,
    `- Phone: ${lead.customerPhoneE164 ?? '(unknown)'}`,
    `- Email: ${lead.customerEmail ?? '(unknown)'}`,
    `- Address: ${lead.customerAddress ?? '(unknown)'}`,
    `- City: ${lead.customerCity ?? '(unknown)'}`,
    `- ZIP: ${lead.customerZip ?? '(unknown)'}`,
    `- County: ${lead.serviceAreaCounty ?? '(unknown)'}`,
    `- Out of service area: ${lead.outOfServiceArea ? 'YES (politely decline / refer)' : 'no'}`,
    `- Scope category: ${lead.scopeCategory ?? 'unknown'}`,
    `- Scope summary: ${lead.scopeSummary ?? '(no summary)'}`,
    `- Source: ${lead.source}`,
  ];

  const faqBlock = faqMarkdown.trim().length > 0
    ? faqMarkdown.trim()
    : '(no FAQ content configured — use professional courteous default tone.)';

  return [
    '[task: generate_response]',
    '',
    'Lead extracted data:',
    ...dataLines,
    '',
    'Original message from customer:',
    '"""',
    lead.scopeRaw,
    '"""',
    '',
    'FAQ knowledge base (canonical answers — match the customer message against these and use the matching answer verbatim where relevant):',
    '"""',
    faqBlock,
    '"""',
    '',
    'Generate a personalized first response addressing the customer directly. Do NOT promise specific scheduling or pricing — say a team member will follow up to schedule a complimentary estimate. Mention ISA-certified arborist credentials when relevant. Sign off as "Premier Tree Specialists Team".',
    '',
    'Return JSON conforming to the schema. confidence is a number from 0.0 to 1.0. Set escalation_recheck=true if you detect this lead requires immediate human escalation that may have been missed by an initial filter.',
  ].join('\n');
}

interface GenerateDeps {
  db?: DrizzleDb;
  llm?: OpenRouterClient;
  now?: () => Date;
  cfg?: Config;
  emailClient?: EmailClient;
  smsClient?: SmsClient;
  arboStarClient?: ArboStarClient;
  /** Skip the inline auto-dispatch hook (testing / batch jobs that dispatch separately). */
  skipAutoDispatch?: boolean;
}

function persistEscalation(
  db: DrizzleDb,
  leadId: string,
  reason: string,
  matched: string[],
  now: Date,
): void {
  db.transaction((tx) => {
    tx.update(leads)
      .set({
        status: 'manually_flagged',
        escalationTriggered: true,
        escalationReason: reason,
        responseText: null,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId))
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId,
        actor: 'system',
        action: 'escalation_detected',
        details: JSON.stringify({ reason, matched_keywords: matched }),
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId,
        actor: 'system',
        action: 'routed_manually_flagged',
        details: JSON.stringify({ reason: 'escalation_triggered' }),
      })
      .run();
  });
}

function persistLlmFailure(db: DrizzleDb, leadId: string, errMessage: string, now: Date): void {
  db.transaction((tx) => {
    tx.update(leads)
      .set({
        status: 'manually_flagged',
        responseText: null,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId))
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId,
        actor: 'system',
        action: 'response_generation_failed',
        details: JSON.stringify({ reason: 'llm_unavailable', error: errMessage }),
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId,
        actor: 'system',
        action: 'routed_manually_flagged',
        details: JSON.stringify({ reason: 'llm_unavailable' }),
      })
      .run();
  });
}

interface PersistSuccessInput {
  leadId: string;
  finalStatus: 'auto_sent' | 'awaiting_review' | 'manually_flagged';
  responseText: string | null;
  finalConfidence: number;
  llmConfidence: number;
  dataCompleteness: number;
  reasoning: string;
  faqsUsed: string[];
  escalationTriggered: boolean;
  escalationReason: string | null;
  routingReason: string;
  now: Date;
}

function persistSuccess(db: DrizzleDb, input: PersistSuccessInput): void {
  const reasoningSuffix = ` (final=${input.finalConfidence}, llm=${input.llmConfidence}, data_completeness=${input.dataCompleteness})`;
  const isAutoSent = input.finalStatus === 'auto_sent';
  db.transaction((tx) => {
    tx.update(leads)
      .set({
        status: input.finalStatus,
        responseText: input.responseText,
        confidenceScore: input.finalConfidence,
        confidenceReasoning: `${input.reasoning}${reasoningSuffix}`,
        escalationTriggered: input.escalationTriggered,
        escalationReason: input.escalationReason,
        ...(isAutoSent
          ? { responseSentAt: input.now, responseSentBy: 'auto' }
          : {}),
        updatedAt: input.now,
      })
      .where(eq(leads.id, input.leadId))
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId: input.leadId,
        actor: 'system',
        action: 'response_generated',
        details: JSON.stringify({
          llm_confidence: input.llmConfidence,
          data_completeness: input.dataCompleteness,
          final_confidence: input.finalConfidence,
          faqs_used: input.faqsUsed,
          reasoning: input.reasoning,
          response_persisted: input.responseText !== null,
        }),
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId: input.leadId,
        actor: 'system',
        action: `routed_${input.finalStatus}`,
        details: JSON.stringify({ reason: input.routingReason }),
      })
      .run();
  });
}

export async function generateResponse(
  leadId: string,
  deps: GenerateDeps = {},
): Promise<ResponseGenerationResult> {
  const db = deps.db ?? getDb();
  const llm = deps.llm ?? createOpenRouterClient(appConfig);
  const now = deps.now ?? (() => new Date());
  const cfg = deps.cfg ?? appConfig;

  const found = db.select().from(leads).where(eq(leads.id, leadId)).all();
  if (found.length === 0) {
    return { leadId, status: 'failed', reason: 'lead_not_found' };
  }
  const lead = found[0]!;

  if (lead.status !== 'extracted') {
    return { leadId, status: 'skipped', reason: `status_is_${lead.status}` };
  }

  // Step 1: Pre-LLM escalation detection (regex on scope_raw + honor existing flag).
  const businessRules = getBusinessRules({ db });
  const detected = detectEscalation(lead.scopeRaw, {
    customKeywords: businessRules.escalationKeywords,
  });
  const isEscalated = detected.triggered || lead.escalationTriggered === true;
  if (isEscalated) {
    const reason = detected.triggered
      ? detected.reason ?? 'escalation_triggered'
      : lead.escalationReason ?? 'escalation_triggered';
    persistEscalation(db, leadId, reason, detected.matchedKeywords, now());
    return {
      leadId,
      status: 'manually_flagged',
      reason: 'escalation',
      escalationTriggered: true,
    };
  }

  // Step 2: Pull FAQ markdown (single source of truth — replaces per-row matching).
  const faqMarkdown = getFaqMarkdown({ db });

  // Step 3: Call LLM.
  const ai = getAiSettings({ db });
  const prompt = buildResponsePrompt(lead, faqMarkdown);
  let parsed: LlmResponse | null = null;
  try {
    const result = await llm.complete({
      model: ai.model,
      system: ai.systemPrompt && ai.systemPrompt.trim().length > 0 ? ai.systemPrompt : SYSTEM_PROMPT,
      user: prompt,
      jsonSchema: RESPONSE_SCHEMA,
      maxTokens: ai.maxTokens > 0 ? ai.maxTokens : 1000,
      temperature: ai.temperature,
    });
    parsed = (result.parsedJson as LlmResponse | undefined) ?? null;
    if (!parsed && result.content) {
      try {
        parsed = JSON.parse(result.content) as LlmResponse;
      } catch {
        parsed = null;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, leadId }, 'response-gen LLM call failed');
    persistLlmFailure(db, leadId, message, now());
    return { leadId, status: 'manually_flagged', reason: 'llm_unavailable' };
  }

  if (
    !parsed ||
    typeof parsed.response_text !== 'string' ||
    typeof parsed.confidence !== 'number'
  ) {
    persistLlmFailure(db, leadId, 'invalid_llm_response_shape', now());
    return { leadId, status: 'manually_flagged', reason: 'llm_unavailable' };
  }

  const llmConfidence = clamp01(parsed.confidence);
  const dataCompletenessRaw = lead.confidenceScore;
  const dataCompleteness =
    typeof dataCompletenessRaw === 'number' && dataCompletenessRaw > 0
      ? clamp01(dataCompletenessRaw)
      : 1;
  const finalConfidence = round2(llmConfidence * dataCompleteness);

  let finalStatus: 'auto_sent' | 'awaiting_review' | 'manually_flagged';
  let finalResponseText: string | null;
  let finalEscalationTriggered = lead.escalationTriggered;
  let finalEscalationReason = lead.escalationReason;
  let routingReason: string;

  if (parsed.escalation_recheck === true) {
    finalStatus = 'manually_flagged';
    finalResponseText = null;
    finalEscalationTriggered = true;
    finalEscalationReason = 'llm_escalation_recheck';
    routingReason = 'llm_escalation_recheck';
  } else if (lead.outOfServiceArea) {
    finalStatus = 'awaiting_review';
    finalResponseText = parsed.response_text;
    routingReason = 'out_of_service_area_override';
  } else if (finalConfidence >= cfg.CONFIDENCE_AUTO_SEND_THRESHOLD) {
    finalStatus = 'auto_sent';
    finalResponseText = parsed.response_text;
    routingReason = `final_confidence_${finalConfidence}_>=_${cfg.CONFIDENCE_AUTO_SEND_THRESHOLD}`;
  } else if (finalConfidence >= cfg.CONFIDENCE_DRAFT_THRESHOLD) {
    finalStatus = 'awaiting_review';
    finalResponseText = parsed.response_text;
    routingReason = `final_confidence_${finalConfidence}_in_draft_range`;
  } else {
    finalStatus = 'manually_flagged';
    finalResponseText = null;
    routingReason = `final_confidence_${finalConfidence}_below_${cfg.CONFIDENCE_DRAFT_THRESHOLD}`;
  }

  persistSuccess(db, {
    leadId,
    finalStatus,
    responseText: finalResponseText,
    finalConfidence,
    llmConfidence,
    dataCompleteness,
    reasoning: parsed.confidence_reasoning ?? '',
    // FAQ matching now happens implicitly inside the LLM via the markdown
    // context — we no longer surface a per-category "faqs_used" list.
    faqsUsed: [],
    escalationTriggered: finalEscalationTriggered ?? false,
    escalationReason: finalEscalationReason,
    routingReason,
    now: now(),
  });

  let dispatchResult: DispatchResult | undefined;
  if (finalStatus === 'auto_sent' && deps.skipAutoDispatch !== true) {
    try {
      dispatchResult = await dispatchLead(leadId, {
        db,
        cfg,
        now,
        emailClient: deps.emailClient,
        smsClient: deps.smsClient,
        arboStarClient: deps.arboStarClient,
      });
    } catch (err) {
      logger.error({ err, leadId }, 'auto-dispatch hook failed');
    }
  }

  return {
    leadId,
    status: finalStatus,
    finalConfidence,
    llmConfidence,
    responseTextSet: finalResponseText !== null,
    escalationTriggered: finalEscalationTriggered ?? false,
    dispatch: dispatchResult,
  };
}

export const __testing = { buildResponsePrompt, RESPONSE_SCHEMA, SYSTEM_PROMPT };
