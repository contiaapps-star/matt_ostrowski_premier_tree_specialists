# Premier Tree Specialists — Lead Intake Dashboard

Automated lead intake dashboard for Premier Tree Specialists LLC (Matt Ostrowski, CEO; Cleveland + Columbus, Ohio). Consolidates non-phone leads from three sources (Google Local Service Ads, Vercel website form, AnswerForce after-hours) into a single inbox, extracts structured info with AI, generates FAQ-based responses, auto-sends them when confidence is ≥80%, queues lower-confidence leads for human review, and pushes everything to ArboStar CRM. Goal: <1 minute response-time for 80% of non-phone leads.

## Stack

- Backend: Hono + Node.js (≥20 LTS) + TypeScript (strict mode)
- Frontend: HTML server-rendered + Tailwind CSS + htmx
- Database: SQLite (`better-sqlite3` + Drizzle ORM) on a Docker volume
- AI: SoTA tier via OpenRouter
- Outbound email: SendGrid (Mailgun fallback)
- Outbound SMS / iMessage: Agent Phone (Twilio fallback)
- CRM push: ArboStar REST API
- Auth: cookie-based sessions stored in SQLite, signed with `SESSION_SECRET`; CSRF enforced via double-submit cookie.
- Containerized: Docker + Docker Compose
- Tests: Vitest
- Lint / format: Biome

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

The app listens on `http://localhost:5000`. Sign in at `/login` with the seeded admin: `matt@premiertreesllc.com` / `ChangeMe123!`. Change this password on first real deploy.

Health check:

```bash
curl http://localhost:5000/health
# {"status":"ok","version":"0.1.0","integration_mode":"stub","db_ok":true,...}
```

## Run tests

```bash
docker compose exec app npm test
```

## Database — migrations & seed

```bash
docker compose exec app npm run db:generate    # generate migration from schema changes
docker compose exec app npm run db:migrate     # apply migrations
docker compose exec app npm run db:seed        # base seed: FAQs, zips, admin user, 8 demo leads
docker compose exec app npm run db:seed:demo   # ↑ same, plus 20 extra demo leads with outbound + audit
```

The `db:seed:demo` script is for **manual UI testing**: it gives you 28 leads spread across every status (`ingested`, `extracted`, `awaiting_review`, `auto_sent`, `manually_sent`, `manually_flagged`, `failed`), all 3 sources, all 8 scope categories, with realistic outbound messages (sent + failed), ArboStar sync entries, escalation flags, out-of-service-area leads, and audit-log trails. The base `db:seed` only inserts the 8 leads referenced by the test suite.

The SQLite database lives in the named Docker volume `db-data` mounted at `/data/leads.db`. It survives `docker compose down`; remove it explicitly with `docker volume rm matt_ostrowski_premier_tree_specialists_db-data` if you need a clean slate.

## Backups

A hot-backup script is included at [`scripts/backup.sh`](scripts/backup.sh):

```bash
docker compose exec app /workspace/scripts/backup.sh
```

It uses `sqlite3 .backup` (safe under concurrent reads/writes), gzips the result into `/backups`, and prunes files older than 30 days. Wire it to a cron job or a Railway scheduled task to run daily.

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

In production mode the server applies Drizzle migrations on startup (no manual `db:migrate` needed).

## Deploy to Railway

1. Push the repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub Repo** → select this repo.
3. Add a **Volume** mounted at `/data` (so the SQLite DB persists across deploys).
4. Set the env vars listed in [.env.example](.env.example). At minimum:
   - `SESSION_SECRET` — strong random string, ≥16 chars (`openssl rand -hex 32`)
   - `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
   - `SENDGRID_API_KEY`
   - `AGENT_PHONE_API_KEY`, `AGENT_PHONE_NUMBER`
   - `ARBOSTAR_COMPANY_ID`, `ARBOSTAR_API_KEY`
   - `WEBSITE_FORM_WEBHOOK_SECRET`
   - `INTEGRATION_MODE=live` (only after smoke tests pass)
5. Railway will detect [`railway.toml`](railway.toml) and build using the project's `Dockerfile`.
6. After the first successful deploy, run the live smoke tests (see `scripts/smoke-tests/`) before flipping `INTEGRATION_MODE=live`.

Detailed runbooks: see [`docs/operations.md`](docs/operations.md).

## Authentication

The dashboard uses signed-cookie sessions (7-day TTL) stored in the `sessions` table. CSRF is enforced via a double-submit cookie pattern (`pts_csrf` cookie + `X-CSRF-Token` header / `_csrf` form field on every POST/PATCH/DELETE).

Brute-force protection blocks an email after 5 failed login attempts within 15 minutes; the block lifts automatically after 15 minutes.

To create a new user manually (until an admin UI is added):

```bash
docker compose exec app node -e "
import('bcryptjs').then(b => {
  const hash = b.default.hashSync('NEW_TEMPORARY_PASSWORD', 12);
  console.log(hash);
});
"
# Then INSERT a row into the users table with that hash.
```

## Folder structure

```
/app
  /routes            # Hono route handlers, grouped by domain
    /api             # Webhooks (intake) + admin batch triggers
  /services          # Business logic (extraction, response, dedup, auth, stats…)
  /clients           # External adapters (live + stub variants)
  /db                # Drizzle schema + migrations
  /views             # Layouts / partials / pages (HTML templates)
  /middleware        # auth, csrf, rate-limit, error-handler, logger
  /lib               # Pure utilities (e164, email-validator, zip-lookup)
  app.ts             # Hono app factory
  server.ts          # Entry point (auto-migrates in production)
  config.ts          # Zod-validated env config
/tests
  /unit
  /integration       # auth.test.ts, csrf.test.ts, stats.test.ts, end-to-end-with-auth, backup-restore, …
  /fixtures
/scripts
  backup.sh          # Hot-backup script
  /smoke-tests       # Live-mode smoke tests (sendgrid, agent-phone, arbostar, gmail-poll)
/docs
  operations.md      # Operational runbook
  /phases            # Per-phase implementation notes
  /screenshots       # PRD screenshots
Dockerfile
docker-compose.yml
docker-compose.prod.yml
railway.toml
.dockerignore
.env.example
drizzle.config.ts
biome.json
vitest.config.ts
package.json
tsconfig.json
CLAUDE.md
```

## Environment variables

All env vars are documented in [.env.example](.env.example). Key ones:

| Var | Purpose |
|-----|---------|
| `SESSION_SECRET` | Required in production (≥16 chars). Used to sign session + CSRF cookies. |
| `INTEGRATION_MODE` | `stub` (default) keeps all external calls in-memory; `live` hits real APIs. |
| `CONFIDENCE_AUTO_SEND_THRESHOLD` | Confidence ≥ this auto-sends responses. Default `0.80`. |
| `CONFIDENCE_DRAFT_THRESHOLD` | Confidence below this skips draft generation. Default `0.50`. |
| `OPENROUTER_MODEL` | LLM identifier for OpenRouter. Update to current SoTA at deploy time. |
| `DATABASE_PATH` | SQLite file path inside the container; defaults to `/data/leads.db`. |

## License

Proprietary — Premier Tree Specialists LLC.
