import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import {
  agentMailMessages,
  type AgentMailMessageRow,
  AGENT_MAIL_PARSE_STATUSES,
  type AgentMailParseStatus,
} from '../db/schema.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ArchiveListFilters {
  parseStatus?: AgentMailParseStatus;
  detectedSource?: string;
  limit?: number;
}

export interface ArchiveListItem {
  id: string;
  agentmailMessageId: string;
  receivedAt: Date;
  fromAddress: string | null;
  subject: string | null;
  detectedSource: string | null;
  parseStatus: string;
  parseError: string | null;
  leadId: string | null;
}

export interface ArchiveCounts {
  total: number;
  byStatus: Record<AgentMailParseStatus, number>;
}

export function listArchive(
  filters: ArchiveListFilters = {},
  db: DrizzleDb = getDb(),
): ArchiveListItem[] {
  const conditions: SQL[] = [];
  if (filters.parseStatus) {
    conditions.push(eq(agentMailMessages.parseStatus, filters.parseStatus));
  }
  if (filters.detectedSource) {
    conditions.push(eq(agentMailMessages.detectedSource, filters.detectedSource));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({
      id: agentMailMessages.id,
      agentmailMessageId: agentMailMessages.agentmailMessageId,
      receivedAt: agentMailMessages.receivedAt,
      fromAddress: agentMailMessages.fromAddress,
      subject: agentMailMessages.subject,
      detectedSource: agentMailMessages.detectedSource,
      parseStatus: agentMailMessages.parseStatus,
      parseError: agentMailMessages.parseError,
      leadId: agentMailMessages.leadId,
    })
    .from(agentMailMessages)
    .where(where)
    .orderBy(desc(agentMailMessages.receivedAt))
    .limit(filters.limit ?? 100)
    .all();

  return rows.map((r) => ({
    ...r,
    receivedAt: r.receivedAt instanceof Date ? r.receivedAt : new Date(r.receivedAt as unknown as number),
  }));
}

export function getArchiveCounts(db: DrizzleDb = getDb()): ArchiveCounts {
  const all = db
    .select({ id: agentMailMessages.id, status: agentMailMessages.parseStatus })
    .from(agentMailMessages)
    .all();
  const byStatus = Object.fromEntries(
    AGENT_MAIL_PARSE_STATUSES.map((s) => [s, 0]),
  ) as Record<AgentMailParseStatus, number>;
  for (const row of all) {
    if ((AGENT_MAIL_PARSE_STATUSES as readonly string[]).includes(row.status)) {
      byStatus[row.status as AgentMailParseStatus] += 1;
    }
  }
  return { total: all.length, byStatus };
}

export function getArchiveById(
  id: string,
  db: DrizzleDb = getDb(),
): AgentMailMessageRow | null {
  const rows = db
    .select()
    .from(agentMailMessages)
    .where(eq(agentMailMessages.id, id))
    .limit(1)
    .all();
  return rows.length > 0 ? (rows[0] as AgentMailMessageRow) : null;
}
