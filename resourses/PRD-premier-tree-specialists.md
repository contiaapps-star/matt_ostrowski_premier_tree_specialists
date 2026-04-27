# PRD: Automated Lead Intake Dashboard for Premier Tree Specialists

**Customer:** Matt Ostrowski  
**Company:** Premier Tree Specialists LLC  
**Date:** April 24, 2026 (Updated after PRD Review Call)  
**Build Type:** New

---

## Update Summary (April 24, 2026 Review Call)

This PRD was reviewed with the customer on April 24, 2026. Key refinements incorporated:

- **ArboStar API confirmed**: Customer verified that ArboStar POST API for lead creation is exactly what's needed (initial research was correct)
- **Scheduling explicitly out of scope**: Confirmed that appointment scheduling is deferred to future phase — this build focuses on lead intake and response only
- **Text messaging approach refined**: Added iMessage as interim option (covers 80% of texts, no registration required) while 10DLC registration processes; noted Agent Phone as preferred service over direct Twilio
- **Google LSA integration simplified**: Defaulting to email monitoring fallback instead of third-party webhook service (Hatch/LeadTruffle) for initial version — simpler and customer already uses email for AnswerForce
- **Sample data requirements clarified**: Customer will provide last 10 leads from each source (website, LSA, AnswerForce) for testing and FAQ tuning
- **Prototype-first delivery confirmed**: Build full prototype with synthetic data first, then customer provides credentials/access after approval

---

## One-Line Summary

Eliminates 12–20 hours/week of manual lead triage and reduces response time from 15+ minutes to <1 minute for 80% of non-phone inquiries by consolidating Google LSA messages, website forms, and after-hours emails into a single AI-powered intake dashboard for Premier Tree Specialists' 4-person call team.

---

## Build Spec

- **Unified lead inbox** — Automatically consolidate leads from Google Local Service Ads messages, website form submissions, and AnswerForce after-hours emails into a single dashboard
- **Intelligent response automation** — Extract customer info (name, address, phone, email, scope of work) and generate FAQ-based responses that send automatically when confidence exceeds 80%
- **Human review queue** — Route responses with <80% confidence to call team for quick approval before sending
- **Dual-channel outreach** — Send both immediate text/message reply and email follow-up to every lead
- **CRM integration** — Push all processed leads to ArboStar with structured data for sales team follow-up
- **Speed-to-lead improvement** — Target sub-1-minute response time for high-confidence leads vs current 15+ minute manual response

---

## Company & Problem Context

**Company Overview**

Premier Tree Specialists LLC is a residential and commercial tree care company serving Northeast and Central Ohio (Cleveland and Columbus metro areas). Founded with 80+ years of combined arborist experience, they operate 7-8 crews and employ ISA-certified arborists. Matt Ostrowski acquired the business 2 years ago and is scaling through operational improvements and technology adoption. The company launched a second location in Columbus in October 2025. Services include tree trimming/pruning, removal, stump grinding, arborist consultations, and plant health care. They compete in a market where private equity has professionalized HVAC/plumbing competitors but tree care operators remain behind on lead response standards.

**Problem Statement**

Premier Tree Specialists receives approximately 35 new customer inquiries per day across five channels: phone calls (~50%), Google Local Service Ads messages (~20%), website form submissions (~20%), AnswerForce after-hours emails (~5%), and direct texts (~5%). Their lean team of 4 call takers (2 US-based, 2 global talent) correctly prioritizes answering live phone calls (highest intent, highest conversion), but this strategy causes non-phone leads to fall through the cracks.

The pain is most acute with **Google Local Service Ads** (LSA), where their current manual response time of 15+ minutes is hurting their ranking and lead quality score. Google penalizes slow responders, reducing ad visibility. The **office manager** wastes hours daily logging into separate platforms (Google LSA dashboard, Vercel form admin, email inbox) to manually type responses. The **call takers** cannot effectively monitor multiple inboxes while handling live calls. And **Matt** lacks a unified view of total lead capture — he can measure phone answer rates but has no KPI for overall lead response performance.

