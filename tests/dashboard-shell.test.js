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

function host(bodyHtml, { role = 'Managers', firebase = true, startupTimeoutMs, share } = {}) {
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
      if (share) window.MTW_DASHBOARD_SHARE = share;
      // jsdom lacks Web Crypto digest/TextEncoder; browsers have both.
      Object.defineProperty(window, 'crypto', { value: require('node:crypto').webcrypto, configurable: true });
      if (!window.TextEncoder) window.TextEncoder = TextEncoder;
      if (firebase) {
        // Stand-in for the Firebase API the Webflow page exposes as window.MTW.
        window.MTW = {
          db: {},
          collection: () => ({}),
          getDocs: async () => ({ forEach() {} }),
          doc: (db, collection, id) => ({ collection, id }),
          setDoc: async (ref, data) => { (window.__saved = window.__saved || []).push({ ref, data }); },
          updateDoc: async (ref, data) => { (window.__updated = window.__updated || []).push({ ref, data }); }
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

test('Webflow tool wrapper outside .db-right-content survives the shell', async () => {
  // Legacy layout: the tool wrapper (with its panels) is a direct child of .db-main-wrapper.
  const { dom, window, document } = host(
    '<section class="db-main-wrapper">' +
      '<div class="db-left-content"><div class="db-menu-list"></div></div>' +
      '<div class="db-right-content"></div>' +
      '<div class="db-tool-wrapper"><div class="db-selected-panel-wrapper">' +
        '<div class="barcode-label-panels"><button class="legacy-button">Print</button></div>' +
      '</div></div>' +
      '<div class="legacy-modal">modal</div>' +
    '</section>' +
    // A tool script grabs its element at load time, like barcodes.js does.
    '<script>window.__legacyPanel = document.querySelector(".barcode-label-panels");</script>' +
    '<script src="dashboard-navigation.js"></script>'
  );
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  assert.equal(document.querySelectorAll('.db-tool-wrapper').length, 1, 'no duplicate wrapper');
  assert.ok(document.contains(window.__legacyPanel), 'legacy panel still in the page');
  assert.ok(window.__legacyPanel.closest('.mtw-dashboard-shell'), 'legacy panel inside the shell');
  assert.ok(document.querySelector('.mtw-dashboard-shell .legacy-modal'), 'other children kept');
  document.querySelector('.db-list-toolcard[data-select="barcodes"]').click();
  assert.equal(window.__legacyPanel.style.display, 'block');
  assert.equal(document.querySelector('.mtw-dashboard-missing-tool'), null);
  dom.window.close();
});

test('every navigation card has an SVG icon, including custom tools', async () => {
  const { dom, window, document } = host('<script src="dashboard-navigation.js"></script>');
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  window.MTW_APPLY_TOOL_SETTINGS({ test: { custom: true, name: 'TEST', roles: ['Managers'] } });
  const cards = [...document.querySelectorAll('.db-list-toolcard')];
  assert.ok(cards.some(card => card.dataset.select === 'test'));
  for (const card of cards) {
    const icon = card.querySelector('.db-list-icon');
    assert.ok(icon && icon.querySelector('svg path'), `icon for ${card.dataset.select}`);
    assert.equal(icon.textContent.trim(), '', `no letter icon for ${card.dataset.select}`);
  }
  dom.window.close();
});

test('Manager Tools "Disable item" saves without a ReferenceError', async () => {
  const { dom, window, document, errors } = host('<script src="dashboard-navigation.js"></script>');
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell') &&
    document.querySelector('.developer-tools-panel .developer-tool-row'));
  document.querySelector('.db-list-toolcard[data-select="developer-tools"]').click();
  document.querySelector('.developer-tools-panel .developer-tool-row').click();
  document.querySelector('.developer-tool-disable').click();
  await waitFor(window, () => /Saved/.test(document.querySelector('.developer-tools-status')?.textContent || ''));
  assert.equal(window.__saved.length, 1);
  assert.equal(window.__saved[0].data.enabled, false);
  assert.deepEqual(errors.filter(e => /ReferenceError|enabledInput/.test(e)), []);
  dom.window.close();
});

test('X in a Manager Tools item returns to the list; X again closes the tool', async () => {
  const { dom, window, document, errors } = host('<script src="dashboard-navigation.js"></script>');
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell') &&
    document.querySelector('.developer-tools-panel .developer-tool-row'));
  const panel = document.querySelector('.developer-tools-panel');
  const wrapper = document.querySelector('.db-tool-wrapper');
  const exit = document.querySelector('#exit-btn');

  document.querySelector('.db-list-toolcard[data-select="developer-tools"]').click();
  document.querySelector('.developer-tool-row').click();
  assert.equal(panel.dataset.view, 'form');

  exit.click();
  assert.equal(panel.dataset.view, 'list', 'back to the list');
  assert.equal(wrapper.style.display, 'block', 'tool still open');

  exit.click();
  assert.equal(wrapper.style.display, 'none', 'tool closed');

  // The Overview tab always leaves the tool, even mid-edit.
  document.querySelector('.db-list-toolcard[data-select="developer-tools"]').click();
  document.querySelector('.developer-tool-add').click();
  assert.equal(panel.dataset.view, 'form');
  document.querySelector('.mtw-home-tab').click();
  assert.equal(wrapper.style.display, 'none');
  assert.equal(panel.dataset.view, 'list', 'reopens at the list');

  // Other tools close on the first X.
  document.querySelector('.db-list-toolcard[data-select="barcodes"]').click();
  exit.click();
  assert.equal(wrapper.style.display, 'none');
  assert.deepEqual(relevantErrors(errors), []);
  dom.window.close();
});

test('Managers (or Manager) see every tool; old Developer/Admin roles in saved settings are mapped or dropped', async () => {
  for (const role of ['Managers', 'Manager']) {
    const { dom, window, document } = host('<script src="dashboard-navigation.js"></script>', { role });
    await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
    const visible = [...document.querySelectorAll('.db-list-toolcard')].filter(card => card.style.display !== 'none');
    assert.equal(visible.length, Object.keys(window.MTW_TOOL_REGISTRY).length, `${role} sees every tool`);
    assert.ok([...document.querySelectorAll('.db-heading-list')].some(el => el.textContent === 'Manager Tools'));
    assert.equal(document.body.textContent.includes('Developer'), false, 'no Developer wording');
    dom.window.close();
  }

  const { dom, window, document } = host('<script src="dashboard-navigation.js"></script>', { role: 'Counter' });
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  const shown = id => document.querySelector(`.db-list-toolcard[data-select="${id}"]`).style.display !== 'none';
  assert.equal(shown('product-info'), false, 'Product Information was Admin-only; now Managers');
  assert.equal(shown('barcodes'), true);

  window.MTW_APPLY_TOOL_SETTINGS({ 'csv-config': { roles: ['Developer', 'Admin', 'Counter'] } });
  assert.deepEqual([...window.MTW_TOOL_REGISTRY['csv-config'].roles], ['Managers', 'Counter']);
  dom.window.close();
});

test('share link mode: only the shared tool, no overview, exit or sign-out, no role needed', async () => {
  const { dom, window, document } = host('<script src="dashboard-navigation.js"></script>', {
    role: null, share: { id: 'abc', tool: 'timesheet', label: 'Workshop tablet' }
  });
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  assert.ok(document.documentElement.classList.contains('mtw-share-mode'));
  const visible = [...document.querySelectorAll('.db-list-toolcard')]
    .filter(card => card.style.display !== 'none').map(card => card.dataset.select);
  assert.deepEqual(visible, ['timesheet']);
  assert.equal(document.querySelector('.mtw-shell-account-label').textContent, 'Shared link');
  assert.equal(document.querySelector('.mtw-shell-account-role').textContent, 'Workshop tablet');
  assert.equal(document.querySelector('script[data-mtw-developer-tools]'), null, 'Manager Tools not loaded');
  // X does nothing: there is no overview to go back to.
  window.openDBTool('timesheet');
  document.querySelector('#exit-btn').click();
  assert.equal(document.querySelector('.db-tool-wrapper').style.display, 'block');
  // Other tools can't be opened even by id.
  window.openDBTool('barcodes');
  assert.notEqual(document.querySelector('.barcodes-panel, .barcode-label-panels')?.style.display, 'block');
  dom.window.close();
});

test('Manager Tools creates a share link (hash stored, token only in the URL) and revokes it', async () => {
  const { dom, window, document } = host(
    '<script src="../access/session-guard.js"></script><script src="dashboard-navigation.js"></script>');
  await waitFor(window, () => document.querySelector('.developer-share-form'));
  const form = document.querySelector('.developer-share-form');
  form.querySelector('input[name="label"]').value = 'Workshop tablet';
  form.querySelector('.developer-share-create').click();
  await waitFor(window, () => document.querySelector('.developer-share-new input'));

  const url = new URL(document.querySelector('.developer-share-new input').value);
  const token = url.searchParams.get('share');
  assert.match(token, /^[A-Za-z0-9_-]{30,}$/);
  assert.equal(url.pathname, '/apps/dashboard/js/navigation/host.html');
  const saved = window.__saved.find(item => item.ref.collection === 'dashboard-share-links');
  assert.equal(saved.ref.id, await window.MTW_SESSION_GUARD.hashToken(token));
  assert.equal(saved.data.tool, 'timesheet');
  assert.equal(saved.data.label, 'Workshop tablet');
  assert.equal(saved.data.revoked, false);
  assert.equal(saved.data.createdBy, 'Managers');
  assert.ok(!JSON.stringify(saved.data).includes(token), 'token itself is never stored');

  // Revoke from the list.
  window.MTW.getDocs = async () => ({
    forEach(fn) { fn({ id: saved.ref.id, data: () => saved.data }); }
  });
  document.querySelector('.db-list-toolcard[data-select="developer-tools"]').click();
  document.querySelector('.mtw-home-tab').click();
  document.dispatchEvent(new window.CustomEvent('db-tools-ready'));
  await waitFor(window, () => document.querySelector('.developer-share-revoke'));
  document.querySelector('.developer-share-revoke').click();
  await waitFor(window, () => (window.__updated || []).length);
  Object.assign(saved.data, window.__updated[0].data);
  await waitFor(window, () => document.querySelector('.developer-share-row[data-revoked="true"]'));
  assert.equal(document.querySelector('.developer-share-revoke'), null);
  assert.equal(window.__updated[0].ref.id, saved.ref.id);
  assert.equal(window.__updated[0].data.revoked, true);
  dom.window.close();
});
