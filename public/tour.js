(function () {
  'use strict';

  function el(selector) {
    return document.querySelector(selector);
  }

  function buildSteps() {
    return [
      {
        popover: {
          title: 'Welcome to Premier Tree Specialists',
          description:
            "This is the lead intake workspace. Every Google LSA, website form, and AnswerForce call lands here, gets triaged by AI, and either auto-responds or surfaces for your team. 60-second tour?",
          side: 'over',
          align: 'center',
        },
      },
      {
        element: '[data-tour="kpis"]',
        popover: {
          title: 'Your pulse',
          description:
            'These six metrics summarize what happened in your selected window. Auto-Sent are leads the AI already replied to. Needs Review and Flagged are where humans step in.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="time-range"]',
        popover: {
          title: 'Time range',
          description:
            'Default is the last 24 hours. Switch to 3 days, a week, or a month to see longer trends.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="source-filter"]',
        popover: {
          title: 'Source filter',
          description:
            'Three intake channels. Each card has a colored stripe so you can scan source at a glance: blue for Google LSA, red for the website form, orange for AnswerForce.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="tabs"]',
        popover: {
          title: 'Triage tabs',
          description:
            'Auto-triaged shows leads the AI handled end-to-end. Needs Manual is your inbox. Flagged is where escalations or out-of-area leads collect.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="first-card"]',
        popover: {
          title: 'Anatomy of a lead',
          description:
            'Confidence ring on the left, customer name and time, source pill, scope category, contact info, and a one-line scope summary. Everything you need before opening the full record.',
          side: 'right',
          align: 'start',
        },
        onHighlightStarted: function (element) {
          if (element && element.click) {
            // open the panel so the next step can highlight it
            try {
              element.click();
            } catch (e) {}
          }
        },
      },
      {
        element: '[data-tour="detail-panel"]',
        popover: {
          title: 'Detail panel',
          description:
            'The right side opens with everything: extracted data (editable), the AI-drafted response, outbound message log, audit trail, and the original raw payload.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="response-actions"]',
        popover: {
          title: 'Take action',
          description:
            'Approve & Send fires the message immediately. Edit & Send lets you tweak the draft first. Regenerate asks the LLM for another try. Reject moves it to Flagged.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="simulate"]',
        popover: {
          title: 'Try it yourself',
          description:
            'Click Simulate Lead to drop a synthetic lead into the queue. The AI will run extraction, response generation, and dispatch in real time so you can watch the full pipeline.',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        popover: {
          title: "You're set",
          description:
            "When real leads arrive they appear at the top of the list with auto-refresh every 15 seconds. The 'Take a tour' button in the header re-runs this walkthrough anytime.",
          side: 'over',
          align: 'center',
        },
      },
    ];
  }

  function getDriverFactory() {
    // driver.js v1.x IIFE bundle exposes the factory as window.driver.js.driver.
    // Fall back to other shapes for resilience across versions.
    if (window.driver && window.driver.js && typeof window.driver.js.driver === 'function') {
      return window.driver.js.driver;
    }
    if (window.driver && typeof window.driver.driver === 'function') return window.driver.driver;
    if (typeof window.driver === 'function') return window.driver;
    return null;
  }

  function startTour(opts) {
    var auto = opts && opts.auto;
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
      instance.drive();
    } catch (e) {
      console.warn('[pts-tour] failed to start', e);
    }
    if (auto) {
      // First-time run — make sure we record completion even if the user X's out
      // before reaching the end.
    }
  }

  function markDone() {
    try {
      localStorage.setItem('pts_tour_done', '1');
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