The core workflow issue: manually responding to each non-phone lead requires context-switching between platforms, reading the inquiry, crafting a reply with arborist knowledge (e.g., "oak season is closed until November to prevent infection"), typing it out, and sending. This takes 3-5 minutes per lead when done properly, or gets skipped entirely when the team is busy with phone calls.

This build eliminates that manual work by consolidating all non-phone leads into one dashboard, extracting structured data automatically, generating responses using an FAQ knowledge base, and sending immediately when quality is high or queuing for one-click approval when uncertain. The result: 80% of non-phone leads get sub-1-minute responses automatically, the remaining 20% get drafted for quick human review, and nothing falls through the cracks.

---

## Developer Brief

- **Unified dashboard** — Call team sees all incoming non-phone leads in one place instead of checking 3+ separate platforms. No more context-switching, no more missed leads.
- **Auto-response with confidence scoring** — AI reads the inquiry, checks it against FAQ, generates a response, scores its confidence (0-100%), and either sends it automatically (80%+) or queues it for human review (<80%). Replaces 3-5 min manual work with instant response.
- **Dual outreach** — Every lead gets both a text/message reply (via same channel they came in on) AND an email follow-up, maximizing engagement.
- **ArboStar integration** — ArboStar API supports POST operations for lead creation (confirmed during review call). Can push structured lead data directly via API.
- **FAQ knowledge base** — Customer will provide call recordings and domain expertise to build v1 FAQ. Should cover common scenarios: oak season restrictions, service types, pricing guidance, scheduling process, service area coverage, emergency tree work, ISA-certified arborist credentials.
- **Speed matters** — Current Google LSA response time is 15+ min. Target is <1 min for high-confidence responses. This directly impacts Google's quality score and ad ranking.
- **Columbus location priority** — Customer launched Columbus location in October 2025 and mentioned during review that regular content updates and lead response are particularly important for this new market.

---

## Prototype

**Prototype Strategy:** This build is highly prototypable. The core value — seeing all leads in one place, auto-generating responses, and routing based on confidence — can be fully demonstrated with synthetic data and demo mode.

**What to Build:**

