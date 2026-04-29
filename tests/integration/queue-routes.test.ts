import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';

describe('Workspace — needs_review triage tab', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('renders only awaiting_review leads under triage=needs_review', async () => {
    const db = getDb();
    insertLead(db, { customerName: 'Awaiting A', status: 'awaiting_review' });
    insertLead(db, { customerName: 'Awaiting B', status: 'awaiting_review' });
    insertLead(db, { customerName: 'Flagged C', status: 'manually_flagged' });
    insertLead(db, { customerName: 'Sent D', status: 'auto_sent' });
    insertLead(db, { customerName: 'Sent E', status: 'manually_sent' });

    const app = createApp();
    const res = await app.request('/?triage=needs_review');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="workspace-page"');
    expect(html).toContain('Awaiting A');
    expect(html).toContain('Awaiting B');
    expect(html).not.toContain('Flagged C');
    expect(html).not.toContain('Sent D');
    expect(html).not.toContain('Sent E');
  });

  it('renders flagged leads under triage=flagged', async () => {
    const db = getDb();
    insertLead(db, { status: 'awaiting_review', customerName: 'Pending One' });
    insertLead(db, { status: 'manually_flagged', customerName: 'Flagged One' });

    const app = createApp();
    const res = await app.request('/?triage=flagged');
    const html = await res.text();
    expect(html).toContain('Flagged One');
    expect(html).not.toContain('Pending One');
  });

  it('shows empty state when nothing is in queue', async () => {
    const db = getDb();
    insertLead(db, { status: 'auto_sent' });
    const app = createApp();
    const res = await app.request('/?triage=needs_review');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="leads-empty"');
  });
});

describe('Legacy /queue route', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('redirects to /?triage=needs_review', async () => {
    const app = createApp();
    const res = await app.request('/queue');
    expect([301, 302, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('/?triage=needs_review');
  });
});

describe('Legacy /stats route', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('redirects to /?range=week', async () => {
    const app = createApp();
    const res = await app.request('/stats');
    expect([301, 302, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('/?range=week');
  });
});

describe('end-to-end UI smoke (no browser)', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('seed → workspace → patch extracted → approve → status final', async () => {
    const db = getDb();
    const id = insertLead(db, {
      customerName: 'Smoke Customer',
      status: 'awaiting_review',
      responseText: 'Draft hi from PTS.',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
    });
    const app = createApp();

    const dashRes = await app.request('/');
    expect(dashRes.status).toBe(200);
    expect(await dashRes.text()).toContain('Smoke Customer');

    const patchRes = await app.request(`/leads/${id}/extracted-data`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer_name: 'Smoke Customer Edited',
        customer_phone: '(216) 555-1234',
        customer_email: 'smoke@example.com',
        customer_address: '1 Maple',
        customer_city: 'Cleveland',
        customer_zip: '44113',
      }).toString(),
    });
    expect(patchRes.status).toBe(200);

    const approveRes = await app.request(`/leads/${id}/approve`, { method: 'POST' });
    expect(approveRes.status).toBe(200);

    const finalDetail = await app.request(`/leads/${id}`);
    expect(finalDetail.status).toBe(200);
    const html = await finalDetail.text();
    expect(html).toContain('Smoke Customer Edited');
    expect(html).toContain('data-status="manually_sent"');
  });
});
