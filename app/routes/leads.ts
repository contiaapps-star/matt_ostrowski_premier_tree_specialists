import { asc, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { html as honoHtml } from 'hono/html';
import { getDb } from '../db/client.js';
import {
  auditLog,
  leads,
  leadSourceEvents,
  outboundMessages,
  type AuditLogRow,
  type Lead,
  type LeadSourceEvent,
  type OutboundMessage,
} from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { normalizeToE164 } from '../lib/e164.js';
import { lookupCounty } from '../lib/zip-lookup.js';
import { logger } from '../lib/logger.js';
import { baseLayout, flashOob } from '../views/layouts/base.html.js';
import {
  extractedDataRegion,
  leadDetailPage,
  leadSummaryCard,
  notFoundPage,
  outboundStatusCard,
  responseRegion,
} from '../views/pages/lead-detail.html.js';
import { demoUserMiddleware, type DemoUser, type DemoUserVariables } from '../middleware/demo-user.js';
import { generateResponse } from '../services/response-generator.service.js';
import { dispatchLead } from '../services/outbound-dispatcher.service.js';

export const leadsRoute = new Hono<{ Variables: DemoUserVariables }>();

leadsRoute.use('*', demoUserMiddleware);

function loadLead(id: string): Lead | null {
  const db = getDb();
  const rows = db.select().from(leads).where(eq(leads.id, id)).all();
  return rows.length > 0 ? (rows[0] as Lead) : null;
}

function loadAuditEvents(leadId: string): AuditLogRow[] {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.leadId, leadId))
    .orderBy(desc(auditLog.createdAt))
    .all() as AuditLogRow[];
}

function loadSourceEvents(leadId: string): LeadSourceEvent[] {
  const db = getDb();
  return db
    .select()
    .from(leadSourceEvents)
    .where(eq(leadSourceEvents.leadId, leadId))
    .orderBy(asc(leadSourceEvents.receivedAt))
    .all() as LeadSourceEvent[];
}

function loadOutboundMessages(leadId: string): OutboundMessage[] {
  const db = getDb();
  return db
    .select()
    .from(outboundMessages)
    .where(eq(outboundMessages.leadId, leadId))
    .orderBy(asc(outboundMessages.createdAt))
    .all() as OutboundMessage[];
}

function getReviewQueueCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'awaiting_review'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

function trimNullable(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

interface ParsedExtractedData {
  customerName: string | null;
  customerPhoneE164: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  customerZip: string | null;
}

function parseExtractedFormBody(body: Record<string, unknown>): ParsedExtractedData {
  const phoneRaw = trimNullable(body.customer_phone);
  const phoneE164 = phoneRaw ? normalizeToE164(phoneRaw) : null;
  return {
    customerName: trimNullable(body.customer_name),
    customerPhoneE164: phoneE164,
    customerEmail: trimNullable(body.customer_email),
    customerAddress: trimNullable(body.customer_address),
    customerCity: trimNullable(body.customer_city),
    customerZip: trimNullable(body.customer_zip),
  };
}

function recordAudit(leadId: string, actor: string, action: string, details: unknown): void {
  const db = getDb();
  db.insert(auditLog)
    .values({
      id: generateUuidV7(),
      leadId,
      actor,
      action,
      details: details === undefined ? null : JSON.stringify(details),
    })
    .run();
}

function withFlash(region: ReturnType<typeof responseRegion>, text: string, kind: 'success' | 'info' | 'error' = 'success') {
  return honoHtml`${region}${flashOob(text, kind)}`;
}

/**
 * Returns a fragment containing the response region (primary swap target)
 * + an OOB swap of the lead-summary card so its status badge stays in sync
 * + a flash banner.
 */
function responseAndSummary(
  lead: Lead,
  flashText: string,
  kind: 'success' | 'info' | 'error' = 'success',
) {
  const summaryOob = honoHtml`<div id="lead-summary-region" hx-swap-oob="true">${leadSummaryCard(lead)}</div>`;
  return honoHtml`${responseRegion(lead)}${summaryOob}${flashOob(flashText, kind)}`;
}

leadsRoute.get('/leads/:id', (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) {
    return c.html(
      baseLayout({
        title: 'Lead not found',
        body: notFoundPage(id),
        active: 'dashboard',
        reviewQueueCount: getReviewQueueCount(),
        userDisplayName: c.get('user')?.displayName ?? null,
      }),
      404,
    );
  }
  const auditEvents = loadAuditEvents(id);
  const sourceEvents = loadSourceEvents(id);
  const outboundMessagesRows = loadOutboundMessages(id);
  const body = leadDetailPage({
    lead,
    auditEvents,
    sourceEvents,
    outboundMessages: outboundMessagesRows,
  });
  return c.html(
    baseLayout({
      title: lead.customerName ?? 'Lead detail',
      body,
      active: 'dashboard',
      reviewQueueCount: getReviewQueueCount(),
      userDisplayName: c.get('user')?.displayName ?? null,
    }),
  );
});

