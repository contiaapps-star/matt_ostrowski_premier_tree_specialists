# PRD: Automated Lead Intake Dashboard for Premier Tree Specialists

**Customer:** Matt Ostrowski  
**Company:** Premier Tree Specialists LLC  
**Date:** April 18, 2026  
**Build Type:** New

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

Premier Tree Specialists is a residential and commercial tree care company serving Northeast and Central Ohio (Cleveland and Columbus metro areas). Founded with 80+ years of combined arborist experience, they operate 7-8 crews and employ ISA-certified arborists. Matt Ostrowski acquired the business 2 years ago and is scaling through operational improvements and technology adoption. Services include tree trimming/pruning, removal, stump grinding, arborist consultations, and plant health care. They compete in a market where private equity has professionalized HVAC/plumbing competitors but tree care operators remain behind on lead response standards.

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
- **ArboStar integration** — Discovered during research: ArboStar API supports POST operations for lead creation (customer thought it was read-only). Can push structured lead data directly via API instead of relying on email parsing workaround.
- **FAQ knowledge base** — Customer will provide call recordings and domain expertise to build v1 FAQ. Should cover common scenarios: oak season restrictions, service types, pricing guidance, scheduling process, service area coverage, emergency tree work, etc.
- **Speed matters** — Current Google LSA response time is 15+ min. Target is <1 min for high-confidence responses. This directly impacts Google's quality score and ad ranking.

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

Create 8-10 realistic tree service inquiry scenarios based on screenshots and transcript:
- "I have a big oak tree that I would like to have looked at. It will probably need trimming and I need quote" (Google LSA message)
- "Need emergency tree removal - large oak limb fell on roof during storm last night" (after-hours email)
- Simple form: name, email, phone, zip code, service type dropdown (website form)
- Include edge cases: missing phone number, out-of-service-area zip code, vague scope description
- Use actual Ohio city names (Cleveland, Solon, Parma Heights, Columbus, Rocky River, etc. from screenshot)
- Service types: tree trimming, tree removal, stump grinding, oak wilt treatment, emergency service

**To Complete (Post-Prototype):**

Customer must provide AFTER approving the prototype:
- ArboStar API credentials (company ID, API key from Company Management → API Access)
- Google LSA integration: either (a) third-party webhook service credentials (Hatch/LeadTruffle), OR (b) email forwarding rule to agent inbox
- Website form: Vercel project access OR add webhook endpoint to form submission handler
- AnswerForce: email forwarding rule to agent inbox OR API credentials if available
- Call recordings (5-10 recent sales calls) for FAQ extraction
- Domain knowledge Q&A session to build FAQ (oak season rules, service area boundaries, pricing ranges, scheduling details, etc.)
- SMS/text sending credentials (Twilio or similar)
- Email sending credentials (SendGrid, Mailgun, or company SMTP)

**Why This Prototype Works:**

The prototype demonstrates the complete problem solution: consolidating scattered lead sources, extracting messy data into structure, generating quality responses, routing intelligently, and integrating with CRM. The customer (a technical founder actively building this himself in Replit) can visualize exactly what he's getting before providing any credentials or data access.

---

## Stack Suggestions

| Layer | Tool | Rationale |
|-------|------|-----------|
| **Hosting** | Railway | Sagan default per stack.md. Single service handles web app, API, background jobs, and SQLite database. |
| **Backend** | Hono + Node.js + TypeScript | Sagan default per stack.md for new builds. Lightweight, minimal boilerplate, perfect for small app. |
| **Frontend** | HTML + Tailwind CSS + htmx | Sagan default per stack.md. Dashboard with forms and live updates — no complex client state needed. |
| **Database** | SQLite on Railway volume | Sagan default for low-medium volume. Stores leads, responses, FAQ entries, confidence scores. |
| **AI Model** | SoTA tier via OpenRouter | Response generation requires nuanced arborist domain knowledge and tone matching. Use Anthropic/Google/OpenAI top models. |
| **Email Sending** | SendGrid or Mailgun | Reliable transactional email for customer follow-ups. |
| **SMS Sending** | Twilio | Industry standard for programmatic text messaging. |
| **Google LSA Integration** | Hatch or LeadTruffle (3rd party webhook) | Provides real-time lead delivery via webhook when Google LSA message arrives. Fallback: email monitoring. |

