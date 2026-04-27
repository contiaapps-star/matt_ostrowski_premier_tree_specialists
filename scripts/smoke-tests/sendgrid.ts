/**
 * SendGrid live smoke test.
 *
 * Sends a single transactional email through the configured SendGrid API
 * key to a recipient passed via CLI arg. Used after the Railway deploy
 * (or against a staging environment) to verify the SENDGRID_API_KEY +
 * EMAIL_FROM_ADDRESS combo are wired up correctly.
 *
 * Usage (from inside the container):
 *   npx tsx scripts/smoke-tests/sendgrid.ts info+test@premiertreesllc.com
 *
 * Exits 0 on success, non-zero otherwise.
 */
import { config } from '../../app/config.js';
import { SendGridLiveClient } from '../../app/clients/sendgrid.client.js';
import { logger } from '../../app/lib/logger.js';

async function main(): Promise<void> {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error('Usage: tsx scripts/smoke-tests/sendgrid.ts <recipient-email>');
    process.exit(2);
  }

  if (!config.SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY is not set — cannot run live smoke test.');
    process.exit(2);
  }

  const client = new SendGridLiveClient({
    apiKey: config.SENDGRID_API_KEY,
    fromAddress: config.EMAIL_FROM_ADDRESS,
    fromName: config.EMAIL_FROM_NAME,
  });

  try {
    const result = await client.send({
      to: recipient,
      subject: '[Premier Tree Specialists] SendGrid smoke test',
      html: `<p>Smoke test from the intake dashboard.</p><p>Timestamp: ${new Date().toISOString()}</p>`,
      text: `Smoke test from the intake dashboard.\nTimestamp: ${new Date().toISOString()}\n`,
    });
    logger.info({ recipient, providerMessageId: result.providerMessageId }, 'sendgrid smoke OK');
    console.log(`OK: sent to ${recipient}, message id ${result.providerMessageId}`);
    process.exit(0);
  } catch (err) {
    logger.error({ recipient, err }, 'sendgrid smoke FAIL');
    console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