leadsRoute.patch('/leads/:id/extracted-data', async (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) {
    return c.json({ error: 'lead_not_found' }, 404);
  }
  const user: DemoUser = c.get('user');

  const formBody = await c.req.parseBody();
  const parsed = parseExtractedFormBody(formBody as Record<string, unknown>);

  const zipLookup = parsed.customerZip ? lookupCounty(parsed.customerZip) : null;
  const newCounty = zipLookup?.county ?? null;
  const outOfArea = parsed.customerZip ? !zipLookup : lead.outOfServiceArea;

  const db = getDb();
  const now = new Date();
  db.update(leads)
    .set({
      customerName: parsed.customerName,
      customerPhoneE164: parsed.customerPhoneE164,
      customerEmail: parsed.customerEmail,
      customerAddress: parsed.customerAddress,
      customerCity: parsed.customerCity,
      customerZip: parsed.customerZip,
      serviceAreaCounty: newCounty,
      outOfServiceArea: outOfArea,
      updatedAt: now,
    })
    .where(eq(leads.id, id))
    .run();

  recordAudit(id, user.email, 'manually_edited_extracted_data', {
    by: user.email,
    fields: parsed,
    new_county: newCounty,
    out_of_service_area: outOfArea,
  });

  const updated = loadLead(id);
  if (!updated) {
    return c.json({ error: 'lead_disappeared' }, 500);
  }
  return c.html(extractedDataRegion(updated));
});

leadsRoute.post('/leads/:id/approve', (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) return c.json({ error: 'lead_not_found' }, 404);
  if (lead.status !== 'awaiting_review') {
    return c.json({ error: 'invalid_status', status: lead.status }, 409);
  }
  const user: DemoUser = c.get('user');
  const db = getDb();
  const now = new Date();
  db.update(leads)
    .set({
      status: 'manually_sent',
      responseSentAt: now,
      responseSentBy: user.email,
      updatedAt: now,
    })
    .where(eq(leads.id, id))
    .run();

  const userKey = user.email.split('@')[0] ?? user.email;
  recordAudit(id, user.email, `approved_by_${userKey}`, {
    by: user.email,
    previous_status: lead.status,
  });

  const updated = loadLead(id) as Lead;
  return c.html(responseAndSummary(updated, 'Lead approved and marked as sent.', 'success'));
});

leadsRoute.post('/leads/:id/reject', async (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) return c.json({ error: 'lead_not_found' }, 404);
  if (lead.status !== 'awaiting_review') {
    return c.json({ error: 'invalid_status', status: lead.status }, 409);
  }
  const user: DemoUser = c.get('user');
  const formBody = (await c.req.parseBody()) as Record<string, unknown>;
  const note = trimNullable(formBody.note);
  const db = getDb();
  const now = new Date();
  db.update(leads).set({ status: 'manually_flagged', updatedAt: now }).where(eq(leads.id, id)).run();
  const userKey = user.email.split('@')[0] ?? user.email;
  recordAudit(id, user.email, `rejected_by_${userKey}`, {
    by: user.email,
    note,
    previous_status: lead.status,
  });
  const updated = loadLead(id) as Lead;
  return c.html(responseAndSummary(updated, 'Lead rejected and moved to manual flag.', 'info'));
});

const SENDABLE_STATUSES = new Set(['awaiting_review', 'manually_flagged', 'extracted']);

