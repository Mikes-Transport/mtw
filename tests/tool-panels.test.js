'use strict';

// Loads the repository panel templates, navigation and the real tool scripts into a
// page shaped like the published Webflow dashboard, then checks every tool opens its
// own panel inside the shell and the tool scripts start without errors.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

const ORIGIN = 'http://mtw.test/';
const REPO_ROOT = path.join(__dirname, '..');
const DASHBOARD = path.join(REPO_ROOT, 'apps', 'dashboard');
const BASE_URL = ORIGIN + 'apps/dashboard/';

class RepoLoader extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith(ORIGIN)) return null;
    const file = path.join(REPO_ROOT, decodeURIComponent(new URL(url).pathname));
    if (!file.startsWith(REPO_ROOT) || !fs.existsSync(file)) return Promise.reject(new Error('404 ' + url));
    return Promise.resolve(fs.readFileSync(file));
  }
}

const TEMPLATE_IDS = fs.readdirSync(path.join(DASHBOARD, 'templates'))
  .filter(name => name.endsWith('.html'))
  .map(name => name.replace(/\.html$/, ''));
const templates = Object.fromEntries(TEMPLATE_IDS.map(id =>
  [id, fs.readFileSync(path.join(DASHBOARD, 'templates', id + '.html'), 'utf8')]));

// Same order as js/dashboard.js.
const loaderSource = fs.readFileSync(path.join(DASHBOARD, 'js', 'dashboard.js'), 'utf8');
const TOOL_SCRIPTS = [...loaderSource.match(/const TOOL_SCRIPTS = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)]
  .map(match => match[1]);
const LOADER_TEMPLATES = [...loaderSource.match(/const TEMPLATES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)]
  .map(match => match[1]);

// Roughly what the published Webflow page has: the old dashboard markup directly in
// <body>, with Webflow's renamed barcode panel.
const LEGACY_WEBFLOW_BODY =
  '<div class="change-logs"><h2 class="change-log-head">CHANGE LOGS</h2></div>' +
  '<div class="db-tool-wrapper"><h1 class="tool-wrapper-h2">Activity Logs</h1>' +
    '<div class="db-selected-panel-wrapper">' +
      '<div class="activity-logs-panel legacy-webflow">old</div>' +
      '<div class="barcode-label-panels-2 legacy-webflow">old</div>' +
    '</div></div>';

function host(bodyHtml, { withTemplates = true } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(String(error.message || error)));
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, {
    url: BASE_URL + 'host.html',
    runScripts: 'dangerously',
    resources: new RepoLoader(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.sessionStorage.setItem('mtw_admin_name', 'Managers');
      window.MTW_DASHBOARD_BASE_URL = BASE_URL;
      if (withTemplates) window.MTW_DASHBOARD_TEMPLATES = { ...templates };
      const empty = { empty: true, size: 0, docs: [], forEach() {} };
      window.MTW = {
        db: {},
        $: selector => window.document.querySelector(selector),
        $$: selector => Array.from(window.document.querySelectorAll(selector)),
        collection: () => ({}),
        getDocs: async () => empty,
        doc: (db, ...parts) => ({ path: parts.join('/') }),
        getDoc: async () => ({ exists: () => false, data: () => ({}) }),
        addDoc: async () => ({ id: 'new' }),
        updateDoc: async () => {},
        deleteDoc: async () => {},
        setDoc: async () => {}
      };
      window.print = () => {};
    }
  });
  return { dom, window: dom.window, document: dom.window.document, errors };
}

function waitFor(window, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      let ok = false;
      try { ok = predicate(); } catch (error) { /* not ready */ }
      if (ok) return resolve();
      if (Date.now() - started > timeout) return reject(new Error('timed out'));
      window.setTimeout(poll, 20);
    })();
  });
}

// Tool scripts are ES modules (top-level `const { db } = window.MTW` in each), so
// give each its own scope, as import() does in the browser.
function runToolScripts(window) {
  for (const script of TOOL_SCRIPTS) {
    const source = fs.readFileSync(path.join(DASHBOARD, 'js', script), 'utf8');
    window.eval(`(function () {\n${source}\n})();\n//# sourceURL=${script}`);
  }
}

