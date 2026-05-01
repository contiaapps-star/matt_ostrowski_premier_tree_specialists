import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { config } from '../../config.js';
import { getDb } from '../../db/client.js';
import { agentMailMessages, auditLog, leads, leadSourceEvents } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateUuidV7 } from '../../lib/uuid.js';
import { normalizeToE164 } from '../../lib/e164.js';
import { lookupCounty } from '../../lib/zip-lookup.js';
import { logger } from '../../lib/logger.js';
import { intakeRateLimiter } from '../../middleware/rate-limit.js';
import { findOrCreateLead } from '../../services/dedup.service.js';
import { parseLsaEmail } from '../../services/lsa-email-parser.service.js';
import { parseAnswerforceEmail } from '../../services/answerforce-email-parser.service.js';
import { resolveAgentMailWebhookSecret } from '../../services/agentmail-bootstrap.service.js';
import { triggerAutoPipeline } from '../../services/auto-pipeline.service.js';

export const intakeRoute = new Hono();

intakeRoute.use('*', intakeRateLimiter.middleware);

const RawEmailBody = z.object({ raw_email: z.string().min(1) });

const WebsiteFormBody = z.object({
  name: z.string().min(1),
  email: z.string().default(''),
  phone: z.string().min(1),
  zip: z.string().min(5),
  service_type: z.string().min(1),
  message: z.string().optional().default(''),
  secret: z.string().min(1),
});

function fail(c: Context, status: 400 | 401 | 500, code: string, message?: string) {
  return c.json({ error: code, ...(message ? { message } : {}) }, status);
}

intakeRoute.post('/lsa-email', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'invalid_json');
  }
  const parsed = RawEmailBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, 'invalid_body', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const lsa = parseLsaEmail(parsed.data.raw_email);
  if (!lsa) {
    return fail(c, 400, 'unparseable_lsa_email');
  }

  try {
    const result = ingestEmailLead({
      source: 'google_lsa_email',
      receivedAt: new Date(),
      rawEmail: parsed.data.raw_email,
      parsedName: lsa.name,
      parsedPhone: lsa.phone,
      parsedLocation: lsa.location,
      scopeRaw: lsa.scope_raw,
    });
    if (result.is_new) triggerAutoPipeline(result.lead_id);
    return c.json(result, 201);
  } catch (err) {
    logger.error({ err }, 'lsa intake failed');
    return fail(c, 500, 'internal_server_error');
  }
});

intakeRoute.post('/answerforce-email', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'invalid_json');
  }
  const parsed = RawEmailBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, 'invalid_body', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const af = parseAnswerforceEmail(parsed.data.raw_email);
  if (!af) {
    return fail(c, 400, 'unparseable_answerforce_email');
  }

  try {
    const result = ingestEmailLead({
      source: 'answerforce_email',
      receivedAt: new Date(),
      rawEmail: parsed.data.raw_email,
      parsedName: af.name,
      parsedPhone: af.phone,
      parsedLocation: af.location,
      scopeRaw: af.scope_raw,
    });
    if (result.is_new) triggerAutoPipeline(result.lead_id);
    return c.json(result, 201);
  } catch (err) {
    logger.error({ err }, 'answerforce intake failed');
    return fail(c, 500, 'internal_server_error');
  }
});

/**
 * AgentMail forwards every inbound email to this endpoint as a
 * `message.received` webhook. We *always* archive the raw payload to
 * agent_mail_messages first (Zaki's "save everything" rule), then try to
 * route it through the LSA / AnswerForce parsers based on the From header.
 *
 * Security: HMAC-SHA256 over the raw body using the secret captured during
 * webhook provisioning. When no secret is configured (e.g. local dev with
 * INTEGRATION_MODE=stub), verification is skipped — see
 * `agentmail-bootstrap.service.ts` for how the secret gets persisted.
 */
