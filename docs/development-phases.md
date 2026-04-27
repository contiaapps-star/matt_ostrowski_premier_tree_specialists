# Premier Tree Specialists — Plan de Fases de Desarrollo

> Este documento contiene el plan de fases para construir el **Automated Lead Intake Dashboard** de Premier Tree Specialists. Cada fase tiene un prompt completo listo para pegar en Claude Code, con tareas, tests obligatorios y un gate bloqueante de avance.
>
> **Convención de delivery**: prototype-first. Las fases 0-5 corren en `INTEGRATION_MODE=stub` (sin credenciales reales). Las fases 6-7 hacen el switch a `live` cuando el cliente entregue creds.

---

## Tabla resumen de fases

| Fase | Foco | Salida validable | Sesión |
|------|------|------------------|--------|
| 0 | Setup, foundations & Docker | `docker compose up` levanta `/health` | 1 |
| 1 | Database, models, migrations & seed | `npm run db:seed` carga 8 leads sintéticos + FAQ + zip lookup | 1 |
| 2 | Inbound ingestion + dedup | POST a 3 webhooks crea `leads`; dedup por phone funciona | 1 |
| 3 | LLM extraction + service-area + scope categorization | Lead crudo → datos estructurados con confidence | 1 |
| 4 | FAQ-based response generation + confidence routing + escalation | Respuesta generada, ruteada según threshold y keywords | 1 |
| 5 | Dashboard UI completo (htmx) | Inbox, detail view, review queue funcionales | 1-2 |
| 6 | Dual-channel outreach + ArboStar push (con stubs) | Envío logueado + ArboStar request mockeado | 1 |
| 7 | Auth, stats, polish, Docker prod, deploy a Railway | App en producción con backup automatizado | 1 |

**Total estimado**: 8-10 sesiones de Claude Code (cada fase = 1 sesión limpia, las fases más densas pueden requerir 2).

---

## Tabla de dependencias

> **Nota crítica**: cada fila implícitamente requiere que la suite de tests de la fase previa esté 100% verde (`docker compose exec app npm test` exit code 0). Sin eso, **NO se avanza**.

| Fase | Depende de | Archivos a adjuntar al prompt | Assets del cliente requeridos |
|------|-----------|-------------------------------|-------------------------------|
| 0 | — | `CLAUDE.md`, PRD, `docs/feasibility-report.md` | Ninguno |
| 1 | Fase 0 verde | (CLAUDE.md ya en repo) | Ninguno (seed sintético) |
| 2 | Fase 1 verde | (CLAUDE.md) | Ninguno (payloads sintéticos basados en transcript/screenshots) |
| 3 | Fase 2 verde | (CLAUDE.md) | API key de OpenRouter (testing) — o seguir en stub-LLM |
| 4 | Fase 3 verde | (CLAUDE.md) | **Recomendado**: si el cliente ya entregó call recordings o sample de 30 leads, usarlos para tunear FAQ. Si no, usar FAQ seed sintético del PRD. |
| 5 | Fase 4 verde | (CLAUDE.md) + screenshots `113_27m02s.jpg` y `197_36m50s.jpg` (referencia visual) | Ninguno; logo/colores definitivos pueden esperar a Fase 7 |
| 6 | Fase 5 verde | (CLAUDE.md) | Ninguno para implementación con stubs; switch a live requiere creds (deferido a fase 7 si no llegaron) |
| 7 | Fase 6 verde | (CLAUDE.md) | **Bloqueante para deploy**: ArboStar API key, SendGrid key, Agent Phone key, Gmail OAuth, Vercel webhook URL, Railway access |

---

## Fases (prompts copy-paste)

> Cada bloque siguiente es un prompt completo. Pegalo tal cual en una sesión limpia de Claude Code (con CLAUDE.md ya en la raíz del repo) para ejecutar la fase.

---

### FASE 0 — Setup, Foundations & Docker

```
Vamos a arrancar el proyecto "Premier Tree Specialists — Lead Intake Dashboard" desde cero. Adjunto el PRD completo (docs/PRD-premier-tree-specialists.md) y el feasibility report (docs/feasibility-report.md).

OBJETIVO DE ESTA FASE:
Setup inicial del proyecto con el stack del PRD, containerizado con Docker. Al final, `docker compose up --build` levanta el server, `/health` responde 200, y la suite de tests Vitest corre verde dentro del container.

STACK FIJO (NO MODIFICAR — viene del PRD post-review 24-Apr-2026):
- Backend: Hono + Node.js (≥20 LTS) + TypeScript (strict mode)
- Frontend: HTML server-rendered + Tailwind CSS + htmx
- Base de datos: SQLite (better-sqlite3 + Drizzle ORM) en /data/leads.db (volumen Docker)
- AI: SoTA tier vía OpenRouter (no implementar todavía, solo dejar config)
- Email: SendGrid (no implementar todavía)
- SMS: Agent Phone preferred / Twilio fallback (no implementar todavía)
- ArboStar: REST POST API (no implementar todavía)
- Test runner: Vitest
- Lint/format: Biome
- Containerización: Docker + Docker Compose (obligatorio)
- Sin React/Next/Express. Sin OAuth en V1.

TAREAS:

1. Crear estructura de carpetas exacta (todas vacías excepto cuando se indique):
   /app/routes
   /app/routes/api
   /app/services
   /app/clients
   /app/db
   /app/db/migrations
   /app/views/layouts
   /app/views/partials
   /app/views/pages
   /app/middleware
   /app/lib
   /tests/unit
   /tests/integration
   /tests/fixtures
   /scripts
   /public
   /docs/screenshots          (vacío; los screenshots viven en resourses/)

2. Crear `package.json` con:
   - Scripts: `dev` (tsx watch app/server.ts), `build` (tsc), `start` (node dist/server.js), `test` (vitest run), `test:watch` (vitest), `lint` (biome check), `format` (biome format --write), `db:generate` (drizzle-kit generate), `db:migrate` (tsx scripts/migrate.ts), `db:seed` (tsx scripts/seed.ts)
   - dependencies: hono, @hono/node-server, better-sqlite3, drizzle-orm, drizzle-kit, dotenv, pino, pino-pretty, zod, bcryptjs
   - devDependencies: typescript, tsx, vitest, @types/node, @types/better-sqlite3, @types/bcryptjs, @biomejs/biome, supertest, @types/supertest

3. Crear `tsconfig.json` con strict mode, target ES2022, module Node16, baseUrl `./app`, paths para imports limpios.

4. Crear `biome.json` con format + lint config razonable (no override de defaults).

5. Crear `vitest.config.ts` apuntando a `tests/**/*.test.ts`, con setup file que carga `.env.test`.

6. Crear `drizzle.config.ts` apuntando a `app/db/schema.ts` y al `DATABASE_PATH` env.

7. Crear `app/config.ts` que lee process.env (vía dotenv en dev) y exporta un objeto tipado Config con:
   PORT, NODE_ENV, SESSION_SECRET, INTEGRATION_MODE, DATABASE_PATH,
   OPENROUTER_API_KEY/MODEL/BASE_URL,
   CONFIDENCE_AUTO_SEND_THRESHOLD (default 0.80), CONFIDENCE_DRAFT_THRESHOLD (default 0.50),
   SENDGRID_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME,
   AGENT_PHONE_API_KEY, AGENT_PHONE_NUMBER, SMS_PROVIDER, ENABLE_IMESSAGE,
   ARBOSTAR_COMPANY_ID, ARBOSTAR_API_KEY,
   GMAIL_INBOUND_ADDRESS, GMAIL_OAUTH_REFRESH_TOKEN, LSA_EMAIL_FROM, ANSWERFORCE_EMAIL_FROM, EMAIL_POLL_INTERVAL_SECONDS,
   WEBSITE_FORM_WEBHOOK_SECRET.
   Validar con Zod. Crash en startup si falta algo crítico (e.g., SESSION_SECRET en prod).

8. Crear `app/lib/logger.ts` exportando un logger pino estructurado.

9. Crear `app/server.ts`:
   - Hono app
   - Middlewares: logger, error-handler global
   - Mount /health route que retorna `{ status: "ok", version: process.env.npm_package_version, integration_mode: config.INTEGRATION_MODE }`
   - Mount placeholder para futuras rutas
   - Listen en config.PORT con @hono/node-server

10. Crear `app/routes/health.ts` con la implementación de /health y un test asociado en `tests/integration/health.test.ts`.

11. Crear `.env.example` con TODAS las vars listadas en CLAUDE.md (sección "Variables de entorno"). Crear también `.env` (gitignored) y `.env.test` (con INTEGRATION_MODE=stub).

12. **Crear `Dockerfile`** multi-stage:
    - Stage `builder`: node:20-slim + apt-get curl ca-certificates + npm ci + npm run build
    - Stage `runtime`: node:20-slim + apt-get curl + COPY --from=builder de /app/dist y node_modules + USER node + EXPOSE 5000 + HEALTHCHECK con curl localhost:5000/health + CMD ["node", "dist/server.js"]

13. **Crear `docker-compose.yml`** (dev mode):
    ```yaml
    services:
      app:
        build:
          context: .
          target: builder              # En dev usamos el stage builder para tener tsx
        command: npm run dev
        ports:
          - "${PORT:-5000}:5000"
        volumes:
          - db-data:/data
          - ./app:/workspace/app
          - ./tests:/workspace/tests
          - ./scripts:/workspace/scripts
          - ./package.json:/workspace/package.json
          - ./tsconfig.json:/workspace/tsconfig.json
        working_dir: /workspace
        env_file: .env
        environment:
          DATABASE_PATH: /data/leads.db
        healthcheck:
          test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
          interval: 30s
          timeout: 10s
          retries: 3
        restart: unless-stopped
    volumes:
      db-data:
    ```

14. Crear `.dockerignore` con: .git, .env, node_modules, dist, *.db, docs/screenshots, resourses/, .vscode, .idea, coverage.

15. Crear `app/views/layouts/base.html.ts` (template Hono JSX o tagged-template) con HTML5, meta viewport, link a Tailwind CDN (placeholder hasta Fase 5), htmx CDN, slot principal.

16. Crear `README.md` con:
    - Descripción del proyecto (1 párrafo del PRD)
    - Cómo correr local: `cp .env.example .env`, `docker compose up --build`
    - Cómo correr tests: `docker compose exec app npm test`
    - Cómo correr migraciones: `docker compose exec app npm run db:migrate`
    - Cómo correr seed: `docker compose exec app npm run db:seed`
    - Estructura de carpetas (copiar de CLAUDE.md)
    - Variables de entorno documentadas (link a `.env.example`)
    - Cómo desplegar (placeholder hasta Fase 7)

17. Crear `.gitignore` con: node_modules/, dist/, .env, *.db, *.db-journal, coverage/, .vscode/, .DS_Store, *.log

18. Crear `docs/phases/README.md` con índice de las 8 fases (lista numerada con título, sin contenido).

19. Inicializar git, hacer commit inicial con mensaje "feat: initial project setup with Hono + TypeScript + Docker (Phase 0)".

TESTS OBLIGATORIOS (escribir y dejar verdes ANTES de cerrar la fase):
- `tests/integration/health.test.ts`: GET /health retorna 200 con shape esperada.
- `tests/integration/server-boot.test.ts`: el server arranca sin throw y se queda escuchando.
- `tests/unit/config.test.ts`: config se parsea bien con .env.test; falta de SESSION_SECRET en NODE_ENV=production lanza error.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `docker compose up --build` levanta el server sin errores.
- `curl localhost:5000/health` retorna `{"status":"ok","integration_mode":"stub"}` con HTTP 200.
- `docker compose exec app npm test` retorna exit code 0 con todos los tests verdes.
- `docker compose down && docker compose up` mantiene el volumen `db-data` (verificar con `docker volume ls`).
- CLAUDE.md ya está en la raíz (no se modifica en esta fase).

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 1 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites el test, no lo skipees, no lo marques skip/todo) y volvé a correr la suite hasta que toda pase. Reportá explícitamente el resultado del último run antes de continuar.

NO HAGAS en esta fase: schema de DB, modelos, ingestion, UI compleja, llamadas a OpenRouter/SendGrid/ArboStar, auth real. Solo skeleton + Docker + health + tests de boot.
```

