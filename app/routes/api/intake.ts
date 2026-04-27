import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { config } from '../../config.js';
import { getDb } from '../../db/client.js';
import { auditLog, leads, leadSourceEvents } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateUuidV7 } from '../../lib/uuid.js';
import { normalizeToE164 } from '../../lib/e164.js';
import { lookupCounty } from '../../lib/zip-lookup.js';
import { logger } from '../../lib/logger.js';
import { intakeRateLimiter } from '../../middleware/rate-limit.js';
import { findOrCreateLead } from '../../services/dedup.service.js';
import { parseLsaEmail } from '../../services/lsa-email-parser.service.js';
import { parseAnswerforceEmail } from '../../services/answerforce-email-parser.service.js';

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
    return c.json(result, 201);
  } catch (err) {
    logger.error({ err }, 'answerforce intake failed');
    return fail(c, 500, 'internal_server_error');
  }
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
    return c.json(result, 201);
  } catch (err) {
    logger.error({ err }, 'website-form intake failed');
    return fail(c, 500, 'internal_server_error');
  }
});

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