const dashboardErrors = errors => errors.filter(message =>
  !/stylesheet|Could not parse CSS|Not implemented|\.css|fonts\.googleapis|IDAutomation|font/i.test(message));

async function boot(body, options) {
  const page = host(body + '<script src="js/navigation/dashboard-navigation.js"></script>', options);
  await waitFor(page.window, () => page.document.querySelector('.mtw-dashboard-shell'));
  return page;
}

test('the loader lists every template file', () => {
  assert.deepEqual([...LOADER_TEMPLATES].sort(), [...TEMPLATE_IDS].sort());
});

test('templates replace the Webflow markup and every tool opens its own panel', async () => {
  const { dom, window, document, errors } = await boot(LEGACY_WEBFLOW_BODY);

  assert.equal(document.querySelectorAll('.legacy-webflow').length, 0, 'Webflow panels removed');
  assert.equal(document.querySelectorAll('.db-tool-wrapper').length, 1);
  assert.equal(document.querySelectorAll('.change-logs').length, 1);
  assert.ok(document.querySelector('.mtw-dashboard-shell .change-logs'), 'change logs inside the shell');

  const ids = ['activity-logs', 'secondhand-tool', 'product-info', 'csv-config', 'mte-config',
    'promotion-label', 'barcodes', 'model-tool-access'];
  for (const id of ids) {
    const selector = window.MTW_TOOL_REGISTRY[id].panel;
    const panels = document.querySelectorAll(selector);
    assert.equal(panels.length, 1, `one ${selector}`);
    assert.ok(panels[0].closest('.mtw-dashboard-shell .db-selected-panel-wrapper'), `${id} inside the shell`);

    document.querySelector(`.db-list-toolcard[data-select="${id}"]`).click();
    assert.equal(panels[0].style.display, 'block', `${id} shown`);
    const others = ids.filter(other => other !== id)
      .map(other => document.querySelector(window.MTW_TOOL_REGISTRY[other].panel));
    assert.ok(others.every(panel => panel.style.display === 'none'), `only ${id} shown`);
    const missing = document.querySelector('.mtw-dashboard-missing-tool');
    assert.ok(!missing || missing.style.display === 'none', `${id} has its panel`);
  }

  const img = document.querySelector('.barcode-label-panels img.image');
  assert.equal(img.getAttribute('src'), BASE_URL + 'assets/labels/x2-labels.jpg');
  assert.ok(fs.existsSync(path.join(DASHBOARD, 'assets', 'labels', 'x2-labels.jpg')));
  assert.deepEqual(dashboardErrors(errors), []);
  dom.window.close();
});

test('without templates, the Webflow markup is adopted into the shell', async () => {
  const { dom, document } = await boot(LEGACY_WEBFLOW_BODY, { withTemplates: false });
  assert.equal(document.querySelectorAll('.db-tool-wrapper').length, 1, 'no duplicate wrapper');
  assert.ok(document.querySelector('.mtw-dashboard-shell .activity-logs-panel.legacy-webflow'));
  assert.ok(document.querySelector('.mtw-dashboard-shell .change-logs'));
  document.querySelector('.db-list-toolcard[data-select="activity-logs"]').click();
  assert.equal(document.querySelector('.activity-logs-panel').style.display, 'block');
  dom.window.close();
});