intakeRoute.post('/agentmail-webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-agentmail-signature') ?? c.req.header('x-webhook-signature');
  const secret = resolveAgentMailWebhookSecret();

  if (secret) {
    if (!signature || !verifyAgentMailSignature(rawBody, signature, secret)) {
      logger.warn({ hasSignature: Boolean(signature) }, 'agentmail webhook signature failed');
      return fail(c, 401, 'invalid_signature');
    }
  }

  let payload: AgentMailWebhookPayload;
  try {
    const parsed = JSON.parse(rawBody);
    payload = AgentMailWebhookSchema.parse(parsed);
  } catch (err) {
    logger.warn({ err }, 'agentmail webhook unparseable body');
    return fail(c, 400, 'invalid_body');
  }

  if (payload.type !== 'message.received') {
    logger.info({ type: payload.type }, 'agentmail webhook ignoring non-message event');
    return c.json({ ok: true, ignored: true }, 200);
  }

  const msg = payload.message;
  const db = getDb();

  // Idempotency: if we've already archived this message_id, no-op.
  const existing = db
    .select({ id: agentMailMessages.id })
    .from(agentMailMessages)
    .where(eq(agentMailMessages.agentmailMessageId, msg.id))
    .all();
  if (existing.length > 0) {
    logger.info({ messageId: msg.id }, 'agentmail webhook idempotent skip');
    return c.json({ ok: true, duplicate: true, archive_id: existing[0]!.id }, 200);
  }

  const archiveId = generateUuidV7();
  const fromAddress = msg.from ?? null;
  const detectedSource = detectAgentMailSource(fromAddress, msg.subject ?? '');
  const receivedAt = msg.receivedAt ? new Date(msg.receivedAt) : new Date();

  db.insert(agentMailMessages)
    .values({
      id: archiveId,
      agentmailMessageId: msg.id,
      inboxId: msg.inboxId ?? null,
      receivedAt,
      fromAddress,
      toAddresses: msg.to ? JSON.stringify(msg.to) : null,
      subject: msg.subject ?? null,
      textBody: msg.text ?? null,
      htmlBody: msg.html ?? null,
      rawMime: msg.raw ?? null,
      headersJson: msg.headers ? JSON.stringify(msg.headers) : null,
      detectedSource,
      leadId: null,
      parseStatus: 'pending',
      parseError: null,
      rawPayload: rawBody,
    })
    .run();

  // Try to extract a lead. Failures here are non-fatal — the raw archive row
  // still lives in agent_mail_messages.
  let leadId: string | null = null;
  let parseStatus: 'parsed' | 'unparseable' = 'unparseable';
  let parseError: string | null = null;

  try {
    if (detectedSource === 'google_lsa_email') {
      const synthetic = synthesizeRawEmail(msg);
      const parsed = parseLsaEmail(synthetic);
      if (parsed) {
        const result = ingestEmailLead({
          source: 'google_lsa_email',
          receivedAt,
          rawEmail: synthetic,
          parsedName: parsed.name,
          parsedPhone: parsed.phone,
          parsedLocation: parsed.location,
          scopeRaw: parsed.scope_raw,
        });
        leadId = result.lead_id;
        parseStatus = 'parsed';
      } else {
        parseError = 'lsa_parser_returned_null';
      }
    } else if (detectedSource === 'answerforce_email') {
      const synthetic = synthesizeRawEmail(msg);
      const parsed = parseAnswerforceEmail(synthetic);
      if (parsed) {
        const result = ingestEmailLead({
          source: 'answerforce_email',
          receivedAt,
          rawEmail: synthetic,
          parsedName: parsed.name,
          parsedPhone: parsed.phone,
          parsedLocation: parsed.location,
          scopeRaw: parsed.scope_raw,
        });
        leadId = result.lead_id;
        parseStatus = 'parsed';
      } else {
        parseError = 'answerforce_parser_returned_null';
      }
    } else {
      parseError = `unknown_source:${detectedSource}`;
    }
  } catch (err) {
    logger.error({ err, archiveId, messageId: msg.id }, 'agentmail webhook parse failed');
    parseError = err instanceof Error ? err.message : String(err);
  }

  db.update(agentMailMessages)
    .set({ parseStatus, parseError, leadId })
    .where(eq(agentMailMessages.id, archiveId))
    .run();

  if (leadId && parseStatus === 'parsed') {
    triggerAutoPipeline(leadId);
  }

  return c.json(
    { ok: true, archive_id: archiveId, lead_id: leadId, parse_status: parseStatus },
    200,
  );
});

intakeRoute.post('/website-form', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'invalid_json');
  }
  const parsed = WebsiteFormBody.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, 'invalid_body', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }

  const expected = config.WEBSITE_FORM_WEBHOOK_SECRET;
  if (!expected || parsed.data.secret !== expected) {
    return fail(c, 401, 'unauthorized');
  }

  try {
    const result = ingestWebsiteForm(parsed.data);
    if (result.is_new) triggerAutoPipeline(result.lead_id);
    return c.json(result, 201);
  } catch (err) {
    logger.error({ err }, 'website-form intake failed');
    return fail(c, 500, 'internal_server_error');
  }
});

// ---------- AgentMail webhook helpers ----------

const AgentMailMessageSchema = z.object({
  id: z.string().min(1),
  inboxId: z.string().optional(),
  inbox_id: z.string().optional(),
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  raw: z.string().optional(),
  headers: z.record(z.string(), z.unknown()).optional(),
  receivedAt: z.string().optional(),
  received_at: z.string().optional(),
});

const AgentMailWebhookSchema = z.object({
  type: z.string().min(1),
  message: AgentMailMessageSchema.transform((m) => ({
    id: m.id,
    inboxId: m.inboxId ?? m.inbox_id,
    from: m.from,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    raw: m.raw,
    headers: m.headers,
    receivedAt: m.receivedAt ?? m.received_at,
  })),
});

type AgentMailWebhookPayload = z.infer<typeof AgentMailWebhookSchema>;

function verifyAgentMailSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const computed = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    // accept either bare hex or "sha256=..." prefixed
    const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (computed.length !== provided.length) return false;
    return timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(provided, 'utf8'));
  } catch {
    return false;
  }
}

