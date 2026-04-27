# Premier Tree Specialists — Lead Intake Dashboard | Guía de Contexto

## Propósito

Dashboard automatizado de intake de leads para Premier Tree Specialists LLC (Matt Ostrowski, CEO; Cleveland + Columbus, Ohio). Consolida leads no-telefónicos de tres fuentes (Google Local Service Ads, formulario web Vercel, AnswerForce after-hours) en un único inbox, extrae info estructurada con IA, genera respuestas FAQ-based, las auto-envía si la confianza es ≥80%, las pone en cola de revisión humana si es <80%, y empuja todo a ArboStar CRM. Lo usa un equipo de **4 call-takers** (2 US, 2 global) que actualmente pierde 12-20 horas/semana en triage manual y demora 15+ min en responder leads de LSA, hiriendo el ranking de Google.

Meta del sistema: **<1 minuto de response-time para 80% de los leads no-phone**.

---

## Stack FIJO (del PRD post-review 24-Apr-2026, NO modificar)

- **Backend**: Hono + Node.js (≥20 LTS) + TypeScript (strict mode)
- **Frontend**: HTML server-rendered + Tailwind CSS + htmx (sin React, sin Vue, sin SPA)
- **Base de datos**: SQLite en volumen Railway (`/data/leads.db`); driver **better-sqlite3** + Drizzle ORM
- **AI/LLM**: SoTA tier vía OpenRouter (modelo: el top actual de Artificial Analysis leaderboard al momento del build; configurar como env var `OPENROUTER_MODEL`)
- **Email outbound**: SendGrid (default) o Mailgun (fallback)
- **SMS / iMessage outbound**: Agent Phone (preferred) o Twilio (fallback). iMessage como interim mientras se completa registro 10DLC.
- **Google LSA inbound**: monitoreo de email forwarded (Gmail forwarding rule a inbox del agente)
- **Website Form (Vercel) inbound**: webhook POST hacia `/api/intake/website-form`
- **AnswerForce inbound**: parsing de email forwarded a inbox del agente
- **ArboStar outbound**: REST POST API a `https://[COMPANY_ID].arbostar.com/api/requests/create`
- **Auth**: sesiones simples con cookies firmadas (call team interno; ~6-8 usuarios). Sin OAuth en V1.
- **Hosting/Deploy**: Railway (single service)
- **Containerización**: **Docker + Docker Compose** (obligatorio, agregado por infra; NO está en el PRD pero NO sustituye el stack — lo encapsula)
- **Test runner**: Vitest (corre dentro del container)
- **Linter / Formatter**: Biome (formato + lint en una sola tool)

**NO permitido en V1**: React, Vue, Svelte, Next.js, Express (Hono ya cubre), MongoDB, PostgreSQL, Redis, OAuth flows, scheduling integrations, voice agents, capacity planning, lead scoring, GBP content automation.

---

## Docker Setup

El proyecto corre 100% en Docker. Nunca asumir que las dependencias están instaladas en el host.

- **Desarrollo**: `docker compose up --build` (monta código fuente como volumen para hot-reload con `tsx watch`)
- **Producción**: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- **Tests**: `docker compose exec app npm test`
- **DB vive en volumen Docker** (`db-data:/data`), NO dentro del container
- **Dependencias del sistema** que requiere el stack: `curl` (healthcheck), `ca-certificates` (TLS para outbound HTTP). El resto es Node puro — no requiere libs nativas pesadas.
- Al agregar dependencias nuevas al proyecto, agregarlas al `package.json` y rebuildar la imagen.

---

## Reglas de Negocio Críticas (NO NEGOCIABLES)

### Confidence Routing (User Story 4)

| Confianza | Acción | Notas |
|-----------|--------|-------|
| **≥ 80%** | Auto-send (text + email) y push a ArboStar | Logear en audit trail siempre |
| **50% – 79%** | Cola de Review Queue con draft pre-cargado | Aprobador puede editar antes de enviar |
| **< 50%** | Flag para review manual SIN draft generado | El agente humano escribe la respuesta desde cero |

- **Threshold tunneable post-launch** vía variable de entorno `CONFIDENCE_AUTO_SEND_THRESHOLD` (default 80) y `CONFIDENCE_DRAFT_THRESHOLD` (default 50). Tuning real ocurre con los 30 sample leads del cliente.
- **Source**: PRD líneas 220-226, transcript ~15:45-16:08.

### Escalation Keywords (forzar review manual aunque confianza ≥80%)

