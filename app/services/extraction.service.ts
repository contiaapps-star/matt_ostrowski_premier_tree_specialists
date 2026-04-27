import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { config as appConfig } from '../config.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import {
  type Lead,
  type LeadStatus,
  type ScopeCategory,
  SCOPE_CATEGORIES,
  auditLog,
  leads,
  leadSourceEvents,
} from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { normalizeToE164 } from '../lib/e164.js';
import { lookupCounty } from '../lib/zip-lookup.js';
import { logger } from '../lib/logger.js';
import { createOpenRouterClient, type OpenRouterClient } from '../clients/openrouter.client.js';
import { categorizeScope } from './scope-categorizer.service.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ExtractionResult {
  leadId: string;
  status: 'extracted' | 'manually_flagged' | 'skipped' | 'failed';
  reason?: string;
  scopeCategory?: ScopeCategory;
  outOfServiceArea?: boolean;
  dataCompleteness?: number;
}

interface LlmExtraction {
  extracted: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  scope_summary: string;
  scope_category: string;
  missing_critical_fields: string[];
}

const SYSTEM_PROMPT =
  'You are a data extraction assistant for a tree care company in Ohio. ' +
  'Extract structured fields from inbound customer inquiries. ' +
  'Be conservative — return null for any field you can\'t confidently extract.';

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['extracted', 'scope_summary', 'scope_category', 'missing_critical_fields'],
  properties: {
    extracted: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'phone', 'email', 'address', 'city', 'state', 'zip'],
      properties: {
        name: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        state: { type: ['string', 'null'] },
        zip: { type: ['string', 'null'] },
      },
    },
    scope_summary: { type: 'string' },
    scope_category: { type: 'string' },
    missing_critical_fields: { type: 'array', items: { type: 'string' } },
  },
};

interface BuildPromptInput {
  scopeRaw: string;
  knownName: string | null;
  knownPhone: string | null;
  knownEmail: string | null;
  knownCity: string | null;
  knownZip: string | null;
  sourceLabel: string;
}

export function buildUserPrompt(input: BuildPromptInput): string {
  const known: string[] = [];
  if (input.knownName) known.push(`name: ${input.knownName}`);
  if (input.knownPhone) known.push(`phone: ${input.knownPhone}`);
  if (input.knownEmail) known.push(`email: ${input.knownEmail}`);
  if (input.knownCity) known.push(`city: ${input.knownCity}`);
  if (input.knownZip) known.push(`zip: ${input.knownZip}`);

  const knownBlock = known.length > 0 ? `Known fields from intake source:\n${known.join('\n')}\n\n` : '';

  return (
    `Source: ${input.sourceLabel}\n\n` +
    `${knownBlock}` +
    `Inbound message / scope of work:\n"""\n${input.scopeRaw}\n"""\n\n` +
    'Return JSON conforming to the schema. Categories must be one of: ' +
    SCOPE_CATEGORIES.join(', ') +
    '. Use null for any field you cannot confidently extract.'
  );
}

function fetchKnownFromSourceEvent(db: DrizzleDb, leadId: string): {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  zip: string | null;
} {
  const events = db
    .select()
    .from(leadSourceEvents)
    .where(eq(leadSourceEvents.leadId, leadId))
    .all();

  const fallback = { name: null, phone: null, email: null, city: null, zip: null } as {
    name: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    zip: string | null;
  };
  if (events.length === 0) return fallback;

  const first = events[0]!;
  try {
    const payload = JSON.parse(first.rawPayload) as Record<string, unknown>;
    const parsed = (payload.parsed as Record<string, unknown> | undefined) ?? undefined;
    const name =
      (typeof parsed?.name === 'string' ? parsed.name : null) ??
      (typeof payload.name === 'string' ? (payload.name as string) : null);
    const phone =
      (typeof parsed?.phone === 'string' ? parsed.phone : null) ??
      (typeof payload.phone === 'string' ? (payload.phone as string) : null);
    const email = typeof payload.email === 'string' && payload.email.length > 0 ? (payload.email as string) : null;
    const city = typeof payload.city === 'string' ? (payload.city as string) : null;
    const zip = typeof payload.zip === 'string' ? (payload.zip as string) : null;
    return { name, phone, email, city, zip };
  } catch {
    return fallback;
  }
}

function safeScopeCategory(value: unknown, fallback: ScopeCategory): ScopeCategory {
  if (typeof value !== 'string') return fallback;
  if ((SCOPE_CATEGORIES as readonly string[]).includes(value)) return value as ScopeCategory;
  return fallback;
}

function computeDataCompleteness(fields: {
  name: string | null;
  phone: string | null;
  address: string | null;
  scopeSummary: string | null;
}): number {
  const present = [fields.name, fields.phone, fields.address, fields.scopeSummary].filter(
    (v) => typeof v === 'string' && v.trim().length > 0,
  ).length;
  return Math.round((present / 4) * 100) / 100;
}

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

interface ExtractDeps {
  db?: DrizzleDb;
  llm?: OpenRouterClient;
  now?: () => Date;
}

