import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { auditLog, leads } from '../../app/db/schema.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';

describe('GET /leads/:id', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('returns 200 and renders response_text + audit trail for an existing lead', async () => {
    const db = getDb();
    const id = insertLead(db, {
      customerName: 'Sharon Kobal',
      status: 'auto_sent',
      responseText: 'Hi Sharon — thanks for reaching out to Premier Tree Specialists!',
      scopeRaw: 'Stump grinding 3 stumps',
    });

    const app = createApp();
    const res = await app.request(`/leads/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Sharon Kobal');
    expect(html).toContain('Hi Sharon — thanks for reaching out');
    expect(html).toContain('data-testid="lead-detail-page"');
    expect(html).toContain('data-testid="audit-trail"');
    expect(html).toContain('data-testid="original-payload"');
    // Auto-sent leads render the read-only contact section, not the editable
    // extracted-data form (per Zaki's redesign).
    expect(html).toContain('data-testid="contact-readonly"');
  });

  it('renders the editable extracted-data form when the lead needs review', async () => {
    const db = getDb();
    const id = insertLead(db, {
      customerName: 'Pending Pete',
      status: 'awaiting_review',
      responseText: 'Draft hi.',
    });
    const app = createApp();
    const res = await app.request(`/leads/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="extracted-data-card"');
  });

  it('returns 404 with an error page for an unknown lead id', async () => {
    const app = createApp();
    const res = await app.request('/leads/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('data-testid="lead-not-found"');
  });
});

describe('PATCH /leads/:id/extracted-data', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('updates DB fields, recalculates county, and writes audit log entry', async () => {
    const db = getDb();
    const id = insertLead(db, {
      customerName: 'Old Name',
      customerCity: 'Cleveland',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
    });

    const app = createApp();
    const formBody = new URLSearchParams({
      customer_name: 'Updated Name',
      customer_phone: '(216) 245-8908',
      customer_email: 'foo@example.com',
      customer_address: '123 Maple',
      customer_city: 'Akron',
      customer_zip: '44301',
    });
    const res = await app.request(`/leads/${id}/extracted-data`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Updated Name');
    expect(html).toContain('id="extracted-data-region"');

    const updated = db.select().from(leads).where(eq(leads.id, id)).all()[0]!;
    expect(updated.customerName).toBe('Updated Name');
    expect(updated.customerEmail).toBe('foo@example.com');
    expect(updated.customerPhoneE164).toBe('+12162458908');
    expect(updated.customerCity).toBe('Akron');
    expect(updated.customerZip).toBe('44301');
    expect(updated.serviceAreaCounty).toBe('Summit');
    expect(updated.outOfServiceArea).toBe(false);

    const audits = db.select().from(auditLog).where(eq(auditLog.leadId, id)).all();
    const editAudit = audits.find((a) => a.action === 'manually_edited_extracted_data');
    expect(editAudit).toBeTruthy();
  });

  it('flags out_of_service_area when zip is unknown', async () => {
    const db = getDb();
    const id = insertLead(db, { customerZip: '44113', serviceAreaCounty: 'Cuyahoga' });
    const app = createApp();
    const formBody = new URLSearchParams({
      customer_name: 'Foo',
      customer_phone: '(216) 555-0001',
      customer_email: '',
      customer_address: '',
      customer_city: 'Miami',
      customer_zip: '33101',
    });
    const res = await app.request(`/leads/${id}/extracted-data`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    expect(res.status).toBe(200);
    const updated = db.select().from(leads).where(eq(leads.id, id)).all()[0]!;
    expect(updated.outOfServiceArea).toBe(true);
    expect(updated.serviceAreaCounty).toBeNull();
  });

  it('returns 404 for unknown lead id', async () => {
    const app = createApp();
    const res = await app.request('/leads/nope/extracted-data', {
      method: 'PATCH',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'customer_name=foo',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /leads/:id/approve', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('marks awaiting_review lead as manually_sent and writes approve audit', async () => {
    const db = getDb();
    const id = insertLead(db, {
      status: 'awaiting_review',
      responseText: 'Draft response',
    });
    const app = createApp();
    const res = await app.request(`/leads/${id}/approve`, {
      method: 'POST',
      headers: { 'x-demo-user': 'matt@premiertreesllc.com' },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="response-region"');

    const updated = db.select().from(leads).where(eq(leads.id, id)).all()[0]!;
    expect(updated.status).toBe('manually_sent');
    expect(updated.responseSentBy).toBe('matt@premiertreesllc.com');
    expect(updated.responseSentAt).toBeInstanceOf(Date);

    const audits = db.select().from(auditLog).where(eq(auditLog.leadId, id)).all();
    const approve = audits.find((a) => a.action.startsWith('approved_by_'));
    expect(approve).toBeTruthy();
    expect(approve!.action).toBe('approved_by_matt');
  });

  it('rejects when status is not awaiting_review', async () => {
    const db = getDb();
    const id = insertLead(db, { status: 'auto_sent' });
    const app = createApp();
    const res = await app.request(`/leads/${id}/approve`, { method: 'POST' });
    expect(res.status).toBe(409);
  });
});

describe('POST /leads/:id/reject', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('flips status to manually_flagged and writes audit log', async () => {
    const db = getDb();
    const id = insertLead(db, { status: 'awaiting_review' });
    const app = createApp();
    const res = await app.request(`/leads/${id}/reject`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-demo-user': 'matt@premiertreesllc.com',
      },
      body: new URLSearchParams({ note: 'wrong customer' }).toString(),
    });
    expect(res.status).toBe(200);
    const updated = db.select().from(leads).where(eq(leads.id, id)).all()[0]!;
    expect(updated.status).toBe('manually_flagged');

    const audits = db.select().from(auditLog).where(eq(auditLog.leadId, id)).all();
    const reject = audits.find((a) => a.action.startsWith('rejected_by_'));
    expect(reject).toBeTruthy();
    expect(reject!.action).toBe('rejected_by_matt');
  });
});

describe('POST /leads/:id/edit-and-send', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('updates response_text and marks manually_sent', async () => {
    const db = getDb();
    const id = insertLead(db, {
      status: 'awaiting_review',
      responseText: 'Original draft',
    });
    const newText = 'Hand-edited reply text from the call team.';
    const app = createApp();
    const res = await app.request(`/leads/${id}/edit-and-send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-demo-user': 'matt@premiertreesllc.com',
      },
      body: new URLSearchParams({ response_text: newText }).toString(),
    });
    expect(res.status).toBe(200);
    const updated = db.select().from(leads).where(eq(leads.id, id)).all()[0]!;
    expect(updated.responseText).toBe(newText);
    expect(updated.status).toBe('manually_sent');

    const audits = db.select().from(auditLog).where(eq(auditLog.leadId, id)).all();
    const edit = audits.find((a) => a.action.startsWith('edited_and_sent_by_'));
    expect(edit).toBeTruthy();
    expect(edit!.action).toBe('edited_and_sent_by_matt');
  });

  it('rejects empty body with 400', async () => {
    const db = getDb();
    const id = insertLead(db, { status: 'awaiting_review' });
    const app = createApp();
    const res = await app.request(`/leads/${id}/edit-and-send`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ response_text: '   ' }).toString(),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /leads/:id/regenerate-response', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('re-runs response generation via the stub LLM', async () => {
    const db = getDb();
    const id = insertLead(db, {
      status: 'awaiting_review',
      responseText: 'old draft',
      customerName: 'Diane Owens',
      scopeRaw: 'I have a big oak tree that needs trimming.',
      scopeCategory: 'trimming',
      scopeSummary: 'Big oak trim',
    });
    const app = createApp();
    const res = await app.request(`/leads/${id}/regenerate-response`, { method: 'POST' });
    expect(res.status).toBe(200);

    const audits = db.select().from(auditLog).where(eq(auditLog.leadId, id)).all();
    const regenAudit = audits.find((a) => a.action === 'regenerate_requested');
    expect(regenAudit).toBeTruthy();
    const respGenAudit = audits.find((a) => a.action === 'response_generated');
    expect(respGenAudit).toBeTruthy();
  });
});