---

### FASE 1 — Database, Models, Migrations & Seed

```
Fase 1 del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md para contexto completo.

OBJETIVO:
Definir el schema completo con Drizzle ORM, generar migraciones, crear seed determinístico (8 leads sintéticos + FAQ inicial + zip-to-county lookup) y asegurar que toda query se hace dentro de transacciones cuando corresponde. Sin UI, sin HTTP routes nuevas.

TAREAS:

1. Crear `app/db/schema.ts` con TODOS los modelos definidos en CLAUDE.md sección "Modelo de Datos":

   - `leads` — todos los campos listados, con tipos correctos (text, integer/boolean as 0/1, real para confidence_score). PK = `id` TEXT (UUID v7). Índices en `dedup_phone_e164`, `status`, `received_at`, `source`.
   - `lead_source_events` — FK lead_id ON DELETE CASCADE. Índice en `lead_id`.
   - `outbound_messages` — FK lead_id. Índice en `lead_id`, `status`.
   - `faq_entries` — todos los campos. Índice en `category`, `active`.
   - `audit_log` — FK lead_id NULLable. Índice en `lead_id`, `created_at`.
   - `users` — PK `id`, UNIQUE en `email`. Índice en `email`.
   - `zip_code_to_county` — PK `zip` (5-digit TEXT). Índice en `county`, `region`.

2. Crear `app/lib/uuid.ts` con función `generateUuidV7(): string` (usar implementación inline o `uuid` v9+ con v7). Export también `now(): Date` y `nowIso(): string` para timestamps consistentes.

3. Crear `app/db/client.ts` que abre conexión better-sqlite3 al `config.DATABASE_PATH`, aplica PRAGMAs (`journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`), exporta `db` (Drizzle instance) y función `closeDb()` para tests.

4. Crear `scripts/migrate.ts` que corre `migrate()` de drizzle-orm/better-sqlite3/migrator apuntando a `app/db/migrations`.

5. Generar la primera migración con `npm run db:generate`. Verificar que el SQL generado crea todas las tablas e índices listados arriba.

6. Crear `scripts/seed.ts` que en una transacción:

   a) Inserta en `zip_code_to_county` los siguientes 14 counties de Ohio con AL MENOS 5 zips representativos por county (total ~70 filas). Usar lookup real de Ohio:
      - Northeast Ohio counties: Cuyahoga (44101, 44102, 44113, 44114, 44120…), Geauga (44021, 44023, 44024…), Lake (44060, 44077…), Lorain (44035, 44052…), Medina (44256, 44280…), Portage (44240, 44266…), Summit (44301, 44302, 44303, 44304, 44320…)
      - Central Ohio counties: Delaware (43015, 43017…), Fairfield (43130, 43147…), Franklin (43004, 43017, 43201, 43202…), Licking (43055, 43056…), Madison (43140…), Pickaway (43113…), Union (43040, 43064…)
      Marcar `region` = 'northeast_ohio' o 'central_ohio'.

   b) Inserta en `faq_entries` los 6 FAQ seed iniciales (basados en transcript y screenshot 197_36m50s.jpg):
      - Oak Season (category=oak_season): question "Can you trim my oak tree?" answer EXACTA del CLAUDE.md, keywords "oak,oak tree,trim oak,prune oak", priority 100, active 1.
      - Service Area (service_area): "Do you serve [county]?" answer enumerando NE Ohio + Central Ohio counties, keywords "service area,coverage,zip,location,where do you serve", priority 80.
      - Emergency (emergency): "I have an emergency / tree on house" answer "We provide 24/7 emergency tree service. Please call us immediately at (216) 245-8908 (Cleveland) or (614) 526-2266 (Columbus).", keywords "emergency,fell on,storm,urgent", priority 95.
      - Credentials (credentials): "Are you certified/insured?" answer "Yes — Premier Tree Specialists employs ISA-certified arborists with 80+ years of combined experience and full insurance coverage.", keywords "certified,insured,credentials,license,arborist", priority 70.
      - Scheduling (scheduling): "When can you come?" answer "Once we receive your inquiry, our team will reach out shortly to schedule a complimentary estimate at a time that works for you.", keywords "schedule,appointment,when,availability", priority 60.
      - Service Types (service_types): "What services do you offer?" answer enumerando trimming, pruning, removal, stump grinding, plant health care, ISA arborist consultations, keywords "services,offer,trim,remove,grind,prune", priority 50.

   c) Inserta en `leads` y `lead_source_events` 8 leads sintéticos realistas (datos derivados del PRD líneas 86-92 y screenshot 113_27m02s.jpg). Para cada lead, crear primero el row en `lead_source_events` con el raw_payload, después el row en `leads` con los campos extraídos pre-populados (simula que ya pasaron por extraction). Usar nombres reales del screenshot 113: Diane Owens, Barbara Wells, Marilyn Hornig, Sharon Kobal, Logan Davis, etc. Mix de fuentes, ciudades, scopes:
      1. Google LSA email — Diane Owens, (216) 555-0001, Cleveland 44113, "I have a big oak tree that I would like to have looked at. It will probably need trimming and I need quote", scope_category=trimming, status=ingested.
      2. Website Form — Barbara Wells, (440) 555-0002, bwells@example.com, Bedford Heights 44146, "Need quote for tree removal in front yard", scope_category=removal, status=extracted, confidence 0.92.
      3. AnswerForce email — Marilyn Hornig, (440) 555-0003, Rocky River 44116, "After-hours call: Need emergency tree removal — large oak limb fell on roof during storm last night", scope_category=emergency, status=awaiting_review (escalation triggered).
      4. Google LSA — Sharon Kobal, (440) 555-0004, Parma Heights 44130, "Stump grinding — 3 stumps in backyard", scope_category=stump_grinding, status=auto_sent, confidence 0.88.
      5. Website Form — Logan Davis, (440) 555-0005, ldavis@example.com, Brunswick 44212, "Plant health care consultation for sick maple", scope_category=plant_health, status=extracted, confidence 0.75 (review queue).
      6. Google LSA — caller con phone (561) 555-0006 (out-of-service-area zip Florida 33101), "Tree trimming Miami", scope_category=trimming, out_of_service_area=1, status=manually_flagged.
      7. AnswerForce email — Charlie StLouis, (440) 555-0007, Strongsville 44136, "Called for arborist consultation", scope_category=consultation, status=auto_sent.
      8. Website Form — sin email ni phone completo, solo "Quote please" — datos faltantes — confidence 0.30 — status=manually_flagged.

   d) Inserta en `users` 1 usuario admin seed: email "matt@premiertreesllc.com", password "ChangeMe123!" (hashear con bcrypt cost 10), role admin, display_name "Matt Ostrowski".

   e) Inserta en `audit_log` un evento por lead: action='ingested', actor='system'.

   El seed debe ser **idempotente**: si ya hay datos, hacer DELETE primero (en orden inverso de FK) y volver a insertar. Logear "seeded N leads, M faq entries, K zips" al final.

7. Tests:
   - `tests/unit/uuid.test.ts`: `generateUuidV7` produce strings de 36 chars con guiones, son ordenables lexicográficamente por tiempo (generar 1000, sortear, verificar orden).
   - `tests/unit/db-schema.test.ts`: abre BD en memoria, aplica migraciones, verifica que `sqlite_master` lista TODAS las 7 tablas + índices esperados.
   - `tests/integration/seed.test.ts`: corre seed dos veces (idempotencia); valida conteos exactos: 8 leads, 6 faq_entries, ≥70 zip rows, 1 user, 8 source_events, ≥8 audit logs.
   - `tests/integration/foreign-keys.test.ts`: insertar lead, insertar event con FK; borrar lead → verificar que el event se borró por CASCADE; intentar insertar event con lead_id inexistente → debe fallar.
   - `tests/integration/seed-data-shape.test.ts`: query a leads, validar que el lead 1 (Diane Owens) tiene scope_category='trimming' y city='Cleveland'; validar que el lead 6 tiene out_of_service_area=1; validar que el lead 3 tiene escalation_triggered=1.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `docker compose exec app npm run db:migrate` aplica las migraciones sin error sobre BD limpia.
- `docker compose exec app npm run db:seed` corre verde dos veces seguidas.
- `docker compose exec app sqlite3 /data/leads.db "SELECT count(*) FROM leads"` retorna 8.
- `docker compose exec app sqlite3 /data/leads.db "SELECT count(*) FROM faq_entries"` retorna 6.
- La suite de tests retorna exit code 0 con 100% de los tests pasando.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 2 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites el test, no lo skipees) y volvé a correr la suite hasta que toda pase. Reportá explícitamente el resultado del último run antes de continuar.

NO HAGAS en esta fase: HTTP routes para ingest (eso es Fase 2), llamadas a LLM (Fase 3), UI (Fase 5), envíos reales. Solo schema, migraciones, seed y tests de DB.
```