A working dashboard that:
1. **Displays mock leads** from three sources (Google LSA message, website form, AnswerForce email) with realistic tree service inquiries
2. **Shows data extraction** — highlights how the system pulls name, address, phone, email, and scope of work from each lead
3. **Generates responses** using a mock FAQ and displays confidence scores (e.g., "88% - auto-send", "65% - needs review")
4. **Routes to appropriate queue** — auto-sent leads move to "Sent" status, low-confidence leads appear in "Review Queue" with suggested draft
5. **Demonstrates dual-channel sending** — shows both text/message reply and email follow-up in demo mode (log output, don't actually send)
6. **Mock ArboStar sync** — shows how structured lead data would POST to ArboStar API

**Synthetic Data Guidance:**

Create 8-10 realistic tree service inquiry scenarios:
- "I have a big oak tree that I would like to have looked at. It will probably need trimming and I need quote" (Google LSA message)
- "Need emergency tree removal - large oak limb fell on roof during storm last night" (after-hours email)
- Simple form: name, email, phone, zip code, service type dropdown (website form)
- Include edge cases: missing phone number, out-of-service-area zip code, vague scope description, oak trimming request during closed season
- Use actual Ohio city names from Premier Tree Specialists' service area: Cleveland, Solon, Parma Heights, Columbus, Rocky River, Delaware, Westerville
- Service types: tree trimming, tree removal, stump grinding, emergency service, arborist consultation, plant health care

**To Complete (Post-Prototype):**

Customer must provide AFTER approving the prototype:
- **ArboStar API credentials** (company ID, API key from Company Management → API Access)
- **Google LSA integration**: Email forwarding rule to agent inbox (simplest approach per review call)
- **Website form**: Vercel project access OR webhook endpoint to add to form submission handler
- **AnswerForce**: Email forwarding rule to agent inbox (already in use)
- **Sample leads for testing**: Last 10 leads from each source (website, LSA, AnswerForce) — per review call request
- **Call recordings** (5-10 recent sales calls) for FAQ extraction, OR domain knowledge Q&A session (Loom video acceptable)
- **FAQ domain knowledge**: Oak season rules, service area boundaries, pricing ranges, scheduling details, emergency service protocols
- **Email sending credentials** (SendGrid, Mailgun, or company SMTP)
- **Text sending approach**: Either (a) existing business phone with API access, OR (b) new Agent Phone number with 10DLC registration (1-2 week process), OR (c) iMessage integration as interim solution (covers 80% of texts, no registration required)

**Why This Prototype Works:**

The prototype demonstrates the complete problem solution: consolidating scattered lead sources, extracting messy data into structure, generating quality responses, routing intelligently, and integrating with CRM. The customer (a technical founder actively building agents himself in Replit) can visualize exactly what he's getting before providing any credentials or data access.

---

## Stack Suggestions

| Layer | Tool | Rationale |
|-------|------|-----------|
| **Hosting** | Railway | Sagan default per stack.md. Single service handles web app, API, background jobs, and SQLite database. |
| **Backend** | Hono + Node.js + TypeScript | Sagan default per stack.md for new builds. Lightweight, minimal boilerplate, perfect for small app. |
| **Frontend** | HTML + Tailwind CSS + htmx | Sagan default per stack.md. Dashboard with forms and live updates — no complex client state needed. |
| **Database** | SQLite on Railway volume | Sagan default for low-medium volume. Stores leads, responses, FAQ entries, confidence scores. |
| **AI Model** | SoTA tier via OpenRouter | Response generation requires nuanced arborist domain knowledge and tone matching. Use current top model per Artificial Analysis leaderboard. |
| **Email Sending** | SendGrid or Mailgun | Reliable transactional email for customer follow-ups. SendGrid free tier covers initial volume. |
| **SMS Sending** | Agent Phone (preferred) or Twilio | Agent Phone handles 10DLC registration automatically and provides simpler API. Twilio fallback if needed. iMessage integration viable as interim solution (covers 80% of US texts, no registration wait). |
| **Google LSA Integration** | Email monitoring (initial) | Parse Google LSA notification emails forwarded to agent inbox. Simpler than third-party webhook service for v1. Can upgrade to Hatch/LeadTruffle later if needed. |

**Environment Variables:**
```
ARBOSTAR_COMPANY_ID=
ARBOSTAR_API_KEY=
SENDGRID_API_KEY=
AGENT_PHONE_API_KEY=
AGENT_PHONE_NUMBER=
OPENROUTER_API_KEY=
DATABASE_PATH=/data/leads.db
EMAIL_FORWARD_ADDRESS=
```

---

## Key Definitions

**ArboStar** — Tree care industry-specific CRM used by Premier Tree Specialists. Manages leads, estimates, jobs, scheduling, and invoicing. Has REST API with POST capability for lead creation at `https://[COMPANY_ID].arbostar.com/api/requests/create`.

**Google Local Service Ads (LSA)** — Google's pay-per-lead advertising platform for service businesses. Customers can message or call directly from search results. Google scores responsiveness and penalizes slow responders, directly impacting ad visibility and ranking.

**AnswerForce** — Third-party answering service that handles Premier Tree Specialists' after-hours calls (after 5 PM, before 8 AM). Agents take caller information and send email summaries to customer service team.

**Oak Season** — Regulatory restriction on oak tree trimming/pruning. In Ohio, oak wilt disease spreads when trees are cut during growing season (roughly April-November). Arborists must communicate this to customers requesting oak work during closed season: "Oak season is currently closed until November to prevent oak wilt infection."

**Service Area** — Premier Tree Specialists serves Northeast Ohio (Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit counties) and Central Ohio (Delaware, Fairfield, Franklin, Licking, Madison, Pickaway, Union counties). Leads outside this area should be flagged.

**Scope of Work** — Description of tree service requested: trimming/pruning, removal, stump grinding, emergency service, plant health care consultation, etc. Critical field for estimating job value and routing to appropriate sales rep.

**Confidence Score** — AI-generated assessment (0-100%) of response quality based on FAQ match strength, data completeness, and domain knowledge requirements. 80%+ auto-sends, <80% queues for human review.

**10DLC Registration** — Required carrier registration for business text messaging (10-Digit Long Code). Takes 1-2 weeks to complete. Required for SMS at scale. iMessage bypasses this requirement but only works for iPhone users (~80% of US market).

---

## User Stories with Implementation Considerations

### 1. Auto-Ingest from Multiple Sources

**As a** call team member  
**I want** all non-phone leads to appear in a single dashboard automatically  
**So that** I don't have to check multiple platforms and miss leads

**Implementation Considerations:**

- **Google LSA ingestion**: Email monitoring approach per review call. Forward Google LSA notification emails to agent inbox and parse structured data from email body. Gmail forwarding rule is simplest (customer already uses this pattern for AnswerForce). Email arrives 1-2 min after message, acceptable delay for after-hours leads. Third-party webhook services (Hatch/LeadTruffle) are deferred to v2 if email approach proves unreliable.
- **Website form**: Customer built form in Vercel. Can add POST webhook to existing form handler (preferred), or access Vercel database/logs directly if storing submissions. Form includes: name, email, phone, zip code, service type dropdown. Customer willing to provide Vercel project access per review call.
- **AnswerForce emails**: Arrive at `customerservice@premiertreesllc.com`. Email parsing approach: forward to agent inbox, extract structured data from email body. Format includes: "Call at [time], Name: X, Phone: Y, Details: Z". Fairly consistent structure.
- **Deduplication**: Phone number is the most reliable dedupe key. If same phone number appears across multiple channels within 30 min window, merge into single lead record.
- **Error handling**: If a source fails (email forwarding broken), should alert but not block other sources. Each ingestion path needs independent retry logic.

### 2. Extract Structured Lead Data

**As a** sales team member  
**I want** lead data extracted and structured automatically  
**So that** I can quickly assess and prioritize without reading raw messages

**Implementation Considerations:**

- **Required fields**: name, phone, email, address/city/zip, scope of work. Not all sources provide all fields — website form is most complete, LSA messages often omit email, after-hours calls often omit email.
- **Lightweight AI tier** is appropriate for data extraction — simple parsing task, no nuanced reasoning needed. Use structured output from model to enforce field schema.
- **Address normalization**: Critical for routing to sales reps by zone. May need geocoding service (Google Maps API) to convert partial addresses/zip codes to coordinates, then match to service area polygons. Or simpler: zip code → county lookup table.
- **Scope of work extraction**: Free-text field in most sources. LLM should categorize into standard service types (trimming/pruning, removal, stump grinding, emergency, consultation) plus extract details like tree species, tree count, urgency indicators.
- **Validation**: Email validation (regex + DNS check), phone formatting (E.164 standard), zip code validation against known service area.
- **Missing data flagging**: If critical field is missing (e.g., no phone number), flag for manual follow-up rather than auto-responding.

### 3. Generate FAQ-Based Responses

**As a** customer  
**I want** fast, knowledgeable responses to my inquiry  
**So that** I can quickly decide whether to book Premier Tree Specialists

**Implementation Considerations:**

- **FAQ knowledge base**: Store as markdown file or SQLite table with Q&A pairs + metadata (category, keywords, confidence threshold). Customer will provide via call recordings and domain knowledge session post-prototype (confirmed during review call).
- **FAQ categories to cover** (based on business research and review call):
  - Oak season restrictions ("Oak season is currently closed until November to prevent oak wilt infection")
  - Service types and pricing guidance (removal vs trimming, stump grinding)
  - Service area coverage (Northeast & Central Ohio, specific counties)
  - Scheduling and availability (note: actual appointment scheduling is OUT OF SCOPE per review call — FAQ should say "we'll call to schedule")
  - Emergency service (24/7 availability for dangerous tree situations)
  - Credentials (ISA-certified arborists, 80+ years combined experience, fully insured)
  - Columbus location mention (new market, particularly important per review call)
- **Response generation**: SoTA tier model (current best per Artificial Analysis). Prompt includes: (a) lead details, (b) full FAQ knowledge base, (c) company tone guidelines (professional, knowledgeable, responsive), (d) instruction to book consultation call if inquiry is complex.
- **Tone matching**: Responses should sound like a knowledgeable arborist, not a chatbot. Professional but approachable. Reference ISA certification and experience to build trust.
- **Confidence scoring**: Model should self-assess response quality. High confidence = FAQ perfectly matches inquiry + all required info present. Low confidence = FAQ partially matches OR inquiry has unusual details OR missing critical data.
- **Fallback behavior**: If confidence <50%, don't attempt response generation — just flag for full manual review with extracted lead data.

### 4. Confidence-Based Routing

**As a** call team member  
**I want** only uncertain responses to require my review  
**So that** I focus on complex cases instead of approving obvious responses

**Implementation Considerations:**

- **Confidence threshold**: 80% per review call confirmation. This is tunable post-launch based on false positive/negative rates. Customer emphasized that sample leads (last 10 from each source) will help calibrate this threshold.
- **Review queue UI**: htmx-powered dashboard showing pending drafts. Each entry displays: (a) original lead inquiry, (b) extracted data, (c) generated response, (d) confidence score + reasoning, (e) one-click approve/edit/reject buttons.
- **Review workflow**: Approver can edit draft before sending. After approval, system sends immediately via text + email. Edits should feed back into FAQ learning (manually curated for now, could automate later).
- **Auto-send logging**: All auto-sent responses should log to audit trail with: lead ID, response text, confidence score, timestamp. Allows post-review of quality.
- **Escalation rules**: Certain keywords should force manual review regardless of confidence: "emergency", "tree on house", "lawsuit", "complaint", mentions of prior bad experience, etc.
- **Response time tracking**: Dashboard should show "time to first response" metric per lead. Goal is <1 min for 80%+ auto-sends (directly impacts Google LSA ranking).

### 5. Dual-Channel Outreach

**As a** marketing-focused business owner  
**I want** to respond via both the original channel AND email  
**So that** I maximize engagement and provide multiple contact paths

**Implementation Considerations:**

- **Text/message reply approach** (refined during review call):
  - Google LSA messages: Reply via email (simpler than LSA message API integration for v1)
  - Website form submissions: Send SMS to provided phone number
  - AnswerForce: No text reply needed (customer already received phone call)
  - **iMessage as interim solution**: Can send iMessages without 10DLC registration, covers ~80% of US phones per review call. Use Agent Phone or similar service that supports iMessage API.
  - **10DLC registration**: If using SMS at scale, need 10DLC registration (1-2 weeks). Agent Phone handles this automatically per review call discussion.
- **Email follow-up**: Always send regardless of source. Use customer's email if provided, otherwise skip (don't guess/enrich email for now).
- **Email content**: Should match text reply but can be slightly more detailed (include links, formatting, company logo). Signature should include: company name, phone numbers (Cleveland: 216-245-8908, Columbus: 614-526-2266), website link, ISA-certified arborist mention.
- **Email validation**: Check email validity before sending (regex + DNS MX record check). Don't send to obviously fake emails. Bounces should update lead record.
- **Rate limiting**: Email providers and SMS services have rate limits. Queue outbound messages if burst exceeds limits.

