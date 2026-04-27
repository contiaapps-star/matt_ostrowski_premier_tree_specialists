import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { type Config, config as appConfig } from '../config.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import {
  type Lead,
  type OutboundChannel,
  auditLog,
  leads,
  outboundMessages,
} from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';
import { logger } from '../lib/logger.js';
import {
  type ArboStarClient,
  type ArboStarLeadPayload,
  createArboStarClient,
} from '../clients/arbostar.client.js';
import { type EmailClient, createEmailClient } from '../clients/sendgrid.client.js';
import { type SmsClient, createSmsClient } from '../clients/agent-phone.client.js';
import { renderLeadResponseEmail } from './email-template.service.js';
import { validateEmailDeliverable } from './email-validator.service.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DispatchResult {
  leadId: string;
  emailSent: boolean;
  smsSent: boolean;
  arboStarSynced: boolean;
  skipped?: boolean;
  reason?: string;
  errors: Array<{ stage: string; message: string }>;
}

export interface DispatchDeps {
  db?: DrizzleDb;
  emailClient?: EmailClient;
  smsClient?: SmsClient;
  arboStarClient?: ArboStarClient;
  cfg?: Config;
  now?: () => Date;
  validateEmail?: typeof validateEmailDeliverable;
}

const DISPATCHED_OUTBOUND_ACTION = 'dispatched_outbound';
const DISPATCH_FAILED_ACTION = 'dispatch_failed';
const ARBOSTAR_SYNCED_ACTION = 'arbostar_synced';
const ARBOSTAR_FAILED_ACTION = 'arbostar_sync_failed';

const DISPATCHABLE_STATUSES = new Set(['auto_sent', 'manually_sent']);

function logAudit(
  db: DrizzleDb,
  leadId: string | null,
  actor: string,
  action: string,
  details: unknown,
  now: Date,
): void {
  db.insert(auditLog)
    .values({
      id: generateUuidV7(),
      leadId,
      actor,
      action,
      details: details === undefined ? null : JSON.stringify(details),
      createdAt: now,
    })
    .run();
}

function alreadyDispatched(db: DrizzleDb, leadId: string): boolean {
  const rows = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.leadId, leadId), eq(auditLog.action, DISPATCHED_OUTBOUND_ACTION)))
    .all();
  return rows.length > 0;
}

interface QueueOutboundParams {
  leadId: string;
  channel: OutboundChannel;
  recipient: string;
  body: string;
  now: Date;
}

function queueOutbound(db: DrizzleDb, p: QueueOutboundParams): string {
  const id = generateUuidV7();
  db.insert(outboundMessages)
    .values({
      id,
      leadId: p.leadId,
      channel: p.channel,
      recipient: p.recipient,
      body: p.body,
      status: 'queued',
      createdAt: p.now,
    })
    .run();
  return id;
}

function markOutboundSent(
  db: DrizzleDb,
  id: string,
  providerMessageId: string,
  channel: OutboundChannel,
  now: Date,
): void {
  db.update(outboundMessages)
    .set({
      status: 'sent',
      providerMessageId,
      channel,
      sentAt: now,
    })
    .where(eq(outboundMessages.id, id))
    .run();
}

function markOutboundFailed(
  db: DrizzleDb,
  id: string,
  errorMessage: string,
  now: Date,
): void {
  db.update(outboundMessages)
    .set({
      status: 'failed',
      errorMessage,
      sentAt: now,
    })
    .where(eq(outboundMessages.id, id))
    .run();
}

function buildArboStarPayload(lead: Lead): ArboStarLeadPayload {
  const sourceLabel =
    lead.source === 'google_lsa_email'
      ? 'Google LSA Email'
      : lead.source === 'website_form'
        ? 'Website Form'
        : lead.source === 'answerforce_email'
          ? 'AnswerForce'
          : lead.source;

  const detailsParts: string[] = [];
  detailsParts.push(`Original message: ${lead.scopeRaw ?? ''}`);
  if (lead.scopeSummary) {
    detailsParts.push(`Summary: ${lead.scopeSummary}`);
  }
  if (lead.scopeCategory) {
    detailsParts.push(`Category: ${lead.scopeCategory}`);
  }

  return {
    name: lead.customerName ?? '',
    email: lead.customerEmail ?? '',
    phone: lead.customerPhoneE164 ?? '',
    address: lead.customerAddress ?? '',
    city: lead.customerCity ?? '',
    state: 'OH',
    postal: lead.customerZip ?? '',
    country: 'US',
    details: detailsParts.join('\n\n'),
    address_notes: `Source: ${sourceLabel}`,
  };
}