---

### FASE 2 — Inbound Ingestion (3 sources) + Deduplication

```
Fase 2 del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md para contexto completo.

OBJETIVO:
Implementar los 3 puntos de entrada de leads (Google LSA email, Website Form webhook, AnswerForce email), normalizar phone a E.164, y dedupear por phone con ventana de 30 minutos. Ningún LLM todavía: el lead se persiste con scope_raw + payload crudo y status='ingested'. Toda integración corre en INTEGRATION_MODE=stub: el "email poller" se reemplaza por un endpoint HTTP que recibe payloads simulados.

TAREAS:

1. Crear `app/lib/e164.ts` con:
   - `normalizeToE164(phone: string, defaultCountry = 'US'): string | null` — limpia separadores, agrega +1 si tiene 10 dígitos US, valida largo. Retorna null si no parseable.
   - `formatForDisplay(e164: string): string` — convierte +12162458908 → (216) 245-8908.
   - Tests unitarios cubriendo: "(216) 245-8908", "216-245-8908", "2162458908", "+12162458908", "1-216-245-8908", inputs basura ("abc", "", null), números cortos.

2. Crear `app/lib/zip-lookup.ts` con función `lookupCounty(zip: string): { county: string, region: 'northeast_ohio' | 'central_ohio' } | null` que consulta `zip_code_to_county`. Cachear en memoria al arrancar.

3. Crear `app/services/dedup.service.ts` con función `findOrCreateLead(input: { phone: string | null, source: SourceEnum, receivedAt: Date }): Promise<{ leadId: string, isNew: boolean }>`:
   - Si phone es null → siempre crear nuevo lead (no se puede dedupear).
   - Si phone existe → buscar lead existente con `dedup_phone_e164 = phone` AND `received_at >= now() - 30 min`. Si encontrado, retornar su id con isNew=false. Si no, crear nuevo.
   - Toda operación dentro de transacción para evitar race conditions.

4. Crear `app/services/lsa-email-parser.service.ts`:
   - Función `parseLsaEmail(rawEmailMime: string): LsaParsedLead | null`.
   - Extraer del cuerpo del email Google LSA: customer name, phone, location, business category, service type, message text. Usar regex simple sobre el formato conocido (referencia: screenshot 197_36m50s.jpg muestra el formato del Lead Summary card; los emails de Google LSA replican esos campos en text).
   - Retornar shape: `{ name?, phone?, location?, scope_raw, raw_email_body }`.
   - Si el email no parece ser de LSA (subject no matchea), retornar null.

5. Crear `app/services/answerforce-email-parser.service.ts`:
   - Función `parseAnswerforceEmail(rawEmailMime: string): AnswerforceParsedLead | null`.
   - Formato AnswerForce (referencia screenshot 180_34m40s.jpg): "Call at [time], From [phone], Customer name [X], Location [Y], Message Taken: [Z], Call outcome: [hung up | message]".
   - Mismo shape de salida que LSA parser.

6. Crear `app/routes/api/intake.ts` con 3 endpoints (todos POST application/json o text/plain según corresponda):

   a) `POST /api/intake/lsa-email` — body: `{ raw_email: string }`. Llama parser, valida que parseó algo, normaliza phone, llama dedup, persiste source_event con raw_payload, populate `leads.scope_raw`, status='ingested'. Audit log "ingested via google_lsa_email". Retorna 201 con `{ lead_id, is_new }`.

   b) `POST /api/intake/answerforce-email` — análogo a (a) pero para AnswerForce.

   c) `POST /api/intake/website-form` — body JSON con shape: `{ name: string, email: string, phone: string, zip: string, service_type: string, message?: string, secret: string }`. Validar `secret === config.WEBSITE_FORM_WEBHOOK_SECRET` (responder 401 si no matchea). Sin parser: el payload ya viene estructurado. Persistir directo populate name/phone/email/zip/scope_raw, lookup county vía zip-lookup, status='ingested'. Audit log "ingested via website_form".

7. Para cada endpoint:
   - Rate limit simple (token bucket en memoria, 60 reqs/min por IP) en `app/middleware/rate-limit.ts`.
   - Validar shape del body con Zod; responder 400 con error structured si inválido.
   - Errores no-controlados → 500, logear con pino, NO leak stacktrace al cliente.

8. Crear `app/services/intake-replay.service.ts` con función `replayFixture(name: string)` que lee un fixture de `tests/fixtures/inbound/` y lo POSTea al endpoint correspondiente. Usado por tests y por un script CLI:

9. Crear `scripts/replay-fixture.ts` que toma argv `[fixture-name]` y llama a replayFixture. Útil para demo manual del cliente: `docker compose exec app npx tsx scripts/replay-fixture.ts lsa-oak-trim`.

10. Crear fixtures en `tests/fixtures/inbound/`:
    - `lsa-oak-trim.txt` — email Google LSA crudo simulando Diane Owens preguntando por oak trimming en Cleveland.
    - `lsa-removal-large-tree.txt` — email Google LSA simulando customer en Solon pidiendo tree removal grande.
    - `lsa-no-phone.txt` — email LSA donde el phone no fue capturado (edge case).
    - `answerforce-emergency.txt` — email AnswerForce simulando Marilyn Hornig llamada after-hours por tree-on-roof.
    - `answerforce-cleveland.txt` — email AnswerForce simulando call de John Stepanek pidiendo info.
    - `website-form-quote.json` — payload JSON website form completo (Barbara Wells, all fields).
    - `website-form-missing-email.json` — payload sin email (edge case).
    - `website-form-out-of-area.json` — zip 33101 (Florida, fuera de service area).

TESTS OBLIGATORIOS (escribir y dejar verdes):
- `tests/unit/e164.test.ts`: ya cubierto en tarea 1.
- `tests/unit/zip-lookup.test.ts`: lookups conocidos retornan county/region correcto; zip desconocido (33101) retorna null.
- `tests/unit/lsa-parser.test.ts`: parsea cada fixture LSA correctamente; retorna null para email basura.
- `tests/unit/answerforce-parser.test.ts`: parsea cada fixture AnswerForce correctamente.
- `tests/unit/dedup.test.ts`:
  - dos leads con mismo phone dentro de 30 min → mismo leadId, isNew false en el segundo.
  - dos leads con mismo phone separados por 31 min → leadIds distintos.
  - phone null → siempre crea lead nuevo.
- `tests/integration/intake-lsa.test.ts`: POST /api/intake/lsa-email con cada fixture LSA → retorna 201, persiste lead + source_event con raw_payload completo.
- `tests/integration/intake-answerforce.test.ts`: análogo.
- `tests/integration/intake-website-form.test.ts`:
  - Happy path: 201, lead persistido con todos los campos, county lookup correcto.
  - Secret incorrecto → 401, lead NO persistido.
  - Body shape inválido → 400, error estructurado.
  - Zip out-of-service-area → lead persiste con out_of_service_area=1.
- `tests/integration/dedup-cross-source.test.ts`: POST website-form con phone X, después POST lsa-email con mismo phone dentro de 30 min → un solo lead con 2 source_events.
- `tests/integration/rate-limit.test.ts`: 70 reqs en 1 minuto → últimos 10 rechazados con 429.

Comando para correr la suite (siempre dentro de Docker):
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `docker compose exec app npx tsx scripts/replay-fixture.ts lsa-oak-trim` crea un nuevo lead en BD; query `SELECT count(*) FROM leads` aumenta en 1.
- `docker compose exec app npx tsx scripts/replay-fixture.ts website-form-quote` lo mismo.
- Llamar el mismo fixture website-form 2 veces dentro de 30 min → un solo lead con 2 source_events.
- La suite retorna exit code 0 al 100%.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 3 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Si algún test falla, ARREGLA EL CÓDIGO (no debilites el test, no lo skipees) y volvé a correr la suite hasta que toda pase. Reportá explícitamente el resultado del último run antes de continuar.

NO HAGAS en esta fase: extraction con LLM (Fase 3), generación de respuesta (Fase 4), UI dashboard (Fase 5), envíos outbound (Fase 6). Solo ingestion + dedup + tests.
```

