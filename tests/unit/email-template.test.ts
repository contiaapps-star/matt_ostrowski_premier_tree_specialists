import { describe, expect, it } from 'vitest';
import type { Lead } from '../../app/db/schema.js';
import { renderLeadResponseEmail, __testing } from '../../app/services/email-template.service.js';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date('2026-04-27T12:00:00Z');
  return {
    id: 'lead-1',
    receivedAt: now,
    source: 'google_lsa_email',
    dedupPhoneE164: '+12165550001',
    status: 'auto_sent',
    customerName: 'Diane Owens',
    customerPhoneE164: '+12165550001',
    customerEmail: 'diane@example.com',
    customerAddress: '5234 Detroit Ave',
    customerCity: 'Cleveland',
    customerZip: '44113',
    serviceAreaCounty: 'Cuyahoga',
    outOfServiceArea: false,
    scopeRaw: 'Big oak tree',
    scopeCategory: 'trimming',
    scopeSummary: 'Oak tree trim',
    confidenceScore: 0.92,
    confidenceReasoning: 'high',
    escalationTriggered: false,
    escalationReason: null,
    responseText: 'reply',
    responseSentAt: now,
    responseSentBy: 'auto',
    arbostarRequestId: null,
    arbostarSyncedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Lead;
}

describe('renderLeadResponseEmail', () => {
  it('uses fixed subject line', () => {
    const out = renderLeadResponseEmail(makeLead(), 'Hello world');
    expect(out.subject).toBe('Re: Your inquiry — Premier Tree Specialists');
  });

  it('greets by first name when available', () => {
    const out = renderLeadResponseEmail(makeLead({ customerName: 'Diane Owens' }), 'Body');
    expect(out.text).toContain('Hi Diane,');
    expect(out.html).toContain('Hi Diane,');
  });

  it('falls back to a generic greeting when name is missing', () => {
    const out = renderLeadResponseEmail(makeLead({ customerName: null }), 'Body');
    expect(out.text).toContain('Hello,');
    expect(out.html).toContain('Hello,');
  });

  it('embeds the response text in both html and text bodies', () => {
    const responseText =
      'Thank you for reaching out! We can absolutely schedule an estimate appointment.';
    const out = renderLeadResponseEmail(makeLead(), responseText);
    expect(out.text).toContain(responseText);
    expect(out.html).toContain('Thank you for reaching out!');
  });

  it('escapes HTML-unsafe characters in the response when rendering HTML', () => {
    const responseText = 'price < 5 & quality > 9 "ok"';
    const out = renderLeadResponseEmail(makeLead(), responseText);
    expect(out.html).toContain('&lt;');
    expect(out.html).toContain('&amp;');
    expect(out.html).toContain('&gt;');
    expect(out.html).toContain('&quot;');
    expect(out.text).toContain(responseText);
  });

  it('includes Cleveland and Columbus phones, credentials line, website url, and company name', () => {
    const out = renderLeadResponseEmail(makeLead(), 'Body');
    expect(out.html).toContain(__testing.CLEVELAND_PHONE);
    expect(out.html).toContain(__testing.COLUMBUS_PHONE);
    expect(out.html).toContain(__testing.CREDENTIALS_LINE);
    expect(out.html).toContain(__testing.COMPANY_NAME);
    expect(out.html).toContain(__testing.WEBSITE_URL);
    expect(out.text).toContain(__testing.CLEVELAND_PHONE);
    expect(out.text).toContain(__testing.COLUMBUS_PHONE);
    expect(out.text).toContain(__testing.CREDENTIALS_LINE);
    expect(out.text).toContain(__testing.COMPANY_NAME);
    expect(out.text).toContain(__testing.WEBSITE_URL);
  });

  it('renders the logo placeholder image in the HTML header', () => {
    const out = renderLeadResponseEmail(makeLead(), 'Body');
    expect(out.html).toContain(__testing.LOGO_PATH);
    expect(out.html).toMatch(/<img\b[^>]+>/i);
  });

  it('preserves paragraph breaks from the response text', () => {
    const txt = 'First paragraph.\n\nSecond paragraph.';
    const out = renderLeadResponseEmail(makeLead(), txt);
    expect(out.text).toContain('First paragraph.');
    expect(out.text).toContain('Second paragraph.');
    expect(out.html.match(/<p\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('first name extraction', () => {
  it('returns first token of a multi-word name', () => {
    expect(__testing.firstName('Diane Owens')).toBe('Diane');
  });
  it('returns null for empty / whitespace name', () => {
    expect(__testing.firstName(null)).toBeNull();
    expect(__testing.firstName('')).toBeNull();
    expect(__testing.firstName('   ')).toBeNull();
  });
});