export async function dispatchLead(
  leadId: string,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const db = deps.db ?? getDb();
  const cfg = deps.cfg ?? appConfig;
  const emailClient = deps.emailClient ?? createEmailClient(cfg);
  const smsClient = deps.smsClient ?? createSmsClient(cfg);
  const arboStarClient = deps.arboStarClient ?? createArboStarClient(cfg);
  const now = deps.now ?? (() => new Date());
  const emailValidator = deps.validateEmail ?? validateEmailDeliverable;

  const result: DispatchResult = {
    leadId,
    emailSent: false,
    smsSent: false,
    arboStarSynced: false,
    errors: [],
  };

  const found = db.select().from(leads).where(eq(leads.id, leadId)).all();
  if (found.length === 0) {
    result.skipped = true;
    result.reason = 'lead_not_found';
    return result;
  }
  const lead = found[0]!;

  if (!DISPATCHABLE_STATUSES.has(lead.status)) {
    result.skipped = true;
    result.reason = `status_is_${lead.status}`;
    return result;
  }
  if (!lead.responseText || lead.responseText.trim().length === 0) {
    result.skipped = true;
    result.reason = 'no_response_text';
    return result;
  }
  if (alreadyDispatched(db, leadId)) {
    result.skipped = true;
    result.reason = 'already_dispatched';
    return result;
  }

  // Determine intent.
  const wantsSms = lead.source === 'website_form' && !!lead.customerPhoneE164;
  const wantsPrimaryEmail = lead.source === 'google_lsa_email' && !!lead.customerEmail;
  const wantsFollowupEmail =
    !wantsPrimaryEmail && !!lead.customerEmail; // answerforce + website (when email present) get the follow-up
  const sendEmailAtAll = wantsPrimaryEmail || wantsFollowupEmail;

  let emailSuccess = false;
  let smsSuccess = false;

  // Email path.
  if (sendEmailAtAll && lead.customerEmail) {
    const rendered = renderLeadResponseEmail(lead, lead.responseText);
    const queuedId = queueOutbound(db, {
      leadId,
      channel: 'email',
      recipient: lead.customerEmail,
      body: rendered.text,
      now: now(),
    });
    try {
      const validation = await emailValidator(lead.customerEmail);
      if (!validation.valid) {
        markOutboundFailed(
          db,
          queuedId,
          `undeliverable_email: ${validation.reason ?? 'unknown'}`,
          now(),
        );
        result.errors.push({
          stage: 'email_validation',
          message: validation.reason ?? 'undeliverable_email',
        });
      } else {
        const sent = await emailClient.send({
          to: lead.customerEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        markOutboundSent(db, queuedId, sent.providerMessageId, 'email', now());
        emailSuccess = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, leadId }, 'email dispatch failed');
      markOutboundFailed(db, queuedId, message, now());
      result.errors.push({ stage: 'email_send', message });
    }
  }

  // SMS path (only website_form gets primary SMS reply per CLAUDE.md).
  if (wantsSms && lead.customerPhoneE164) {
    const useImessage = cfg.ENABLE_IMESSAGE && cfg.SMS_PROVIDER === 'agent_phone';
    const queuedId = queueOutbound(db, {
      leadId,
      channel: useImessage ? 'imessage' : 'sms',
      recipient: lead.customerPhoneE164,
      body: lead.responseText,
      now: now(),
    });
    try {
      const sent = await smsClient.send({
        to: lead.customerPhoneE164,
        body: lead.responseText,
        useImessage,
      });
      markOutboundSent(db, queuedId, sent.providerMessageId, sent.channelUsed, now());
      smsSuccess = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, leadId }, 'sms dispatch failed');
      markOutboundFailed(db, queuedId, message, now());
      result.errors.push({ stage: 'sms_send', message });
    }
  }

  result.emailSent = emailSuccess;
  result.smsSent = smsSuccess;

  // ArboStar push (only if at least one channel succeeded).
  const anyChannelSent = emailSuccess || smsSuccess;
  if (!anyChannelSent) {
    const dispatchTs = now();
    db.update(leads)
      .set({ status: 'failed', updatedAt: dispatchTs })
      .where(eq(leads.id, leadId))
      .run();
    logAudit(
      db,
      leadId,
      'system',
      DISPATCH_FAILED_ACTION,
      {
        reason: 'no_channels_succeeded',
        intent: { wantsPrimaryEmail, wantsFollowupEmail, wantsSms },
        errors: result.errors,
      },
      dispatchTs,
    );
    logAudit(
      db,
      leadId,
      'system',
      DISPATCHED_OUTBOUND_ACTION,
      {
        emails_sent: 0,
        sms_sent: 0,
        arbostar_synced: false,
        outcome: 'all_channels_failed',
      },
      dispatchTs,
    );
    return result;
  }

  // ArboStar push (best-effort). Don't block lead status on ArboStar failure.
  try {
    const payload = buildArboStarPayload(lead);
    const arboResult = await arboStarClient.createRequest(payload);
    const syncedAt = now();
    db.update(leads)
      .set({
        arbostarRequestId: arboResult.requestId,
        arbostarSyncedAt: syncedAt,
        updatedAt: syncedAt,
      })
      .where(eq(leads.id, leadId))
      .run();
    logAudit(
      db,
      leadId,
      'system',
      ARBOSTAR_SYNCED_ACTION,
      { request_id: arboResult.requestId },
      syncedAt,
    );
    result.arboStarSynced = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, leadId }, 'arbostar push failed');
    logAudit(db, leadId, 'system', ARBOSTAR_FAILED_ACTION, { error: message }, now());
    result.errors.push({ stage: 'arbostar', message });
  }

  logAudit(
    db,
    leadId,
    'system',
    DISPATCHED_OUTBOUND_ACTION,
    {
      emails_sent: emailSuccess ? 1 : 0,
      sms_sent: smsSuccess ? 1 : 0,
      arbostar_synced: result.arboStarSynced,
    },
    now(),
  );

  return result;
}

export const __testing = {
  buildArboStarPayload,
  DISPATCHED_OUTBOUND_ACTION,
  ARBOSTAR_SYNCED_ACTION,
  ARBOSTAR_FAILED_ACTION,
};