**Environment Variables:**
```
ARBOSTAR_COMPANY_ID=
ARBOSTAR_API_KEY=
GOOGLE_LSA_WEBHOOK_SECRET=
VERCEL_FORM_WEBHOOK_SECRET=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
OPENROUTER_API_KEY=
DATABASE_PATH=/data/leads.db
```

---

## Key Definitions

**ArboStar** — Tree care industry-specific CRM used by Premier Tree Specialists. Manages leads, estimates, jobs, scheduling, and invoicing. Has REST API with POST capability for lead creation.

**Google Local Service Ads (LSA)** — Google's pay-per-lead advertising platform for service businesses. Customers can message or call directly from search results. Google scores responsiveness and penalizes slow responders.

**AnswerForce** — Third-party answering service that handles Premier Tree Specialists' after-hours calls (after 5 PM, before 8 AM). Agents take caller information and send email summaries to customer service team.

**Oak Season** — Regulatory restriction on oak tree trimming/pruning. In Ohio, oak wilt disease spreads when trees are cut during growing season (roughly April-November). Arborists must communicate this to customers requesting oak work during closed season.

**Service Area** — Premier Tree Specialists serves Northeast Ohio (Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit counties) and Central Ohio (Delaware, Fairfield, Franklin, Licking, Madison, Pickaway, Union counties). Leads outside this area should be flagged.

**Scope of Work** — Description of tree service requested: trimming/pruning, removal, stump grinding, emergency service, plant health care consultation, etc. Critical field for estimating job value and routing to appropriate sales rep.

**Confidence Score** — AI-generated assessment (0-100%) of response quality based on FAQ match strength, data completeness, and domain knowledge requirements. 80%+ auto-sends, <80% queues for human review.

---

## User Stories with Implementation Considerations

### 1. Auto-Ingest from Multiple Sources

**As a** call team member  
**I want** all non-phone leads to appear in a single dashboard automatically  
**So that** I don't have to check multiple platforms and miss leads

**Implementation Considerations:**

- **Google LSA ingestion**: Third-party webhook service (Hatch/LeadTruffle/PrimeLSA) is the cleanest approach for real-time delivery. These services OAuth-connect to Google LSA account and push leads via webhook. Fallback: email monitoring with parsing. Email is 2-5 min delayed and format varies, but customer indicated this is acceptable for after-hours leads.
- **Website form**: Customer built form in Vercel. Can either: (a) add POST webhook to existing form handler, or (b) access Vercel database/logs directly if he's storing submissions. Form includes: name, email, phone, zip code, service type dropdown. Screenshot shows clean tabular view in admin dashboard.
- **AnswerForce emails**: Arrive at `customerservice@premiertreesllc.com`. Email parsing approach: forward to agent inbox, extract structured data from email body. Screenshot from transcript shows format: "Call at [time], Name: X, Phone: Y, Details: Z". Fairly consistent structure.
- **Deduplication**: Phone number is the most reliable dedupe key. If same phone number appears across multiple channels within 30 min window, merge into single lead record.
- **Error handling**: If a source fails (webhook down, email forwarding broken), should alert but not block other sources. Each ingestion path needs independent retry logic.

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

- **FAQ knowledge base**: Store as markdown file or SQLite table with Q&A pairs + metadata (category, keywords, confidence threshold). Customer will provide via call recordings and domain knowledge session post-prototype.
- **FAQ categories to cover** (based on transcript):
  - Oak season restrictions ("Oak season is currently closed until November to prevent oak wilt infection")
  - Service types and pricing guidance (removal vs trimming, stump grinding)
  - Service area coverage (Northeast & Central Ohio, specific counties)
  - Scheduling and availability (currently booking 1 week out)
  - Emergency service (24/7 availability for tree-on-house situations)
  - Credentials (ISA-certified arborists, 80+ years experience, fully insured)
