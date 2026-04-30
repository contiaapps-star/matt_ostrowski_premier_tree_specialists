(function () {
  'use strict';

  var TOUR_KEY = 'pts_tour_v2_done';
  var LOGO_URL = '/public/images/premier-tree-logo.png';

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
            'Last stop before we wrap. We’ll jump to Settings so you can see the AI rules, FAQ, and the email address you’ll forward leads to.',
          side: 'over',
          align: 'center',
        },
        onHighlightStarted: function () {
          // Hand off to /settings — the page bootstrap reads ?tour=7 and resumes
          // at step 8 (the Inbound section) once the page loads.
          setTimeout(function () {
            location.href = '/settings?tour=7';
          }, 400);
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
        popover: {
          title: ' ',
          description: heroPopover(
            'What we need from you',
            'To finish setup we need: (1) Forwarding rules pointing at the agent email above, (2) Google LSA API key (or set the LSA email forward), (3) ArboStar company ID + API key, (4) SendGrid + Agent Phone credentials. Email these to your Sagan contact and we’ll flip the switch.'
          ),
          side: 'over',
          align: 'center',
        },
      },
    ];
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
