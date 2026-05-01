(function () {
  'use strict';

  var TOUR_KEY = 'pts_tour_v3_done';
  var LOGO_URL = '/public/images/premier-tree-logo.png';

  function readAgentMailAddress() {
    // The settings page renders the live AgentMail address with this
    // testid. The dashboard does NOT, so we cache the last value we saw
    // (e.g. via a previous visit) in localStorage so the final tour step
    // can show the address even when the user is on the inbox page.
    try {
      var node = document.querySelector('[data-testid="agent-mail-address"]');
      if (node && node.textContent) {
        var v = node.textContent.trim();
        if (v) {
          try { localStorage.setItem('pts_agent_mail_address', v); } catch (e) {}
          return v;
        }
      }
      return localStorage.getItem('pts_agent_mail_address') || '';
    } catch (e) {
      return '';
    }
  }

  function el(selector) {
    return document.querySelector(selector);
  }

  function heroPopover(title, description) {
    return (
      '<div class="pts-tour-hero">' +
        '<img src="' + LOGO_URL + '" alt="Premier Tree Specialists" class="pts-tour-logo" />' +
        '<div class="pts-tour-hero-body">' +
          '<div class="pts-tour-hero-eyebrow">Premier Tree Specialists · Built by Sagan</div>' +
          '<div class="pts-tour-hero-title">' + title + '</div>' +
          '<div class="pts-tour-hero-desc">' + description + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function buildSteps() {
    return [
      {
        popover: {
          title: ' ',
          description: heroPopover(
            'Here’s what we built for you',
            'This is the lead intake workspace. Every Google LSA, website-form, and AnswerForce inquiry lands here and either auto-responds or surfaces for your team. Take the 60-second tour—I’ll show you exactly what it does and what we need from you to flip it on.'
          ),
          side: 'over',
          align: 'center',
        },
        onHighlightStarted: function () {
          // Fire-and-forget jump to inbox if user is elsewhere — keeps the tour
          // anchored on the workspace shell.
          if (location.pathname !== '/') {
            location.href = '/';
          }
        },
      },
      {
        element: '[data-tour="kpis"]',
        popover: {
          title: 'Your pulse',
          description:
            'Total leads in the last 24 hours, how many were auto-sent, how many need review, and your response rate. Updates every minute.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-testid="triage-tab-needs_review"]',
        popover: {
          title: 'Needs Review',
          description:
            'Anything that needs human attention shows up here — leads with missing info, escalations, anything below the auto-send threshold. This is the inbox you live in.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="first-card"]',
        popover: {
          title: 'Open a lead',
          description:
            'Each card shows the customer name, what they asked for, where they are, and quick Call / Email actions. The square in the bottom-right tells you the source at a glance — G for Google LSA, W for the website form, the headset for AnswerForce.',
          side: 'right',
          align: 'start',
        },
        onHighlightStarted: function (element) {
          if (element && element.click) {
            try { element.click(); } catch (e) {}
          }
        },
      },
      {
        element: '[data-tour="detail-panel"]',
        popover: {
          title: 'Edit & send',
          description:
            'On the right you see exactly what they asked for, the contact details we extracted (editable inline), the AI-drafted response, and any missing fields highlighted. Approve & Send fires email + SMS in one click.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-testid="triage-tab-auto"]',
        popover: {
          title: 'Auto-Sent leads',
          description:
            'Leads we had enough info to auto-respond to live here. Read-only — they’re already handled. Pop one open if you want to review what was sent.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        popover: {
          title: 'Settings (next stop)',
          description:
            'Last stop before we wrap. Click <b>Next</b> and we’ll jump to Settings so you can see the inbound email, business rules, AI prompt, and FAQ — everything that drives how the system answers leads.',
          side: 'over',
          align: 'center',
          // Hand off to /settings on Next — the page bootstrap reads ?tour=7
          // and resumes at the Inbound section once the page loads. We do this
          // in onNextClick (not onHighlightStarted) so the user can actually
          // read this popover before being navigated away.
          onNextClick: function () {
            location.href = '/settings?tour=7';
          },
        },
      },
      {
        element: '[data-tour="settings-inbound"]',
        popover: {
          title: 'Forward your emails here',
          description:
            'Set Gmail filters and your website-form / AnswerForce notifications to forward to this address. The system parses every inbound message and creates a lead.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="settings-business-rules"]',
        popover: {
          title: 'Business Rules',
          description:
            '<b>Escalation keywords</b> always force a lead into manual review — regardless of the AI’s confidence. Add things like <i>emergency</i>, <i>tree on house</i>, <i>lawsuit</i>. Below that, <b>service-area ZIP prefixes</b> (e.g. <code>440</code> for Cleveland metro) decide which leads count as in-area; anything outside is auto-flagged.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '[data-tour="settings-ai"]',
        popover: {
          title: 'AI & Prompt',
          description:
            'The brain of the system. Pick the OpenRouter <b>model</b>, tune <b>max tokens</b> and <b>temperature</b> (0.3–0.5 is the sweet spot), and edit the <b>system prompt</b> — the persona and rules the AI follows on every reply. The <b>extraction prompt</b> below it controls how raw inbound emails get parsed into structured fields.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '[data-tour="settings-faq"]',
        popover: {
          title: 'FAQ Knowledge Base',
          description:
            'Free-form markdown — paste in question / answer pairs and the AI uses them verbatim when drafting replies. This is where the <b>Oak Wilt season</b> rule, pricing answers, scheduling info, and credentials all live. Edit it any time; the next inbound lead picks up the change.',
          side: 'top',
          align: 'start',
        },
      },
      {
        popover: {
          title: ' ',
          description: finalChecklistPopover(),
          side: 'over',
          align: 'center',
          onPopoverRender: function (popover) {
            // Wire up the "Show me" button after driver.js renders the popover.
            try {
              var btn = popover.wrapper.querySelector('[data-tour-action="open-instructions"]');
              if (btn) {
                btn.addEventListener('click', function (ev) {
                  ev.preventDefault();
                  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
                  // Navigate to settings#inbound with a hash that the
                  // settings page bootstrap will use to auto-open the
                  // collapsible Gmail-instructions <details>.
                  location.href = '/settings#inbound-instructions-open';
                });
              }
            } catch (e) {}
          },
        },
      },
    ];
  }

  function finalChecklistPopover() {
    var address = readAgentMailAddress();
    var addressLine = address
      ? '<div class="pts-tour-address-pill" data-testid="tour-final-address">' +
          '<span class="pts-tour-address-label">Forward to</span>' +
          '<code>' + escapeHtml(address) + '</code>' +
        '</div>'
      : '<div class="pts-tour-address-pill pts-tour-address-pending">' +
          '<span class="pts-tour-address-label">Forwarding address</span>' +
          '<code>provisioning…</code>' +
        '</div>';

    return (
      '<div class="pts-tour-hero">' +
        '<img src="' + LOGO_URL + '" alt="Premier Tree Specialists" class="pts-tour-logo" />' +
        '<div class="pts-tour-hero-body">' +
          '<div class="pts-tour-hero-eyebrow">What we need from you</div>' +
          '<div class="pts-tour-hero-title">3 forwarding rules and you’re live</div>' +
          '<div class="pts-tour-hero-desc">Set Gmail filters that forward each lead source to the agent inbox below. Every email that lands there is archived and parsed into a lead automatically.</div>' +
          addressLine +
          '<ul class="pts-tour-checklist" data-testid="tour-final-checklist">' +
            '<li><span class="pts-tour-check">☐</span> Forward Google LSA notifications</li>' +
            '<li><span class="pts-tour-check">☐</span> Forward AnswerForce summaries</li>' +
            '<li><span class="pts-tour-check">☐</span> Forward website-form notifications</li>' +
          '</ul>' +
          '<div class="pts-tour-cta-row">' +
            '<button type="button" class="pts-tour-cta" data-tour-action="open-instructions">Show me how in Gmail →</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getDriverFactory() {
    if (window.driver && window.driver.js && typeof window.driver.js.driver === 'function') {
      return window.driver.js.driver;
    }
    if (window.driver && typeof window.driver.driver === 'function') return window.driver.driver;
    if (typeof window.driver === 'function') return window.driver;
    return null;
  }

  function startTour(opts) {
    opts = opts || {};
    var factory = getDriverFactory();
    if (!factory) {
      console.warn('[pts-tour] driver.js not loaded — skipping tour');
      return;
    }
    var instance = factory({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      smoothScroll: true,
      popoverClass: 'pts-tour-popover',
      steps: buildSteps(),
      onCloseClick: function () {
        markDone();
        instance.destroy();
      },
      onDestroyStarted: function () {
        markDone();
        instance.destroy();
      },
    });
    try {
      if (typeof opts.resumeStep === 'number' && opts.resumeStep >= 0) {
        instance.drive(opts.resumeStep);
      } else {
        instance.drive();
      }
    } catch (e) {
      console.warn('[pts-tour] failed to start', e);
    }
    void el; // reserved for future helpers
  }

  function markDone() {
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch (e) {}
    try {
      var meta = document.querySelector('meta[name="csrf-token"]');
      var token = meta ? meta.getAttribute('content') : '';
      fetch('/api/tour/dismiss', {
        method: 'POST',
        headers: token ? { 'X-CSRF-Token': token } : {},
        credentials: 'same-origin',
      }).catch(function () {});
    } catch (e) {}
  }

  window.startTour = startTour;
})();