### 6. ArboStar CRM Integration

**As a** sales team member  
**I want** all processed leads automatically created in ArboStar  
**So that** I can follow up using our existing CRM workflow

**Implementation Considerations:**

- **API confirmed during review call**: ArboStar API supports POST for lead creation. Customer initially thought it was read-only, but verified during review that POST endpoint for lead creation is available and is exactly what's needed. See `Doc's /PRD-premier-tree-specialists.md` for earlier research findings.
- **API endpoint**: `https://[COMPANY_ID].arbostar.com/api/requests/create`
- **Required fields**: name, email, phone, address, city, state, postal, country. Optional: details, address_notes.
- **API authentication**: API key generated in Company Management → API Access section of ArboStar dashboard. Customer must provide this post-prototype.
- **Sync timing**: Push to ArboStar after response is sent (for auto-sends) or after human approves (for queued drafts). Don't push before response — reduces duplicate lead risk if customer calls separately.
- **Field mapping**: 
  - Name → name
  - Email → email  
  - Phone → phone
  - Address extracted → address, city, state, postal (may need geocoding to get full address from zip)
  - Scope of work → details
  - Lead source tag → address_notes ("Source: Google LSA Email" / "Source: Website Form" / "Source: AnswerForce")
- **Error handling**: If ArboStar API call fails (network, auth, invalid data), should retry with exponential backoff. Don't block response sending on CRM sync — can backfill later if needed.
- **Email fallback**: ArboStar also supports email-based lead import. If API consistently fails, fallback to email import with structured format.
- **Browser automation as nuclear option**: During review call, Zaki mentioned they could use browser automation (Browserbase or similar) to create "makeshift API" for ArboStar if needed, but agreed to stick with POST API approach since it works.

