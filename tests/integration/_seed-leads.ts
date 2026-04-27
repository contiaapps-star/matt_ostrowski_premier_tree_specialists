import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  auditLog,
  leads,
  leadSourceEvents,
  type NewAuditLogRow,
  type NewLead,
  type NewLeadSourceEvent,
} from '../../app/db/schema.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import * as schema from '../../app/db/schema.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface InsertLeadOpts {
  status?: schema.LeadStatus;
  source?: schema.LeadSource;
  receivedAt?: Date;
  customerName?: string | null;
  customerPhoneE164?: string | null;
  customerEmail?: string | null;
  customerCity?: string | null;
  customerZip?: string | null;
  serviceAreaCounty?: string | null;
  outOfServiceArea?: boolean;
  scopeRaw?: string;
  scopeCategory?: schema.ScopeCategory | null;
  scopeSummary?: string | null;
  confidenceScore?: number | null;
  confidenceReasoning?: string | null;
  responseText?: string | null;
  rawPayload?: Record<string, unknown>;
  withSourceEvent?: boolean;
  withIngestedAudit?: boolean;
}

export function insertLead(db: DrizzleDb, opts: InsertLeadOpts = {}): string {
  const id = generateUuidV7();
  const receivedAt = opts.receivedAt ?? new Date();
  const lead: NewLead = {
    id,
    receivedAt,
    source: opts.source ?? 'website_form',
    status: opts.status ?? 'extracted',
    scopeRaw: opts.scopeRaw ?? 'Sample lead text',
    customerName: opts.customerName ?? 'Test Customer',
    customerPhoneE164: opts.customerPhoneE164 ?? '+12165550100',
    customerEmail: opts.customerEmail ?? null,
    customerCity: opts.customerCity ?? 'Cleveland',
    customerZip: opts.customerZip ?? '44113',
    serviceAreaCounty: opts.serviceAreaCounty ?? 'Cuyahoga',
    outOfServiceArea: opts.outOfServiceArea ?? false,
    scopeCategory: opts.scopeCategory ?? 'trimming',
    scopeSummary: opts.scopeSummary ?? null,
    confidenceScore: opts.confidenceScore ?? 0.75,
    confidenceReasoning: opts.confidenceReasoning ?? null,
    responseText: opts.responseText ?? null,
    dedupPhoneE164: opts.customerPhoneE164 ?? '+12165550100',
  };
  db.insert(leads).values(lead).run();

  if (opts.withSourceEvent !== false) {
    const eventRow: NewLeadSourceEvent = {
      id: generateUuidV7(),
      leadId: id,
      source: lead.source,
      receivedAt,
      rawPayload: JSON.stringify(opts.rawPayload ?? { test: true }),
    };
    db.insert(leadSourceEvents).values(eventRow).run();
  }

  if (opts.withIngestedAudit !== false) {
    const auditRow: NewAuditLogRow = {
      id: generateUuidV7(),
      leadId: id,
      actor: 'system',
      action: 'ingested',
      details: JSON.stringify({ source: lead.source }),
    };
    db.insert(auditLog).values(auditRow).run();
  }

  return id;
}
