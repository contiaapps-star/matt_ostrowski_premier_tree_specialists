# Feasibility Report — Premier Tree Specialists Lead Intake Dashboard

**Fecha**: 2026-04-26
**PRD analizado**: `resourses/PRD-premier-tree-specialists.md` (versión post-review 24-Apr-2026)
**Veredicto general**: ✅ **El proyecto es viable y procede a fases**. No se detectaron bloqueantes (🔴). Existen **2 ítems de riesgo medio (🟡)** y **3 decisiones del cliente (🟢)** que no bloquean el inicio del prototipo, pero deben resolverse antes de transicionar a producción.

---

## Resumen ejecutivo

| Severidad | Cantidad | ¿Bloquea inicio? |
|-----------|----------|------------------|
| 🔴 BLOCKER | 0 | — |
| 🟡 HIGH RISK / EXTREME COMPLEXITY | 2 | No (mitigaciones claras) |
| 🟢 NEEDS CLIENT DECISION | 3 | No para prototipo; sí para handoff a producción |

El PRD post-review fue calificado por el propio equipo en 5/5 en cada dimensión (scope, technical, customer impact). Las observaciones aquí no contradicen ese score — son recordatorios operacionales que el equipo debe resolver con el cliente en momentos específicos del cronograma.

---

## Findings

### 1. 🟡 Envío de SMS a escala requiere registro 10DLC (1-2 semanas)

- **Requirement**: "Send both immediate text/message reply and email follow-up to every lead" (User Story 5).
- **Issue**: El envío de SMS a través de short codes regulares (10-Digit Long Code) en US requiere registro 10DLC ante carriers, proceso que demora 1-2 semanas. Sin registro, los SMS pueden ser bloqueados o ratelimitados agresivamente, lo que invalida el SLA de "<1 min response time" para leads de Website Form.
- **Why**: Regulación TCR (The Campaign Registry) post-2023 exige A2P (Application-to-Person) registration para todo envío programático de SMS comercial en US.
- **Severidad**: 🟡 (alto riesgo si no se anticipa, técnicamente solucionable)
- **Alternativas propuestas**:
  1. **iMessage interim** (recomendada para v1): Agent Phone soporta iMessage API que **no requiere 10DLC** y cubre ~80% de teléfonos US (iPhone). Permite shippear el prototipo sin esperar registración. ✅ Ya documentado en PRD post-review (líneas 105, 240-241).
  2. **Agent Phone con 10DLC automático**: Agent Phone gestiona el registro 10DLC por nosotros. Demora 1-2 semanas pero queda permanente. Combinar con iMessage durante la ventana de espera.
  3. **Twilio directo**: Requiere registro 10DLC manual; mayor fricción operacional.
- **Decisión requerida del cliente**: ¿Aceptamos el plan documentado en el PRD (iMessage interim → Agent Phone con 10DLC en paralelo) o el cliente prefiere otra ruta?
- **Impacto en fases**: Afecta **Fase 6 (Outreach)**. El prototipo (Fases 0-5) puede correrse 100% en *stub mode* (logs en lugar de envío real), por lo que no bloquea el inicio.

---

### 2. 🟡 Calidad del FAQ knowledge base define el "auto-send rate"

- **Requirement**: "AI extracts inquiry, generates response, scores confidence; ≥80% auto-sends" (User Stories 3 y 4).
- **Issue**: La meta de "80% de leads no-phone resueltos sin intervención humana" depende directamente de cuán bien curado esté el FAQ. Sin un FAQ rico y específico al dominio (oak season, pricing ranges, service area edge cases), el modelo va a generar confidence scores bajos sistemáticamente y todo caerá en review queue, anulando el ROI prometido al cliente.
- **Why**: LLMs evalúan confianza en función del solapamiento entre la pregunta y el conocimiento contextual provisto. Sin FAQ específico, el modelo "alucinará" tono o detalles, o se rehusará a contestar.
- **Severidad**: 🟡 (no bloquea construcción, pero compromete el outcome)
- **Alternativas propuestas**:
  1. **FAQ seed sintético en Fase 4** (recomendado): el equipo extrae FAQ inicial del PRD/transcript (oak season, service area, ISA credentials, dual location) y usa eso para validar el flujo del prototipo. ✅ Compatible con prototype-first delivery.
  2. **Esperar call recordings del cliente**: agendar sesión post-prototipo donde Matt entrega 5-10 call recordings + Q&A session para tunear FAQ. Confirmado en PRD post-review (línea 102).
  3. **Calibración con 30 leads reales**: cliente prometió "last 10 leads from each source" para tuning del threshold. Usar esos para calibrar.
- **Decisión requerida del cliente**: confirmar fecha de entrega de (a) call recordings o sesión Q&A, (b) sample de 30 leads. PRD ya menciona "by Monday" (línea 359) — confirmar.
- **Impacto en fases**: Afecta **Fase 4 (FAQ + Response Generation)**. Se construye con FAQ seed sintético y se agrega CLI para reemplazar/completar FAQ post-handoff sin tocar código.