---

## Data Sources

| Source | Type | Direction | Integration Method | Notes |
|--------|------|-----------|-------------------|-------|
| **Google Local Service Ads** | External Platform | Inbound | Email monitoring (forwarding) | Parse Google LSA notification emails forwarded to agent inbox. 1-2 min delay, acceptable for after-hours leads. Third-party webhook (Hatch/LeadTruffle) deferred to v2. |
| **Website Form (Vercel)** | Customer-Built | Inbound | Webhook OR database access | Customer built lead capture form in Vercel. Can add POST webhook to form handler, or access Vercel database/logs. Form fields: name, email, phone, zip code, service type dropdown. Customer willing to provide access. |
| **AnswerForce** | Third-Party Service | Inbound | Email parsing (forwarding) | After-hours answering service emails summaries to `customerservice@premiertreesllc.com`. Format includes: timestamp, caller name, phone, message details. Forward to agent inbox for parsing. |
| **ArboStar CRM** | External Platform | Outbound | REST API (POST) | Tree care CRM. API endpoint: `https://[COMPANY_ID].arbostar.com/api/requests/create`. Supports lead creation with name, email, phone, address, details. API key auth. Confirmed working during review call. |
| **Agent Phone (or Twilio)** | Third-Party Service | Outbound | REST API | SMS/iMessage sending for text message replies. Agent Phone preferred (handles 10DLC registration automatically). iMessage support covers 80% of US phones without registration wait. Twilio fallback if needed. |
| **SendGrid or Mailgun** | Third-Party Service | Outbound | REST API | Transactional email sending for dual-channel follow-up. All leads get email if email address is provided. SendGrid free tier covers initial volume. |

