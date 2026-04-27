/**
 * ArboStar live smoke test.
 *
 * Creates a *test-flagged* request via the configured ArboStar tenant.
 * The request is identifiable in the ArboStar dashboard by the obvious
 * test name and the address_notes "Source: smoke-test".
 *
 * Usage:
 *   npx tsx scripts/smoke-tests/arbostar.ts
 */
import { config } from '../../app/config.js';
import { ArboStarLiveClient } from '../../app/clients/arbostar.client.js';
import { logger } from '../../app/lib/logger.js';

async function main(): Promise<void> {
  if (!config.ARBOSTAR_COMPANY_ID || !config.ARBOSTAR_API_KEY) {
    console.error('ARBOSTAR_COMPANY_ID / ARBOSTAR_API_KEY not set; cannot run live smoke.');
    process.exit(2);
  }

  const client = new ArboStarLiveClient({
    companyId: config.ARBOSTAR_COMPANY_ID,
    apiKey: config.ARBOSTAR_API_KEY,
  });

  try {
    const result = await client.createRequest({
      name: '[TEST] Smoke Test Customer',
      email: 'smoke-test@premiertreesllc.com',
      phone: '+12165550000',
      address: '123 Test Lane',
      city: 'Cleveland',
      state: 'OH',
      postal: '44113',
      country: 'US',
      details: `[Smoke test from intake dashboard at ${new Date().toISOString()}] — please delete this entry.`,
      address_notes: 'Source: smoke-test',
    });
    logger.info({ requestId: result.requestId }, 'arbostar smoke OK');
    console.log(`OK: ArboStar request created, id ${result.requestId}`);
    console.log('REMINDER: please delete this test request from the ArboStar dashboard.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'arbostar smoke FAIL');
    console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