Si el texto del lead contiene cualquiera de las siguientes (case-insensitive, word-boundary), **siempre** rutear a review queue (no auto-send), independiente de la confianza:

- `emergency`, `tree on house`, `tree on car`, `tree on roof`
- `lawsuit`, `attorney`, `lawyer`, `legal action`
- `complaint`, `refund`, `unhappy`, `dissatisfied`, `bad experience`
- `urgent` (cuando combina con `today` o un timeframe < 24h)

**Source**: PRD línea 225.

### Oak Season Rule (Critical FAQ)

- **Oak Season cerrada**: aproximadamente Abril a Noviembre (growing season en Ohio). Durante ese período, Premier Tree Specialists **NO realiza** trimming/pruning de oak trees por riesgo de oak wilt disease.
- **Respuesta canónica** (incluir verbatim en FAQ): *"Thank you for reaching out! We can absolutely schedule an estimate appointment. The Oak season is currently closed until November to prevent infection of Oak Wilt but if you would like an estimate now, it would be valid, if confirmed, for the next season. Would you be available for a phone call to discuss the finer details?"*
- **Source**: screenshot `docs/screenshots/197_36m50s.jpg` (LSA conversation real con respuesta del cliente).

### Service Area (validación de zip code)

Premier Tree Specialists sirve **dos regiones**:

- **Northeast Ohio**: counties Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit
- **Central Ohio**: counties Delaware, Fairfield, Franklin, Licking, Madison, Pickaway, Union

Lookup table `zip_code_to_county` se popula al seed con los zips de esos 14 counties. Lead con zip fuera de esa lista debe ser **flagged como out-of-service-area** y rutearse a review queue (no auto-send), aunque la confianza sea alta.

**Source**: PRD línea 150, Key Definitions.

### Dual-Channel Outreach (User Story 5)

Por **cada lead procesado**, el sistema dispara:

1. **Reply en el canal original**:
   - Google LSA → **email al lead** (PRD post-review simplificó: no usamos LSA reply API en v1 — línea 239)
   - Website Form → **SMS / iMessage** al phone capturado
   - AnswerForce → **solo email follow-up** (caller ya recibió llamada; SMS opcional si está flagged en config)

2. **Email follow-up siempre**, si el lead tiene email válido. Email firma debe incluir:
   - Company name: **Premier Tree Specialists LLC**
   - Cleveland: **216-245-8908** | Columbus: **614-526-2266**
   - "ISA-Certified Arborists | 80+ years combined experience | Fully insured"
   - Link al website

3. **Email validation antes de enviar**: regex + DNS MX record check. Skip emails obviously fake (`test@test.com`, `no@email.com`, `a@a.com`).

**Source**: PRD User Story 5, líneas 230-246.

### Deduplication

- Llave de dedup: **phone number normalizado a E.164** (e.g., `+12162458908`).
- Ventana: **30 minutos**. Si el mismo phone aparece en 2+ canales dentro de 30 min, se mergean en un único `lead_record` con array de `source_events[]` que apuntan a cada inbound event.
- **Source**: PRD línea 173, User Story 1.

### ArboStar Push Timing

- **Solo push a ArboStar DESPUÉS** de que la respuesta fue enviada (auto-send o post-aprobación de review). Nunca antes.
- **Razón**: reducir riesgo de duplicado si el customer también llamó por teléfono y ya está en ArboStar.
- **Field mapping**:
  - `name` → `name`
  - `email` → `email`
  - `phone` → `phone` (E.164)
  - `address`, `city`, `state` (siempre `OH`), `postal` → del extractor + zip-to-county lookup
  - `country` → `US`
  - `details` → texto raw del scope of work + extracted summary
  - `address_notes` → `"Source: <Google LSA Email | Website Form | AnswerForce>"`
- **Retry**: exponential backoff (1s, 5s, 30s, 5min). Si falla todos, logear como `arbostar_sync_failed` y permitir backfill manual desde el dashboard.
- **NO bloquear el envío de respuesta si ArboStar falla**.
- **Source**: PRD User Story 6, líneas 247-269.

### Confidence Score (cómo se calcula)

El LLM debe retornar un JSON estructurado con:

```json
{
  "extracted": { "name": "...", "phone": "...", "email": "...", "address": "...", "scope_of_work": "..." },
  "scope_category": "trimming|pruning|removal|stump_grinding|emergency|consultation|plant_health|other",
  "response_text": "...",
  "confidence": 0.87,
  "confidence_reasoning": "FAQ matched on oak season; all required fields present; tone aligns",
  "escalation_triggered": false,
  "escalation_reason": null
}
```