---

### FASE 3 — LLM Extraction, Service-Area Validation & Scope Categorization

```
Fase 3 del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md — las reglas de extraction y service-area son críticas.

OBJETIVO:
Pipeline que toma un lead con status='ingested' y produce datos estructurados (name, phone, email, address, city, zip, county, region, scope_category, scope_summary) usando LLM lightweight + zip lookup. Output incluye un confidence_score parcial sobre completitud de datos. Status pasa a 'extracted' (o 'manually_flagged' si datos críticos faltan). Sin generación de respuesta todavía: la respuesta es Fase 4.

TAREAS:

1. Crear `app/clients/openrouter.client.ts` con interface `OpenRouterClient`:
   - `complete(params: { model: string, system: string, user: string, jsonSchema?: object, maxTokens?: number }): Promise<{ content: string, parsedJson?: any }>`.
   - Implementación `OpenRouterLiveClient` usa fetch a `${OPENROUTER_BASE_URL}/chat/completions` con auth bearer; soporta structured outputs vía response_format.
   - Implementación `OpenRouterStubClient` retorna respuestas determinísticas leídas de `tests/fixtures/llm/`. El stub lee el `user` prompt, calcula un hash, y matchea contra un mapping fixture. Si no matchea, retorna un objeto fake genérico.
   - Factory `createOpenRouterClient(config): OpenRouterClient` switch según `INTEGRATION_MODE`.
   - Toda llamada live debe tener timeout (30s) y retry con exponential backoff (3 intentos, 1s/3s/9s).

2. Crear `app/services/extraction.service.ts` con `extractLeadData(leadId: string): Promise<ExtractionResult>`:
   - Lee el lead de BD (debe estar status='ingested').
   - Construye prompt al LLM con:
     - System: "You are a data extraction assistant for a tree care company in Ohio. Extract structured fields from inbound customer inquiries. Be conservative — return null for any field you can't confidently extract."
     - User: el `scope_raw` del lead + cualquier dato ya conocido del source event (phone, name si vienen del form).
     - JSON schema esperado: `{ name?, phone?, email?, address?, city?, state?, zip?, scope_summary, scope_category: enum, missing_critical_fields: string[] }`.
   - Llama al cliente OpenRouter.
   - Normaliza phone a E.164 vía e164.ts si el LLM retornó algo.
   - Si zip presente → lookup county/region.
   - Calcula `data_completeness` (0.0-1.0): 1.0 si name+phone+address+scope completos; baja proporcionalmente por cada faltante. Persistir en `leads.confidence_score` como score parcial (la confianza FINAL sale en Fase 4 combinando esta con FAQ match).
   - Si `phone is null AND email is null` → status='manually_flagged' con audit log "missing_critical_contact_info".
   - Si zip presente pero NO en zip_code_to_county → `out_of_service_area=1`, status sigue 'extracted' (manda a review queue por escalation rule, NO bloquear extraction).
   - Update lead con todos los campos extraídos. Audit log "extracted".

3. Crear `app/services/scope-categorizer.service.ts` con función pura `categorizeScope(scopeRaw: string): ScopeCategory`:
   - Usa keyword matching simple ANTES de tirar al LLM (fallback rápido y determinístico):
     - "remov" → removal
     - "trim", "prun" → trimming/pruning (preferir trimming si match)
     - "stump" → stump_grinding
     - "emerg", "fell on", "storm", "fallen" → emergency
     - "consult", "arborist" → consultation
     - "plant health", "sick", "disease", "fungus" → plant_health
     - sino → other
   - El service de extraction puede usar este como fallback si el LLM retorna `null` o categoría no válida.

4. Crear `app/services/extraction-batch.service.ts` con `processIngestedLeads(): Promise<BatchResult>`:
   - Query todos los leads con status='ingested', ORDER BY received_at ASC, LIMIT 50.
   - Por cada uno, llama a extractLeadData con manejo de error (si una falla, logear y seguir con la siguiente).
   - Retorna `{ processed, succeeded, failed, errors: [] }`.

5. Crear endpoint `POST /api/admin/extract-batch` que llama a processIngestedLeads. Auth: requiere header `X-Admin-Token: <SESSION_SECRET>` (placeholder hasta Fase 7 que tiene auth real). Útil para trigger manual desde demo.

6. Crear `scripts/extract-now.ts` CLI wrapper para `processIngestedLeads()`. Logear resultado por lead.

7. Crear fixtures LLM en `tests/fixtures/llm/`:
   - `extract-oak-trim-cleveland.json` (response del stub para el lead de Diane Owens)
   - `extract-removal-bedford-heights.json`
   - `extract-emergency-storm.json` (incluye `missing_critical_fields: []` y categoría emergency)
   - `extract-out-of-area-florida.json` (zip Florida)
   - `extract-incomplete-website-form.json` (todos los fields null excepto scope_summary)

TESTS OBLIGATORIOS:
- `tests/unit/scope-categorizer.test.ts`: keyword matching para los 7 valores enum + edge cases (texto vacío, mixed keywords como "trim and remove" → trimming wins por priority).
- `tests/unit/openrouter-client.test.ts`: stub retorna fixture matcheado; live client (mockear fetch) maneja 429 con retry y 500 con retry; 401 NO reintenta (auth fatal).
- `tests/integration/extraction.test.ts` (correr con INTEGRATION_MODE=stub):
  - Lead "Diane Owens oak trim" → extraction llena name, phone E.164, city, county='Cuyahoga', region='northeast_ohio', scope_category='trimming', status='extracted'.
  - Lead "emergency storm" → escalation_triggered=1, status='extracted' pero el siguiente service de routing (Fase 4) lo va a meter a review.
  - Lead "Florida 33101" → out_of_service_area=1.
  - Lead "incomplete website form sin phone ni email" → status='manually_flagged', audit log entry creada.
  - Lead que ya está status != 'ingested' → extraction NO lo reprocesa (idempotencia).
- `tests/integration/extract-batch.test.ts`: seed 5 leads ingested, llamar processIngestedLeads, verificar que 5 quedan en status='extracted' o 'manually_flagged'.

Comando:
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- Después de `npm run db:seed`, los 8 leads están en sus status definidos por el seed (no se reextrae los que ya están en estado posterior).
- `docker compose exec app npx tsx scripts/replay-fixture.ts lsa-oak-trim` + `npx tsx scripts/extract-now.ts` → el lead nuevo pasa de 'ingested' a 'extracted' con datos estructurados completos.
- La suite retorna exit code 0 al 100%.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 4 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Reportá explícitamente el resultado del último run antes de continuar.

NO HAGAS en esta fase: generación de respuesta (Fase 4), routing por confianza FINAL (Fase 4), UI (Fase 5), envíos (Fase 6). Solo extraction + categorización + service-area.
```

---

### FASE 4 — FAQ-Based Response Generation, Confidence Routing & Escalation