export async function extractLeadData(
  leadId: string,
  deps: ExtractDeps = {},
): Promise<ExtractionResult> {
  const db = deps.db ?? getDb();
  const llm = deps.llm ?? createOpenRouterClient(appConfig);
  const now = deps.now ?? (() => new Date());

  const found = db.select().from(leads).where(eq(leads.id, leadId)).all();
  if (found.length === 0) {
    return { leadId, status: 'failed', reason: 'lead_not_found' };
  }
  const lead: Lead = found[0]!;

  if (lead.status !== 'ingested') {
    return { leadId, status: 'skipped', reason: `status_is_${lead.status}` };
  }

  const known = fetchKnownFromSourceEvent(db, leadId);

  const prompt = buildUserPrompt({
    scopeRaw: lead.scopeRaw,
    knownName: known.name,
    knownPhone: known.phone,
    knownEmail: known.email,
    knownCity: known.city,
    knownZip: known.zip,
    sourceLabel: lead.source,
  });

  let parsed: LlmExtraction | null = null;
  try {
    const result = await llm.complete({
      system: SYSTEM_PROMPT,
      user: prompt,
      jsonSchema: RESPONSE_SCHEMA,
      maxTokens: 800,
    });
    parsed = (result.parsedJson as LlmExtraction | undefined) ?? null;
    if (!parsed && result.content) {
      try {
        parsed = JSON.parse(result.content) as LlmExtraction;
      } catch {
        parsed = null;
      }
    }
  } catch (err) {
    logger.error({ err, leadId }, 'extraction LLM call failed');
    db.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId,
        actor: 'system',
        action: 'extraction_failed',
        details: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      })
      .run();
    return { leadId, status: 'failed', reason: 'llm_call_failed' };
  }

  const extracted = parsed?.extracted ?? {
    name: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    state: null,
    zip: null,
  };

  const finalName = extracted.name ?? lead.customerName ?? known.name;
  const rawPhone = extracted.phone ?? lead.customerPhoneE164 ?? known.phone;
  const finalPhoneE164 = normalizeToE164(rawPhone);
  const finalEmail = extracted.email ?? lead.customerEmail ?? known.email;
  const finalAddress = extracted.address ?? lead.customerAddress ?? null;
  const finalCity = extracted.city ?? lead.customerCity ?? known.city;
  const finalZipRaw = extracted.zip ?? lead.customerZip ?? known.zip;
  const finalZip = isNonEmpty(finalZipRaw) ? finalZipRaw.trim().slice(0, 5) : null;

  const fallbackCategory = categorizeScope(lead.scopeRaw);
  const scopeCategory = safeScopeCategory(parsed?.scope_category, fallbackCategory);
  const scopeSummary = isNonEmpty(parsed?.scope_summary) ? parsed!.scope_summary : null;

  let serviceAreaCounty: string | null = lead.serviceAreaCounty;
  let outOfServiceArea = lead.outOfServiceArea;
  if (isNonEmpty(finalZip)) {
    const lookup = lookupCounty(finalZip, db);
    if (lookup) {
      serviceAreaCounty = lookup.county;
      outOfServiceArea = false;
    } else {
      serviceAreaCounty = null;
      outOfServiceArea = true;
    }
  }

  const dataCompleteness = computeDataCompleteness({
    name: finalName,
    phone: finalPhoneE164,
    address: finalAddress,
    scopeSummary,
  });

  const hasContact = isNonEmpty(finalPhoneE164) || isNonEmpty(finalEmail);
  const finalStatus: LeadStatus = hasContact ? 'extracted' : 'manually_flagged';

  let escalationTriggered = lead.escalationTriggered;
  let escalationReason = lead.escalationReason;
  if (scopeCategory === 'emergency') {
    escalationTriggered = true;
    escalationReason = 'scope_category=emergency';
  }

  const updatedAt = now();

  db.transaction((tx) => {
    tx.update(leads)
      .set({
        status: finalStatus,
        customerName: finalName,
        customerPhoneE164: finalPhoneE164 ?? lead.customerPhoneE164,
        customerEmail: isNonEmpty(finalEmail) ? finalEmail : lead.customerEmail,
        customerAddress: isNonEmpty(finalAddress) ? finalAddress : lead.customerAddress,
        customerCity: isNonEmpty(finalCity) ? finalCity : lead.customerCity,
        customerZip: isNonEmpty(finalZip) ? finalZip : lead.customerZip,
        serviceAreaCounty,
        outOfServiceArea,
        scopeCategory,
        scopeSummary: scopeSummary ?? lead.scopeSummary,
        confidenceScore: dataCompleteness,
        confidenceReasoning: `data_completeness=${dataCompleteness} (name+phone+address+scope_summary)`,
        escalationTriggered,
        escalationReason,
        updatedAt,
      })
      .where(eq(leads.id, leadId))
      .run();

    if (finalStatus === 'manually_flagged') {
      tx.insert(auditLog)
        .values({
          id: generateUuidV7(),
          leadId,
          actor: 'system',
          action: 'manually_flagged',
          details: JSON.stringify({ reason: 'missing_critical_contact_info' }),
        })
        .run();
    }

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId,
        actor: 'system',
        action: 'extracted',
        details: JSON.stringify({
          scope_category: scopeCategory,
          out_of_service_area: outOfServiceArea,
          data_completeness: dataCompleteness,
          escalation_triggered: escalationTriggered,
          missing_critical_fields: parsed?.missing_critical_fields ?? [],
        }),
      })
      .run();
  });

  return {
    leadId,
    status: finalStatus,
    scopeCategory,
    outOfServiceArea,
    dataCompleteness,
  };
}
