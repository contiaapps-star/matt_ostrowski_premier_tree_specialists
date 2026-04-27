# Operations Runbook

This document is for the call team / on-call developer maintaining the Premier Tree Specialists lead intake dashboard in production.

---

## Architecture at a glance

- Single Hono service running in a Docker container on Railway.
- SQLite DB stored in a Railway volume mounted at `/data`.
- Three inbound channels: Google LSA (forwarded email), Vercel website form (webhook), AnswerForce (forwarded email).
- Outbound channels: SendGrid (email), Agent Phone (SMS / iMessage).
- ArboStar CRM push: REST POST after the response is sent.

---

## Deploying / Updating

### Railway (recommended)

1. Push to `main` on GitHub.
2. Railway auto-deploys (the service is configured to redeploy on push to the default branch).
3. Watch the **Deploy** logs in Railway. The container runs migrations on startup; any migration error fails the healthcheck and the previous deploy stays live.
4. After deploy succeeds, hit `/health` to confirm `db_ok=true` and `last_intake_at` is recent.

### Manual (Docker)

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Rolling back

Railway: open the **Deploys** tab, click the previous green deploy, **Redeploy**. The DB schema is forward-compatible across the most recent few migrations; if you need to restore a prior schema, restore from a backup first (below).

---

## Backups

### Manual backup

```bash
docker compose exec app /workspace/scripts/backup.sh
# → /backups/leads-YYYYMMDD-HHMMSS.db.gz
```

The script uses `sqlite3 .backup` (safe under live writes), gzips the file, and writes to `/backups` inside the container. Mount the same volume on your host to retrieve the file:

```bash
docker compose cp app:/backups/leads-YYYYMMDD-HHMMSS.db.gz ./
```

### Scheduled backup

Set up a Railway scheduled task (Service → Settings → Cron) that runs:

```
sh /workspace/scripts/backup.sh
```

at e.g. `0 5 * * *` (05:00 UTC daily).

### Restore

```bash
# Get the .db.gz onto the host
gunzip leads-YYYYMMDD-HHMMSS.db.gz
# Stop the app
docker compose stop app
# Replace the live DB
docker compose cp leads-YYYYMMDD-HHMMSS.db app:/data/leads.db
# Restart
docker compose start app
# Verify
curl http://localhost:5000/health
```

Always make a copy of the *current* `/data/leads.db` before overwriting in case the restore is bad.

---

## Switching to live integrations

Default deploy mode is `INTEGRATION_MODE=stub`. To go live:

1. **Confirm the credentials are populated**: `SENDGRID_API_KEY`, `AGENT_PHONE_API_KEY`, `AGENT_PHONE_NUMBER`, `ARBOSTAR_COMPANY_ID`, `ARBOSTAR_API_KEY`.
2. **Run smoke tests** (one at a time, expecting exit code 0):
   ```bash
   docker compose exec app npx tsx scripts/smoke-tests/sendgrid.ts info+test@premiertreesllc.com
   docker compose exec app npx tsx scripts/smoke-tests/agent-phone.ts +12162458908   # Matt's phone
   docker compose exec app npx tsx scripts/smoke-tests/arbostar.ts                   # creates a [TEST] request — DELETE manually after
   docker compose exec app npx tsx scripts/smoke-tests/gmail-poll.ts                 # placeholder; verifies env wiring
   ```
3. Set `INTEGRATION_MODE=live` and redeploy.
4. Send a real lead through each channel and watch the dashboard. The first 30 leads worth of LLM output should be eyeballed by Matt or a senior call-taker before trusting the auto-send threshold.

---

## Common operations

### Add a new FAQ entry

Until an admin UI is built, FAQs are added via SQL:

```bash
docker compose exec app sqlite3 /data/leads.db
```

```sql
INSERT INTO faq_entries (id, category, question, answer, keywords, priority, active)
VALUES (
  lower(hex(randomblob(16))),
  'pricing',
  'How much does tree removal cost?',
  'Tree removal pricing depends on size, accessibility, and location. We provide complimentary estimates — please reply with your address and a couple of photos.',
  'cost,price,how much,quote',
  60,
  1
);
```

After insertion the next request will pick up the new entry (no app restart needed; FAQ matching reads the table on each request).

### Tune the confidence threshold

Update env vars on Railway (or in `.env`) and redeploy:

- `CONFIDENCE_AUTO_SEND_THRESHOLD` — defaults to `0.80`. Higher = fewer auto-sends, more drafts.
- `CONFIDENCE_DRAFT_THRESHOLD` — defaults to `0.50`. Below this, the system flags for manual response without generating a draft.

### Reset a stuck lead

