import { html, raw } from 'hono/html';
import type { AiSettings, BusinessRules } from '../../services/settings.service.js';

export interface SettingsPageProps {
  businessRules: BusinessRules;
  ai: AiSettings;
  faqMarkdown: string;
  agentMailAddress: string;
  csrfToken: string;
  flash?: { kind: 'success' | 'error'; text: string } | null;
}

function escapeAttr(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flashBanner(flash: SettingsPageProps['flash']) {
  if (!flash) return html``;
  const palette =
    flash.kind === 'success'
      ? 'bg-green-50 border-green-200 text-green-900'
      : 'bg-red-50 border-red-200 text-red-900';
  return html`<div
      class="${palette} border rounded-md px-4 py-3 text-sm"
      role="status"
      aria-live="polite"
      data-testid="settings-flash"
    >${flash.text}</div>`;
}

function inboundSection(agentMailAddress: string) {
  const hasAddress = agentMailAddress.trim().length > 0;
  const safeAddress = escapeAttr(agentMailAddress);
  return html`<section id="inbound" class="space-y-3" data-testid="inbound-section" data-tour="settings-inbound">
    <header>
      <h2 class="text-base font-semibold text-slate-900 flex items-center gap-1.5">
        <span aria-hidden="true">📬</span> Inbound Email
      </h2>
      <p class="text-xs text-slate-500">Forward your incoming leads to this address. Set up Gmail filters that forward Google LSA notifications, AnswerForce summaries, and your website-form emails to this single inbox — the system parses everything from there and creates leads automatically.</p>
    </header>
    <div class="rounded-lg border border-brand-200 bg-brand-50/40 px-4 py-3 space-y-3" data-testid="inbound-card">
      ${hasAddress
        ? html`<div class="flex flex-wrap items-center justify-between gap-2">
            <code class="rounded bg-white border border-brand-200 px-2.5 py-1 text-sm font-mono text-brand-800" data-testid="agent-mail-address">${agentMailAddress}</code>
            <div class="flex items-center gap-2">
              <a
                href="/admin/agent-mail-archive"
                class="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                data-testid="agent-mail-archive-link"
                title="View archived messages"
              >📥 View archive</a>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-brand-600 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                data-testid="agent-mail-copy"
                onclick="(function(b){var v='${safeAddress}';if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(function(){b.textContent='✓ Copied';setTimeout(function(){b.innerHTML='\\u{1F4CB} Copy';},1500);});}})(this)"
              >📋 Copy</button>
            </div>
          </div>`
        : html`<div class="text-sm text-slate-700" data-testid="agent-mail-pending">
            <span class="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Pending</span>
            <span class="ml-2 text-xs text-slate-500">Set <code class="bg-white px-1 rounded">AGENT_MAIL_API_KEY</code> in your env to provision the inbox automatically on next boot.</span>
          </div>`}
      <ul class="text-xs text-slate-600 space-y-0.5 list-disc pl-5">
        <li>Forward Google LSA notifications (Lead messages) to this address.</li>
        <li>Forward AnswerForce email summaries to this address.</li>
        <li>Forward website-form notifications to this address (or POST to <code class="bg-white px-1 rounded">/api/intake/website-form</code> directly).</li>
      </ul>
      ${hasAddress ? gmailInstructionsAccordion(agentMailAddress) : html``}
    </div>
  </section>`;
}

function gmailInstructionsAccordion(agentMailAddress: string) {
  return html`<details class="group rounded-md border border-brand-200 bg-white" data-testid="inbound-instructions" data-tour="settings-inbound-instructions">
    <summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50 flex items-center justify-between">
      <span><span aria-hidden="true">🛠</span> How to set up Gmail forwarding</span>
      <span class="text-xs text-brand-600 group-open:hidden">Show steps</span>
      <span class="text-xs text-brand-600 hidden group-open:inline">Hide</span>
    </summary>
    <div class="px-4 py-3 space-y-4 text-xs text-slate-700 border-t border-brand-200">
      <div>
        <h4 class="font-semibold text-slate-900 mb-1">1. Add <code class="bg-slate-100 px-1 rounded">${agentMailAddress}</code> as a forwarding address (one time)</h4>
        <ol class="list-decimal pl-5 space-y-0.5">
          <li>In Gmail, click the gear ⚙ → <b>See all settings</b>.</li>
          <li>Open the <b>Forwarding and POP/IMAP</b> tab.</li>
          <li>Click <b>Add a forwarding address</b> and paste <code class="bg-slate-100 px-1 rounded">${agentMailAddress}</code>.</li>
          <li>Gmail sends a confirmation email to that address. The team at Sagan / Sara confirms it on the AgentMail side and you'll see it move to <i>verified</i>.</li>
          <li>Leave the radio at <b>Disable forwarding</b> at the bottom — we forward per-filter, not the whole inbox.</li>
        </ol>
      </div>
      <div>
        <h4 class="font-semibold text-slate-900 mb-1">2. Forward Google LSA leads</h4>
        <ol class="list-decimal pl-5 space-y-0.5">
          <li>In Settings, open the <b>Filters and Blocked Addresses</b> tab.</li>
          <li>Click <b>Create a new filter</b>.</li>
          <li>In the <b>From</b> field paste your LSA notifier address (typically <code class="bg-slate-100 px-1 rounded">noreply@google-business.com</code> or <code class="bg-slate-100 px-1 rounded">noreply@business.google.com</code> — check a recent LSA email to confirm).</li>
          <li>Click <b>Create filter</b>.</li>
          <li>Check ☑ <b>Forward it to:</b> and pick <code class="bg-slate-100 px-1 rounded">${agentMailAddress}</code>.</li>
          <li>Optionally check ☑ <b>Also apply filter to matching conversations</b> so historical LSA emails replay through the system.</li>
          <li>Click <b>Create filter</b>.</li>
        </ol>
      </div>
      <div>
        <h4 class="font-semibold text-slate-900 mb-1">3. Forward AnswerForce summaries</h4>
        <ol class="list-decimal pl-5 space-y-0.5">
          <li>Same flow as step 2, but use <code class="bg-slate-100 px-1 rounded">notifications@answerforce.com</code> in the <b>From</b> field.</li>
          <li>If your AnswerForce account uses a different sender, check a recent message summary email to copy the exact address.</li>
        </ol>
      </div>
      <div>
        <h4 class="font-semibold text-slate-900 mb-1">4. Forward website-form notifications</h4>
        <ol class="list-decimal pl-5 space-y-0.5">
          <li>Identify the address that delivers your contact-form submissions (Vercel, WordPress, Formspree, etc.).</li>
          <li>Same Gmail filter flow as step 2 with that <b>From</b> address.</li>
          <li>Alternative (recommended for new forms): point the form's webhook directly at <code class="bg-slate-100 px-1 rounded">POST /api/intake/website-form</code> with the <code class="bg-slate-100 px-1 rounded">x-webhook-secret</code> header — the system parses the JSON without needing email at all.</li>
        </ol>
      </div>
      <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
        <p class="text-amber-900"><b>Heads up:</b> every email forwarded to this address is archived in full — even if the parser can't extract a lead. That gives the team real samples to tune the parsers against. Open <a href="/admin/agent-mail-archive" class="underline font-semibold">📥 View archive</a> to inspect what's arrived.</p>
      </div>
    </div>
  </details>`;
}

function businessRulesSection(rules: BusinessRules, csrf: string) {
  const keywordsText = rules.escalationKeywords.join(', ');
  const prefixesText = rules.serviceArea.zipPrefixes.join(', ');
  return html`<section id="business-rules" class="space-y-3" data-testid="business-rules-section" data-tour="settings-business-rules">
    <header>
      <h2 class="text-base font-semibold text-slate-900 flex items-center gap-1.5">
        <span aria-hidden="true">⚖️</span> Business Rules
      </h2>
      <p class="text-xs text-slate-500">Escalation keywords always force review. ZIP prefixes define which leads count as in-area — anything outside is flagged.</p>
    </header>

    <form
      class="rounded-lg border border-slate-200 bg-white px-4 py-4 space-y-5"
      method="post"
      action="/settings/business-rules"
      data-testid="business-rules-form"
    >
      <input type="hidden" name="_csrf" value="${csrf}" />

      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-rose-700 flex items-center gap-1.5">
          <span aria-hidden="true">⚠</span> Emergency Escalation Keywords
        </h3>
        <p class="text-xs text-slate-500">Leads containing any of these words are always routed to manual review — regardless of confidence score.</p>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Keywords (comma-separated)</span>
          <span class="text-[11px] text-slate-400 mb-1">Matching is case-insensitive. Multi-word phrases match with up to 4 filler words between tokens.</span>
          <textarea name="escalation_keywords" rows="3" class="pts-input font-mono text-xs" data-testid="escalation-keywords">${escapeHtml(keywordsText)}</textarea>
        </label>
      </div>

      <hr class="border-slate-200" />

      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-pink-700 flex items-center gap-1.5">
          <span aria-hidden="true">📍</span> Service Area
        </h3>
        <p class="text-xs text-slate-500">Leads from ZIP codes not matching these prefixes are flagged as out-of-area when the ZIP isn't in the seed table.</p>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">ZIP code prefixes (comma-separated, first 3 digits)</span>
          <span class="text-[11px] text-slate-400 mb-1">E.g. 440 covers all of 44000–44099 (Cleveland metro). Add or remove prefixes to expand or shrink your coverage.</span>
          <textarea name="zip_prefixes" rows="2" class="pts-input font-mono text-xs" data-testid="zip-prefixes">${escapeHtml(prefixesText)}</textarea>
        </label>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Service area description</span>
          <span class="text-[11px] text-slate-400 mb-1">Plain-English description shown in system messages.</span>
          <input type="text" name="service_area_description" value="${escapeAttr(rules.serviceArea.description)}" class="pts-input" data-testid="service-area-description" />
        </label>
      </div>

      <div class="flex items-center justify-end pt-1">
        <button type="submit" class="pts-btn-primary" data-testid="save-business-rules">Save business rules</button>
      </div>
    </form>
  </section>`;
}

function aiSettingsSection(ai: AiSettings, csrf: string) {
  return html`<section id="ai-settings" class="space-y-3" data-testid="ai-settings-section" data-tour="settings-ai">
    <header>
      <h2 class="text-base font-semibold text-slate-900 flex items-center gap-1.5">
        <span aria-hidden="true">🤖</span> AI &amp; Prompt
      </h2>
      <p class="text-xs text-slate-500">Default model is Google Gemini Flash — fast and cost-effective. Override with any OpenRouter model id.</p>
    </header>

    <form
      class="rounded-lg border border-slate-200 bg-white px-4 py-4 space-y-5"
      method="post"
      action="/settings/ai"
      data-testid="ai-settings-form"
    >
      <input type="hidden" name="_csrf" value="${csrf}" />

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Model</span>
          <span class="text-[11px] text-slate-400 mb-1">OpenRouter model string.</span>
          <input type="text" name="model" value="${escapeAttr(ai.model)}" class="pts-input font-mono text-xs" data-testid="ai-model" />
        </label>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Max tokens</span>
          <span class="text-[11px] text-slate-400 mb-1">Maximum length of generated response. Recommended 400–500 for SMS/email replies.</span>
          <input type="number" min="50" max="1000" name="max_tokens" value="${ai.maxTokens}" class="pts-input" data-testid="ai-max-tokens" />
        </label>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Temperature</span>
          <span class="text-[11px] text-slate-400 mb-1">0 = deterministic, 1 = creative. Recommended 0.3–0.5.</span>
          <input type="number" min="0" max="1" step="0.05" name="temperature" value="${ai.temperature}" class="pts-input" data-testid="ai-temperature" />
        </label>
      </div>

      <label class="flex flex-col">
        <span class="text-xs text-slate-500">System prompt</span>
        <span class="text-[11px] text-slate-400 mb-1">The persona and rules given to the AI before every response. Drives the auto-generated text shown in the detail panel.</span>
        <textarea name="system_prompt" rows="10" class="pts-input font-mono text-xs" data-testid="ai-system-prompt">${escapeHtml(ai.systemPrompt)}</textarea>
      </label>

      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Extraction prompt</span>
        <span class="text-[11px] text-slate-400 mb-1">Instructions for extracting structured data from raw messages.</span>
        <textarea name="extraction_prompt" rows="5" class="pts-input font-mono text-xs" data-testid="ai-extraction-prompt">${escapeHtml(ai.extractionPrompt)}</textarea>
      </label>

      <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span aria-hidden="true">💡</span>
        The system prompt supports these variables: <code>{faq_context}</code>, <code>{office_phone}</code>, <code>{office_name}</code>.
      </div>

      <div class="flex items-center justify-end pt-1">
        <button type="submit" class="pts-btn-primary" data-testid="save-ai-settings">Save AI settings</button>
      </div>
    </form>
  </section>`;
}

function faqSection(faqMarkdown: string, csrf: string) {
  return html`<section id="faq-knowledge" class="space-y-3" data-testid="faq-section" data-tour="settings-faq">
    <header>
      <h2 class="text-base font-semibold text-slate-900 flex items-center gap-1.5">
        <span aria-hidden="true">📚</span> FAQ
      </h2>
      <p class="text-xs text-slate-500">Free-form markdown — copy &amp; paste in question / answer pairs. The AI uses this verbatim as canonical context when drafting responses.</p>
    </header>
    <form
      class="rounded-lg border border-slate-200 bg-white px-4 py-4 space-y-3"
      method="post"
      action="/settings/faq"
      data-testid="faq-form"
    >
      <input type="hidden" name="_csrf" value="${csrf}" />
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Knowledge base (markdown)</span>
        <span class="text-[11px] text-slate-400 mb-1">Use <code>## Question</code> headings followed by the answer. No category, priority, or keywords needed.</span>
        <textarea
          name="faq_markdown"
          rows="20"
          class="pts-input font-mono text-xs"
          data-testid="faq-markdown"
          spellcheck="false"
        >${escapeHtml(faqMarkdown)}</textarea>
      </label>
      <div class="flex items-center justify-end">
        <button type="submit" class="pts-btn-primary" data-testid="save-faq">Save FAQ</button>
      </div>
    </form>
  </section>`;
}

function tourResumeBootstrap() {
  return raw(`<script>
    (function(){
      function go(){
        try {
          var url = new URL(window.location.href);
          var resume = url.searchParams.get('tour');
          if (resume && window.startTour) {
            setTimeout(function(){ window.startTour({ resumeStep: parseInt(resume, 10) }); }, 250);
            url.searchParams.delete('tour');
            history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
          }
          // When the final tour step's CTA navigates here, auto-open the
          // Gmail-instructions <details> and scroll it into view so the
          // client lands directly on the steps they need.
          if (window.location.hash === '#inbound-instructions-open') {
            var det = document.querySelector('[data-testid="inbound-instructions"]');
            if (det) {
              det.setAttribute('open', '');
              setTimeout(function(){ det.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
            }
            history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + '#inbound');
          }
        } catch(e) {}
      }
      if (document.readyState !== 'loading') go(); else document.addEventListener('DOMContentLoaded', go);
    })();
  </script>`);
}

export function settingsPage(props: SettingsPageProps) {
  return html`<div class="space-y-6 max-w-4xl mx-auto" data-testid="settings-page">
    <header>
      <h1 class="text-xl font-bold text-slate-900">Settings</h1>
      <p class="text-sm text-slate-600">All the rules in one scrollable page. Changes take effect on the next inbound lead.</p>
    </header>
    ${flashBanner(props.flash ?? null)}
    ${inboundSection(props.agentMailAddress)}
    ${businessRulesSection(props.businessRules, props.csrfToken)}
    ${aiSettingsSection(props.ai, props.csrfToken)}
    ${faqSection(props.faqMarkdown, props.csrfToken)}
    ${tourResumeBootstrap()}
  </div>`;
}
