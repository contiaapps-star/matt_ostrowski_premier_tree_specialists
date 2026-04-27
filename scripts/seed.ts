import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import {
  auditLog,
  faqEntries,
  leads,
  leadSourceEvents,
  outboundMessages,
  users,
  zipCodeToCounty,
  type NewLead,
  type NewLeadSourceEvent,
} from '../app/db/schema.js';
import * as schema from '../app/db/schema.js';
import { generateUuidV7 } from '../app/lib/uuid.js';
import { logger } from '../app/lib/logger.js';
import { ZIP_ROWS, FAQ_ROWS, buildDemoLeadSpecs } from '../app/db/seed-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function deleteAll(db: DrizzleDb): void {
  // Delete in FK-safe order
  db.delete(auditLog).run();
  db.delete(outboundMessages).run();
  db.delete(leadSourceEvents).run();
  db.delete(leads).run();
  db.delete(faqEntries).run();
  db.delete(zipCodeToCounty).run();
  db.delete(users).run();
}

export interface SeedCounts {
  leads: number;
  faqEntries: number;
  zipRows: number;
  users: number;
  sourceEvents: number;
  auditLogs: number;
}

export function runSeed(db: DrizzleDb): SeedCounts {
  const counts: SeedCounts = {
    leads: 0,
    faqEntries: 0,
    zipRows: 0,
    users: 0,
    sourceEvents: 0,
    auditLogs: 0,
  };

  db.transaction((tx) => {
    deleteAll(tx);

    for (const row of ZIP_ROWS) {
      tx.insert(zipCodeToCounty).values(row).run();
      counts.zipRows += 1;
    }

    for (const f of FAQ_ROWS) {
      tx.insert(faqEntries)
        .values({ id: generateUuidV7(), ...f })
        .run();
      counts.faqEntries += 1;
    }

    const adminId = generateUuidV7();
    tx.insert(users)
      .values({
        id: adminId,
        email: 'matt@premiertreesllc.com',
        passwordHash: bcrypt.hashSync('ChangeMe123!', 10),
        displayName: 'Matt Ostrowski',
        role: 'admin',
      })
      .run();
    counts.users += 1;

    const specs = buildDemoLeadSpecs();
    for (const spec of specs) {
      const leadId = generateUuidV7();
      const eventId = generateUuidV7();
      const auditId = generateUuidV7();
      const receivedAt = new Date(spec.receivedAtIso);

      const leadRow: NewLead = {
        id: leadId,
        receivedAt,
        source: spec.source,
        scopeRaw: spec.lead.scopeRaw,
        ...spec.lead,
      };
      tx.insert(leads).values(leadRow).run();
      counts.leads += 1;

      const eventRow: NewLeadSourceEvent = {
        id: eventId,
        leadId,
        source: spec.source,
        receivedAt,
        rawPayload: JSON.stringify(spec.rawPayload),
      };
      tx.insert(leadSourceEvents).values(eventRow).run();
      counts.sourceEvents += 1;

      tx.insert(auditLog)
        .values({
          id: auditId,
          leadId,
          actor: 'system',
          action: 'ingested',
          details: JSON.stringify({ source: spec.source }),
        })
        .run();
      counts.auditLogs += 1;
    }
  });

  return counts;
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
    const counts = runSeed(db);
    logger.info(
      counts,
      `seeded ${counts.leads} leads, ${counts.faqEntries} faq entries, ${counts.zipRows} zips`,
    );
    closeDb();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Seed failed');
    closeDb();
    process.exit(1);
  }
}
