/**
 * Agent Phone (SMS / iMessage) live smoke test.
 *
 * Sends a single SMS through the configured Agent Phone API key to a
 * phone number passed in E.164 format. Use this against Matt's own
 * phone after the Railway deploy to verify outbound dispatch works.
 *
 * Usage:
 *   npx tsx scripts/smoke-tests/agent-phone.ts +12162458908
 */
import { config } from '../../app/config.js';
import { AgentPhoneLiveClient } from '../../app/clients/agent-phone.client.js';
import { logger } from '../../app/lib/logger.js';

async function main(): Promise<void> {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error('Usage: tsx scripts/smoke-tests/agent-phone.ts <+E164phone>');
    process.exit(2);
  }
  if (!/^\+\d{8,15}$/.test(recipient)) {
    console.error('Recipient must be E.164 format (e.g. +12162458908)');
    process.exit(2);
  }
  if (!config.AGENT_PHONE_API_KEY || !config.AGENT_PHONE_NUMBER) {
    console.error('AGENT_PHONE_API_KEY / AGENT_PHONE_NUMBER not set; cannot run live smoke.');
    process.exit(2);
  }

  const client = new AgentPhoneLiveClient({
    apiKey: config.AGENT_PHONE_API_KEY,
    fromNumber: config.AGENT_PHONE_NUMBER,
    enableImessage: config.ENABLE_IMESSAGE,
  });

  try {
    const result = await client.send({
      to: recipient,
      body: `Premier Tree Specialists smoke test. Timestamp: ${new Date().toISOString()}`,
    });
    logger.info({ recipient, ...result }, 'agent-phone smoke OK');
    console.log(`OK: ${result.channelUsed} sent to ${recipient}, id ${result.providerMessageId}`);
    process.exit(0);
  } catch (err) {
    logger.error({ recipient, err }, 'agent-phone smoke FAIL');
    console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
