'use strict';

// Loads the real dashboard scripts into a minimal host page (jsdom) and checks that
// the repository alone builds the shell, navigation and tool switching.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

// Serve the repository over a fake http origin (file: URLs have no sessionStorage).
const ORIGIN = 'http://mtw.test/';
const REPO_ROOT = path.join(__dirname, '..');
const BASE_URL = ORIGIN + 'apps/dashboard/js/navigation/';
const requested = [];

class RepoLoader extends ResourceLoader {
  fetch(url, options) {
    requested.push(url);
    if (!url.startsWith(ORIGIN)) return null;
    const file = path.join(REPO_ROOT, decodeURIComponent(new URL(url).pathname));
    if (!file.startsWith(REPO_ROOT) || !fs.existsSync(file)) {
      return Promise.reject(new Error('404 ' + url));
    }
    return Promise.resolve(fs.readFileSync(file));
  }
}

function host(bodyHtml, { role = 'Developer', firebase = true, startupTimeoutMs } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(String(error.message || error)));
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, {
    url: BASE_URL + 'host.html',
    runScripts: 'dangerously',
    resources: new RepoLoader(),
    virtualConsole,
    beforeParse(window) {
      if (role) window.sessionStorage.setItem('mtw_admin_name', role);
      if (startupTimeoutMs) window.MTW_DASHBOARD_STARTUP_TIMEOUT_MS = startupTimeoutMs;
      if (firebase) {
        // Stand-in for the Firebase API the Webflow page exposes as window.MTW.
        window.MTW = {
          db: {},
          collection: () => ({}),
          getDocs: async () => ({ forEach() {} })
        };
      }
    }
  });
  return { dom, window: dom.window, document: dom.window.document, errors };
}

function waitFor(window, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      if (predicate()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error('timed out'));
      window.setTimeout(poll, 20);
    })();
  });
}

const relevantErrors = errors =>
  // jsdom cannot apply stylesheets from file URLs; that is not a dashboard error.
  errors.filter(message => !/stylesheet|Could not parse CSS|admin-dashboard\.css/i.test(message));

test('navigation script alone builds the complete shell in an empty host', async () => {
  const { dom, window, document, errors } = host(
    '<div data-mtw-dashboard-mount></div><script src="dashboard-navigation.js"></script>'
  );
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));

  const shell = document.querySelectorAll('.mtw-dashboard-shell');
  assert.equal(shell.length, 1, 'exactly one shell');
  assert.ok(document.querySelector('[data-mtw-dashboard-mount] .mtw-dashboard-shell'), 'mounted in mount point');
  assert.ok(shell[0].querySelector('nav.mtw-shell-navigation .db-menu-list'), 'navigation built');
  assert.ok(shell[0].querySelector('main.mtw-shell-content .db-right-content'), 'content area built');
  const cards = [...document.querySelectorAll('.db-list-toolcard')].map(card => card.dataset.select);
  for (const id of ['barcodes', 'product-info', 'developer-tools']) {
    assert.ok(cards.includes(id), `card for ${id}`);
  }
  assert.equal(new Set(cards).size, cards.length, 'no duplicate cards');
  assert.deepEqual(relevantErrors(errors).filter(e => /\[dashboard\] could not build/.test(e)), []);
  dom.window.close();
});

test('clicking a tool opens it and Overview closes it', async () => {
  const { dom, window, document, errors } = host('<script src="dashboard-navigation.js"></script>');
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));

  const card = document.querySelector('.db-list-toolcard[data-select="barcodes"]');
  card.click();
  assert.equal(card.getAttribute('aria-current'), 'page');
  assert.equal(document.querySelector('.tool-wrapper-h2').textContent, 'Barcode Labels');
  assert.equal(document.querySelector('.db-tool-wrapper').style.display, 'block');
  assert.equal(document.querySelector('.mtw-home-tab').hasAttribute('aria-current'), false);

  document.querySelector('.mtw-home-tab').click();
  assert.equal(document.querySelector('.db-tool-wrapper').style.display, 'none');
  assert.equal(card.hasAttribute('aria-current'), false);
  assert.equal(document.querySelector('.mtw-home-tab').getAttribute('aria-current'), 'page');
  assert.deepEqual(relevantErrors(errors), []);
  dom.window.close();
});

test('shell script alone loads navigation itself and builds', async () => {
  const { dom, window, document } = host('<script src="dashboard-shell.js"></script>');
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  assert.equal(document.querySelectorAll('.mtw-dashboard-shell').length, 1);
  assert.equal(document.querySelectorAll('script[src*="dashboard-navigation.js"]').length, 1);
  dom.window.close();
});

test('duplicate script includes still produce one shell and one set of cards', async () => {
  const { dom, window, document, errors } = host(
    '<script src="dashboard-navigation.js"></script><script src="dashboard-shell.js"></script>' +
    '<script src="dashboard-navigation.js"></script><script src="dashboard-shell.js"></script>'
  );
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  await new Promise(resolve => window.setTimeout(resolve, 200));
  assert.equal(document.querySelectorAll('.mtw-dashboard-shell').length, 1);
  assert.equal(document.querySelectorAll('.mtw-home-tab').length, 1);
  assert.equal(document.querySelectorAll('.db-list-toolcard[data-select="barcodes"]').length, 1);
  assert.equal(document.querySelectorAll('script[src*="dashboard-shell.js"]').length, 2, 'no extra shell injected');
  assert.deepEqual(relevantErrors(errors).filter(e => /\[dashboard\]/.test(e)), []);
  dom.window.close();
});

test('existing Webflow markup is reused rather than duplicated', async () => {
  const { dom, window, document } = host(
    '<section class="db-main-wrapper"><div class="db-left-content"><div class="db-menu-list">' +
    '<div class="db-list-toolcard" data-select="barcodes"><span class="db-heading-list">Barcodes</span></div>' +
    '</div></div><div class="db-right-content"><div class="barcode-label-panels">legacy panel</div></div></section>' +
    '<script src="dashboard-navigation.js"></script>'
  );
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  assert.equal(document.querySelectorAll('.db-main-wrapper').length, 1);
  assert.equal(document.querySelectorAll('.db-list-toolcard[data-select="barcodes"]').length, 1);
  document.querySelector('.db-list-toolcard[data-select="barcodes"]').click();
  assert.equal(document.querySelector('.barcode-label-panels').style.display, 'block');
  dom.window.close();
});

test('a navigation script that fails to load produces a specific, actionable error', async () => {
  // The page references a navigation URL that 404s (e.g. a wrong or stale path in Webflow).
  const { dom, window, document, errors } = host(
    '<script src="missing/dashboard-navigation.js"></script><script src="dashboard-shell.js"></script>',
    { startupTimeoutMs: 300 }
  );
  await waitFor(window, () => errors.some(e => /could not build the dashboard shell/.test(e)));
  const message = errors.find(e => /could not build the dashboard shell/.test(e));
  assert.match(message, /dashboard-navigation\.js never ran/);
  assert.match(message, /window\.openDBTool/);
  assert.equal(document.querySelector('.mtw-dashboard-shell'), null);
  dom.window.close();
});