```
Fase 4 del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md — las reglas de Confidence Routing, Escalation Keywords y Oak Season son CRÍTICAS y no admiten error.

OBJETIVO:
Tomar un lead con status='extracted', construir un prompt que combina extracted data + FAQ knowledge base + tone guidelines + escalation rules, llamar al SoTA model vía OpenRouter, recibir response_text + confidence_score + escalation_flag, y rutear el lead según las reglas:
- ≥0.80 + sin escalation + sin out_of_service_area → status='auto_sent' (sin enviar todavía; eso es Fase 6) y dejar listo para outbound.
- 0.50-0.79 OR out_of_service_area → status='awaiting_review'.
- <0.50 OR escalation triggered → status='manually_flagged' (sin response_text generado).

TAREAS:

1. Crear `app/services/escalation-detector.service.ts` con función pura `detectEscalation(scopeRaw: string): { triggered: boolean, reason?: string, matchedKeywords: string[] }`:
   - Keywords (case-insensitive, word-boundary regex) según CLAUDE.md sección "Escalation Keywords":
     - emergency, "tree on house", "tree on car", "tree on roof"
     - lawsuit, attorney, lawyer, "legal action"
     - complaint, refund, unhappy, dissatisfied, "bad experience"
     - urgent + (today | within \d+ hours) → match combinado
   - Retorna lista de matched keywords + reason humano-legible.

2. Crear `app/services/faq-matcher.service.ts` con `findRelevantFaqs(scopeRaw: string, scopeCategory: string): FaqEntry[]`:
   - Score cada FAQ entry: por cada keyword del FAQ presente en `scopeRaw` (case-insensitive), +1; si la category del FAQ matchea `scopeCategory`, +5.
   - Retorna top 3 FAQ entries con score >0, ordenados por score DESC.

3. Crear `app/services/response-generator.service.ts` con `generateResponse(leadId: string): Promise<ResponseGenerationResult>`:
   - Lee lead (debe estar status='extracted').
   - Llama escalation-detector. Si triggered → set escalation_triggered=1, escalation_reason, status='manually_flagged' (sin generar respuesta), audit log, return early.
   - Llama faq-matcher para encontrar FAQs relevantes.
   - Construye prompt al SoTA LLM:
     - System: "You are a customer-service agent for Premier Tree Specialists, a residential and commercial tree care company in Cleveland and Columbus, Ohio. Your goal is to send a helpful, knowledgeable, professional first response to inquiries — sounding like an ISA-certified arborist, not a chatbot. NEVER promise scheduling — always say the team will call to schedule. NEVER mention pricing in dollars — say 'we'll provide a free estimate'. ALWAYS mention ISA-certified arborist credentials when relevant. Sign off as 'Premier Tree Specialists Team'. If you cannot confidently respond, set confidence below 0.5."
     - User: structured prompt con (a) lead extracted data, (b) FAQ entries relevantes (full Q+A text), (c) instrucción de retornar JSON con response_text + confidence (0.0-1.0) + confidence_reasoning + escalation_recheck (por si LLM detecta algo que el regex no agarró).
     - JSON schema strict via response_format.
   - Si LLM falla 3 veces (timeouts/errors) → status='manually_flagged' con reason='llm_unavailable'.
   - Combina confidence: `final_confidence = llm_confidence * data_completeness` (data_completeness ya está en `leads.confidence_score` desde Fase 3).
   - Aplica routing rules según CLAUDE.md:
     - escalation_recheck=true → manually_flagged (sin response).
     - out_of_service_area=1 → awaiting_review (con response generado para que humano lo edite).
     - final_confidence >= CONFIDENCE_AUTO_SEND_THRESHOLD → status='auto_sent' (NOTA: NO se envía todavía, solo se marca listo. Fase 6 hace el envío real).
     - final_confidence >= CONFIDENCE_DRAFT_THRESHOLD → status='awaiting_review'.
     - final_confidence < CONFIDENCE_DRAFT_THRESHOLD → status='manually_flagged' (sin response).
   - Persistir response_text, confidence_score (final), confidence_reasoning, status. Audit log "response_generated" + "routed_<status>".

4. Crear `app/services/response-batch.service.ts` con `processExtractedLeads()`: análogo a Fase 3, batch process de leads en status='extracted'.

5. Crear endpoint `POST /api/admin/generate-responses` que llama processExtractedLeads. Mismo header X-Admin-Token.

6. Crear `scripts/generate-now.ts` CLI wrapper.

7. Crear fixtures LLM `tests/fixtures/llm/`:
   - `response-oak-trim-high-confidence.json` — confidence 0.92, response usa la oak season canonical answer.
   - `response-removal-medium-confidence.json` — confidence 0.65 (review queue).
   - `response-low-confidence.json` — confidence 0.35 (manual flag).
   - `response-out-of-area-with-text.json` — confidence 0.85 pero out_of_service_area trigger override.

TESTS OBLIGATORIOS:
- `tests/unit/escalation-detector.test.ts`:
  - "tree fell on my roof" → triggered, matches "tree on roof".
  - "I'm filing a lawsuit" → triggered, matches "lawsuit".
  - "EMERGENCY EMERGENCY" → triggered (case-insensitive).
  - "I had a tree trimmed" → NOT triggered (no escalation keywords).
  - "urgent within 2 hours" → triggered.
  - "urgent" solo (sin timeframe) → NOT triggered.
- `tests/unit/faq-matcher.test.ts`:
  - "I have an oak tree to trim" → top FAQ es Oak Season.
  - "what's your service area" → top FAQ es Service Area.
  - "removal of a maple" → top FAQ matches Service Types o por category.
  - Texto random → retorna top 3 con scores positivos o lista vacía.
- `tests/integration/response-generator.test.ts` (INTEGRATION_MODE=stub):
  - Oak trim Cleveland (extracted data complete) → final_confidence ≥ 0.80, status='auto_sent', response contiene "Oak season is currently closed until November".
  - Tree on roof emergency → status='manually_flagged', escalation_reason mentioning 'tree on roof', response_text=NULL.
  - Plant health medium → status='awaiting_review', response_text presente.
  - Florida out-of-area → status='awaiting_review' independiente de la confidence (override).
  - Lead con final_confidence < 0.50 → status='manually_flagged', response_text=NULL.
  - LLM stub configurado para fallar 3 veces → status='manually_flagged', reason='llm_unavailable'.
- `tests/integration/response-batch.test.ts`: 5 leads en status='extracted' → batch los rutea correctamente según sus fixtures.
- `tests/integration/end-to-end-pipeline.test.ts`: replay fixture LSA → extract-batch → generate-responses → lead final está en status correcto con todos los fields populados.

Comando:
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- Replay fixture LSA oak trim → extract → generate → lead queda en status='auto_sent' con response que incluye oak season verbiage.
- Replay fixture answerforce-emergency → extract → generate → status='manually_flagged' con escalation_reason populated.
- La suite retorna exit code 0 al 100%.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 5 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Reportá explícitamente el resultado del último run antes de continuar.

NO HAGAS en esta fase: UI (Fase 5), envío real de email/SMS (Fase 6), push a ArboStar (Fase 6), auth (Fase 7). Solo lógica de generación + routing + tests.
```

---

### FASE 5 — Unified Dashboard UI (htmx + Tailwind)

```
Fase 5 del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md sección "Especificaciones Visuales". Referencia visual: docs/screenshots/113_27m02s.jpg (LSA leads list, layout para inbox) y docs/screenshots/197_36m50s.jpg (LSA conversation detail, layout para detail view).

OBJETIVO:
Construir el dashboard web completo (server-rendered HTML + Tailwind + htmx) que permite al call team ver inbox unificado, abrir lead detail, editar extracted data, aprobar/editar/rechazar drafts en review queue, y triggear acciones manuales. Sin auth todavía (fake user fijo en `X-Demo-User: matt@premiertreesllc.com` para testing); auth real es Fase 7. Sin envío real (los botones de "Send" todavía solo loggean — eso es Fase 6).

TAREAS:

1. Setup Tailwind:
   - Agregar `@tailwindcss/cli` a devDependencies.
   - Crear `app/views/styles/input.css` con `@tailwind base; @tailwind components; @tailwind utilities;` + custom CSS variables para brand colors (CLAUDE.md sección color palette).
   - Crear `tailwind.config.js` apuntando a `app/views/**/*.{html,ts,tsx}`.
   - Agregar script `npm run build:css`: `tailwindcss -i app/views/styles/input.css -o public/styles.css --minify`.
   - Agregar build de CSS al Dockerfile (stage builder corre `npm run build:css`).
   - Mount `public/` como static en Hono via `serveStatic`.

2. Layouts y partials (en `app/views/`):
   - `layouts/base.html.ts` (template literal o JSX-Hono): HTML5 doctype, meta viewport, title placeholder, link a /styles.css, htmx CDN script (`https://unpkg.com/htmx.org@2`), header con logo "Premier Tree Specialists" + nav (Dashboard, Queue, Stats), main slot.
   - `partials/lead-row.html.ts`: una fila de tabla del inbox (re-usable, htmx-friendly para swap-OOB).
   - `partials/status-badge.html.ts`: badge component según status.
   - `partials/confidence-badge.html.ts`: badge según rango de confidence.
   - `partials/empty-state.html.ts`: ilustración + texto.

3. Rutas en `app/routes/dashboard.ts`:
   - `GET /` → redirect a `/dashboard`.
   - `GET /dashboard` → render `pages/dashboard.html.ts` con tabla de leads. Query params: `source`, `status`, `from`, `to`. Default: últimos 7 días, todos los status. Server-side pagination (20 por página).
   - `GET /dashboard/leads-table` → solo el partial de la tabla, para htmx-driven filter changes.

4. Rutas en `app/routes/leads.ts`:
   - `GET /leads/:id` → render `pages/lead-detail.html.ts` con todas las cards (Lead Summary, Extracted Data, Generated Response, Audit Trail accordion, Original Payload accordion).
   - `PATCH /leads/:id/extracted-data` (form encoded; htmx hx-patch) → actualiza customer_name/phone/email/address/city/zip; recalcula county lookup; audit log "manually_edited_extracted_data". Retorna partial actualizada.
   - `POST /leads/:id/approve` → marca status='manually_sent' (Fase 6 ya enviará realmente; en esta fase solo marcamos y agregamos audit log "approved_by_<user>"). Retorna partial actualizada.
   - `POST /leads/:id/reject` → status='manually_flagged', audit log "rejected_by_<user> with optional note". Retorna partial.
   - `POST /leads/:id/edit-and-send` → body con new response_text; valida 1-5000 chars; actualiza response_text, status='manually_sent', audit log "edited_and_sent_by_<user>".
   - `POST /leads/:id/regenerate-response` → vuelve a llamar response-generator service. Útil si humano edita extracted data y quiere nuevo draft.