- `confidence` se calcula combinando: (a) match strength contra FAQ entries (cosine similarity sobre keywords), (b) completitud de campos extraídos (faltantes bajan score), (c) ausencia de keywords ambigüas / urgentes.
- Si `escalation_triggered = true`, override a review queue independiente del score numérico.

---

## Modelo de Datos (schema lógico)

### `leads`
- `id` (TEXT PK, UUID v7 para sortabilidad temporal)
- `received_at` (TIMESTAMP, UTC)
- `source` (TEXT, enum: `google_lsa_email`, `website_form`, `answerforce_email`)
- `dedup_phone_e164` (TEXT, NULLable, indexed)
- `status` (TEXT, enum: `ingested`, `extracting`, `extracted`, `responding`, `awaiting_review`, `auto_sent`, `manually_sent`, `manually_flagged`, `failed`)
- `customer_name` (TEXT, NULLable — populated post-extraction)
- `customer_phone_e164` (TEXT, NULLable)
- `customer_email` (TEXT, NULLable)
- `customer_address` (TEXT, NULLable)
- `customer_city` (TEXT, NULLable)
- `customer_zip` (TEXT, NULLable)
- `service_area_county` (TEXT, NULLable — derived from zip lookup)
- `out_of_service_area` (BOOLEAN, default 0)
- `scope_raw` (TEXT — original text del lead)
- `scope_category` (TEXT, NULLable, enum)
- `scope_summary` (TEXT, NULLable — LLM normalized one-liner)
- `confidence_score` (REAL 0.0-1.0, NULLable)
- `confidence_reasoning` (TEXT, NULLable)
- `escalation_triggered` (BOOLEAN, default 0)
- `escalation_reason` (TEXT, NULLable)
- `response_text` (TEXT, NULLable — final text que se envía/envió)
- `response_sent_at` (TIMESTAMP, NULLable)
- `response_sent_by` (TEXT — `auto` o `<user_id>`)
- `arbostar_request_id` (TEXT, NULLable)
- `arbostar_synced_at` (TIMESTAMP, NULLable)
- `created_at`, `updated_at` (TIMESTAMP)

### `lead_source_events`
- `id` (TEXT PK, UUID v7)
- `lead_id` (TEXT FK → `leads.id`, ON DELETE CASCADE)
- `source` (TEXT, enum)
- `received_at` (TIMESTAMP)
- `raw_payload` (JSON TEXT — el payload completo crudo, para debugging y replay)

(Permite que un mismo `lead` tenga múltiples eventos si llegó por más de un canal en la ventana de dedup.)

### `outbound_messages`
- `id` (TEXT PK, UUID v7)
- `lead_id` (TEXT FK → `leads.id`)
- `channel` (TEXT, enum: `email`, `sms`, `imessage`)
- `recipient` (TEXT — email o phone E.164)
- `body` (TEXT)
- `status` (TEXT, enum: `queued`, `sent`, `failed`, `bounced`)
- `provider_message_id` (TEXT, NULLable — SendGrid/AgentPhone ID)
- `error_message` (TEXT, NULLable)
- `sent_at` (TIMESTAMP, NULLable)
- `created_at` (TIMESTAMP)

### `faq_entries`
- `id` (TEXT PK, UUID v7)
- `category` (TEXT — e.g., `oak_season`, `service_area`, `emergency`, `pricing`, `credentials`, `scheduling`)
- `question` (TEXT — pregunta canónica)
- `answer` (TEXT — respuesta canónica)
- `keywords` (TEXT — comma-separated for keyword matching)
- `priority` (INTEGER — orden de match; mayor = primero)
- `active` (BOOLEAN, default 1)
- `created_at`, `updated_at` (TIMESTAMP)

### `audit_log`
- `id` (TEXT PK, UUID v7)
- `lead_id` (TEXT FK, NULLable)
- `actor` (TEXT — `system`, `<user_id>`, `auto`)
- `action` (TEXT — e.g., `ingested`, `extracted`, `response_generated`, `auto_sent`, `manually_approved`, `manually_edited`, `arbostar_synced`, `arbostar_failed`)
- `details` (JSON TEXT)
- `created_at` (TIMESTAMP)

### `users`
- `id` (TEXT PK)
- `email` (TEXT UNIQUE)
- `password_hash` (TEXT, bcrypt)
- `display_name` (TEXT)
- `role` (TEXT — enum `admin`, `call_taker`)
- `created_at` (TIMESTAMP)