- **Response generation**: SoTA tier model (Anthropic/Google/OpenAI). Prompt includes: (a) lead details, (b) full FAQ knowledge base, (c) company tone guidelines (professional, knowledgeable, responsive), (d) instruction to book consultation call if inquiry is complex.
- **Tone matching**: Screenshot shows Premier Tree Specialists' actual response: professional, informative, consultative. Not salesy, not overly formal. Responses should sound like an arborist, not a chatbot.
- **Confidence scoring**: Model should self-assess response quality. High confidence = FAQ perfectly matches inquiry + all required info present. Low confidence = FAQ partially matches OR inquiry has unusual details OR missing critical data.
- **Fallback behavior**: If confidence <50%, don't attempt response generation — just flag for full manual review with extracted lead data.

### 4. Confidence-Based Routing

**As a** call team member  
**I want** only uncertain responses to require my review  
**So that** I focus on complex cases instead of approving obvious responses

**Implementation Considerations:**

- **Confidence threshold**: 80% per transcript discussion. This is tunable post-launch based on false positive/negative rates.
- **Review queue UI**: htmx-powered dashboard showing pending drafts. Each entry displays: (a) original lead inquiry, (b) extracted data, (c) generated response, (d) confidence score + reasoning, (e) one-click approve/edit/reject buttons.
- **Review workflow**: Approver can edit draft before sending. After approval, system sends immediately via text + email. Edits should feed back into FAQ learning (manually curated for now, could automate later).
- **Auto-send logging**: All auto-sent responses should log to audit trail with: lead ID, response text, confidence score, timestamp. Allows post-review of quality.
- **Escalation rules**: Certain keywords should force manual review regardless of confidence: "emergency", "tree on house", "lawsuit", "refund", complaints about prior work, etc.
- **Response time tracking**: Dashboard should show "time to first response" metric per lead. Goal is <1 min for 80%+ auto-sends.

### 5. Dual-Channel Outreach

**As a** marketing-focused business owner  
**I want** to respond via both the original channel AND email  
**So that** I maximize engagement and provide multiple contact paths

**Implementation Considerations:**

- **Text/message reply**: Send via same channel lead came from. Google LSA messages = reply via Google LSA message API (if using webhook service, it provides send capability). Website form doesn't have two-way messaging — skip text reply for this source. AnswerForce = no text reply (came from phone call that went to voicemail).
- **Email follow-up**: Always send regardless of source. Use customer's email if provided, otherwise skip (don't guess/enrich email for now — future enhancement).
- **Email content**: Should match text reply but can be slightly more detailed (include links, formatting, company logo). Signature should include: company name, phone numbers (Cleveland & Columbus), website link, ISA-certified arborist badge mention.
- **Email validation**: Check email validity before sending (regex + DNS MX record check). Don't send to obviously fake emails (test@test.com, no@email.com, etc.). Bounces should update lead record.
- **SMS considerations**: If replying via text to Google LSA or website form, need Twilio integration. Website form submissions include phone number — can send SMS. Google LSA messages are within Google platform — may need to use LSA message reply instead of SMS.
- **Rate limiting**: Twilio and email providers have rate limits. Queue outbound messages if burst exceeds limits.

### 6. ArboStar CRM Integration

**As a** sales team member  
**I want** all processed leads automatically created in ArboStar  
**So that** I can follow up using our existing CRM workflow

**Implementation Considerations:**