5. Rutas en `app/routes/queue.ts`:
   - `GET /queue` → render `pages/queue.html.ts`: solo leads con status='awaiting_review' OR status='manually_flagged' (los manually_flagged necesitan más esfuerzo humano). Sort: por received_at ASC. Banner top con conteo + "average wait time".

6. Ruta placeholder `app/routes/stats.ts`:
   - `GET /stats` → render `pages/stats.html.ts` con placeholder "Stats coming in Phase 7" (la implementación real es Fase 7). Los KPIs aparecen vacíos. Esto evita 404 en nav.

7. Helpers de view:
   - `app/lib/format.ts`: `formatPhone(e164)`, `formatDateET(iso)` (timezone America/New_York), `formatTimeAgo(iso)` ("3 minutes ago"), `truncate(str, n)`.
   - `app/middleware/demo-user.ts`: middleware que lee `X-Demo-User` header (si existe) o usa default 'matt@premiertreesllc.com', popula `c.set('user', userRow)`. Reemplazado por session-based auth en Fase 7.

8. Estilo / UX detalles:
   - Inbox table: hover highlight, click anywhere on row → abre detail (htmx hx-get hx-target=closest body hx-push-url=true).
   - Filter chips: htmx hx-get a `/dashboard/leads-table` con query params nuevos, hx-target table body.
   - Detail view: forms con htmx, mensajes flash en top via toast div (hx-swap-oob).
   - Loading states: htmx-indicator class con spinner CSS-only.
   - Empty states con ilustración SVG inline.
   - Mobile-responsive: tabla colapsa a cards en <768px.

9. Tests:
   - `tests/integration/dashboard-routes.test.ts`:
     - GET /dashboard retorna 200 con HTML que contiene "Premier Tree Specialists" y al menos 1 row de lead seed.
     - GET /dashboard?source=google_lsa_email retorna solo leads de esa fuente.
     - GET /dashboard?status=auto_sent retorna solo auto-sent.
     - GET /dashboard/leads-table (htmx partial) retorna solo el `<tbody>` HTML, sin layout completo.
   - `tests/integration/lead-detail-routes.test.ts`:
     - GET /leads/:id de un lead que existe → 200 con response_text visible.
     - GET /leads/:id de uno inexistente → 404 con error page.
     - PATCH /leads/:id/extracted-data con form data nueva → DB actualizada, audit log creada.
     - POST /leads/:id/approve sobre un lead awaiting_review → status='manually_sent', audit log "approved_by_matt".
     - POST /leads/:id/reject sobre un lead awaiting_review → status='manually_flagged' + audit log.
     - POST /leads/:id/edit-and-send sobre un lead awaiting_review con new text → response_text actualizado, audit log "edited_and_sent_by_matt".
     - POST /leads/:id/regenerate-response → llama al stub LLM, vuelve a generar response.
   - `tests/integration/queue-routes.test.ts`: GET /queue retorna solo leads en awaiting_review/manually_flagged; banner muestra el conteo correcto.
   - `tests/unit/format.test.ts`: formatters dan output correcto para casos típicos y edge cases.
   - Smoke test E2E (sin browser real, solo HTTP): seed → GET /dashboard → click PATCH extracted → POST approve → verificar status final.

Comando:
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- `docker compose up --build` levanta. Abrir `http://localhost:5000/dashboard` muestra los 8 leads seed con badges, filtros, layout limpio que matchea la referencia del screenshot 113.
- Click en un lead → abre detail view que matchea la estructura de screenshot 197 (Lead Summary + Extracted Data + Conversation/Response).
- Filter por "Awaiting Review" → muestra solo los leads en review queue.
- Editar extracted data + Save → DB actualizada, página recarga vía htmx.
- Approve sobre un lead awaiting_review → status pasa a manually_sent (en BD), audit trail agrega entrada.
- La suite retorna exit code 0 al 100%.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 6 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Adicionalmente, validar manualmente el flujo en el browser y confirmar visualmente que el inbox y detail view coinciden con los screenshots de referencia. Reportá explícitamente ambas validaciones antes de continuar.

NO HAGAS en esta fase: envío real de email/SMS (Fase 6), push real a ArboStar (Fase 6), session-based auth (Fase 7), stats reales (Fase 7), polish final / responsive deep dive (Fase 7). Solo UI funcional con stubs de envío.
```

---

### FASE 6 — Dual-Channel Outreach (Email + SMS/iMessage) + ArboStar Push

```
Fase 6 del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md secciones "Dual-Channel Outreach" y "ArboStar Push Timing".

OBJETIVO:
Implementar los clientes outbound (SendGrid email, Agent Phone SMS/iMessage, ArboStar API) con adapter pattern (Live + Stub). Implementar el outbound dispatcher que toma leads en status='auto_sent' o 'manually_sent' y dispara el dual-channel send + ArboStar push, con retry/backoff y audit trail completo. Toda la fase corre en INTEGRATION_MODE=stub por default; el switch a live se prueba con creds reales en Fase 7.

TAREAS:

1. Crear `app/clients/sendgrid.client.ts`:
   - Interface `EmailClient.send(params: { to: string, subject: string, html: string, text: string }): Promise<{ providerMessageId: string }>`.
   - `SendGridLiveClient`: POST a `https://api.sendgrid.com/v3/mail/send` con auth, payload con personalizations + content multipart. Maneja 429/5xx con retry; 4xx fatal sin retry.
   - `SendGridStubClient`: persiste el envío en una tabla in-memory (o `tmp/stub-emails.jsonl`) y retorna ID fake `stub_<uuid>`.

2. Crear `app/clients/agent-phone.client.ts`:
   - Interface `SmsClient.send(params: { to: string, body: string, useImessage?: boolean }): Promise<{ providerMessageId: string }>`.
   - `AgentPhoneLiveClient`: POST a Agent Phone API endpoint (placeholder URL — confirmar con cliente; PRD post-review menciona Agent Phone como preferred).
   - `TwilioLiveClient` (alternativa): POST a Twilio Messages API con account SID + auth token. Switch via `config.SMS_PROVIDER`.
   - `SmsStubClient`: log a `tmp/stub-sms.jsonl`, return fake ID.
   - Soportar flag iMessage si `config.ENABLE_IMESSAGE=true` (incluye en payload Agent Phone con campo `channel: 'imessage'`).

3. Crear `app/clients/arbostar.client.ts`:
   - Interface `ArboStarClient.createRequest(params: ArboStarLeadPayload): Promise<{ requestId: string }>`.
   - `ArboStarLiveClient`: POST a `https://${config.ARBOSTAR_COMPANY_ID}.arbostar.com/api/requests/create` con header Authorization Bearer ${config.ARBOSTAR_API_KEY}. Field mapping según CLAUDE.md sección "ArboStar Push Timing".
   - Retry con exponential backoff (1s, 5s, 30s, 5min) ante 5xx/network. 4xx sin retry.
   - `ArboStarStubClient`: persiste el call en `tmp/stub-arbostar.jsonl`, retorna fake `requestId='stub_arbostar_<uuid>'`.

4. Crear `app/services/email-template.service.ts` con `renderLeadResponseEmail(lead, responseText): { subject, html, text }`:
   - Subject: `Re: Your inquiry — Premier Tree Specialists`.
   - Body HTML: greeting con first name si disponible, response_text formateado, signature con phones (216-245-8908 Cleveland, 614-526-2266 Columbus), website link (placeholder), ISA-certified arborist disclaimer.
   - Versión text plain también (multipart).
   - Premier Tree branded: header con logo placeholder (path /public/logo-placeholder.png hasta que cliente provea logo real).

5. Crear `app/services/email-validator.service.ts` con `validateEmailDeliverable(email: string): Promise<{ valid: boolean, reason?: string }>`:
   - Regex check.
   - DNS MX record lookup (usar Node `dns/promises`).
   - Reject obviously fake: test@test.com, no@email.com, a@a.com (lista negra inline).
   - Cache por 1h en memoria.

6. Crear `app/services/outbound-dispatcher.service.ts` con `dispatchLead(leadId: string): Promise<DispatchResult>`:
   - Lee lead. Debe estar status='auto_sent' o 'manually_sent', con response_text NOT NULL.
   - Verifica que NO se haya dispatcheado antes (check audit_log por action='dispatched_outbound' para este lead). Idempotencia.
   - Determina canal de reply según source (CLAUDE.md sección Dual-Channel Outreach):
     - google_lsa_email → email reply al customer email (si existe).
     - website_form → SMS/iMessage al phone.
     - answerforce_email → solo email follow-up (si email).
   - Determina si envía email follow-up (siempre que haya email válido).
   - Para CADA envío:
     - Crear row en `outbound_messages` con status='queued'.
     - Llamar al cliente correspondiente.
     - Update outbound_message status='sent' o 'failed' con providerMessageId / error_message.
     - Si email: validar deliverability primero; si falla, marca status='failed' con reason='undeliverable_email'.
   - Push a ArboStar DESPUÉS de que al menos UN canal exitoso (regla CLAUDE.md "ArboStar Push Timing"):
     - Si 0 canales exitosos → NO push a ArboStar; lead.status='failed', audit log.
     - Si ≥1 canal exitoso → push a ArboStar con field mapping. Persistir arbostar_request_id, arbostar_synced_at. Audit log.
     - Si ArboStar falla todos los retries → audit log "arbostar_sync_failed" pero no marcar lead failed (la respuesta sí salió).
   - Audit log "dispatched_outbound" al final con summary {emails_sent, sms_sent, arbostar_synced}.
   - Retorna `{ leadId, emailSent, smsSent, arboStarSynced, errors: [] }`.

