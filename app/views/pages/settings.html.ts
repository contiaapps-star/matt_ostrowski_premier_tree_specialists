import { html, raw } from 'hono/html';
import type { FaqEntry } from '../../db/schema.js';
import type { AiSettings, BusinessRules } from '../../services/settings.service.js';

export interface SettingsPageProps {
  businessRules: BusinessRules;
  ai: AiSettings;
  faqs: FaqEntry[];
  searchQuery?: string;
  csrfToken: string;
  flash?: { kind: 'success' | 'error'; text: string } | null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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

function monthOptions(selected: number): string {
  return MONTHS.map((label, idx) => {
    const value = idx + 1;
    const sel = value === selected ? ' selected' : '';
    return `<option value="${value}"${sel}>${label}</option>`;
  }).join('');
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

function settingsTabs() {
  return html`<nav class="flex gap-2 border-b border-slate-200" aria-label="Settings sections">
    <a href="#business-rules" class="border-b-2 border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700">Business Rules</a>
    <a href="#ai-settings" class="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">AI &amp; Prompt</a>
    <a href="#faq-knowledge" class="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">FAQ Knowledge Base</a>
  </nav>`;
}

function businessRulesSection(rules: BusinessRules, csrf: string) {
  const oak = rules.oakSeason;
  const keywordsText = rules.escalationKeywords.join(', ');
  const prefixesText = rules.serviceArea.zipPrefixes.join(', ');
  return html`<section id="business-rules" class="space-y-4" data-testid="business-rules-section">
    <header class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-slate-900">Business Rules</h2>
        <p class="text-xs text-slate-500">Control oak season, escalation keywords, and the service area used by extraction and routing.</p>
      </div>
    </header>

    <form
      class="pts-card space-y-5"
      method="post"
      action="/settings/business-rules"
      data-testid="business-rules-form"
    >
      <input type="hidden" name="_csrf" value="${csrf}" />

      <div class="space-y-3">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
              <span aria-hidden="true">🌳</span> Oak Season Restriction
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">Warn customers and delay oak trim bookings during wilt-risk months.</p>
          </div>
          <label class="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="oak_enabled" value="1" ${oak.enabled ? raw('checked') : ''} class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" data-testid="oak-enabled-toggle" />
            <span>Enabled</span>
          </label>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="flex flex-col">
            <span class="text-xs text-slate-500">Restriction starts</span>
            <select name="oak_start_month" class="pts-input mt-1" data-testid="oak-start-month">
              ${raw(monthOptions(oak.startMonth))}
            </select>
          </label>
          <label class="flex flex-col">
            <span class="text-xs text-slate-500">Restriction ends</span>
            <select name="oak_end_month" class="pts-input mt-1" data-testid="oak-end-month">
              ${raw(monthOptions(oak.endMonth))}
            </select>
          </label>
        </div>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Oak season message</span>
          <span class="text-[11px] text-slate-400 mb-1">Shown in the drafted reply when a customer requests oak trimming during the restricted period.</span>
          <textarea name="oak_message" rows="3" class="pts-input font-mono text-xs" data-testid="oak-message">${escapeHtml(oak.message)}</textarea>
        </label>
      </div>

      <hr class="border-slate-200" />

      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-red-700 flex items-center gap-1.5">
          <span aria-hidden="true">⚠</span> Emergency Escalation Keywords
        </h3>
        <p class="text-xs text-slate-500">Leads containing any of these words are always routed to review — regardless of confidence score.</p>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Keywords (comma-separated)</span>
          <span class="text-[11px] text-slate-400 mb-1">Add or remove words. Matching is case-insensitive. Multi-word phrases match with up to 4 filler words between tokens.</span>
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

      <div class="flex items-center justify-end pt-2">
        <button type="submit" class="pts-btn-primary" data-testid="save-business-rules">Save business rules</button>
      </div>
    </form>
  </section>`;
}

function aiSettingsSection(ai: AiSettings, csrf: string) {
  return html`<section id="ai-settings" class="space-y-4" data-testid="ai-settings-section">
    <header>
      <h2 class="text-base font-semibold text-slate-900">AI &amp; Prompt Settings</h2>
      <p class="text-xs text-slate-500">Control the model, parameters, and prompts used for extraction and response generation.</p>
    </header>

    <form
      class="pts-card space-y-5"
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
          <span class="text-[11px] text-slate-400 mb-1">Maximum length of generated response.</span>
          <input type="number" min="50" max="4000" name="max_tokens" value="${ai.maxTokens}" class="pts-input" data-testid="ai-max-tokens" />
        </label>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Temperature</span>
          <span class="text-[11px] text-slate-400 mb-1">0 = deterministic, 1 = creative. Recommended 0.3–0.5.</span>
          <input type="number" min="0" max="1" step="0.05" name="temperature" value="${ai.temperature}" class="pts-input" data-testid="ai-temperature" />
        </label>
      </div>

      <label class="flex flex-col">
        <span class="text-xs text-slate-500">System prompt</span>
        <span class="text-[11px] text-slate-400 mb-1">The persona and rules given to the AI before every response. Changes take effect on the next inbound lead.</span>
        <textarea name="system_prompt" rows="10" class="pts-input font-mono text-xs" data-testid="ai-system-prompt">${escapeHtml(ai.systemPrompt)}</textarea>
      </label>

      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Extraction prompt</span>
        <span class="text-[11px] text-slate-400 mb-1">Instructions for extracting structured data from raw messages. Prepended to the extraction request.</span>
        <textarea name="extraction_prompt" rows="5" class="pts-input font-mono text-xs" data-testid="ai-extraction-prompt">${escapeHtml(ai.extractionPrompt)}</textarea>
      </label>

      <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span aria-hidden="true">💡</span>
        The system prompt supports these variables: <code>{faq_context}</code>, <code>{office_phone}</code>, <code>{office_name}</code>.
      </div>

      <div class="flex items-center justify-end pt-2">
        <button type="submit" class="pts-btn-primary" data-testid="save-ai-settings">Save AI settings</button>
      </div>
    </form>
  </section>`;
}

function faqRow(faq: FaqEntry, csrf: string, expanded: boolean) {
  const keywords = faq.keywords && faq.keywords.length > 0 ? faq.keywords : '(no keywords)';
  return html`<details
      class="pts-card border-l-4 border-l-brand-600"
      data-testid="faq-row"
      data-faq-id="${faq.id}"
      ${expanded ? raw('open') : ''}
    >
      <summary class="cursor-pointer flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="inline-flex items-center rounded-full bg-brand-50 text-brand-800 px-2 py-0.5 text-xs font-medium border border-brand-200" data-testid="faq-category">${escapeHtml(faq.category)}</span>
            <span class="text-[11px] text-slate-500 truncate font-mono">${escapeHtml(keywords)}</span>
            ${faq.active
              ? html`<span class="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-semibold">Active</span>`
              : html`<span class="inline-flex items-center rounded-full bg-slate-200 text-slate-700 px-2 py-0.5 text-[10px] font-semibold">Disabled</span>`}
          </div>
          <h3 class="text-sm font-semibold text-slate-900 truncate">${escapeHtml(faq.question)}</h3>
          <p class="text-xs text-slate-600 line-clamp-2">${escapeHtml(faq.answer.slice(0, 220))}${faq.answer.length > 220 ? '…' : ''}</p>
        </div>
        <span class="text-xs text-brand-700 hover:underline shrink-0">Edit ↗</span>
      </summary>

      <form class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" method="post" action="/settings/faqs/${faq.id}" data-testid="faq-edit-form">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Category</span>
          <input type="text" name="category" value="${escapeAttr(faq.category)}" class="pts-input" required />
        </label>
        <label class="flex flex-col">
          <span class="text-xs text-slate-500">Priority</span>
          <input type="number" min="0" max="9999" name="priority" value="${faq.priority}" class="pts-input" />
        </label>
        <label class="flex flex-col sm:col-span-2">
          <span class="text-xs text-slate-500">Question</span>
          <input type="text" name="question" value="${escapeAttr(faq.question)}" class="pts-input" required />
        </label>
        <label class="flex flex-col sm:col-span-2">
          <span class="text-xs text-slate-500">Answer</span>
          <textarea name="answer" rows="4" class="pts-input font-mono text-xs" required>${escapeHtml(faq.answer)}</textarea>
        </label>
        <label class="flex flex-col sm:col-span-2">
          <span class="text-xs text-slate-500">Keywords (comma-separated)</span>
          <input type="text" name="keywords" value="${escapeAttr(faq.keywords)}" class="pts-input font-mono text-xs" />
        </label>
        <label class="inline-flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="active" value="1" ${faq.active ? raw('checked') : ''} class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
          <span>Active</span>
        </label>
        <div class="sm:col-span-2 flex items-center justify-between gap-2 pt-1">
          <button
            type="submit"
            formaction="/settings/faqs/${faq.id}/delete"
            formmethod="post"
            class="pts-btn-danger"
            data-testid="faq-delete-btn"
            onclick="return confirm('Delete this FAQ entry? This cannot be undone.');"
          >Delete</button>
          <button type="submit" class="pts-btn-primary" data-testid="faq-save-btn">Save</button>
        </div>
      </form>
    </details>`;
}

function faqEmpty() {
  return html`<div class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500" data-testid="faq-empty">
    <p class="font-medium text-slate-700">No FAQ entries match.</p>
    <p class="mt-1 text-xs">Try a different search, or click <strong>+ Add entry</strong> below to create one.</p>
  </div>`;
}

export function faqListRegion(faqs: FaqEntry[], csrf: string, query: string | null) {
  return html`<div id="faq-list-region" class="space-y-2" data-testid="faq-list-region">
    ${faqs.length === 0 ? faqEmpty() : faqs.map((f) => faqRow(f, csrf, false))}
    <p class="text-xs text-slate-500 pt-1">
      ${faqs.length} ${faqs.length === 1 ? 'entry' : 'entries'}${query && query.length > 0 ? ` matching "${escapeHtml(query)}"` : ''}.
    </p>
  </div>`;
}

function faqAddForm(csrf: string) {
  return html`<details class="pts-card border-2 border-dashed border-brand-200" data-testid="faq-add-form-details">
    <summary class="cursor-pointer text-sm font-semibold text-brand-700 flex items-center gap-1.5">
      <span aria-hidden="true">＋</span> Add a new FAQ entry
    </summary>
    <form class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" method="post" action="/settings/faqs" data-testid="faq-add-form">
      <input type="hidden" name="_csrf" value="${csrf}" />
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Category</span>
        <input type="text" name="category" placeholder="e.g. pricing" class="pts-input" required />
      </label>
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Priority</span>
        <input type="number" min="0" max="9999" name="priority" value="50" class="pts-input" />
      </label>
      <label class="flex flex-col sm:col-span-2">
        <span class="text-xs text-slate-500">Question</span>
        <input type="text" name="question" placeholder="What do customers ask?" class="pts-input" required />
      </label>
      <label class="flex flex-col sm:col-span-2">
        <span class="text-xs text-slate-500">Answer</span>
        <textarea name="answer" rows="4" placeholder="Canonical response..." class="pts-input font-mono text-xs" required></textarea>
      </label>
      <label class="flex flex-col sm:col-span-2">
        <span class="text-xs text-slate-500">Keywords (comma-separated)</span>
        <input type="text" name="keywords" placeholder="e.g. price,cost,quote,estimate" class="pts-input font-mono text-xs" />
      </label>
      <label class="inline-flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" name="active" value="1" checked class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
        <span>Active</span>
      </label>
      <div class="sm:col-span-2 flex items-center justify-end pt-1">
        <button type="submit" class="pts-btn-primary" data-testid="faq-create-btn">Create FAQ entry</button>
      </div>
    </form>
  </details>`;
}

function faqSection(props: SettingsPageProps) {
  return html`<section id="faq-knowledge" class="space-y-4" data-testid="faq-section">
    <header>
      <h2 class="text-base font-semibold text-slate-900">FAQ Knowledge Base</h2>
      <p class="text-xs text-slate-500">These entries power the AI context and confidence scoring. Each category has a keyword list — leads matching those keywords get scored against this answer.</p>
    </header>

    <div class="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-slate-700 space-y-1">
      <div class="font-semibold text-brand-800">How the FAQ affects the system</div>
      <p>📊 <strong>Confidence scoring</strong> — leads matching a category's keywords get extra confidence points.</p>
      <p>🤖 <strong>AI responses</strong> — matched FAQ Q/A pairs are injected into the system prompt as canonical context.</p>
      <p>📝 <strong>Editing</strong> — answer changes take effect on the next inbound lead. Keyword changes affect scoring from the next lead onward.</p>
    </div>

    <form
      class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
      method="get"
      action="/settings"
      data-testid="faq-search-form"
    >
      <input type="hidden" name="section" value="faq" />
      <input
        type="search"
        name="q"
        value="${escapeAttr(props.searchQuery ?? '')}"
        placeholder="Search by category, question, or keyword…"
        class="pts-input flex-1"
        data-testid="faq-search-input"
      />
      <button type="submit" class="pts-btn-secondary">Search</button>
      ${props.searchQuery && props.searchQuery.length > 0
        ? html`<a href="/settings#faq-knowledge" class="pts-btn-secondary">Clear</a>`
        : ''}
    </form>

    ${faqListRegion(props.faqs, props.csrfToken, props.searchQuery ?? null)}

    ${faqAddForm(props.csrfToken)}
  </section>`;
}

export function settingsPage(props: SettingsPageProps) {
  return html`<div class="space-y-6 max-w-4xl mx-auto" data-testid="settings-page">
    <header>
      <h1 class="text-xl font-bold text-slate-900">Settings</h1>
      <p class="text-sm text-slate-600">Configure business rules, AI prompts, and the FAQ knowledge base. Changes take effect on the next inbound lead.</p>
    </header>
    ${flashBanner(props.flash ?? null)}
    ${settingsTabs()}
    ${businessRulesSection(props.businessRules, props.csrfToken)}
    ${aiSettingsSection(props.ai, props.csrfToken)}
    ${faqSection(props)}
  </div>`;
}