- **API discovery**: Research revealed ArboStar API supports POST for lead creation at `https://[COMPANY_ID].arbostar.com/api/requests/create`. Required fields: name, email, phone, address, city, state, postal, country. Optional: details, address_notes.
- **API authentication**: API key generated in Company Management → API Access section of ArboStar dashboard. Customer must provide this post-prototype.
- **Sync timing**: Push to ArboStar after response is sent (for auto-sends) or after human approves (for queued drafts). Don't push before response — reduces duplicate lead risk if customer calls separately.
- **Field mapping**: 
  - Name → name
  - Email → email  
  - Phone → phone
  - Address extracted → address, city, state, postal (may need geocoding to get full address from zip)
  - Scope of work → details
  - Lead source tag → address_notes ("Source: Google LSA Message" / "Source: Website Form" / "Source: AnswerForce")
- **Error handling**: If ArboStar API call fails (network, auth, invalid data), should retry with exponential backoff. Don't block response sending on CRM sync — can backfill later if needed.
- **Email fallback**: ArboStar also supports email-based lead import at `company_id@leads.arbostar.com`. If API consistently fails, fallback to email import with structured format.
- **Deduplication in ArboStar**: ArboStar likely dedupes by phone number. If lead already exists (customer called earlier), API may update existing record vs creating duplicate. Confirm behavior during integration.

---

## Data Sources

| Source | Type | Direction | Integration Method | Notes |
|--------|------|-----------|-------------------|-------|
| **Google Local Service Ads** | External Platform | Inbound | Third-party webhook (Hatch/LeadTruffle) OR email monitoring | Provides message leads in real-time via webhook to OAuth-connected service. Fallback: parse email notifications (2-5 min delay, inconsistent format). Admin-level Google Ads permissions required. |
| **Website Form (Vercel)** | Customer-Built | Inbound | Webhook OR database access | Customer built lead capture form in Vercel. Can add POST webhook to form handler, or access Vercel database/logs if storing submissions there. Form fields: name, email, phone, zip code, service type dropdown. |
| **AnswerForce** | Third-Party Service | Inbound | Email parsing (forwarding) OR API | After-hours answering service emails summaries to `customerservice@premiertreesllc.com`. Format includes: timestamp, caller name, phone, message details. Forward to agent inbox for parsing. May also have API (check during implementation). |
| **ArboStar CRM** | External Platform | Outbound | REST API (POST) | Tree care CRM. API endpoint: `https://[COMPANY_ID].arbostar.com/api/requests/create`. Supports lead creation with name, email, phone, address, details. API key auth. Email import fallback available. |
| **Twilio** | Third-Party Service | Outbound | REST API | SMS sending for text message replies. Required for website form leads (customer provided phone). May not be needed for Google LSA if using webhook service's reply capability. |
| **SendGrid or Mailgun** | Third-Party Service | Outbound | REST API | Transactional email sending for dual-channel follow-up. All leads get email if email address is provided. |

---

## Confidence Score

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| **Scope Definition** | 4/5 | Clear conversation with explicit commitments. Data sources identified and demonstrated via screen share. Data fields explicitly listed. Response approach well-defined (FAQ-based, 80% confidence threshold, dual-channel sending). Minor ambiguity: exact FAQ content must be gathered post-call via customer session. Minor decision point: Google LSA webhook provider vs email monitoring approach. |
| **Technical Feasibility** | 4/5 | ArboStar API supports POST operations (confirmed via research) — simpler than customer expected. Website form integration straightforward (Vercel). AnswerForce email parsing or API viable. Google LSA has proven third-party webhook solutions (Hatch/LeadTruffle). AI response generation is well-understood problem space. Only uncertainty: confidence scoring reliability for domain-specific arborist responses — requires careful FAQ curation and prompt tuning to hit 80% auto-send rate target. |
| **Customer Impact** | 5/5 | Directly solves stated pain (non-phone leads falling through cracks). Measurable improvement (15+ min → <1 min response time for 80% of leads). Frees team capacity (80% automation rate). Improves Google LSA ranking via speed-to-lead. Enables unified lead capture KPI. Customer is technically savvy founder actively trying to build this himself — high engagement and clear value understanding. |
| **Overall** | **4/5** | Build is well-scoped and highly valuable. Main risk is FAQ knowledge base quality for domain-specific responses. Post-prototype FAQ gathering session critical for hitting 80% auto-send target. |