function detectAgentMailSource(
  fromAddress: string | null,
  subject: string,
): 'google_lsa_email' | 'answerforce_email' | 'website_form_email' | 'unknown' {
  const lowerFrom = (fromAddress ?? '').toLowerCase();
  const lowerSubject = subject.toLowerCase();
  if (lowerFrom.includes(config.LSA_EMAIL_FROM.toLowerCase())) return 'google_lsa_email';
  if (lowerFrom.includes(config.ANSWERFORCE_EMAIL_FROM.toLowerCase())) return 'answerforce_email';
  if (lowerFrom.includes('google-business') || lowerSubject.includes('local services ad')) {
    return 'google_lsa_email';
  }
  if (lowerFrom.includes('answerforce') || lowerSubject.includes('answerforce')) {
    return 'answerforce_email';
  }
  if (lowerSubject.includes('website form') || lowerSubject.includes('contact form')) {
    return 'website_form_email';
  }
  return 'unknown';
}

interface AgentMailMessageView {
  id: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
}

/**
 * Builds a synthetic raw RFC822-ish email string so we can reuse the existing
 * LSA / AnswerForce parsers (which expect `Subject:` headers + a body).
 */
function synthesizeRawEmail(msg: AgentMailMessageView): string {
  const subject = msg.subject ?? '';
  const from = msg.from ?? '';
  const body = msg.text ?? msg.html ?? '';
  return `From: ${from}\nSubject: ${subject}\n\n${body}`;
}

interface EmailIngestArgs {
  source: 'google_lsa_email' | 'answerforce_email';
  receivedAt: Date;
  rawEmail: string;
  parsedName: string | null;
  parsedPhone: string | null;
  parsedLocation: string | null;
  scopeRaw: string;
}

function ingestEmailLead(args: EmailIngestArgs): { lead_id: string; is_new: boolean } {
  const db = getDb();
  const dedup = findOrCreateLead(
    {
      phone: args.parsedPhone,
      source: args.source,
      receivedAt: args.receivedAt,
      scopeRaw: args.scopeRaw,
    },
    db,
  );

  db.transaction((tx) => {
    if (dedup.isNew) {
      tx.update(leads)
        .set({
          customerName: args.parsedName,
          customerPhoneE164: args.parsedPhone,
        })
        .where(eq(leads.id, dedup.leadId))
        .run();
    }

    tx.insert(leadSourceEvents)
      .values({
        id: generateUuidV7(),
        leadId: dedup.leadId,
        source: args.source,
        receivedAt: args.receivedAt,
        rawPayload: JSON.stringify({
          raw_email: args.rawEmail,
          parsed: {
            name: args.parsedName,
            phone: args.parsedPhone,
            location: args.parsedLocation,
            scope_raw: args.scopeRaw,
          },
        }),
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId: dedup.leadId,
        actor: 'system',
        action: dedup.isNew ? 'ingested' : 'ingested_dedup_merge',
        details: JSON.stringify({ source: args.source, is_new: dedup.isNew }),
      })
      .run();
  });

  return { lead_id: dedup.leadId, is_new: dedup.isNew };
}

interface WebsiteFormArgs {
  name: string;
  email: string;
  phone: string;
  zip: string;
  service_type: string;
  message: string;
}

function ingestWebsiteForm(input: WebsiteFormArgs): { lead_id: string; is_new: boolean } {
  const db = getDb();
  const phoneE164 = normalizeToE164(input.phone);
  const email = input.email && input.email.trim().length > 0 ? input.email.trim() : null;
  const scopeRaw =
    input.message && input.message.trim().length > 0
      ? `${input.service_type} — ${input.message.trim()}`
      : input.service_type;

  const zipFive = input.zip.trim().slice(0, 5);
  const county = lookupCounty(zipFive, db);

  const receivedAt = new Date();
  const dedup = findOrCreateLead(
    {
      phone: phoneE164,
      source: 'website_form',
      receivedAt,
      scopeRaw,
    },
    db,
  );

  db.transaction((tx) => {
    if (dedup.isNew) {
      tx.update(leads)
        .set({
          customerName: input.name,
          customerPhoneE164: phoneE164,
          customerEmail: email,
          customerZip: zipFive,
          serviceAreaCounty: county?.county ?? null,
          outOfServiceArea: county === null,
        })
        .where(eq(leads.id, dedup.leadId))
        .run();
    }

    tx.insert(leadSourceEvents)
      .values({
        id: generateUuidV7(),
        leadId: dedup.leadId,
        source: 'website_form',
        receivedAt,
        rawPayload: JSON.stringify({
          name: input.name,
          email,
          phone: input.phone,
          zip: zipFive,
          service_type: input.service_type,
          message: input.message ?? '',
        }),
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: generateUuidV7(),
        leadId: dedup.leadId,
        actor: 'system',
        action: dedup.isNew ? 'ingested' : 'ingested_dedup_merge',
        details: JSON.stringify({
          source: 'website_form',
          is_new: dedup.isNew,
          out_of_service_area: county === null,
        }),
      })
      .run();
  });

  return { lead_id: dedup.leadId, is_new: dedup.isNew };
}
