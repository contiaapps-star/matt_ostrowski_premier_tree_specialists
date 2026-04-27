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
- Containerized: Docker + Docker Compose
- Tests: Vitest
- Lint / format: Biome

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

The app listens on `http://localhost:5000`. Health check:

```bash
curl http://localhost:5000/health
# {"status":"ok","version":"0.1.0","integration_mode":"stub"}
```

## Run tests

```bash
docker compose exec app npm test
```

## Database — migrations & seed

```bash
docker compose exec app npm run db:generate   # generate migration from schema changes
docker compose exec app npm run db:migrate    # apply migrations
docker compose exec app npm run db:seed       # seed FAQ + zip-to-county lookup tables
```

The SQLite database lives in the named Docker volume `db-data` mounted at `/data/leads.db`. It survives `docker compose down`; remove it explicitly with `docker volume rm matt_ostrowski_premier_tree_specialists_db-data` if you need a clean slate.

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Folder structure

```
/app
  /routes            # Hono route handlers, grouped by domain
    /api             # Webhooks (intake) + cron triggers
  /services          # Business logic (extraction, response, dedup, ...)
  /clients           # External adapters (live + stub variants)
  /db                # Drizzle schema + migrations
  /views             # Layouts / partials / pages (HTML templates)
  /middleware        # Auth, session, rate-limit, error-handler, logger
  /lib               # Pure utilities (e164, email-validator, zip-lookup)
  app.ts             # Hono app factory
  server.ts          # Entry point
  config.ts          # Zod-validated env config
/tests
  /unit
  /integration
  /fixtures          # Sample lead payloads (synthetic)
/scripts             # migrate, seed, backup
/docs
  /phases            # Per-phase implementation notes
  /screenshots       # PRD screenshots (synced from /resourses on demand)
Dockerfile
docker-compose.yml
docker-compose.prod.yml
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
| `INTEGRATION_MODE` | `stub` (default) keeps all external calls in-memory; `live` hits real APIs. |
| `CONFIDENCE_AUTO_SEND_THRESHOLD` | Confidence ≥ this auto-sends responses. Default `0.80`. |
| `CONFIDENCE_DRAFT_THRESHOLD` | Confidence below this skips draft generation. Default `0.50`. |
| `OPENROUTER_MODEL` | LLM identifier for OpenRouter. Update to the current SoTA at build time. |
| `DATABASE_PATH` | SQLite file path inside the container; defaults to `/data/leads.db`. |

## Deployment

Railway single-service deployment (placeholder until Phase 7).

## License

Proprietary — Premier Tree Specialists LLC.