A lead can occasionally end up in `status='extracting'` if the extraction worker crashed. Move it back to `ingested`:

```sql
UPDATE leads SET status='ingested' WHERE id='<lead-id>' AND status='extracting';
```

Then trigger the batch worker:

```bash
curl -X POST http://localhost:5000/api/admin/extract-batch -H "x-admin-token: $SESSION_SECRET"
```

### Trigger response-generation for ALL extracted leads

```bash
curl -X POST http://localhost:5000/api/admin/generate-responses -H "x-admin-token: $SESSION_SECRET"
```

### Trigger dispatch for ALL pending leads

```bash
curl -X POST http://localhost:5000/api/admin/dispatch-batch -H "x-admin-token: $SESSION_SECRET"
```

### Add a new user

Until a UI is built, the simplest path is two SQL statements + a one-liner to hash the password:

```bash
docker compose exec app node -e "
import('bcryptjs').then(b => console.log(b.default.hashSync('TempPassword!', 12)));
"
```

```sql
INSERT INTO users (id, email, password_hash, display_name, role)
VALUES (
  lower(hex(randomblob(16))),
  'newuser@premiertreesllc.com',
  '<paste-hash-from-above>',
  'New User',
  'call_taker'
);
```

### Logs

Railway: **Service → Deployments → View Logs** (live tail).

Local: `docker compose logs -f app`. The app uses `pino` with structured JSON output in production (`pino-pretty` in dev).

---

## Troubleshooting

### Lead does not appear in the dashboard

1. Find which channel was used (LSA, website form, AnswerForce).
2. Hit `/health` — confirm the app is running and `db_ok=true`.
3. Check the intake endpoint logs:
   ```bash
   docker compose logs --tail 200 app | grep -i 'intake'
   ```
4. For website-form leads: confirm the `WEBSITE_FORM_WEBHOOK_SECRET` matches the Vercel form's secret. A wrong secret returns `401 unauthorized`.
5. For email-forwarded leads (LSA, AnswerForce): confirm the forwarding rule is firing and the inbox has the message. If yes, the polling worker may be stuck — restart the app.

### Outbound email never arrives

1. Open the lead detail page → **Outbound Status** card. If the message status is `failed`, the error message will be in the row.
2. If `queued` for >2 minutes: check SendGrid dashboard (Activity feed). Common causes:
   - Sender domain not verified in SendGrid → email rejected
   - Recipient address bounced or flagged as spam previously
3. Use the smoke test script to send a known-good test email:
   ```bash
   docker compose exec app npx tsx scripts/smoke-tests/sendgrid.ts <your-email>
   ```

### ArboStar push keeps failing

1. Open the lead detail page; the audit trail will show `arbostar_failed` with the error reason.
2. Verify `ARBOSTAR_COMPANY_ID` and `ARBOSTAR_API_KEY` env vars in Railway.
3. Smoke test:
   ```bash
   docker compose exec app npx tsx scripts/smoke-tests/arbostar.ts
   ```
4. Pushes are retried with exponential backoff (1s → 5s → 30s → 5min). After all retries fail, the lead is logged as `arbostar_sync_failed` and can be manually backfilled from the dashboard (future feature) or via SQL.

### LLM timeout / 5xx on extraction

1. Check OpenRouter status page.
2. Bump `OPENROUTER_TIMEOUT_MS` (env var, defaults to 30s in the client) if upstream is slow.
3. Switch `OPENROUTER_MODEL` to a faster tier and redeploy.
4. As a last resort, set `INTEGRATION_MODE=stub` (uses the deterministic offline LLM) so the queue keeps moving — every lead will land in the review queue for manual response.

### Login is locked out

Brute-force protection: 5 failed attempts in 15 minutes blocks an email for 15 minutes. To unlock immediately, restart the app (the lockout map is in-memory):

```bash
docker compose restart app
```

If a real attacker is hammering the endpoint, the rate-limit middleware on `/api/intake` does NOT cover `/login` — consider adding a Cloudflare WAF rule.

---

## Monitoring & alerts

- **Healthcheck**: Railway pings `/health` every 30s. If the response is non-200 for `restartPolicyMaxRetries` consecutive checks, the deployment is restarted.
- **Deploy notifications**: Railway can send webhooks on deploy success/failure to Slack or email — configure under **Service → Settings → Notifications**.
- **Application logs**: structured JSON via `pino`. Set `LOG_LEVEL=debug` to drill into a single request trace.

If you have access to Sentry/Datadog, point the `pino` transport there in `app/lib/logger.ts`.

---

## Contacts / escalation

- Matt Ostrowski (CEO) — primary stakeholder, daily user.
- Engineering on-call — rotation TBD.