### `zip_code_to_county` (seed table)
- `zip` (TEXT PK, 5-digit)
- `county` (TEXT)
- `region` (TEXT, enum `northeast_ohio`, `central_ohio`)

---

## Especificaciones Visuales

### Inbox principal (`/dashboard`)

Inspirado en el screenshot `docs/screenshots/113_27m02s.jpg` (Google LSA leads list), pero unificando las 3 fuentes.

- **Header**: barra superior con logo "Premier Tree Specialists" izquierda; en derecha, badge con conteo de "needs review" + dropdown del usuario.
- **Filtros**: chips horizontales: `All sources`, `Google LSA`, `Website Form`, `AnswerForce` | `All statuses`, `Auto-sent`, `Awaiting Review`, `Manual Flag`, `Failed` | rango de fecha (Today / 7 days / 30 days / Custom).
- **Tabla**: columnas: `Customer name | Source | Scope | City/Zip | Confidence | Status | Received | Actions`
  - **Confidence**: badge de color: verde (≥80%), amarillo (50-79%), rojo (<50%), gris (no scoreado aún).
  - **Status**: badge: verde "Auto-sent", amarillo "Awaiting Review", rojo "Manual Flag", gris "Processing".
  - **Actions**: ícono de chevron → abre detail view.
- **Empty state**: ilustración de árbol + texto "No leads in this view yet."

### Detail view (`/leads/:id`)

Inspirado en `docs/screenshots/197_36m50s.jpg` (LSA conversation detail).

- **Top bar**: nombre del cliente + phone | botones `Mark Booked` (futuro), `Archive`.
- **Lead Summary card**:
  - Status, Source, Scope category, Location, Lead received, Confidence score (con tooltip mostrando `confidence_reasoning`).
- **Extracted Data card** (sección editable):
  - Name, Phone, Email, Address, City, ZIP, County, Service Area badge (in/out).
  - Inputs editables; botón "Save extracted data" actualiza el record.
- **Generated Response card**:
  - Textarea con el `response_text` (editable si está en review queue).
  - Botones según status:
    - `awaiting_review`: `[Approve & Send]` `[Edit & Send]` `[Reject]`
    - `auto_sent`: `[View sent message]` (read-only)
    - `manually_flagged`: `[Compose Response Manually]`
- **Audit Trail accordion** (cerrado por default): timeline de eventos del `audit_log` para este lead.
- **Original payload accordion**: dump JSON del `raw_payload` del primer source event.

### Review Queue (`/queue`)

- Vista equivalente al inbox pero filtrada por `status = 'awaiting_review'`, ordenada por `received_at` ASC (más viejos primero).
- Banner top: "X leads awaiting review — average wait: Y min" (KPI de UX para presionar al equipo).

### Stats Dashboard (`/stats`)

Vista simple con KPIs (Phase 7):
- **Time to first response** (avg + p50 + p95 last 7 days).
- **Auto-send rate** (% of leads ≥80% confidence en últimos 7 días).
- **Volume per source** (count last 7 days).
- **ArboStar sync rate** (% successful pushes).
- **Out-of-service-area count**.

### Color palette (Tailwind config)

- **Primary** (verde Premier Tree, derivar del logo cuando cliente lo provea): `green-700` (`#15803d`) como placeholder.
- **Accent / CTA** (botones de acción): `green-600`.
- **Auto-send badge**: `green-100` bg + `green-800` text.
- **Awaiting review badge**: `amber-100` bg + `amber-800` text.
- **Manual flag badge**: `red-100` bg + `red-800` text.
- **Out of service area badge**: `slate-200` bg + `slate-700` text.
- **Confirmar exact brand colors con cliente antes de Fase 7**.

---

## Convenciones de Código