---

## Confidence Score

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| **Scope Definition** | 5/5 | PRD review call provided additional clarity beyond initial scoping. All commitments reconfirmed. Scheduling explicitly confirmed as out of scope. Sample data requirements specified (last 10 leads from each source). Integration approaches validated (email for LSA, ArboStar POST API confirmed working). FAQ creation process clarified (call recordings or Q&A session). Prototype-first delivery strategy confirmed. |
| **Technical Feasibility** | 5/5 | All technical approaches validated during review. ArboStar POST API confirmed by customer as available and working. Email monitoring for Google LSA is proven approach (customer already uses for AnswerForce). iMessage provides SMS alternative without 10DLC wait. Agent Phone simplifies phone number provisioning. AI response generation is well-understood problem space. Customer is technical (building agents himself in Replit) and understands feasibility. |
| **Customer Impact** | 5/5 | Directly solves stated pain (non-phone leads falling through cracks). Measurable improvement (15+ min → <1 min response time for 80% of leads). Frees team capacity (80% automation rate). Improves Google LSA ranking via speed-to-lead. Enables unified lead capture KPI. Customer repeatedly emphasized importance during review, particularly for new Columbus location. Strong business case with clear ROI. |
| **Overall** | **5/5** | Build is exceptionally well-scoped after review session. Technical approaches validated. Customer highly engaged and technical. FAQ knowledge base gathering is post-prototype (appropriate). Only remaining work is prototype build, customer feedback, and credential handoff. |

