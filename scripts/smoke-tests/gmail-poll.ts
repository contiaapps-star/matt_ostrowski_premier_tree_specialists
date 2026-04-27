/**
 * Gmail polling smoke test (placeholder).
 *
 * Phase 7's MVP relies on email forwarding rules into the operational
 * Gmail inbox; the actual poll-loop integration is deferred until
 * GMAIL_OAUTH_REFRESH_TOKEN is provisioned.
 *
 * This script is intended to be filled in once the OAuth credentials
 * are available. For now it just verifies that the relevant env vars
 * are set and exits with a documented status code.
 *
 * Usage:
 *   npx tsx scripts/smoke-tests/gmail-poll.ts
 */
import { config } from '../../app/config.js';

function main(): void {
  const missing: string[] = [];
  if (!config.GMAIL_INBOUND_ADDRESS) missing.push('GMAIL_INBOUND_ADDRESS');
  if (!config.GMAIL_OAUTH_REFRESH_TOKEN) missing.push('GMAIL_OAUTH_REFRESH_TOKEN');

  if (missing.length > 0) {
    console.error('Gmail polling not configured. Missing:', missing.join(', '));
    console.error('To enable: forward LSA + AnswerForce notifications to GMAIL_INBOUND_ADDRESS');
    console.error('and provision an OAuth refresh token via Google Cloud Console.');
    process.exit(2);
  }

  console.log(`OK: Gmail poll-loop env wired up. Inbox: ${config.GMAIL_INBOUND_ADDRESS}`);
  console.log('NOTE: actual Gmail API integration is wired into the poll worker;');
  console.log('this smoke test only validates that the required env vars are set.');
  process.exit(0);
}

main();
