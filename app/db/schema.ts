import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const LEAD_SOURCES = ['google_lsa_email', 'website_form', 'answerforce_email'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = [
  'ingested',
  'extracting',
  'extracted',
  'responding',
  'awaiting_review',
  'auto_sent',
  'manually_sent',
  'manually_flagged',
  'failed',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const SCOPE_CATEGORIES = [
  'trimming',
  'pruning',
  'removal',
  'stump_grinding',
  'emergency',
  'consultation',
  'plant_health',
  'other',
] as const;
export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];

export const OUTBOUND_CHANNELS = ['email', 'sms', 'imessage'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const OUTBOUND_STATUSES = ['queued', 'sent', 'failed', 'bounced'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

export const REGIONS = ['northeast_ohio', 'central_ohio'] as const;
export type Region = (typeof REGIONS)[number];

export const USER_ROLES = ['admin', 'call_taker'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const leads = sqliteTable(
  'leads',
  {
    id: text('id').primaryKey(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
    source: text('source').notNull(),
    dedupPhoneE164: text('dedup_phone_e164'),
    status: text('status').notNull().default('ingested'),
    customerName: text('customer_name'),
    customerPhoneE164: text('customer_phone_e164'),
    customerEmail: text('customer_email'),
    customerAddress: text('customer_address'),
    customerCity: text('customer_city'),
    customerZip: text('customer_zip'),
    serviceAreaCounty: text('service_area_county'),
    outOfServiceArea: integer('out_of_service_area', { mode: 'boolean' }).notNull().default(false),
    scopeRaw: text('scope_raw').notNull(),
    scopeCategory: text('scope_category'),
    scopeSummary: text('scope_summary'),
    confidenceScore: real('confidence_score'),
    confidenceReasoning: text('confidence_reasoning'),
    escalationTriggered: integer('escalation_triggered', { mode: 'boolean' })
      .notNull()
      .default(false),
    escalationReason: text('escalation_reason'),
    responseText: text('response_text'),
    responseSentAt: integer('response_sent_at', { mode: 'timestamp_ms' }),
    responseSentBy: text('response_sent_by'),
    arbostarRequestId: text('arbostar_request_id'),
    arbostarSyncedAt: integer('arbostar_synced_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    leadsDedupPhoneIdx: index('leads_dedup_phone_idx').on(t.dedupPhoneE164),
    leadsStatusIdx: index('leads_status_idx').on(t.status),
    leadsReceivedAtIdx: index('leads_received_at_idx').on(t.receivedAt),
    leadsSourceIdx: index('leads_source_idx').on(t.source),
  }),
);

export const leadSourceEvents = sqliteTable(
  'lead_source_events',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
    rawPayload: text('raw_payload').notNull(),
  },
  (t) => ({
    leadSourceEventsLeadIdIdx: index('lead_source_events_lead_id_idx').on(t.leadId),
  }),
);

export const outboundMessages = sqliteTable(
  'outbound_messages',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    recipient: text('recipient').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    errorMessage: text('error_message'),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    outboundMessagesLeadIdIdx: index('outbound_messages_lead_id_idx').on(t.leadId),
    outboundMessagesStatusIdx: index('outbound_messages_status_idx').on(t.status),
  }),
);

export const faqEntries = sqliteTable(
  'faq_entries',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    keywords: text('keywords').notNull().default(''),
    priority: integer('priority').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    faqEntriesCategoryIdx: index('faq_entries_category_idx').on(t.category),
    faqEntriesActiveIdx: index('faq_entries_active_idx').on(t.active),
  }),
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    details: text('details'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    auditLogLeadIdIdx: index('audit_log_lead_id_idx').on(t.leadId),
    auditLogCreatedAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
  }),
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('call_taker'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    usersEmailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    sessionsUserIdIdx: index('sessions_user_id_idx').on(t.userId),
    sessionsExpiresAtIdx: index('sessions_expires_at_idx').on(t.expiresAt),
  }),
);

export const zipCodeToCounty = sqliteTable(
  'zip_code_to_county',
  {
    zip: text('zip').primaryKey(),
    county: text('county').notNull(),
    region: text('region').notNull(),
  },
  (t) => ({
    zipCountyIdx: index('zip_code_to_county_county_idx').on(t.county),
    zipRegionIdx: index('zip_code_to_county_region_idx').on(t.region),
  }),
);

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadSourceEvent = typeof leadSourceEvents.$inferSelect;
export type NewLeadSourceEvent = typeof leadSourceEvents.$inferInsert;
export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type NewOutboundMessage = typeof outboundMessages.$inferInsert;
export type FaqEntry = typeof faqEntries.$inferSelect;
export type NewFaqEntry = typeof faqEntries.$inferInsert;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ZipRow = typeof zipCodeToCounty.$inferSelect;
export type NewZipRow = typeof zipCodeToCounty.$inferInsert;
export type AppSettingsRow = typeof appSettings.$inferSelect;
export type NewAppSettingsRow = typeof appSettings.$inferInsert;
