/**
 * Demo seed — runs the canonical `runSeed()` first (which produces the
 * fixed 8-lead set the tests depend on) and then layers a much richer
 * fixture on top so the dashboard, queue, lead detail and stats pages
 * all have plenty of variety to click through.
 *
 * Run inside the dev container:
 *   docker compose exec app npm run db:seed:demo
 *
 * Idempotent — running it twice yields the same data because runSeed
 * wipes-then-reseeds and we layer the same DEMO_LEADS each time.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import {
  auditLog,
  leads,
  leadSourceEvents,
  outboundMessages,
  type LeadSource,
  type LeadStatus,
  type NewAuditLogRow,
  type NewLead,
  type NewLeadSourceEvent,
  type NewOutboundMessage,
  type ScopeCategory,
  type OutboundChannel,
  type OutboundStatus,
} from '../app/db/schema.js';
import { generateUuidV7 } from '../app/lib/uuid.js';
import { logger } from '../app/lib/logger.js';
import * as schema from '../app/db/schema.js';
import { runSeed } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

type DrizzleDb = BetterSQLite3Database<typeof schema>;

interface DemoLeadSpec {
  customerName: string;
  source: LeadSource;
  status: LeadStatus;
  receivedMinutesAgo: number;
  customerPhone: string;
  customerEmail: string | null;
  customerCity: string;
  customerZip: string;
  serviceAreaCounty: string | null;
  outOfServiceArea?: boolean;
  scopeRaw: string;
  scopeCategory: ScopeCategory;
  scopeSummary: string;
  confidenceScore: number;
  confidenceReasoning: string;
  escalationTriggered?: boolean;
  escalationReason?: string;
  responseText?: string;
  responseSentBy?: string; // 'auto' or '<email>'
  arbostarSynced?: boolean;
  outbound?: Array<{
    channel: OutboundChannel;
    recipient: string;
    body: string;
    status: OutboundStatus;
    error?: string;
    sentMinutesAgo?: number;
  }>;
}

const SIGNATURE =
  'Premier Tree Specialists LLC | Cleveland 216-245-8908 | Columbus 614-526-2266 | ISA-Certified Arborists | 80+ years combined experience | Fully insured';

const DEMO_LEADS: DemoLeadSpec[] = [
  // ===== Fresh in the queue (last 30 min) — easy to find on /queue =====
  {
    customerName: 'Linda Albertson',
    source: 'google_lsa_email',
    status: 'awaiting_review',
    receivedMinutesAgo: 4,
    customerPhone: '+12164440001',
    customerEmail: 'lalbertson@example.com',
    customerCity: 'Cleveland Heights',
    customerZip: '44118',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'Looking for an estimate to prune two large maples in the front yard before winter.',
    scopeCategory: 'pruning',
    scopeSummary: 'Prune two large maples (front yard)',
    confidenceScore: 0.71,
    confidenceReasoning: 'Clear scope, all fields present, but service window unclear — review draft',
    responseText:
      'Hi Linda — thank you for reaching out to Premier Tree Specialists! We can absolutely schedule an estimate for pruning your two maples. A team member will follow up shortly to coordinate a time. ' +
      SIGNATURE,
  },
  {
    customerName: 'Brian Petrolino',
    source: 'website_form',
    status: 'awaiting_review',
    receivedMinutesAgo: 12,
    customerPhone: '+12164440002',
    customerEmail: 'brian.p@example.com',
    customerCity: 'Lakewood',
    customerZip: '44107',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'Tree leaning toward driveway after Saturday\'s wind. Need someone to look ASAP please.',
    scopeCategory: 'consultation',
    scopeSummary: 'Leaning tree post-storm — assessment requested',
    confidenceScore: 0.68,
    confidenceReasoning: 'Borderline urgency wording — escalation pre-check passed but human eyes wanted',
    responseText:
      'Hi Brian — thank you for the message. Given the lean toward your driveway, an arborist will reach out within the next hour to schedule a same-day visit. ' +
      SIGNATURE,
  },
  {
    customerName: 'Yelena Marchuk',
    source: 'answerforce_email',
    status: 'awaiting_review',
    receivedMinutesAgo: 22,
    customerPhone: '+16144440003',
    customerEmail: null,
    customerCity: 'Worthington',
    customerZip: '43054',
    serviceAreaCounty: 'Delaware',
    scopeRaw: 'Caller (Yelena) wants quote for stump grinding — 2 stumps roughly 18" diameter near patio.',
    scopeCategory: 'stump_grinding',
    scopeSummary: '2 stumps grinding (patio area)',
    confidenceScore: 0.78,
    confidenceReasoning: 'Standard stump-grinding request; price-by-diameter common — review draft',
    responseText:
      'Hi Yelena — thanks for calling Premier Tree Specialists after-hours. We can schedule a stump grinding estimate for your two patio stumps. We\'ll text shortly to confirm a time. ' +
      SIGNATURE,
  },

  // ===== Auto-sent successes (high confidence, recently dispatched) =====
  {
    customerName: 'Frank Greco',
    source: 'google_lsa_email',
    status: 'auto_sent',
    receivedMinutesAgo: 65,
    customerPhone: '+14404440004',
    customerEmail: 'fgreco@example.com',
    customerCity: 'Mentor',
    customerZip: '44060',
    serviceAreaCounty: 'Lake',
    scopeRaw: 'Need a quote on tree trimming for 3 large maple trees in backyard.',
    scopeCategory: 'trimming',
    scopeSummary: '3 maples trimming (backyard)',
    confidenceScore: 0.92,
    confidenceReasoning: 'All required fields, clear scope, FAQ matched on trimming + service area',
    responseText:
      'Hi Frank — thanks for reaching out to Premier Tree Specialists! We can schedule an estimate for trimming your three maples. Our team will text and email shortly to coordinate. ' +
      SIGNATURE,
    responseSentBy: 'auto',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'fgreco@example.com',
        body: 'Hi Frank — thanks for reaching out…',
        status: 'sent',
        sentMinutesAgo: 64,
      },
      {
        channel: 'sms',
        recipient: '+14404440004',
        body: 'Hi Frank — Premier Tree Specialists here. Estimate for trimming…',
        status: 'sent',
        sentMinutesAgo: 64,
      },
    ],
  },
  {
    customerName: 'Anita Mehrotra',
    source: 'website_form',
    status: 'auto_sent',
    receivedMinutesAgo: 130,
    customerPhone: '+16144440005',
    customerEmail: 'anita@example.com',
    customerCity: 'Dublin',
    customerZip: '43017',
    serviceAreaCounty: 'Delaware',
    scopeRaw: 'Plant health care assessment for sick dogwood — losing leaves early.',
    scopeCategory: 'plant_health',
    scopeSummary: 'PHC for ailing dogwood',
    confidenceScore: 0.86,
    confidenceReasoning: 'Clear PHC request, all fields present',
    responseText:
      'Hi Anita — thanks for the inquiry. Our ISA-certified arborists handle plant health care assessments. We will follow up shortly to schedule. ' +
      SIGNATURE,
    responseSentBy: 'auto',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'anita@example.com',
        body: 'Hi Anita — thanks for the inquiry…',
        status: 'sent',
        sentMinutesAgo: 129,
      },
    ],
  },
  {
    customerName: 'Carlos Reyes',
    source: 'google_lsa_email',
    status: 'auto_sent',
    receivedMinutesAgo: 240,
    customerPhone: '+14404440006',
    customerEmail: 'creyes@example.com',
    customerCity: 'Avon Lake',
    customerZip: '44012',
    serviceAreaCounty: 'Lorain',
    scopeRaw: 'Quote for removing one large dead ash tree, ~50 feet tall, leaning toward neighbor.',
    scopeCategory: 'removal',
    scopeSummary: 'Dead ash removal (~50 ft, leaning)',
    confidenceScore: 0.89,
    confidenceReasoning: 'Standard removal request, clear scope, all fields present',
    responseText:
      'Hi Carlos — thank you for reaching out. We will arrange a same-week estimate for the dead ash removal. ' +
      SIGNATURE,
    responseSentBy: 'auto',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'creyes@example.com',
        body: 'Hi Carlos — thank you for reaching out…',
        status: 'sent',
        sentMinutesAgo: 239,
      },
      {
        channel: 'sms',
        recipient: '+14404440006',
        body: 'Hi Carlos — Premier Tree Specialists confirming…',
        status: 'sent',
        sentMinutesAgo: 239,
      },
    ],
  },

  // ===== Auto-sent BUT ArboStar push failed (interesting edge case) =====
  {
    customerName: 'Greg Whitman',
    source: 'website_form',
    status: 'auto_sent',
    receivedMinutesAgo: 360,
    customerPhone: '+13304440007',
    customerEmail: 'gwhitman@example.com',
    customerCity: 'Akron',
    customerZip: '44301',
    serviceAreaCounty: 'Summit',
    scopeRaw: 'Need quote for trimming 4 trees along property line.',
    scopeCategory: 'trimming',
    scopeSummary: '4 trees property-line trim',
    confidenceScore: 0.84,
    confidenceReasoning: 'Solid scope, clear; ArboStar push failed (visible as not synced)',
    responseText: 'Hi Greg — thanks for reaching out. We will follow up shortly to estimate. ' + SIGNATURE,
    responseSentBy: 'auto',
    arbostarSynced: false,
    outbound: [
      {
        channel: 'email',
        recipient: 'gwhitman@example.com',
        body: 'Hi Greg — thanks for reaching out…',
        status: 'sent',
        sentMinutesAgo: 359,
      },
    ],
  },

  // ===== Manually sent (human approved) =====
  {
    customerName: 'Patricia Vegh',
    source: 'answerforce_email',
    status: 'manually_sent',
    receivedMinutesAgo: 480,
    customerPhone: '+12164440008',
    customerEmail: 'pvegh@example.com',
    customerCity: 'Bay Village',
    customerZip: '44140',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'After-hours call: oak tree pruning request — caller asked about timing/season.',
    scopeCategory: 'pruning',
    scopeSummary: 'Oak pruning — season question',
    confidenceScore: 0.74,
    confidenceReasoning: 'Oak season question — required human review for nuanced response',
    responseText:
      'Hi Patricia — thank you for reaching out! We can absolutely schedule an estimate appointment. The Oak season is currently closed until November to prevent infection of Oak Wilt but if you would like an estimate now, it would be valid, if confirmed, for the next season. Would you be available for a phone call to discuss the finer details? ' +
      SIGNATURE,
    responseSentBy: 'matt@premiertreesllc.com',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'pvegh@example.com',
        body: 'Hi Patricia — thank you for reaching out…',
        status: 'sent',
        sentMinutesAgo: 479,
      },
    ],
  },
  {
    customerName: 'Doug Nakamura',
    source: 'google_lsa_email',
    status: 'manually_sent',
    receivedMinutesAgo: 720,
    customerPhone: '+16144440009',
    customerEmail: 'dnakamura@example.com',
    customerCity: 'Columbus',
    customerZip: '43201',
    serviceAreaCounty: 'Franklin',
    scopeRaw: 'Wanted to ask if you do consultations for tree health on commercial property — small office park.',
    scopeCategory: 'consultation',
    scopeSummary: 'Commercial PHC consultation',
    confidenceScore: 0.66,
    confidenceReasoning: 'Commercial-property nuance required human edit',
    responseText:
      'Hi Doug — yes, we handle commercial properties as well. A senior ISA-certified arborist will reach out to coordinate a site walk. ' +
      SIGNATURE,
    responseSentBy: 'matt@premiertreesllc.com',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'dnakamura@example.com',
        body: 'Hi Doug — yes, we handle commercial properties as well…',
        status: 'sent',
        sentMinutesAgo: 719,
      },
    ],
  },

  // ===== Manually flagged — escalation =====
  {
    customerName: 'Susan Hartwell',
    source: 'answerforce_email',
    status: 'manually_flagged',
    receivedMinutesAgo: 90,
    customerPhone: '+12164440010',
    customerEmail: 'shartwell@example.com',
    customerCity: 'Shaker Heights',
    customerZip: '44120',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'EMERGENCY — large oak limb fell on the roof of my detached garage during the storm. Need emergency removal.',
    scopeCategory: 'emergency',
    scopeSummary: 'Emergency: oak limb on garage roof',
    confidenceScore: 0.82,
    confidenceReasoning: 'High confidence but escalation keyword "emergency" + "fell on roof" forced manual',
    escalationTriggered: true,
    escalationReason: 'Keyword match: "emergency", "fell on", "roof"',
  },

  // ===== Manually flagged — out of service area =====
  {
    customerName: 'Robert Klein',
    source: 'google_lsa_email',
    status: 'manually_flagged',
    receivedMinutesAgo: 1440,
    customerPhone: '+18564440011',
    customerEmail: 'rklein@example.com',
    customerCity: 'Cherry Hill',
    customerZip: '08003',
    serviceAreaCounty: null,
    outOfServiceArea: true,
    scopeRaw: 'Looking for tree trimming services in southern New Jersey.',
    scopeCategory: 'trimming',
    scopeSummary: 'Trimming in NJ — out of area',
    confidenceScore: 0.55,
    confidenceReasoning: 'Out-of-service-area ZIP detected (08003 — NJ)',
  },

  // ===== Manually flagged — low confidence (insufficient info) =====
  {
    customerName: 'Mike',
    source: 'website_form',
    status: 'manually_flagged',
    receivedMinutesAgo: 200,
    customerPhone: '+12164440012',
    customerEmail: null,
    customerCity: 'Cleveland',
    customerZip: '44113',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'tree',
    scopeCategory: 'other',
    scopeSummary: 'Insufficient info',
    confidenceScore: 0.28,
    confidenceReasoning: 'Message too short to extract scope — manual outreach required',
  },

  // ===== Extracted (waiting for response generation pass) =====
  {
    customerName: 'Helen Ortega',
    source: 'website_form',
    status: 'extracted',
    receivedMinutesAgo: 8,
    customerPhone: '+13304440013',
    customerEmail: 'helen.o@example.com',
    customerCity: 'Stow',
    customerZip: '44224',
    serviceAreaCounty: 'Summit',
    scopeRaw: 'Two pine trees, one looks dead. Need them looked at.',
    scopeCategory: 'consultation',
    scopeSummary: 'Pine assessment (1 dead?)',
    confidenceScore: 0.72,
    confidenceReasoning: 'Clear scope, all fields present',
  },
  {
    customerName: 'Tomás Iglesias',
    source: 'google_lsa_email',
    status: 'extracted',
    receivedMinutesAgo: 18,
    customerPhone: '+14404440014',
    customerEmail: 'tomas@example.com',
    customerCity: 'Westlake',
    customerZip: '44145',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'Need quote for stump grinding, four stumps from previous removal.',
    scopeCategory: 'stump_grinding',
    scopeSummary: '4 stumps grinding',
    confidenceScore: 0.81,
    confidenceReasoning: 'Standard request with all fields',
  },

  // ===== Ingested (just arrived, not yet extracted) =====
  {
    customerName: null,
    source: 'answerforce_email',
    status: 'ingested',
    receivedMinutesAgo: 2,
    customerPhone: '+16144440015',
    customerEmail: null,
    customerCity: 'Powell',
    customerZip: '43065',
    serviceAreaCounty: null,
    scopeRaw: 'After-hours caller: just received voicemail forwarded — playback transcribed by AnswerForce.',
    scopeCategory: 'other',
    scopeSummary: 'Awaiting extraction',
    confidenceScore: 0,
    confidenceReasoning: 'Not yet extracted',
  },

  // ===== Older auto_sent leads (for the 7-day stats window) =====
  {
    customerName: 'Janet Kim',
    source: 'google_lsa_email',
    status: 'auto_sent',
    receivedMinutesAgo: 60 * 36, // 1.5 days ago
    customerPhone: '+12164440016',
    customerEmail: 'jkim@example.com',
    customerCity: 'Solon',
    customerZip: '44139',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'Tree trimming quote for 2 ornamental cherries.',
    scopeCategory: 'trimming',
    scopeSummary: '2 ornamental cherries trimming',
    confidenceScore: 0.91,
    confidenceReasoning: 'Clear scope, all fields',
    responseText: 'Hi Janet — thanks for reaching out. We will schedule shortly. ' + SIGNATURE,
    responseSentBy: 'auto',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'jkim@example.com',
        body: 'Hi Janet — thanks for reaching out…',
        status: 'sent',
        sentMinutesAgo: 60 * 36 - 1,
      },
      {
        channel: 'sms',
        recipient: '+12164440016',
        body: 'Hi Janet — Premier Tree Specialists…',
        status: 'sent',
        sentMinutesAgo: 60 * 36 - 1,
      },
    ],
  },
  {
    customerName: 'Pavel Sokolov',
    source: 'website_form',
    status: 'auto_sent',
    receivedMinutesAgo: 60 * 50,
    customerPhone: '+13304440017',
    customerEmail: 'pavel@example.com',
    customerCity: 'Cuyahoga Falls',
    customerZip: '44221',
    serviceAreaCounty: 'Summit',
    scopeRaw: 'Quote for removal of one storm-damaged maple.',
    scopeCategory: 'removal',
    scopeSummary: 'Storm-damaged maple removal',
    confidenceScore: 0.88,
    confidenceReasoning: 'Clear, all fields',
    responseText: 'Hi Pavel — sorry to hear about the storm damage. ' + SIGNATURE,
    responseSentBy: 'auto',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'pavel@example.com',
        body: 'Hi Pavel — sorry to hear…',
        status: 'sent',
        sentMinutesAgo: 60 * 50 - 1,
      },
    ],
  },
  {
    customerName: 'Wendy Caulfield',
    source: 'answerforce_email',
    status: 'manually_sent',
    receivedMinutesAgo: 60 * 70,
    customerPhone: '+16144440018',
    customerEmail: 'wendy.c@example.com',
    customerCity: 'New Albany',
    customerZip: '43054',
    serviceAreaCounty: 'Delaware',
    scopeRaw: 'After-hours: caller wanted to discuss arborist consultation for new property.',
    scopeCategory: 'consultation',
    scopeSummary: 'New-property arborist consult',
    confidenceScore: 0.69,
    confidenceReasoning: 'Manually edited before send',
    responseText: 'Hi Wendy — congrats on the new property! We will reach out to coordinate a walk-through. ' + SIGNATURE,
    responseSentBy: 'matt@premiertreesllc.com',
    arbostarSynced: true,
    outbound: [
      {
        channel: 'email',
        recipient: 'wendy.c@example.com',
        body: 'Hi Wendy — congrats on the new property!…',
        status: 'sent',
        sentMinutesAgo: 60 * 70 - 1,
      },
    ],
  },

  // ===== Outbound failures (for retry-dispatch testing) =====
  {
    customerName: 'Thomas Beale',
    source: 'website_form',
    status: 'manually_sent',
    receivedMinutesAgo: 60 * 6,
    customerPhone: '+12164440019',
    customerEmail: 'tbeale@example.com',
    customerCity: 'Strongsville',
    customerZip: '44136',
    serviceAreaCounty: 'Cuyahoga',
    scopeRaw: 'Looking for tree pruning quote — 3 maples.',
    scopeCategory: 'pruning',
    scopeSummary: '3 maples pruning',
    confidenceScore: 0.79,
    confidenceReasoning: 'Email bounced — retry needed',
    responseText: 'Hi Thomas — thanks for the inquiry. We will follow up. ' + SIGNATURE,
    responseSentBy: 'matt@premiertreesllc.com',
    arbostarSynced: false,
    outbound: [
      {
        channel: 'email',
        recipient: 'tbeale@example.com',
        body: 'Hi Thomas — thanks for the inquiry…',
        status: 'failed',
        error: 'sendgrid 5xx (transient): retry recommended',
      },
      {
        channel: 'sms',
        recipient: '+12164440019',
        body: 'Hi Thomas — Premier Tree Specialists…',
        status: 'failed',
        error: 'agent-phone http 503: upstream unavailable',
      },
    ],
  },

  // ===== Failed processing (extraction crashed) =====
  {
    customerName: null,
    source: 'google_lsa_email',
    status: 'failed',
    receivedMinutesAgo: 60 * 8,
    customerPhone: '+13304440020',
    customerEmail: null,
    customerCity: 'Tallmadge',
    customerZip: '44278',
    serviceAreaCounty: 'Summit',
    scopeRaw: '[malformed payload — LSA email parser failed]',
    scopeCategory: 'other',
    scopeSummary: 'LLM call failed — needs replay',
    confidenceScore: 0,
    confidenceReasoning: 'Extraction failed — needs replay',
  },
];

function insertDemoLead(db: DrizzleDb, spec: DemoLeadSpec, baseTime: number): void {
  const id = generateUuidV7();
  const receivedAt = new Date(baseTime - spec.receivedMinutesAgo * 60_000);

  const lead: NewLead = {
    id,
    receivedAt,
    source: spec.source,
    status: spec.status,
    customerName: spec.customerName,
    customerPhoneE164: spec.customerPhone,
    customerEmail: spec.customerEmail,
    customerAddress: null,
    customerCity: spec.customerCity,
    customerZip: spec.customerZip,
    serviceAreaCounty: spec.serviceAreaCounty,
    outOfServiceArea: spec.outOfServiceArea ?? false,
    scopeRaw: spec.scopeRaw,
    scopeCategory: spec.scopeCategory,
    scopeSummary: spec.scopeSummary,
    confidenceScore: spec.confidenceScore,
    confidenceReasoning: spec.confidenceReasoning,
    escalationTriggered: spec.escalationTriggered ?? false,
    escalationReason: spec.escalationReason ?? null,
    responseText: spec.responseText ?? null,
    responseSentAt:
      spec.responseSentBy && spec.outbound && spec.outbound[0]
        ? new Date(baseTime - (spec.outbound[0].sentMinutesAgo ?? spec.receivedMinutesAgo) * 60_000)
        : spec.responseSentBy
          ? new Date(baseTime - (spec.receivedMinutesAgo - 1) * 60_000)
          : null,
    responseSentBy: spec.responseSentBy ?? null,
    arbostarRequestId: spec.arbostarSynced ? `req_${id.slice(0, 8)}` : null,
    arbostarSyncedAt: spec.arbostarSynced
      ? new Date(baseTime - (spec.receivedMinutesAgo - 1) * 60_000)
      : null,
    dedupPhoneE164: spec.customerPhone,
  };
  db.insert(leads).values(lead).run();

  const sourceEvent: NewLeadSourceEvent = {
    id: generateUuidV7(),
    leadId: id,
    source: spec.source,
    receivedAt,
    rawPayload: JSON.stringify({
      demo_seed: true,
      name: spec.customerName,
      phone: spec.customerPhone,
      email: spec.customerEmail,
      city: spec.customerCity,
      zip: spec.customerZip,
      message: spec.scopeRaw,
    }),
  };
  db.insert(leadSourceEvents).values(sourceEvent).run();

  // Audit trail — at minimum an "ingested" entry, plus state-change entries.
  const auditTrail: NewAuditLogRow[] = [
    {
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'ingested',
      details: JSON.stringify({ source: spec.source }),
    },
  ];
  if (
    spec.status !== 'ingested' &&
    spec.status !== 'failed'
  ) {
    auditTrail.push({
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'extracted',
      details: JSON.stringify({
        scope_category: spec.scopeCategory,
        county: spec.serviceAreaCounty,
        confidence: spec.confidenceScore,
      }),
    });
  }
  if (
    spec.status === 'auto_sent' ||
    spec.status === 'manually_sent' ||
    spec.status === 'awaiting_review' ||
    spec.status === 'manually_flagged'
  ) {
    auditTrail.push({
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'response_generated',
      details: JSON.stringify({
        confidence: spec.confidenceScore,
        escalation: spec.escalationTriggered ?? false,
      }),
    });
  }
  if (spec.status === 'auto_sent') {
    auditTrail.push({
      id: generateUuidV7(),
      leadId: id,
      actor: 'auto',
      action: 'auto_sent',
      details: JSON.stringify({ confidence: spec.confidenceScore }),
    });
  }
  if (spec.status === 'manually_sent' && spec.responseSentBy) {
    const userKey = spec.responseSentBy.split('@')[0] ?? spec.responseSentBy;
    auditTrail.push({
      id: generateUuidV7(),
      leadId: id,
      actor: spec.responseSentBy,
      action: `approved_by_${userKey}`,
      details: JSON.stringify({ by: spec.responseSentBy }),
    });
  }
  if (spec.arbostarSynced) {
    auditTrail.push({
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'arbostar_synced',
      details: JSON.stringify({ request_id: lead.arbostarRequestId }),
    });
  }
  for (const a of auditTrail) {
    db.insert(auditLog).values(a).run();
  }

  // Outbound messages
  for (const o of spec.outbound ?? []) {
    const msg: NewOutboundMessage = {
      id: generateUuidV7(),
      leadId: id,
      channel: o.channel,
      recipient: o.recipient,
      body: o.body,
      status: o.status,
      providerMessageId: o.status === 'sent' ? `msg_${generateUuidV7().slice(0, 8)}` : null,
      errorMessage: o.error ?? null,
      sentAt:
        o.status === 'sent'
          ? new Date(baseTime - (o.sentMinutesAgo ?? spec.receivedMinutesAgo) * 60_000)
          : null,
    };
    db.insert(outboundMessages).values(msg).run();
  }
}

export function runDemoSeed(db: DrizzleDb, baseTime: number = Date.now()): {
  baseLeadCount: number;
  demoLeadCount: number;
} {
  const baseCounts = runSeed(db);
  db.transaction((tx) => {
    for (const spec of DEMO_LEADS) {
      insertDemoLead(tx, spec, baseTime);
    }
  });
  return {
    baseLeadCount: baseCounts.leads,
    demoLeadCount: DEMO_LEADS.length,
  };
}

const isMain = (() => {
  if (typeof process.argv[1] !== 'string') return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const { db } = openDb(config.DATABASE_PATH);
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const result = runDemoSeed(db);
    logger.info(
      result,
      `demo seed complete — ${result.baseLeadCount} base + ${result.demoLeadCount} demo leads`,
    );
    closeDb();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'demo seed failed');
    closeDb();
    process.exit(1);
  }
}
