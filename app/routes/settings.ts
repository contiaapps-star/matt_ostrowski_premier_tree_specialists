import { count, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { getDb } from '../db/client.js';
import { leads } from '../db/schema.js';
import { authMiddleware, csrfMiddleware, type AuthVariables } from '../middleware/auth.js';
import { resolveAgentMailAddress } from '../services/agentmail-bootstrap.service.js';
import { getFaqMarkdown, setFaqMarkdown } from '../services/faq.service.js';
import {
  getAiSettings,
  getBusinessRules,
  parseCommaList,
  updateAiSettings,
  updateBusinessRules,
  type AiSettings,
  type BusinessRules,
} from '../services/settings.service.js';
import { baseLayout } from '../views/layouts/base.html.js';
import { settingsPage } from '../views/pages/settings.html.js';

export const settingsRoute = new Hono<{ Variables: AuthVariables }>();

settingsRoute.use('*', authMiddleware);
settingsRoute.use('*', csrfMiddleware);

function getReviewQueueCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'awaiting_review'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

function readFlash(c: Context<{ Variables: AuthVariables }>): { kind: 'success' | 'error'; text: string } | null {
  const url = new URL(c.req.url);
  const kindParam = url.searchParams.get('flash');
  const text = url.searchParams.get('msg');
  if (!kindParam || !text) return null;
  if (kindParam !== 'success' && kindParam !== 'error') return null;
  return { kind: kindParam, text };
}

function renderPage(
  c: Context<{ Variables: AuthVariables }>,
  flash: { kind: 'success' | 'error'; text: string } | null = null,
) {
  const db = getDb();
  const businessRules = getBusinessRules({ db });
  const ai = getAiSettings({ db });
  const faqMarkdown = getFaqMarkdown({ db });
  const csrfToken = c.get('csrfToken');
  const user = c.get('user');
  const reviewCount = getReviewQueueCount();
  const body = settingsPage({
    businessRules,
    ai,
    faqMarkdown,
    agentMailAddress: resolveAgentMailAddress({ db }),
    csrfToken,
    flash: flash ?? readFlash(c),
  });
  return c.html(
    baseLayout({
      title: 'Settings',
      body,
      reviewQueueCount: reviewCount,
      userDisplayName: user?.displayName ?? null,
      csrfToken,
      showTourButton: true,
      showSimulateButton: false,
    }),
  );
}

settingsRoute.get('/settings', (c) => renderPage(c));

function redirectWith(c: Context, hash: string, kind: 'success' | 'error', text: string) {
  const params = new URLSearchParams({ flash: kind, msg: text });
  return c.redirect(`/settings?${params.toString()}${hash}`);
}

settingsRoute.post('/settings/business-rules', async (c) => {
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const escalationKeywords = parseCommaList(typeof body['escalation_keywords'] === 'string' ? (body['escalation_keywords'] as string) : '');
  const zipPrefixes = parseCommaList(typeof body['zip_prefixes'] === 'string' ? (body['zip_prefixes'] as string) : '');
  const description = typeof body['service_area_description'] === 'string' ? (body['service_area_description'] as string) : '';

  // Per Zaki: oak season ceases to be a configurable rule. We still persist
  // a stub object so the BusinessRules shape stays consistent for any
  // service that reads `oakSeason` — but the toggle is forced off and the
  // months stay at defaults.
  const existing = getBusinessRules();
  const next: BusinessRules = {
    oakSeason: { ...existing.oakSeason, enabled: false },
    escalationKeywords,
    serviceArea: {
      zipPrefixes,
      description,
    },
  };
  updateBusinessRules(next);
  return redirectWith(c, '#business-rules', 'success', 'Business rules saved.');
});

settingsRoute.post('/settings/ai', async (c) => {
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const next: AiSettings = {
    model: typeof body['model'] === 'string' ? (body['model'] as string).trim() : '',
    maxTokens: Number(body['max_tokens'] ?? 0),
    temperature: Number(body['temperature'] ?? 0),
    systemPrompt: typeof body['system_prompt'] === 'string' ? (body['system_prompt'] as string) : '',
    extractionPrompt: typeof body['extraction_prompt'] === 'string' ? (body['extraction_prompt'] as string) : '',
  };
  updateAiSettings(next);
  return redirectWith(c, '#ai-settings', 'success', 'AI settings saved.');
});

settingsRoute.post('/settings/faq', async (c) => {
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const md = typeof body['faq_markdown'] === 'string' ? (body['faq_markdown'] as string) : '';
  if (md.length > 100_000) {
    return redirectWith(c, '#faq-knowledge', 'error', 'FAQ content is too large (>100k chars).');
  }
  setFaqMarkdown(md);
  return redirectWith(c, '#faq-knowledge', 'success', 'FAQ saved.');
});
