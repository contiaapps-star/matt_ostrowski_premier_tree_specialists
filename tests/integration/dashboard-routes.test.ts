import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';

describe('GET / — workspace SPA shell', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('returns 200 with HTML, header label, and at least one lead card', async () => {
    const db = getDb();
    insertLead(db, {
      source: 'google_lsa_email',
      status: 'auto_sent',
      customerName: 'Diane Owens',
      customerCity: 'Cleveland',
      customerZip: '44113',
    });
    insertLead(db, {
      source: 'website_form',
      status: 'awaiting_review',
      customerName: 'Barbara Wells',
    });

    const app = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('Premier Tree Specialists');
    expect(html).toContain('Diane Owens');
    expect(html).toContain('Barbara Wells');
    expect(html).toContain('data-testid="workspace-page"');
    expect(html).toContain('data-testid="lead-card"');
  });

  it('shows an empty state when no leads match', async () => {
    const app = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="leads-empty"');
  });

  it('filters by source=google_lsa_email', async () => {
    const db = getDb();
    insertLead(db, { source: 'google_lsa_email', customerName: 'LSA Lead' });
    insertLead(db, { source: 'website_form', customerName: 'Website Lead' });
    insertLead(db, { source: 'answerforce_email', customerName: 'AnswerForce Lead' });

    const app = createApp();
    const res = await app.request('/?source=google_lsa_email');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('LSA Lead');
    expect(html).not.toContain('Website Lead');
    expect(html).not.toContain('AnswerForce Lead');
  });

  it('filters by triage=auto (auto-triaged leads)', async () => {
    const db = getDb();
    insertLead(db, { customerName: 'AutoSent A', status: 'auto_sent' });
    insertLead(db, { customerName: 'Pending B', status: 'awaiting_review' });

    const app = createApp();
    const res = await app.request('/?triage=auto');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('AutoSent A');
    expect(html).not.toContain('Pending B');
  });

  it('ignores unknown source/triage filter values without crashing', async () => {
    const db = getDb();
    insertLead(db, { customerName: 'Anyone' });
    const app = createApp();
    const res = await app.request('/?source=hacker&triage=xyz');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Anyone');
  });

  it('passes user header through demo-user middleware', async () => {
    const db = getDb();
    insertLead(db, { customerName: 'Anyone' });
    const app = createApp();
    const res = await app.request('/', {
      headers: { 'x-demo-user': 'matt@premiertreesllc.com' },
    });
    const html = await res.text();
    expect(html).toContain('Matt Ostrowski');
  });
});

describe('GET /partials/leads-list — list fragment for htmx', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('returns only the list fragment (no <head>, no nav)', async () => {
    const db = getDb();
    insertLead(db, { customerName: 'Partial Test' });
    const app = createApp();
    const res = await app.request('/partials/leads-list');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Partial Test');
    expect(html).toContain('id="leads-list-region"');
    // Layout markers should be ABSENT in a partial.
    expect(html).not.toContain('<!DOCTYPE');
    expect(html).not.toContain('<html');
    expect(html).not.toContain('Lead Intake Workspace');
  });

  it('returns an empty-state fragment when no leads match', async () => {
    const app = createApp();
    const res = await app.request('/partials/leads-list?source=website_form');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="leads-empty"');
    expect(html).not.toContain('<!DOCTYPE');
  });

  it('respects source filter on partial endpoint', async () => {
    const db = getDb();
    insertLead(db, { source: 'google_lsa_email', customerName: 'LSA Only' });
    insertLead(db, { source: 'website_form', customerName: 'Form Only' });
    const app = createApp();
    const res = await app.request('/partials/leads-list?source=google_lsa_email');
    const html = await res.text();
    expect(html).toContain('LSA Only');
    expect(html).not.toContain('Form Only');
  });
});

describe('Legacy /dashboard route', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('redirects to / preserving any query params', async () => {
    const app = createApp();
    const res = await app.request('/dashboard?source=google_lsa_email');
    expect([301, 302, 307, 308]).toContain(res.status);
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/^\/(\?|$)/);
    expect(location).toContain('source=google_lsa_email');
  });
});