test('template forms never submit the page', async () => {
  const { dom, window, document } = await boot('');
  const forms = document.querySelectorAll('.db-selected-panel-wrapper form');
  assert.ok(forms.length >= 3, 'product, secondhand and CSV forms are installed');
  for (const form of forms) {
    const event = new window.Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  dom.window.close();
});

test('the real tool scripts start against the templates without errors', async () => {
  const { dom, window, document, errors } = await boot(LEGACY_WEBFLOW_BODY);
  runToolScripts(window);

  // Barcodes: label sheet choices are added to the dropdown around its nav card.
  await waitFor(window, () =>
    document.querySelectorAll('#barcode-drop').length === 1 &&
    document.querySelector('.db-list-dropdown-wrapper #barcode-drop') &&
    document.querySelectorAll('.db-list-dropdown-wrapper [data-barcode-template]').length === 4);

  // Each label-sheet page (barcodes.js copies these for every printed page) carries
  // its image, loaded eagerly.
  const sheets = document.querySelectorAll('.barcode-label-panels .barcode-page img.image');
  assert.equal(sheets.length, 4);
  for (const img of sheets) {
    assert.match(img.getAttribute('src'), /^http:\/\/mtw\.test\/apps\/dashboard\/assets\/labels\/x(2|8|10|30)-labels\.jpg$/);
    assert.equal(img.hasAttribute('loading'), false, 'not lazy-loaded');
  }

  // Promotional labels: renders its starter card into the template's containers.
  document.querySelector('.db-list-toolcard[data-select="promotion-label"]').click();
  await waitFor(window, () => document.querySelector('.card-view-container .et-current-card') &&
    document.querySelector('.et-card-body-wrapper .et-page'));

  // Model access: fills the empty panel itself.
  document.querySelector('.db-list-toolcard[data-select="model-tool-access"]').click();
  await waitFor(window, () => document.querySelector('.model-access-panel .ma-root'));

  await new Promise(resolve => window.setTimeout(resolve, 300));
  assert.deepEqual(dashboardErrors(errors), []);
  dom.window.close();
});

test('promotional label editing opens in the drawer, not the hidden sidebar', async () => {
  const { dom, window, document } = await boot('');
  runToolScripts(window);
  document.querySelector('.db-list-toolcard[data-select="promotion-label"]').click();
  await waitFor(window, () => document.querySelector('.card-view-container .et-current-card'));

  document.querySelector('.card-view-container [btn="edit"]').click();
  const left = document.querySelector('.db-left-content');
  await waitFor(window, () => left.classList.contains('editing') && left.querySelector('.et-edit-panel'));
  assert.ok(left.closest('.mtw-dashboard-shell'), 'drawer is inside the shell');
  assert.ok(left.classList.contains('mtw-shell-editor'));
  assert.equal(left.hasAttribute('hidden'), false);
  assert.equal(left.style.display, '');
  await new Promise(resolve => window.setTimeout(resolve, 300));
  dom.window.close();
});

test('tools.css: modals sit above the dashboard, product grid is 4 wide, row text is readable', async () => {
  const css = fs.readFileSync(path.join(DASHBOARD, 'styles', 'tools.css'), 'utf8');
  // Webflow's site stylesheet still loads first on the live page; tools.css must win.
  const webflow = '.row-text{color:#fff}.product-results-grid{grid-template-columns:1fr 1fr 1fr}' +
    '.product-add-product-panel{position:fixed;display:none}';
  const { dom, window, document } = await boot(`<style>${webflow}</style><style>${css}</style>`);
  const style = el => window.getComputedStyle(el);

  assert.equal(style(document.querySelector('.product-add-product-panel')).zIndex, '10000');
  assert.equal(style(document.querySelector('.second-hand-overlay')).zIndex, '10000');
  assert.equal(style(document.querySelector('.product-results-grid')).gridTemplateColumns,
    'repeat(4, minmax(0, 1fr))');

  const row = document.createElement('div');
  row.className = 'row-text';
  document.querySelector('.activity-table-body').appendChild(row);
  assert.notEqual(style(row).color, 'rgb(255, 255, 255)', 'row text is not white');
  dom.window.close();
});

test('barcode label-sheet menu closes on pick, outside click, Escape, tabbing away and other tools', async () => {
  const { dom, window, document, errors } = await boot('');
  runToolScripts(window);
  await waitFor(window, () => document.querySelectorAll('[data-barcode-template]').length === 4);
  const menu = document.querySelector('.db-list-dropdown-wrapper');
  const drop = document.querySelector('#barcode-drop');
  const isOpen = () => menu.classList.contains('barcode-dropdown-open');
  const open = () => { drop.click(); assert.equal(isOpen(), true, 'opens'); };
  const press = (target, type, init = {}) =>
    target.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  open();
  document.querySelector('[data-barcode-template="medium"]').click();
  assert.equal(isOpen(), false, 'closes on pick');

  open();
  press(menu.querySelector('[data-barcode-template="large"]'), 'pointerdown');
  assert.equal(isOpen(), true, 'pointer inside the menu keeps it open');
  press(document.querySelector('.change-logs'), 'pointerdown');
  assert.equal(isOpen(), false, 'closes on outside click');

  open();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(isOpen(), false, 'closes on Escape');

  open();
  document.querySelector('.db-list-toolcard[data-select="csv-config"]').focus();
  assert.equal(isOpen(), false, 'closes when focus tabs away');

  open();
  document.querySelector('.db-list-toolcard[data-select="product-info"]').click();
  assert.equal(isOpen(), false, 'closes when another tool opens');

  await new Promise(resolve => window.setTimeout(resolve, 300));
  assert.deepEqual(dashboardErrors(errors), []);
  dom.window.close();
});

test('change logs are one centred column', async () => {
  const css = fs.readFileSync(path.join(DASHBOARD, 'styles', 'admin-dashboard.css'), 'utf8');
  const { dom, window, document } = await boot(`<style>${css}</style>`);
  const logs = window.getComputedStyle(document.querySelector('.mtw-dashboard-shell .change-logs'));
  assert.equal(logs.maxWidth, '760px');
  assert.equal(logs.marginLeft, 'auto');
  assert.equal(logs.marginRight, 'auto');

  // Each card is one full-width row: title left, date right (no half-empty grid).
  const box = document.querySelector('.mtw-dashboard-shell .change-logs');
  box.innerHTML = '<div class="change-log-scroll"><div class="change-log-card"><div class="change-log-card-top">' +
    '<div class="change-log-title">T</div><div class="change-log-date">D</div></div></div></div>';
  assert.equal(window.getComputedStyle(box.querySelector('.change-log-card')).display, 'block');
  const top = window.getComputedStyle(box.querySelector('.change-log-card-top'));
  assert.equal(top.display, 'flex');
  assert.equal(top.justifyContent, 'space-between');
  dom.window.close();
});

// jsdom has no layout, so give elements a settable scrollTop to observe the editors.
function trackScrollTop(window) {
  Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() { return this.__scrollTop || 0; },
    set(value) { this.__scrollTop = value; }
  });
}

