# Development Phases — Index

The build is sliced into 8 sequential phases. Each phase has a hard gate: tests green inside Docker before advancing.

1. **Phase 0 — Setup, Foundations & Docker** — project skeleton, Hono server, `/health`, Vitest, Dockerfile, docker-compose.
2. **Phase 1 — Database Schema & Migrations** — Drizzle schema for `leads`, `lead_source_events`, `outbound_messages`, `faq_entries`, `audit_log`, `users`, `zip_code_to_county`; seed script.
3. **Phase 2 — Lead Intake (3 channels)** — webhooks/parsers for Google LSA email, website form, AnswerForce email; dedup window; persistence.
4. **Phase 3 — AI Extraction & Response Generation** — OpenRouter client, structured JSON output, confidence scoring, escalation keyword detection, oak-season + service-area rules.
5. **Phase 4 — Outbound Channels (Email + SMS/iMessage)** — SendGrid + Agent Phone clients, dual-channel send, signature template, email validation with MX check.
6. **Phase 5 — Dashboard UI** — server-rendered HTML inbox, filters, detail view, review queue, htmx interactions, Tailwind styling.
7. **Phase 6 — ArboStar CRM Push** — REST POST integration, retry with exponential backoff, manual backfill from dashboard.
8. **Phase 7 — Auth, Stats Dashboard & Production Hardening** — cookie sessions, KPI dashboard, audit trail UI, Railway deployment.