---

## Out of Scope (Future Phases)

**Phase 2: Voice Agent for Overflow Calls**
- AI voice agent to handle phone calls that ring without answer
- Collects customer info via interactive voice prompts
- Routes to dashboard for follow-up
- Mentioned during review call future agents discussion (27:46)

**Phase 3: Sales Appointment Scheduler**
- Appointment scheduling integration with sales rep calendars
- Discussed during review call (17:53-18:11) but explicitly confirmed as out of scope
- Matt noted scheduling "would be tricky" and Zaki confirmed they're not doing it in this build
- Matt agreed: "As long as we're getting back to them in the first instance, I think it's okay"

**Phase 4: Capacity Planning Tool**
- Dispatch board showing sales rep availability by zone and day
- Capacity tracking and zone-based routing
- Matt is actively prototyping this separately in Vercel/Replit
- Mentioned in previous scoping call (see `Doc's /PRD-premier-tree-specialists.md`)

**Phase 5: Lead Scoring and Prioritization**
- Score leads by potential value (tree species, job scope, neighborhood)
- Elevate high-value leads for faster human review
- Mentioned in future agents discussion (27:51)

**Phase 6: Proactive Outreach Campaigns**
- Purchase intent signals (Zillow, LoopNet transactions)
- Particularly valuable for commercial work expansion
- Matt expressed strong interest during review call (28:04-28:14)
- Mentioned in future agents discussion (27:56)

**Phase 7: Google Business Profile Content Agent**
- Regular content updates to Google Business Profile
- Particularly important for Columbus location SEO
- Matt's original reason for scheduling review call (10:36-10:49)
- Zaki deferred to focus on shipping lead intake dashboard first (12:28-12:45)
- To be discussed in future agent planning session after this build ships

---

## Audit Notes

**Review Call Verification Summary:**

This PRD was reviewed section-by-section with the customer on April 24, 2026 (28-minute call). Zaki screen-shared the PRD and walked through each section while Matt confirmed accuracy and provided clarifications. All original scope commitments reconfirmed. Key validations:

1. **ArboStar API approach validated** (17:20-17:42): Customer confirmed ArboStar POST API for lead creation exists and is exactly what's needed. Original PRD research was correct despite customer's initial assumption it was read-only.

2. **Scheduling confirmed out of scope** (17:53-18:11): Matt raised scheduling concern, Zaki confirmed it's not included in this build. Matt agreed speed-to-lead is the priority, scheduling can come later.

3. **Text messaging approach refined** (22:46-24:31): Added iMessage as interim option (80% coverage, no registration) and Agent Phone as preferred provider (handles 10DLC automatically).

4. **Google LSA integration simplified** (24:57-25:30): Confirmed email monitoring approach instead of third-party webhook for v1. Simpler and customer doesn't use Hatch/LeadTruffle.

5. **Sample data requirements specified** (16:08-16:26): Customer will provide last 10 leads from each source for testing and FAQ calibration.

6. **Prototype-first delivery confirmed** (19:17-19:32): Zaki will send prototype with dummy data first, customer provides credentials after approval.

7. **Future builds noted** (27:40-28:28): Voice agent, sales scheduler, capacity planning, lead scoring, outbound campaigns, and GBP content agent all mentioned for future planning session after this build ships.

**Confidence in scope accuracy:** Very high. PRD was reviewed line-by-line with customer present. No contradictions found. All commitments reconfirmed. Customer eager to proceed ("Really excited" - 28:31).

**Build commitment:** Confirmed. Zaki mentioned dev assignment happening next week (27:04-27:11). Customer will provide sample data by Monday (26:52-27:04).
