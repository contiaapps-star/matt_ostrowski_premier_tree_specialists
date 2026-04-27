import type { LeadSource, NewFaqEntry, NewLead, NewZipRow } from './schema.js';

function zips(
  county: string,
  region: 'northeast_ohio' | 'central_ohio',
  zs: string[],
): NewZipRow[] {
  return zs.map((zip) => ({ zip, county, region }));
}

export const ZIP_ROWS: NewZipRow[] = [
  // Northeast Ohio
  ...zips('Cuyahoga', 'northeast_ohio', ['44101', '44102', '44113', '44114', '44120']),
  ...zips('Geauga', 'northeast_ohio', ['44021', '44023', '44024', '44026', '44065']),
  ...zips('Lake', 'northeast_ohio', ['44060', '44077', '44094', '44095', '44057']),
  ...zips('Lorain', 'northeast_ohio', ['44035', '44052', '44053', '44054', '44055']),
  ...zips('Medina', 'northeast_ohio', ['44256', '44280', '44212', '44215', '44217']),
  ...zips('Portage', 'northeast_ohio', ['44240', '44266', '44260', '44241', '44231']),
  ...zips('Summit', 'northeast_ohio', ['44301', '44302', '44303', '44304', '44320']),

  // Central Ohio
  ...zips('Delaware', 'central_ohio', ['43015', '43017', '43035', '43054', '43074']),
  ...zips('Fairfield', 'central_ohio', ['43130', '43147', '43102', '43105', '43110']),
  ...zips('Franklin', 'central_ohio', ['43004', '43201', '43202', '43204', '43205']),
  ...zips('Licking', 'central_ohio', ['43055', '43056', '43023', '43025', '43027']),
  ...zips('Madison', 'central_ohio', ['43140', '43162', '43151', '43153', '43160']),
  ...zips('Pickaway', 'central_ohio', ['43113', '43117', '43136', '43156', '43164']),
  ...zips('Union', 'central_ohio', ['43040', '43064', '43044', '43066', '43067']),
];

export const FAQ_ROWS: Omit<NewFaqEntry, 'id'>[] = [
  {
    category: 'oak_season',
    question: 'Can you trim my oak tree?',
    answer:
      'Thank you for reaching out! We can absolutely schedule an estimate appointment. The Oak season is currently closed until November to prevent infection of Oak Wilt but if you would like an estimate now, it would be valid, if confirmed, for the next season. Would you be available for a phone call to discuss the finer details?',
    keywords: 'oak,oak tree,trim oak,prune oak',
    priority: 100,
    active: true,
  },
  {
    category: 'service_area',
    question: 'Do you serve my area?',
    answer:
      'We serve two regions in Ohio: Northeast Ohio (Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit counties) and Central Ohio (Delaware, Fairfield, Franklin, Licking, Madison, Pickaway, Union counties). If you let us know your ZIP, we can confirm coverage right away.',
    keywords: 'service area,coverage,zip,location,where do you serve',
    priority: 80,
    active: true,
  },
  {
    category: 'emergency',
    question: 'I have an emergency / tree on house',
    answer:
      'We provide 24/7 emergency tree service. Please call us immediately at (216) 245-8908 (Cleveland) or (614) 526-2266 (Columbus).',
    keywords: 'emergency,fell on,storm,urgent',
    priority: 95,
    active: true,
  },
  {
    category: 'credentials',
    question: 'Are you certified and insured?',
    answer:
      'Yes — Premier Tree Specialists employs ISA-certified arborists with 80+ years of combined experience and full insurance coverage.',
    keywords: 'certified,insured,credentials,license,arborist',
    priority: 70,
    active: true,
  },
  {
    category: 'scheduling',
    question: 'When can you come out?',
    answer:
      'Once we receive your inquiry, our team will reach out shortly to schedule a complimentary estimate at a time that works for you.',
    keywords: 'schedule,appointment,when,availability',
    priority: 60,
    active: true,
  },
  {
    category: 'service_types',
    question: 'What services do you offer?',
    answer:
      'We offer tree trimming, pruning, removal, stump grinding, plant health care, and ISA-certified arborist consultations across Northeast and Central Ohio.',
    keywords: 'services,offer,trim,remove,grind,prune',
    priority: 50,
    active: true,
  },
];