leadsRoute.post('/leads/:id/edit-and-send', async (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) return c.json({ error: 'lead_not_found' }, 404);
  if (!SENDABLE_STATUSES.has(lead.status)) {
    return c.json({ error: 'invalid_status', status: lead.status }, 409);
  }
  const user: DemoUser = c.get('user');
  const formBody = (await c.req.parseBody()) as Record<string, unknown>;
  const newText = typeof formBody.response_text === 'string' ? formBody.response_text.trim() : '';
  if (newText.length < 1 || newText.length > 5000) {
    return c.json({ error: 'invalid_response_text', length: newText.length }, 400);
  }
  const db = getDb();
  const now = new Date();
  db.update(leads)
    .set({
      responseText: newText,
      status: 'manually_sent',
      responseSentAt: now,
      responseSentBy: user.email,
      updatedAt: now,
    })
    .where(eq(leads.id, id))
    .run();
  const userKey = user.email.split('@')[0] ?? user.email;
  recordAudit(id, user.email, `edited_and_sent_by_${userKey}`, {
    by: user.email,
    previous_status: lead.status,
    new_text_length: newText.length,
  });
  const updated = loadLead(id) as Lead;
  return c.html(responseAndSummary(updated, 'Lead edited and marked as sent.', 'success'));
});

leadsRoute.post('/leads/:id/regenerate-response', async (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) return c.json({ error: 'lead_not_found' }, 404);
  const user: DemoUser = c.get('user');

  const db = getDb();
  // Reset:
  //  - status → 'extracted' so generateResponse() proceeds
  //  - confidenceScore → null so the dataCompleteness factor in
  //    finalConfidence = llmConfidence × dataCompleteness defaults to 1.0
  //    (otherwise repeated regenerates compound the penalty and the lead
  //    falls below the draft threshold even when the LLM is confident).
  //  - escalationTriggered → false so the keyword pre-check can decide
  //    fresh; if the scope text really does contain escalation keywords the
  //    detector inside generateResponse will re-flag it anyway.
  db.update(leads)
    .set({
      status: 'extracted',
      confidenceScore: null,
      confidenceReasoning: null,
      escalationTriggered: false,
      escalationReason: null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id))
    .run();
  recordAudit(id, user.email, 'regenerate_requested', {
    by: user.email,
    previous_status: lead.status,
    previous_confidence: lead.confidenceScore,
    previous_escalation_triggered: lead.escalationTriggered,
  });

  try {
    await generateResponse(id);
  } catch (err) {
    logger.error({ err, leadId: id }, 'regenerate response failed');
  }

  const updated = loadLead(id) as Lead;
  const { text, kind } = describeRegenerationResult(updated);
  return c.html(responseAndSummary(updated, text, kind));
});

leadsRoute.post('/leads/:id/dispatch-now', async (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) return c.json({ error: 'lead_not_found' }, 404);
  if (lead.status !== 'auto_sent' && lead.status !== 'manually_sent') {
    return c.json({ error: 'invalid_status', status: lead.status }, 409);
  }

  let dispatchResult;
  try {
    dispatchResult = await dispatchLead(id);
  } catch (err) {
    logger.error({ err, leadId: id }, 'manual dispatch failed');
    return c.json({ error: 'dispatch_failed' }, 500);
  }

  const messages = loadOutboundMessages(id);
  const updated = loadLead(id) as Lead;
  return c.html(
    honoHtml`${outboundStatusCard(updated, messages)}${flashOob(
      describeDispatchResult(dispatchResult),
      dispatchResult.emailSent || dispatchResult.smsSent ? 'success' : 'error',
    )}`,
  );
});

function describeDispatchResult(r: { emailSent: boolean; smsSent: boolean; arboStarSynced: boolean; skipped?: boolean; reason?: string }): string {
  if (r.skipped) {
    return `Dispatch skipped: ${r.reason ?? 'unknown'}.`;
  }
  const channels: string[] = [];
  if (r.emailSent) channels.push('email');
  if (r.smsSent) channels.push('SMS/iMessage');
  if (channels.length === 0) {
    return 'Dispatch failed: no channels succeeded.';
  }
  const arboNote = r.arboStarSynced ? ', synced to ArboStar' : '';
  return `Sent via ${channels.join(' + ')}${arboNote}.`;
}

function describeRegenerationResult(lead: Lead): { text: string; kind: 'success' | 'info' | 'error' } {
  if (lead.status === 'auto_sent') {
    return { text: 'Response auto-sent (high confidence).', kind: 'success' };
  }
  if (lead.status === 'awaiting_review') {
    return { text: 'New draft generated and queued for review.', kind: 'success' };
  }
  if (lead.status === 'manually_flagged') {
    if (lead.escalationTriggered) {
      return {
        text: `Lead escalated to manual review${lead.escalationReason ? ` — ${lead.escalationReason}` : ''}. No draft generated.`,
        kind: 'info',
      };
    }
    return { text: 'No draft generated — confidence too low. Compose manually.', kind: 'info' };
  }
  return { text: 'Response regenerated.', kind: 'info' };
}