---

## Out of Scope (Future Phases)

**Phase 2: Voice Agent for Overflow Calls**
- AI voice agent to handle phone calls that ring 6-8 times without answer
- Collects customer info via interactive voice prompts
- Routes to dashboard for follow-up
- Explicitly deferred during transcript: "I don't want to do that quite yet for you, because, like, that would be the next step, right?"
- Mentioned as backup for unanswered calls vs primary phone handling

**Phase 3: Sales Appointment Scheduler / Capacity Planning**
- Dispatch board showing sales rep availability by zone and day
- Capacity tracking (8-10 appointments per rep per day)
- Zone-based routing (4 geographic zones across service area)
- Visual capacity planning for office manager
- Dynamic zone assignment based on demand
- Detailed discussion in transcript (~08:12-17:40) but separate from committed build
- Matt is actively prototyping this in Vercel/Replit separately

**Phase 4: Lead Scoring and Prioritization**
- Score leads by potential value (tree species, job scope, neighborhood demographics)
- Elevate high-value leads for faster human review
- Historical data analysis (8,000+ invoices) to predict job value by zip code
- Mentioned in transcript (~36:42-37:00) as "might not be [included], we might do, like, a first pass on, like, size"

**Phase 5: Proactive Outreach Campaigns**
- Bug/disease outbreak alerts to past customers in affected areas
- Seasonal service reminders based on customer history
- Discussed in transcript (~33:18-33:35) as "definitely a future agent idea"

**Discussed but Rejected:**
- Changing workflows to fit off-the-shelf products (Matt explicitly rejected this approach, wants custom solution)

---

## Screen Share Timestamps

Key moments where systems were demonstrated:

- **10:27-14:30** — ArboStar calendar interface showing current appointment booking system (multiple sales rep calendars, high latency, requires multiple tabs)
- **12:50-14:30** — Matt's Vercel mockup of capacity planning tool (dispatch board concept for future phase)
- **26:30-27:40** — Google Local Service Ads interface showing message leads list and conversation threads
- **29:25-35:40** — Website form admin dashboard showing incoming submissions
- **36:50-37:30** — Individual Google LSA message detail view with conversation history and manual response flow

**Screenshots referenced:** `113_27m02s.jpg` (Google LSA leads list), `197_36m50s.jpg` (Google LSA message conversation detail showing oak season response example)

---

## Audit Notes

**Verification Summary:**

All user stories traced to transcript commitments. Build scope narrowed to non-phone lead automation only — voice agent and capacity planning tool explicitly deferred to future phases per transcript. Three items flagged during audit:

1. **Voice agent**: Discussed (06:14-08:00) but Zaki explicitly deferred: "I don't want to do that quite yet for you, because, like, that would be the next step, right? I don't want to be the front… I want to be the backup" (~28:06-28:10). Correctly moved to Out of Scope.

2. **Capacity planning tool**: Extensively discussed with screen share demo (08:12-17:40) but represents a separate build idea. Matt is actively prototyping this himself in Vercel. Zaki pivoted conversation to focus on lead intake automation as the first build (~21:36-25:20). Correctly moved to Out of Scope.

3. **ArboStar API capabilities**: Customer stated API is "read-only" with "no post capability" (~07:01-07:05). Research during PRD creation revealed ArboStar API does support POST operations for lead creation. This discovery is noted in Developer Brief and Implementation Considerations — makes build simpler than expected.

**Confidence in scope accuracy:** High. Zaki explicitly summarized three options at ~22:38-24:00 (voice agent, non-phone lead handling, capacity planning) and collaboratively decided with Matt to focus on non-phone lead automation (~24:41-25:05). Final build definition agreed at ~44:24-44:41.

**Build commitment:** Confirmed at end of call. Zaki: "I'm gonna write up a… specification… just like, hey, here's the four bullet points on what we're going to build." Matt: "Awesome. Really excited." (~46:49-48:08)