export interface SeedLeadSpec {
  receivedAtIso: string;
  source: LeadSource;
  rawPayload: Record<string, unknown>;
  lead: Partial<NewLead> & Pick<NewLead, 'scopeRaw'>;
}

/**
 * 8 synthetic leads spanning all three sources, every scope category, and the
 * full status spectrum (auto_sent, awaiting_review, manually_flagged). Used
 * by both the CLI seed script (full reset) and the production demo bootstrap
 * (only when SEED_DEMO_LEADS=true and the leads table is empty).
 */
export function buildDemoLeadSpecs(baseTime: number = Date.UTC(2026, 3, 26, 12, 0, 0)): SeedLeadSpec[] {
  const minute = 60_000;
  const ts = (offsetMinutes: number) => new Date(baseTime + offsetMinutes * minute).toISOString();

  return [
    {
      receivedAtIso: ts(0),
      source: 'google_lsa_email',
      rawPayload: {
        from: 'noreply@google-business.com',
        subject: 'New lead from Google Local Services',
        body: 'Diane Owens — Cleveland, OH 44113 — (216) 555-0001\n\nI have a big oak tree that I would like to have looked at. It will probably need trimming and I need a quote.',
      },
      lead: {
        status: 'ingested',
        customerName: 'Diane Owens',
        customerPhoneE164: '+12165550001',
        customerEmail: null,
        customerAddress: null,
        customerCity: 'Cleveland',
        customerZip: '44113',
        serviceAreaCounty: 'Cuyahoga',
        outOfServiceArea: false,
        scopeRaw:
          'I have a big oak tree that I would like to have looked at. It will probably need trimming and I need a quote.',
        scopeCategory: 'trimming',
        dedupPhoneE164: '+12165550001',
      },
    },
    {
      receivedAtIso: ts(5),
      source: 'website_form',
      rawPayload: {
        form: 'website_quote',
        name: 'Barbara Wells',
        phone: '(440) 555-0002',
        email: 'bwells@example.com',
        city: 'Bedford Heights',
        zip: '44146',
        message: 'Need quote for tree removal in front yard',
      },
      lead: {
        status: 'extracted',
        customerName: 'Barbara Wells',
        customerPhoneE164: '+14405550002',
        customerEmail: 'bwells@example.com',
        customerCity: 'Bedford Heights',
        customerZip: '44146',
        serviceAreaCounty: 'Cuyahoga',
        outOfServiceArea: false,
        scopeRaw: 'Need quote for tree removal in front yard',
        scopeCategory: 'removal',
        scopeSummary: 'Tree removal in front yard',
        confidenceScore: 0.92,
        confidenceReasoning: 'All required fields present; clear scope',
        dedupPhoneE164: '+14405550002',
      },
    },
    {
      receivedAtIso: ts(15),
      source: 'answerforce_email',
      rawPayload: {
        from: 'notifications@answerforce.com',
        subject: 'After-hours call summary',
        body: 'Caller: Marilyn Hornig — (440) 555-0003 — Rocky River OH 44116\n\nAfter-hours call: Need emergency tree removal — large oak limb fell on roof during storm last night.',
      },
      lead: {
        status: 'awaiting_review',
        customerName: 'Marilyn Hornig',
        customerPhoneE164: '+14405550003',
        customerCity: 'Rocky River',
        customerZip: '44116',
        serviceAreaCounty: 'Cuyahoga',
        outOfServiceArea: false,
        scopeRaw:
          'After-hours call: Need emergency tree removal — large oak limb fell on roof during storm last night',
        scopeCategory: 'emergency',
        scopeSummary: 'Emergency: oak limb on roof',
        confidenceScore: 0.86,
        confidenceReasoning: 'Emergency keyword detected; escalation required',
        escalationTriggered: true,
        escalationReason: 'Keyword match: "emergency", "fell on roof"',
        dedupPhoneE164: '+14405550003',
      },
    },
    {
      receivedAtIso: ts(25),
      source: 'google_lsa_email',
      rawPayload: {
        from: 'noreply@google-business.com',
        subject: 'New lead from Google Local Services',
        body: 'Sharon Kobal — Parma Heights, OH 44130 — (440) 555-0004\n\nStump grinding — 3 stumps in backyard.',
      },
      lead: {
        status: 'auto_sent',
        customerName: 'Sharon Kobal',
        customerPhoneE164: '+14405550004',
        customerCity: 'Parma Heights',
        customerZip: '44130',
        serviceAreaCounty: 'Cuyahoga',
        outOfServiceArea: false,
        scopeRaw: 'Stump grinding — 3 stumps in backyard',
        scopeCategory: 'stump_grinding',
        scopeSummary: '3 stumps for grinding in backyard',
        confidenceScore: 0.88,
        confidenceReasoning: 'Clear scope; matches FAQ keywords',
        responseText:
          'Hi Sharon — thanks for reaching out to Premier Tree Specialists! We can absolutely schedule an estimate for your stump grinding project. A team member will follow up shortly to confirm a convenient time.',
        responseSentAt: new Date(baseTime + 26 * minute),
        responseSentBy: 'auto',
        dedupPhoneE164: '+14405550004',
      },
    },
    {
      receivedAtIso: ts(35),
      source: 'website_form',
      rawPayload: {
        form: 'website_quote',
        name: 'Logan Davis',
        phone: '(440) 555-0005',
        email: 'ldavis@example.com',
        city: 'Brunswick',
        zip: '44212',
        message: 'Plant health care consultation for sick maple',
      },
      lead: {
        status: 'extracted',
        customerName: 'Logan Davis',
        customerPhoneE164: '+14405550005',
        customerEmail: 'ldavis@example.com',
        customerCity: 'Brunswick',
        customerZip: '44212',
        serviceAreaCounty: 'Medina',
        outOfServiceArea: false,
        scopeRaw: 'Plant health care consultation for sick maple',
        scopeCategory: 'plant_health',
        scopeSummary: 'PHC consultation for ailing maple',
        confidenceScore: 0.75,
        confidenceReasoning: 'Scope clear but uncommon category — review draft before send',
        dedupPhoneE164: '+14405550005',
      },
    },
    {
      receivedAtIso: ts(45),
      source: 'google_lsa_email',
      rawPayload: {
        from: 'noreply@google-business.com',
        subject: 'New lead from Google Local Services',
        body: 'Caller — Miami, FL 33101 — (561) 555-0006\n\nTree trimming Miami.',
      },
      lead: {
        status: 'manually_flagged',
        customerName: null,
        customerPhoneE164: '+15615550006',
        customerCity: 'Miami',
        customerZip: '33101',
        serviceAreaCounty: null,
        outOfServiceArea: true,
        scopeRaw: 'Tree trimming Miami',
        scopeCategory: 'trimming',
        confidenceScore: 0.55,
        confidenceReasoning: 'Out-of-service-area ZIP detected (Florida)',
        dedupPhoneE164: '+15615550006',
      },
    },
    {
      receivedAtIso: ts(55),
      source: 'answerforce_email',
      rawPayload: {
        from: 'notifications@answerforce.com',
        subject: 'After-hours call summary',
        body: 'Caller: Charlie StLouis — (440) 555-0007 — Strongsville OH 44136\n\nCalled for arborist consultation.',
      },
      lead: {
        status: 'auto_sent',
        customerName: 'Charlie StLouis',
        customerPhoneE164: '+14405550007',
        customerCity: 'Strongsville',
        customerZip: '44136',
        serviceAreaCounty: 'Cuyahoga',
        outOfServiceArea: false,
        scopeRaw: 'Called for arborist consultation',
        scopeCategory: 'consultation',
        scopeSummary: 'Arborist consultation requested',
        confidenceScore: 0.84,
        confidenceReasoning: 'Standard consultation request; FAQ matched',
        responseText:
          'Hi Charlie — thanks for reaching out. One of our ISA-certified arborists will follow up shortly to schedule your consultation.',
        responseSentAt: new Date(baseTime + 56 * minute),
        responseSentBy: 'auto',
        dedupPhoneE164: '+14405550007',
      },
    },
    {
      receivedAtIso: ts(65),
      source: 'website_form',
      rawPayload: {
        form: 'website_quote',
        name: null,
        phone: null,
        email: null,
        message: 'Quote please',
      },
      lead: {
        status: 'manually_flagged',
        scopeRaw: 'Quote please',
        confidenceScore: 0.3,
        confidenceReasoning: 'Insufficient information to extract structured fields',
      },
    },
  ];
}