7. Crear `app/services/outbound-batch.service.ts` con `dispatchPendingLeads()`:
   - Query leads en status='auto_sent' o 'manually_sent' SIN audit_log de "dispatched_outbound" todavía.
   - Por cada uno, llamar dispatchLead con manejo de error.

8. Endpoint `POST /api/admin/dispatch-batch` que llama dispatchPendingLeads. Mismo X-Admin-Token guard.

9. Endpoint `POST /leads/:id/dispatch-now` (UI button, htmx) que llama dispatchLead para un single lead.

10. Update UI Fase 5:
    - En lead detail view, si status='auto_sent' o 'manually_sent', mostrar card "Outbound Status" con lista de outbound_messages (channel, recipient, status, sent_at). Botón "Retry dispatch" si todos fallaron.
    - Mostrar arbostar_request_id si presente.

11. Crear `scripts/dispatch-now.ts` CLI wrapper.

12. Adicional: la regla "auto-send debería pasar por dispatch automáticamente". Crear hook después de response-generator (Fase 4): si status final = 'auto_sent', encolar dispatch automático (mismo proceso, solo llamar dispatchLead inline). Documentar que en Fase 7 esto se mueve a una BullMQ-like queue para escalar; en V1 es inline (Hono soporta async post-response).

TESTS OBLIGATORIOS:
- `tests/unit/email-template.test.ts`: render produce HTML + text con phones, signature, response_text dentro.
- `tests/unit/email-validator.test.ts`: regex válidos/inválidos; mocks DNS para MX presence; blacklist atrapa test@test.com.
- `tests/unit/sendgrid-client.test.ts`: stub graba; live client (mocked fetch) reintenta 429, no reintenta 401.
- `tests/unit/agent-phone-client.test.ts`: análogo.
- `tests/unit/arbostar-client.test.ts`: análogo + field mapping correcto (snapshot test del payload).
- `tests/integration/outbound-dispatcher.test.ts`:
  - Lead auto_sent con email + phone (Diane Owens) → dispatchLead manda 2 outbound_messages (email + sms), ambos status='sent'; ArboStar synced; audit log creada.
  - Lead website_form sin email válido → solo SMS sent; ArboStar synced; outbound_messages tiene 1 row email failed con reason='undeliverable_email'.
  - Lead answerforce sin email → 0 envíos, lead.status='failed', NO push ArboStar.
  - Idempotencia: llamar dispatchLead 2 veces sobre mismo lead → segunda llamada NO reenvía.
  - ArboStar stub configurado para fallar todos los retries → outbound_messages siguen sent, lead.status sigue 'auto_sent', audit log "arbostar_sync_failed" sin bloquear.
- `tests/integration/auto-dispatch-flow.test.ts`: replay LSA oak trim → extract → generate (que cae en auto_sent) → verifica que automáticamente dispatchó (outbound_messages presentes).

Comando:
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- En modo stub: replay LSA fixture → extract → generate (auto_sent) → dispatchó automáticamente. Inspeccionar `tmp/stub-emails.jsonl` y `tmp/stub-arbostar.jsonl` para ver los payloads.
- UI: lead detail muestra card "Outbound Status" con los messages enviados.
- Manualmente aprobar un lead awaiting_review desde UI → POST approve → trigger dispatch → outbound logueado.
- La suite retorna exit code 0 al 100%.

GATE DE AVANCE (BLOQUEANTE):
NO avances a la Fase 7 hasta que `docker compose exec app npm test` retorne exit code 0 con 100% de los tests pasando. Reportá explícitamente el resultado del último run antes de continuar.

NO HAGAS en esta fase: switch a live clients (espera creds del cliente, se hace en Fase 7), session-based auth (Fase 7), stats dashboard (Fase 7), Docker production hardening (Fase 7). Mantener todo en stub mode.
```

---

### FASE 7 — Auth, Stats, Polish, Docker Production & Deploy a Railway

```
Fase 7 (final) del Premier Tree Specialists Lead Intake Dashboard. Lee CLAUDE.md.

OBJETIVO:
Hacer el sistema production-ready: auth real para el call team (~6-8 usuarios), stats dashboard con KPIs, manejo de errores robusto, polish visual, Docker production multi-stage optimizado, deploy a Railway, backup script de SQLite, y documentación operacional para el equipo. Si el cliente ya entregó credenciales, hacer el switch a INTEGRATION_MODE=live con smoke tests por cada integración.

TAREAS:

