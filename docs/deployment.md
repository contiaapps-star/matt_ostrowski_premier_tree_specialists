# Going Live — Production Deployment Checklist

This is the one-time checklist to flip the dashboard from `INTEGRATION_MODE=stub` (default) to a fully live production environment with real Google LSA, AnswerForce, and Vercel website-form leads flowing in via AgentMail and real outbound replies via SendGrid + Agent Phone + ArboStar.

For day-to-day operations once live, see [operations.md](operations.md).

---

## 1. Prerequisites

Before flipping the switch, you need:

- [ ] **Railway service** deployed and reachable at a public URL (`https://<service>.up.railway.app` or custom domain).
- [ ] **OpenRouter** account with credits and an API key — the LLM used for extraction + response generation.
- [ ] **AgentMail** account access. Coordinate with **Sara at Sagan** to provision an inbox and grant the API key for this project. The bootstrap service auto-provisions the inbox on first boot once the key is set.
- [ ] **SendGrid** account with a verified sender (`info@premiertreesllc.com` or whatever Matt's branded sender is) and an API key.
- [ ] **Agent Phone** (preferred) or **Twilio** account with a number registered for SMS / iMessage.
- [ ] **ArboStar** company ID + API key from Matt — for pushing converted leads into his CRM.
- [ ] **Admin credentials** chosen — these seed the first admin user on first boot.

---

## 2. Environment variables

In Railway → service → **Variables**, set the following. The full reference is in `.env.example`.

```env
# Mode + URL
NODE_ENV=production
INTEGRATION_MODE=live
PUBLIC_BASE_URL=https://<railway-public-url>     # required for AgentMail webhook registration
SESSION_SECRET=<openssl rand -hex 32>            # ≥16 chars

# Admin bootstrap (only used on a fresh DB)
ADMIN_EMAIL=<admin-email>
ADMIN_PASSWORD=<strong-password>
ADMIN_DISPLAY_NAME=Admin

# AI
OPENROUTER_API_KEY=<...>
OPENROUTER_MODEL=google/gemini-2.5-flash         # default, per Zaki's prototype review

# Inbound (AgentMail provisioning)
AGENT_MAIL_API_KEY=<...>                         # from Sara
AGENT_MAIL_USERNAME=premier3-pts-agent           # adjust if Sara provisioned a different alias
AGENT_MAIL_DOMAIN=agentmail.to
AGENT_MAIL_DISPLAY_NAME=Premier Tree Specialists Agent

# Outbound — Email
SENDGRID_API_KEY=<...>
EMAIL_FROM_ADDRESS=info@premiertreesllc.com
EMAIL_FROM_NAME=Premier Tree Specialists

# Outbound — SMS
AGENT_PHONE_API_KEY=<...>
AGENT_PHONE_NUMBER=<E.164>
SMS_PROVIDER=agent_phone
ENABLE_IMESSAGE=true

# CRM push
ARBOSTAR_COMPANY_ID=<...>
ARBOSTAR_API_KEY=<...>

# Webhook secret for direct website-form POSTs (optional if using email forwarding only)
WEBSITE_FORM_WEBHOOK_SECRET=<random>

# Demo data
RESEED_ON_BOOT=false                             # never enable in prod after first launch
```

> `INTEGRATION_MODE=live` is the master switch. With it set, every client (OpenRouter, SendGrid, AgentPhone, ArboStar, AgentMail) makes real HTTP calls. With `stub`, all of them log to local JSONL files for local development only.

---

## 3. First-boot provisioning

After saving the env vars, redeploy. On startup, [app/server.ts](../app/server.ts) runs:

1. Migrations — schema is created/updated from `app/db/migrations/`.
2. Reference data seed (if empty) — 14 Ohio counties + zip lookup.
3. Admin bootstrap (if `users` table is empty) — creates the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
4. **AgentMail bootstrap** (`bootstrapAgentMail` in [app/services/agentmail-bootstrap.service.ts](../app/services/agentmail-bootstrap.service.ts)). This is idempotent — safe to run on every boot:
   - If an inbox row already exists in `app_settings`, the cached value is reused.
   - Otherwise, the AgentMail SDK is called to create an inbox at `<AGENT_MAIL_USERNAME>@<AGENT_MAIL_DOMAIN>` and register a webhook pointing at `<PUBLIC_BASE_URL>/api/intake/agentmail-webhook`.
   - The address and webhook secret are persisted in `app_settings` and exposed to the dashboard via `/settings`.

Watch the deploy logs for:

```
Server listening { port: 5000, integration_mode: 'live', env: 'production' }
[agentmail-bootstrap] inbox + webhook ready
```

If you see `[agentmail-bootstrap] partial: ...`, check that `PUBLIC_BASE_URL` is correct and reachable.

---

## 4. Verify in the UI

1. Log in at `https://<railway-public-url>/login` with the admin credentials.
2. Navigate to **Settings**.
3. **Inbound section** — confirm the AgentMail address renders as a code chip, NOT the "Pending" pill. Copy the address.
4. **AI section** — confirm the model is `google/gemini-2.5-flash` and `Max tokens` ≤ 500.
5. **FAQ section** — confirm the canonical Premier Tree FAQ markdown is loaded (oak-wilt rule, service area, pricing, credentials).
6. Open `/admin/agent-mail-archive` — should be empty for now (no inbound emails yet).

---

## 5. Hand-off to Matt — set up forwards

Send Matt the AgentMail address from `/settings` and ask him to:

1. **In Gmail**, add `<address>@agentmail.to` as a verified forwarding address (Settings → Forwarding and POP/IMAP → Add a forwarding address). Sara confirms the verification email on the AgentMail side.
2. Create three Gmail filters that **forward (don't redirect) matching messages** to the verified address:
   - From `noreply@google-business.com` or `noreply@business.google.com` → forward (Google LSA notifications).
   - From `notifications@answerforce.com` (verify the exact address from a recent AnswerForce email) → forward.
   - From his website-form sender (Vercel/Formspree/WordPress, whatever the contact form uses) → forward.

The exact step-by-step is rendered inside `/settings` under **How to set up Gmail forwarding** so Matt can self-serve.

If Matt's site has a webhook-capable form (Vercel/Next.js): point the form `POST` directly at `https://<railway-public-url>/api/intake/website-form` with header `x-webhook-secret: <WEBSITE_FORM_WEBHOOK_SECRET>`. Skips email entirely.

---

## 6. Smoke test (real-data end-to-end)

Once Matt has confirmed the forwards are active:

1. **Trigger an inbound**: ask Matt to either submit his own website form or wait for a real LSA/AnswerForce email to arrive. (If urgent, you can also forward an old LSA email manually from his Gmail.)
2. **Watch logs** in Railway — should see:
   - `agentmail-webhook received` (POST hit)
   - `lead ingested ...` (parse + DB insert)
   - `extraction succeeded` (OpenRouter call returned)
   - `response generated` + `auto_sent` or `awaiting_review` depending on confidence.
3. **Open `/admin/agent-mail-archive`** — the new message should appear with `parse_status=parsed` and a linked `lead_id`.
4. **Open the dashboard** `/` — the new lead should appear in the inbox. Click into the detail view.
5. **Verify outbound** — depending on confidence:
   - **≥0.80**: `outbound_messages` shows `sent` rows for the email channel (and SMS if a phone is present). The audit trail shows `auto_sent`. ArboStar should also show `arbostar_synced` with a real `arbostar_request_id`.
   - **0.50–0.79**: lead is in **Needs Review** with a draft. Click **Approve & Send** → confirms outbound + ArboStar push.
   - **<0.50** or escalation keyword: lead is `manually_flagged` for human reply.
6. **Verify ArboStar**: log into Matt's ArboStar account and confirm the request appears in the queue with the expected fields (name, phone, email, address, zip, scope notes).

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/settings` shows "Pending" for AgentMail | `AGENT_MAIL_API_KEY` empty, or AgentMail SDK threw on bootstrap | Check Railway logs for `[agentmail-bootstrap]` errors. Confirm Sara has provisioned the inbox/key. Restart deploy. |
| `agentmail-bootstrap: partial` in logs | `PUBLIC_BASE_URL` missing/incorrect → webhook can't be registered remotely | Set `PUBLIC_BASE_URL` to the live Railway URL (no trailing slash). Redeploy. |
| Forward emails arrive in Gmail but never hit the dashboard | Forwarding address not yet verified in AgentMail | Sara confirms the verification on AgentMail's side. Re-test after. |
| Webhook hits but returns 401/403 | HMAC signature mismatch — `AGENT_MAIL_WEBHOOK_SECRET` rotated | Reprovision: clear the cached secret in `app_settings` (`DELETE FROM app_settings WHERE key='agentmail.webhook_secret'`) and restart. |
| Lead created but `extraction_failed` audit | `OPENROUTER_API_KEY` invalid or out of credits | Check OpenRouter dashboard. Set a new key or top up. |
| Email send returns `bounced` | SendGrid sender unverified, or email validation flagged it | Verify the sender in SendGrid. For obvious-fake addresses (`test@test.com`), the validator skips intentionally — that's expected. |
| ArboStar sync 404/500 | Wrong `ARBOSTAR_COMPANY_ID` or expired key | Confirm with Matt; the dispatcher retries with backoff (1s, 5s, 30s, 5min) before logging `arbostar_failed`. The lead is still marked `auto_sent` — it doesn't block the response. |
| Out-of-service-area badge on a clearly-local lead | ZIP not in seeded `zip_code_to_county` | Add the missing zip via SQL: `INSERT INTO zip_code_to_county (zip, county, region) VALUES ('44XXX', 'Cuyahoga', 'northeast_ohio');` or expand `app/db/seed-data.ts` and redeploy. |

---

## 8. Post-launch tuning

After ~30 real leads have flowed:

- Pull `confidence_score` distribution: `SELECT confidence_score, COUNT(*) FROM leads GROUP BY ROUND(confidence_score, 1);`
- If too many false-positives auto-send, raise `CONFIDENCE_AUTO_SEND_THRESHOLD` (env var, default `0.80`).
- If review queue piles up, lower `CONFIDENCE_DRAFT_THRESHOLD` (default `0.50`) so more leads get a draft.
- Tune escalation keywords in **Settings → Business Rules** based on real escalations the team flagged manually.
- Iterate on the FAQ markdown in **Settings → FAQ** — that's the single biggest lever for response quality.