- **Estructura de carpetas**:
  ```
  /app
    /routes          # Hono route handlers, agrupados por dominio
      dashboard.ts
      leads.ts
      queue.ts
      stats.ts
      auth.ts
      api/
        intake.ts    # POST endpoints para website-form webhook
        cron.ts      # Para email-poller trigger
    /services        # Business logic (sin HTTP concerns)
      extraction.service.ts
      response.service.ts
      dedup.service.ts
      service-area.service.ts
      arbostar.service.ts
      email-sender.service.ts
      sms-sender.service.ts
      lsa-email-parser.service.ts
      answerforce-email-parser.service.ts
    /clients         # Adapters externos (live + stub variants)
      arbostar.client.ts
      sendgrid.client.ts
      agent-phone.client.ts
      openrouter.client.ts
    /db              # Drizzle schema + migrations
      schema.ts
      migrations/
    /views           # HTML templates (Hono JSX o tagged templates)
      layouts/
      partials/
      pages/
    /middleware
      auth.ts
      session.ts
      rate-limit.ts
    /lib             # Pure utilities
      e164.ts
      email-validator.ts
      zip-lookup.ts
      uuid.ts
    server.ts        # Entry point
    config.ts        # Config from env
  /tests
    /unit
    /integration
    /fixtures        # Sample lead payloads (synthetic)
  /scripts
    seed.ts
    backup.sh
  /docs
    screenshots/
    development-phases.md
    feasibility-report.md
  Dockerfile
  docker-compose.yml
  docker-compose.prod.yml
  .dockerignore
  .env.example
  drizzle.config.ts
  package.json
  tsconfig.json
  biome.json
  vitest.config.ts
  README.md
  CLAUDE.md
  ```
- **Naming**: TypeScript strict; nombres en inglés; archivos `kebab-case.ts`; clases `PascalCase`; funciones `camelCase`; constantes `SCREAMING_SNAKE`.
- **Money / phone format**: phones siempre en E.164 (`+1XXXXXXXXXX`); display format `(216) 245-8908`; conversiones en `lib/e164.ts`.
- **Fechas**: persistir UTC; display en `America/New_York` timezone (Cleveland & Columbus están en ET).
- **Logging**: usar `pino` con structured JSON output; nunca `console.log` en producción.
- **Errores**: cada `service` lanza `AppError` con código (e.g., `EXTRACTION_FAILED`, `ARBOSTAR_API_ERROR`); los routes capturan y mapean a HTTP status.
- **Adapter pattern para integraciones externas**: cada `client` tiene interface compartida + dos implementaciones (`Live`, `Stub`). El switch ocurre en `config.ts` según `INTEGRATION_MODE` env (`live` | `stub`).

---

## Fuera de Scope V1 (NO implementar)

- **Voice agent para overflow calls** — Phase 2 futura, mencionado en PRD línea 299-303.
- **Sales appointment scheduler** — Phase 3 futura. PRD línea 305: Matt confirmó out of scope durante review.
- **Capacity planning tool** (dispatch board por zona) — Phase 4 futura. Matt está prototipando esto separadamente en Vercel.
- **Lead scoring & prioritization** — Phase 5 futura.
- **Proactive outreach campaigns** (Zillow / LoopNet signals) — Phase 6 futura.
- **Google Business Profile content agent** — Phase 7 futura. Era el motivo original de la review call pero Zaki defirió.
- **Two-way conversation threading** — el sistema solo envía la primera respuesta. Si el customer responde, no hay threading inteligente; los replies caen al inbox de Gmail tradicional del equipo.
- **Multi-tenant** — Premier Tree Specialists es el único tenant.
- **Mobile app nativa** — solo web responsive.

---

## Variables de entorno (`.env.example`)

```env
# App
PORT=5000
NODE_ENV=development
SESSION_SECRET=change-me-in-prod
INTEGRATION_MODE=stub                        # stub | live

# Database
DATABASE_PATH=/data/leads.db

# AI
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4-6  # placeholder; verificar SoTA actual
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Confidence thresholds (tuneable post-launch)
CONFIDENCE_AUTO_SEND_THRESHOLD=0.80
CONFIDENCE_DRAFT_THRESHOLD=0.50

# Email (SendGrid)
SENDGRID_API_KEY=
EMAIL_FROM_ADDRESS=info@premiertreesllc.com
EMAIL_FROM_NAME=Premier Tree Specialists

# SMS / iMessage (Agent Phone)
AGENT_PHONE_API_KEY=
AGENT_PHONE_NUMBER=
SMS_PROVIDER=agent_phone                      # agent_phone | twilio
ENABLE_IMESSAGE=true

# ArboStar
ARBOSTAR_COMPANY_ID=
ARBOSTAR_API_KEY=

# Email inbound (Gmail polling for LSA + AnswerForce)
GMAIL_INBOUND_ADDRESS=agent@premiertreesllc.com
GMAIL_OAUTH_REFRESH_TOKEN=
LSA_EMAIL_FROM=noreply@google-business.com    # filter for LSA notifications
ANSWERFORCE_EMAIL_FROM=notifications@answerforce.com
EMAIL_POLL_INTERVAL_SECONDS=60

# Webhook secrets
WEBSITE_FORM_WEBHOOK_SECRET=
```