1. AUTENTICACIÓN (reemplaza el demo-user middleware de Fase 5):
   - Crear `app/services/auth.service.ts` con `authenticate(email, password): Promise<User | null>`, `createSession(userId)`, `validateSession(token)`, `destroySession(token)`.
   - Sessions stored in DB (nueva tabla `sessions`: id, user_id, expires_at, created_at). 7-day expiration. Cookie HTTP-only signed con `SESSION_SECRET` (HS256).
   - Crear `app/middleware/auth.ts`: verifica session cookie, popula `c.set('user', userRow)`, redirige a /login si missing on protected routes.
   - Rutas en `app/routes/auth.ts`: GET /login (form), POST /login (credentials check), POST /logout (destroy session).
   - View `pages/login.html.ts` con form simple (email, password, "Sign in" button).
   - Proteger TODAS las rutas excepto /login, /health, /api/intake/*.
   - Bcrypt cost 12 para hashing (Fase 1 ya lo hizo cost 10 para el seed, mantenerlo; los nuevos usuarios usan 12).
   - Eliminar el demo-user middleware y el header `X-Demo-User`.
   - CSRF token simple en forms (double-submit cookie pattern).
   - Brute-force protection: max 5 failed logins por email en 15 min → bloqueo temporal 15 min.

2. STATS DASHBOARD (reemplaza el placeholder de Fase 5):
   - `GET /stats` renderiza `pages/stats.html.ts` con cards:
     - **Time to first response** (ventana últimos 7 días): avg, p50, p95 (en minutos).
     - **Auto-send rate**: % de leads procesados con confidence ≥0.80 últimos 7 días.
     - **Volume per source**: 3 mini-bar-charts (LSA, Website Form, AnswerForce) con conteos diarios (últimos 7 días).
     - **ArboStar sync rate**: % de leads con arbostar_synced_at NOT NULL / total processed últimos 7 días.
     - **Out-of-service-area count**: total y % últimos 7 días.
     - **Manual flag count**: total últimos 7 días por reason (escalation vs missing_data vs llm_unavailable).
   - Service `app/services/stats.service.ts` con queries SQL agregadas para cada KPI. Cachear resultados 60s en memoria.
   - Sin librería de charting pesada — usar SVG inline simple para los bar charts (htmx-friendly).

3. MANEJO DE ERRORES Y POLISH:
   - Error pages: `404.html.ts`, `500.html.ts`, `403.html.ts` con branding.
   - Error handler global en server.ts: captura excepciones, logea con pino (level=error con leadId si está en contexto), retorna 500 con error page.
   - Try/catch en cada service público; bubble errores estructurados (AppError con code).
   - Loading states en TODOS los htmx requests: spinner con `htmx-indicator` class.
   - Toast notifications post-action (htmx hx-swap-oob a un div #toasts).
   - Empty states en todas las vistas (cuando no hay leads, FAQ vacío, etc.).
   - Mobile responsive verificado: testar en viewport 375px, 768px, 1280px.
   - Accessibility básico: alt en images, aria-labels en buttons sin texto, focus-visible CSS, tab order lógico.
   - Favicon (placeholder verde).

4. TESTING COMPLETO:
   - Asegurar que TODA la suite previa sigue verde con auth activado (los tests deben crear sessions de test antes de pegar a rutas protegidas).
   - Coverage target: ≥85% sobre services, ≥70% sobre routes (configurar en vitest.config.ts coverage threshold).
   - Smoke test E2E: login → dashboard → click lead → edit extracted → approve → verify outbound dispatched.
   - Test de regresión visual NO requerido (sin Storybook); verificación manual contra screenshots.
   - Test de carga simple: 100 leads ingested en paralelo → todos procesan sin race conditions (usar Promise.all en test).

5. DOCKER PRODUCTION-READY:
   - Optimizar `Dockerfile`:
     - Multi-stage definitivo: stage `deps` (npm ci --only=production), stage `builder` (npm ci + build), stage `runtime` (copia solo dist + node_modules production + public).
     - Imagen final basada en `node:20-slim` (no alpine porque better-sqlite3 prefiere glibc).
     - User no-root: `RUN groupadd -r app && useradd -r -g app app && chown -R app:app /workspace`.
     - Pinear versiones de packages OS instalados (curl, ca-certificates).
     - HEALTHCHECK definitivo.
     - Eliminar archivos innecesarios (tests/, docs/, scripts/seed.ts) del runtime stage.
   - Crear `docker-compose.prod.yml` override:
     ```yaml
     services:
       app:
         command: node dist/server.js     # No tsx, no hot-reload
         volumes:
           - db-data:/data                # Solo datos persistentes
         env_file: .env.production
         restart: unless-stopped
         deploy:
           resources:
             limits:
               memory: 512M
               cpus: '1.0'
         logging:
           driver: json-file
           options:
             max-size: "10m"
             max-file: "3"
     ```
   - Test: `docker build --target runtime .` debe completar sin warnings y la imagen final ser <300MB.
   - Test: `docker compose down && docker compose up` con volumen → DB persiste, leads siguen ahí.

6. BACKUP DE SQLITE:
   - Crear `scripts/backup.sh`:
     ```bash
     #!/bin/bash
     set -e
     TS=$(date +%Y%m%d-%H%M%S)
     BACKUP_DIR=${BACKUP_DIR:-/backups}
     mkdir -p "$BACKUP_DIR"
     # Use sqlite3 .backup which is hot-backup safe
     sqlite3 /data/leads.db ".backup '$BACKUP_DIR/leads-$TS.db'"
     gzip "$BACKUP_DIR/leads-$TS.db"
     # Retention: keep last 30 days
     find "$BACKUP_DIR" -name "leads-*.db.gz" -mtime +30 -delete
     echo "Backup complete: leads-$TS.db.gz"
     ```
   - Mountear volumen extra en docker-compose.prod.yml: `- backups:/backups`.
   - Documentar cron / Railway scheduled task para correr daily.

7. DEPLOY A RAILWAY:
   - Crear `railway.toml`:
     ```toml
     [build]
     builder = "DOCKERFILE"
     dockerfilePath = "Dockerfile"

     [deploy]
     startCommand = "node dist/server.js"
     healthcheckPath = "/health"
     healthcheckTimeout = 30
     restartPolicyType = "ON_FAILURE"
     restartPolicyMaxRetries = 3
     ```
   - Configurar volumen Railway montado en `/data`.
   - Documentar en README cómo crear el servicio Railway, agregar volumen, configurar las env vars (lista exhaustiva).
   - **Switch a INTEGRATION_MODE=live (CONDICIONAL — solo si cliente entregó creds)**:
     - Smoke test cada cliente real:
       - SendGrid: enviar email a `info+test@premiertreesllc.com` y verificar recepción.
       - Agent Phone: enviar SMS de test al phone del propio Matt y verificar recepción.
       - ArboStar: crear lead test con flag de test, verificar en dashboard ArboStar.
       - Gmail polling: forwardear un email LSA real a la inbox y verificar ingestion.
     - Documentar cada smoke test con script reproducible en `scripts/smoke-tests/`.

8. DOCUMENTACIÓN OPERACIONAL (`README.md` + `docs/operations.md`):
   - **Cómo correr local con Docker** (ya en README de Fase 0).
   - **Cómo desplegar a Railway** (paso a paso con screenshots).
   - **Cómo actualizar la app**: pull main, Railway redeploya automático on push.
   - **Cómo hacer backup manual**: `docker compose exec app /scripts/backup.sh`.
   - **Cómo restaurar de backup**: copiar .db.gz al volumen, descomprimir, restart.
   - **Cómo agregar nuevos FAQ entries**: SQL INSERT directo o crear endpoint admin (futuro).
   - **Cómo cambiar threshold de confidence**: env var, restart.
   - **Cómo revisar logs**: `docker compose logs -f app` o Railway dashboard.
   - **Troubleshooting común**:
     - Lead no aparece → verificar logs del intake endpoint, confirmar webhook secret.
     - Email no llega → verificar SendGrid dashboard, status del outbound_messages row.
     - ArboStar push falla → verificar API key, logs de retry.
     - LLM timeout → cambiar `OPENROUTER_MODEL` o aumentar timeout.

9. MONITOREO:
   - Endpoint `/health` retorna 200 con info adicional (DB connectivity check, last successful intake timestamp).
   - Configurar alerting en Railway (notification on deploy fail, on healthcheck fail).
   - Logear métricas clave en cada lead pipeline step (ingest, extract, generate, dispatch) con timing.

10. CHECKLIST FINAL (cada item debe ser verificado y reportado):
    - [ ] `docker compose up --build` funciona desde cero en una máquina limpia (probado en Mac y Linux).
    - [ ] Toda la data persiste entre reinicios del container (test: `docker compose down && docker compose up` → leads siguen).
    - [ ] Backup script corre exitoso, archivo se crea en /backups.
    - [ ] Restore probado: borrar BD, restaurar de backup, leads reaparecen.
    - [ ] Deploy a Railway exitoso, app accesible vía URL pública (con auth).
    - [ ] Login del usuario seed (matt@premiertreesllc.com / ChangeMe123!) funciona; cambiar password al primer login (UI o vía CLI).
    - [ ] Test suite pasa al 100% en CI-equivalent (`docker compose exec app npm test` retorna exit 0).
    - [ ] Coverage ≥85% services, ≥70% routes.
    - [ ] Smoke tests live (si creds disponibles): SendGrid, Agent Phone, ArboStar, Gmail polling — todos pasan.
    - [ ] README + docs/operations.md completos.
    - [ ] Cliente Matt puede acceder, ver el dashboard, aprobar un lead, ver el outbound, ver el ArboStar push.

TESTS OBLIGATORIOS:
- `tests/integration/auth.test.ts`: login con creds correctas → cookie session set, redirect a /dashboard. Login con incorrectas → error visible. POST /logout → cookie cleared. Acceso a /dashboard sin session → redirect /login. 5 logins fallidos → 6to bloqueado por 15 min.
- `tests/integration/csrf.test.ts`: POST sin token CSRF → 403. POST con token mismatched → 403. POST con token correcto → success.
- `tests/integration/stats.test.ts`: con datos seed conocidos, /stats retorna KPIs con valores esperados (e.g., auto_send_rate calculado correctamente).
- `tests/integration/end-to-end-with-auth.test.ts`: login → dashboard → click lead → approve → outbound dispatched → verificar en stats.
- `tests/integration/backup-restore.test.ts`: ejecutar backup script en container, descomprimir el .gz, validar que es un SQLite válido con todas las tablas.
- TODA la suite anterior re-corrida con auth activo (helpers que crean session de test).

Comando:
  `docker compose exec app npm test`

ENTREGABLE VALIDABLE:
- App desplegada en Railway accesible vía URL pública.
- Login funcional con cookie session.
- Dashboard, queue, lead detail, stats todos operativos.
- Aprobar un lead desde UI dispara envío real (en modo live) o stub (en modo stub) + ArboStar push.
- Backup script crea archivo válido.
- Restore desde backup funciona.
- Suite retorna exit code 0 al 100%, coverage por encima de los thresholds.

GATE DE AVANCE (BLOQUEANTE):
Esta es la fase final, NO hay siguiente. Pero NO declarar "production-ready" hasta que:
1. `docker compose exec app npm test` retorna exit code 0 al 100%.
2. Coverage thresholds (85% services, 70% routes) pasan.
3. Deploy a Railway completado con healthcheck verde.
4. Si hay creds live disponibles: los 4 smoke tests live pasaron.
5. Cliente confirma que puede loguearse y operar la app.
Reportá explícitamente cada uno de estos 5 puntos antes de cerrar el proyecto.

NO HAGAS en esta fase: features futuras (voice agent, scheduling, capacity planning, lead scoring, GBP content, outreach campaigns — todas listadas como "Fuera de Scope V1" en CLAUDE.md). Solo polish + auth + deploy + docs.
```

---

## Tips para trabajar con Claude Code

1. **Sesión limpia por fase**: cada prompt está diseñado para una sesión nueva. CLAUDE.md siempre se lee al inicio (Claude Code lo carga automáticamente). No mezcles fases en una sola sesión.

2. **Pegá el prompt verbatim**: están escritos para ser self-contained. No los abrevies.

3. **Adjuntá los screenshots solo cuando importan**: Fase 5 los necesita para layout; el resto puede ignorarlos.

4. **El Gate es real**: si una fase no pasa los tests al 100%, NO continúes. Pedí a Claude Code que arregle el código (no los tests) antes de seguir.

5. **`INTEGRATION_MODE=stub` por default**: todas las fases corren sin credenciales reales hasta Fase 7. Esto te permite avanzar el prototipo sin esperar al cliente.

6. **Cuando cliente entregue las credenciales**:
   - Editar `.env.production` con valores reales.
   - Setear `INTEGRATION_MODE=live`.
   - Correr smoke tests live (Fase 7 tarea 7).
   - Deploy.

7. **Si Claude Code se desvía del stack**: rechaza, mostrá CLAUDE.md sección "Stack FIJO" y pedí que se ajuste. Nunca aceptes "uso Express en lugar de Hono porque es más conocido" — el PRD es ley.

8. **Cada vez que se agrega una FAQ entry**: documentar también en `docs/faq-additions.md` (timestamp, autor, contexto) para auditabilidad. El customer Matt es técnico y va a apreciar trazabilidad.

9. **El cliente Matt es técnico** (construye agentes en Replit por su cuenta). Podés mostrarle el código y los logs sin sobre-explicar. En las demos, abrir las dev tools y mostrarle los htmx swaps, los stub jsonl files, los tests verdes.

10. **Demo flow para el cliente**: replay 3 fixtures (oak trim LSA, emergency AnswerForce, website form) → mostrar dashboard con los 3 leads en distinto status (auto_sent, manually_flagged por escalation, awaiting_review) → abrir cada uno → mostrar el response generado y el outbound stub jsonl. Esto valida toda la pipeline en <5 minutos.
