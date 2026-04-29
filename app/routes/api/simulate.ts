import { Hono } from 'hono';
import { html } from 'hono/html';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import {
  auditLog,
  leads,
  leadSourceEvents,
  type Lead,
  type NewLead,
  type NewLeadSourceEvent,
} from '../../db/schema.js';
import { buildDemoLeadSpecs } from '../../db/seed-data.js';
import { generateUuidV7 } from '../../lib/uuid.js';
import { logger } from '../../lib/logger.js';
import { authMiddleware, csrfMiddleware, type AuthVariables } from '../../middleware/auth.js';
import { generateResponse } from '../../services/response-generator.service.js';
import { leadCard } from '../../views/partials/lead-card.html.js';
import { flashOob } from '../../views/layouts/base.html.js';
import { formatSource } from '../../lib/format.js';

export const simulateRoute = new Hono<{ Variables: AuthVariables }>();

simulateRoute.use('*', authMiddleware);
simulateRoute.use('*', csrfMiddleware);

let simulateCounter = 0;

function pickSpec() {
  const specs = buildDemoLeadSpecs();
  const spec = specs[simulateCounter % specs.length]!;
  simulateCounter += 1;
  return spec;
}

simulateRoute.post('/', async (c) => {
  const spec = pickSpec();
  const db = getDb();
  const leadId = generateUuidV7();
  const eventId = generateUuidV7();
  const auditId = generateUuidV7();
  const receivedAt = new Date();

  const seedFields = { ...spec.lead };
  // Reset response/status fields so the new lead actually flows through
  // extraction → response generation rather than appearing pre-completed.
  seedFields.status = 'extracted';
  seedFields.responseText = null;
  seedFields.responseSentAt = null;
  seedFields.responseSentBy = null;
  seedFields.confidenceScore = null;
  seedFields.confidenceReasoning = null;
  seedFields.escalationTriggered = false;
  seedFields.escalationReason = null;
  // Keep dedupPhoneE164 unique-ish so dedup doesn't merge repeated simulations.
  // Append a counter suffix to the dedup phone, but keep customer phone realistic.
  if (seedFields.dedupPhoneE164) {
    seedFields.dedupPhoneE164 = `${seedFields.dedupPhoneE164}sim${simulateCounter}`;
  }

  const leadRow: NewLead = {
    id: leadId,
    receivedAt,
    source: spec.source,
    ...seedFields,
  };

  db.transaction((tx) => {
    tx.insert(leads).values(leadRow).run();
    const eventRow: NewLeadSourceEvent = {
      id: eventId,
      leadId,
      source: spec.source,
      receivedAt,
      rawPayload: JSON.stringify({ ...spec.rawPayload, simulated: true }),
    };
    tx.insert(leadSourceEvents).values(eventRow).run();
    tx.insert(auditLog)
      .values({
        id: auditId,
        leadId,
        actor: 'system',
        action: 'ingested',
        details: JSON.stringify({ source: spec.source, simulated: true }),
      })
      .run();
  });

  // Fire-and-forget: run generateResponse asynchronously so the user sees
  // the card appear immediately, then the polling refresh shows the
  // auto_sent / awaiting_review status a few seconds later.
  void (async () => {
    try {
      await generateResponse(leadId);
    } catch (err) {
      logger.error({ err, leadId }, 'simulate generateResponse failed');
    }
  })();

  const inserted = db.select().from(leads).where(eq(leads.id, leadId)).all() as Lead[];
  const lead = inserted[0]!;
  return c.html(
    html`${leadCard({ lead })}${flashOob(`Simulated lead from ${formatSource(spec.source)} — pipeline running...`, 'success')}`,
  );
});