---

### 3. 🟢 Credenciales y accesos de producción pendientes

- **Requirement**: Integraciones con ArboStar, SendGrid, Agent Phone, Vercel form, Gmail forwarding (User Stories 1 y 6).
- **Issue**: El cliente confirmó delivery prototype-first (PRD línea 19, 96-105). Las credenciales reales no están disponibles al iniciar las fases. Sin diseñar para *stub mode* desde el día 1, vamos a tener que reescribir adapters cuando lleguen las creds.
- **Severidad**: 🟢 (decisión operacional, no técnica)
- **Alternativa propuesta**: Cada integración (ArboStar, SendGrid, Agent Phone, LSA email parser, Vercel webhook) se construye con un **adapter pattern**: clase `XxxClient` con dos implementaciones intercambiables vía variable de entorno: `XxxLiveClient` (HTTP real) y `XxxStubClient` (logs + persistencia local). Para prototipo, todos en stub. Switch en deploy a producción.
- **Decisión requerida del cliente**: confirmar checklist de credenciales que entregará post-aprobación (lista en PRD líneas 97-105). Acordar fecha objetivo.
- **Impacto en fases**: Afecta **Fase 6 y Fase 7**. Se construye con stubs en Fase 6; se hace switch a live clients en Fase 7 una vez recibidas las creds.

---

### 4. 🟢 Reply API de Google LSA vs reply por email — confirmar canal de retorno

- **Requirement**: "Send text/message reply via same channel lead came from" (User Story 5).
- **Issue**: El PRD post-review decidió simplificar Google LSA a "Reply via email (simpler than LSA message API integration for v1)" (línea 239). Esto significa que el customer recibe la respuesta del agente en su **inbox de email** y no en el chat de Google LSA donde inició la consulta. UX cuestionable: el lead puede no asociar el email con su mensaje original.
- **Severidad**: 🟢 (decisión de UX/producto)
- **Alternativas propuestas**:
  1. **Email-only reply para LSA en v1** (recomendado por PRD): minimiza scope, ya está acordado con cliente.
  2. **Reply dentro de LSA conversation**: requiere integración con Google Business Messages API (más compleja, OAuth, scopes) — diferida a v2.
  3. **Híbrido**: enviar email Y registrar el reply en LSA dashboard manualmente vía instrucción en el dashboard ("copia este texto y pégalo en LSA"). Trabajo manual, pero cierra el loop UX.
- **Decisión requerida del cliente**: confirmar que el approach email-only es aceptable para v1, o si prefiere la opción híbrida.
- **Impacto en fases**: Afecta **Fase 6 (Outreach)**. Default a email-only por defecto; documentar UX impact en CLAUDE.md.

---

### 5. 🟢 AnswerForce reply channel — sin canal de respuesta automatizado

- **Requirement**: AnswerForce leads requieren follow-up (User Story 1).
- **Issue**: AnswerForce envía email-summary de calls que ya ocurrieron. El cliente que llamó **no tiene un canal directo de respuesta abierto** — solo un número de teléfono. El PRD dice "AnswerForce: No text reply needed (customer already received phone call)" (línea 239), pero esto contradice la promesa de "dual-channel outreach a todo lead".
- **Severidad**: 🟢 (decisión de producto)
- **Alternativas propuestas**:
  1. **Solo email follow-up para AnswerForce** (default per PRD): si el caller dejó email en el message detail, enviar email; si no, solo crear el lead en ArboStar para que sales rep llame.
  2. **SMS al phone number capturado**: AnswerForce tiene el phone; podemos enviar SMS aunque no sea "respuesta" sino outreach proactivo ("Hi, you called us last night — here's the info you asked about").
  3. **Híbrido**: SMS + email follow-up.
- **Decisión requerida del cliente**: confirmar política para AnswerForce leads en Fase 6.
- **Impacto en fases**: Afecta **Fase 6**. Default a "solo email + ArboStar push" según PRD; flag para confirmar en review.

---

## Recommended next actions (priorizado)

1. **AHORA — antes de Fase 0**: Cliente confirma delivery date para (a) los 30 sample leads y (b) los call recordings o sesión Q&A para FAQ. Sin esto, Fase 4 se atrasa.
2. **Antes de Fase 6**: Cliente confirma decisiones 🟢 #4 (LSA email-only OK) y 🟢 #5 (AnswerForce policy).
3. **Antes de Fase 7 (deploy a producción)**: Cliente entrega checklist completo de credenciales (ítem 🟢 #3) y confirma path de SMS (ítem 🟡 #1: iMessage interim + Agent Phone con 10DLC en paralelo).
4. **Procede a generar fases**: Fases 0-5 son completamente desbloqueadas. Fase 6 se construye con stubs. Fase 7 espera handoff de credenciales.

---

**Conclusión**: el proyecto está listo para iniciar Fase 0 hoy mismo. Los findings anteriores son recordatorios operacionales del cronograma, no bloqueantes técnicos.
