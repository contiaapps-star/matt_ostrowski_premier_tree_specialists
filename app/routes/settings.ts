import { count, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { getDb } from '../db/client.js';
import { leads } from '../db/schema.js';
import { authMiddleware, csrfMiddleware, type AuthVariables } from '../middleware/auth.js';
import {
  createFaq,
  deleteFaq,
  FaqValidationError,
  listFaqs,
  searchFaqs,
  updateFaq,
} from '../services/faq-admin.service.js';
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
  search: string | null,
  flash: { kind: 'success' | 'error'; text: string } | null = null,
) {
  const db = getDb();
  const businessRules = getBusinessRules({ db });
  const ai = getAiSettings({ db });
  const faqs = search && search.trim().length > 0 ? searchFaqs(search, { db }) : listFaqs({ db });
  const csrfToken = c.get('csrfToken');
  const user = c.get('user');
  const reviewCount = getReviewQueueCount();
  const body = settingsPage({
    businessRules,
    ai,
    faqs,
    searchQuery: search ?? '',
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
      showTourButton: false,
      showSimulateButton: false,
    }),
  );
}

settingsRoute.get('/settings', (c) => {
  const url = new URL(c.req.url);
  return renderPage(c, url.searchParams.get('q'));
});

function redirectWith(c: Context, hash: string, kind: 'success' | 'error', text: string) {
  const params = new URLSearchParams({ flash: kind, msg: text });
  return c.redirect(`/settings?${params.toString()}${hash}`);
}

settingsRoute.post('/settings/business-rules', async (c) => {
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const oakEnabled = body['oak_enabled'] === '1' || body['oak_enabled'] === 'on';
  const oakStart = Number.parseInt(String(body['oak_start_month'] ?? '4'), 10);
  const oakEnd = Number.parseInt(String(body['oak_end_month'] ?? '10'), 10);
  const oakMessage = typeof body['oak_message'] === 'string' ? (body['oak_message'] as string) : '';
  const escalationKeywords = parseCommaList(typeof body['escalation_keywords'] === 'string' ? (body['escalation_keywords'] as string) : '');
  const zipPrefixes = parseCommaList(typeof body['zip_prefixes'] === 'string' ? (body['zip_prefixes'] as string) : '');
  const description = typeof body['service_area_description'] === 'string' ? (body['service_area_description'] as string) : '';

  const next: BusinessRules = {
    oakSeason: {
      enabled: oakEnabled,
      startMonth: oakStart,
      endMonth: oakEnd,
      message: oakMessage,
    },
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

function readFaqInput(body: Record<string, unknown>) {
  return {
    category: typeof body['category'] === 'string' ? (body['category'] as string) : '',
    question: typeof body['question'] === 'string' ? (body['question'] as string) : '',
    answer: typeof body['answer'] === 'string' ? (body['answer'] as string) : '',
    keywords: typeof body['keywords'] === 'string' ? (body['keywords'] as string) : '',
    priority: Number(body['priority'] ?? 0),
    active: body['active'] === '1' || body['active'] === 'on',
  };
}

settingsRoute.post('/settings/faqs', async (c) => {
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  try {
    createFaq(readFaqInput(body));
  } catch (err) {
    if (err instanceof FaqValidationError) {
      return redirectWith(c, '#faq-knowledge', 'error', err.message);
    }
    throw err;
  }
  return redirectWith(c, '#faq-knowledge', 'success', 'FAQ entry created.');
});

settingsRoute.post('/settings/faqs/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  try {
    const updated = updateFaq(id, readFaqInput(body));
    if (!updated) return redirectWith(c, '#faq-knowledge', 'error', 'FAQ entry not found.');
  } catch (err) {
    if (err instanceof FaqValidationError) {
      return redirectWith(c, '#faq-knowledge', 'error', err.message);
    }
    throw err;
  }
  return redirectWith(c, '#faq-knowledge', 'success', 'FAQ entry updated.');
});

settingsRoute.post('/settings/faqs/:id/delete', (c) => {
  const id = c.req.param('id');
  const ok = deleteFaq(id);
  if (!ok) return redirectWith(c, '#faq-knowledge', 'error', 'FAQ entry not found.');
  return redirectWith(c, '#faq-knowledge', 'success', 'FAQ entry deleted.');
});