test('promotional edit panel keeps its scroll position when rebuilt', async () => {
  const { dom, window, document } = await boot('');
  trackScrollTop(window);
  runToolScripts(window);
  document.querySelector('.db-list-toolcard[data-select="promotion-label"]').click();
  await waitFor(window, () => document.querySelector('.card-view-container [btn="edit"]'));

  document.querySelector('.card-view-container [btn="edit"]').click();
  await waitFor(window, () => document.querySelector('.et-edit-panel'));
  const first = document.querySelector('.et-edit-panel');
  first.scrollTop = 420;

  document.querySelector('.card-view-container [btn="edit"]').click();
  await waitFor(window, () => document.querySelector('.et-edit-panel') !== first);
  const second = document.querySelector('.et-edit-panel');
  assert.equal(second.scrollTop, 420);
  assert.match(second.style.getPropertyValue('--promo-edit-top'), /^\d+px$/);
  await new Promise(resolve => window.setTimeout(resolve, 300));
  dom.window.close();
});

test('barcode cards get the Edit hover pill, and the edit panel keeps its scroll position', async () => {
  const { dom, window, document } = await boot('');
  trackScrollTop(window);
  runToolScripts(window);
  document.querySelector('.db-list-toolcard[data-select="barcodes"]').click();
  await waitFor(window, () => document.querySelector('.barcode-add-card-button'));

  document.querySelector('.barcode-add-card-button').click();
  await waitFor(window, () => document.querySelector('.barcode-edit-panel') &&
    document.querySelector('.barcode-card .barcode-card-overlay'));
  const pill = document.querySelector('.barcode-card .barcode-card-overlay .barcode-card-overlay-btn');
  assert.ok(pill, 'overlay has an Edit pill');
  assert.equal(pill.textContent, 'Edit');

  const first = document.querySelector('.barcode-edit-panel');
  first.scrollTop = 310;
  document.querySelector('.barcode-card .barcode-card-overlay').click();
  await waitFor(window, () => document.querySelector('.barcode-edit-panel') !== first);
  assert.equal(document.querySelector('.barcode-edit-panel').scrollTop, 310);
  await new Promise(resolve => window.setTimeout(resolve, 300));
  dom.window.close();
});
