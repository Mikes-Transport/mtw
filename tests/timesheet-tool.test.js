'use strict';

// End-to-end flow of the Timesheet tool inside the dashboard, against an in-memory
// stand-in for Firestore: first GM setup, PIN unlock, adding an employee, clocking in,
// taking a break, clocking out, and the GM view of the week.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

const ORIGIN = 'http://mtw.test/';
const REPO_ROOT = path.join(__dirname, '..');
const BASE_URL = ORIGIN + 'apps/dashboard/';

class RepoLoader extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith(ORIGIN)) return null;
    const file = path.join(REPO_ROOT, decodeURIComponent(new URL(url).pathname));
    if (!file.startsWith(REPO_ROOT) || !fs.existsSync(file)) return Promise.reject(new Error('404 ' + url));
    return Promise.resolve(fs.readFileSync(file));
  }
}

function memoryFirestore() {
  const store = {};
  let next = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const table = name => (store[name] = store[name] || {});
  return {
    store,
    api: {
      db: {},
      collection: (db, name) => ({ name }),
      doc: (db, name, id) => ({ name, id }),
      getDocs: async ref => {
        const rows = Object.entries(table(ref.name));
        return { forEach(fn) { rows.forEach(([id, data]) => fn({ id, data: () => copy(data) })); } };
      },
      getDoc: async ref => ({ exists: () => Boolean(table(ref.name)[ref.id]), data: () => copy(table(ref.name)[ref.id]) }),
      addDoc: async (ref, data) => { const id = `doc${++next}`; table(ref.name)[id] = copy(data); return { id }; },
      setDoc: async (ref, data) => { table(ref.name)[ref.id] = copy(data); },
      updateDoc: async (ref, data) => { Object.assign(table(ref.name)[ref.id], copy(data)); },
      deleteDoc: async ref => { delete table(ref.name)[ref.id]; }
    }
  };
}

function host(role = 'Managers') {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(String(error.message || error)));
  const firestore = memoryFirestore();
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><script src="js/navigation/dashboard-navigation.js"></script></body></html>', {
    url: BASE_URL + 'host.html',
    runScripts: 'dangerously',
    resources: new RepoLoader(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.sessionStorage.setItem('mtw_admin_name', role);
      window.MTW_DASHBOARD_BASE_URL = BASE_URL;
      Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
      if (!window.TextEncoder) window.TextEncoder = TextEncoder;
      window.MTW = {
        ...firestore.api,
        $: s => window.document.querySelector(s),
        $$: s => Array.from(window.document.querySelectorAll(s))
      };
    }
  });
  return { dom, window: dom.window, document: dom.window.document, errors, store: firestore.store };
}

function waitFor(window, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      let ok = false;
      try { ok = predicate(); } catch (error) { /* not yet */ }
      if (ok) return resolve();
      if (Date.now() - started > timeout) return reject(new Error('timed out waiting'));
      window.setTimeout(poll, 20);
    })();
  });
}

function loadTimesheet(window) {
  for (const file of ['timesheet-core.js', 'timesheet.js']) {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'timesheet', 'js', file), 'utf8');
    window.eval(`(function () {\n${source}\n})();\n//# sourceURL=${file}`);
  }
}

const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const button = (document, label) =>
  [...document.querySelectorAll('.timesheet-panel button')].find(b => text(b) === label);
const tab = (document, label) =>
  [...document.querySelectorAll('.timesheet-panel .ts-tab')].find(b => text(b) === label);

async function openTab(window, document, label) {
  await waitFor(window, () => tab(document, label));
  tab(document, label).click();
  await waitFor(window, () => tab(document, label).classList.contains('active'));
}

async function enterPin(window, document, pin) {
  await waitFor(window, () => document.querySelector('.ts-pin-input'));
  document.querySelector('.ts-pin-input').value = pin;
  button(document, 'Unlock').click();
}

test('Timesheet is a Managers-only navigation item', async () => {
  for (const [role, visible] of [['Managers', true], ['Counter', false], ['Stores', false], ['KeyAccounts', false]]) {
    const { dom, window, document } = host(role);
    await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
    const card = document.querySelector('.db-list-toolcard[data-select="timesheet"]');
    assert.ok(card, 'card exists');
    assert.equal(card.style.display !== 'none', visible, `${role} ${visible ? 'sees' : 'does not see'} Timesheet`);
    dom.window.close();
  }
});

test('first GM setup, PIN unlock, employee clock-in, break and clock-out', async () => {
  const { dom, window, document, store, errors } = host();
  try {
  await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
  loadTimesheet(window);

  // Setup: no PINs yet.
  document.querySelector('.db-list-toolcard[data-select="timesheet"]').click();
  await waitFor(window, () => /Set up Timesheet/.test(text(document.querySelector('.timesheet-panel'))));
  assert.equal(document.querySelector('.timesheet-panel').style.display, 'block');
  document.querySelector('.timesheet-panel input').value = 'Mike';
  button(document, 'Create GM PIN').click();
  await waitFor(window, () => document.querySelector('.ts-pin-reveal .ts-pin'));
  const gmPin = text(document.querySelector('.ts-pin-reveal .ts-pin'));
  assert.match(gmPin, /^\d{6}$/);

  const [gm] = Object.values(store['timesheet-people']);
  assert.equal(gm.role, 'gm');
  assert.match(gm.pinHash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(store['timesheet-people']).includes(gmPin), 'PIN itself is never stored');

  // Wrong PIN, then the GM's PIN.
  await enterPin(window, document, '000000' === gmPin ? '111111' : '000000');
  await waitFor(window, () => /does not match/.test(text(document.querySelector('.ts-message'))));
  await enterPin(window, document, gmPin);
  await waitFor(window, () => /Team status/.test(text(document.querySelector('.timesheet-panel .ts-tabs'))));
  assert.match(text(document.querySelector('.ts-title')), /Timesheets/);
  assert.deepEqual([...document.querySelectorAll('.ts-tab')].map(text), ['Team status', 'Hours', 'People & PINs', 'Settings']);
  assert.equal(document.querySelector('.ts-tab.active').textContent, 'Team status');
  await openTab(window, document, 'People & PINs');

  // GM adds an employee (Calgary by default).
  const add = document.querySelector('.ts-add');
  add.querySelector('input').value = 'Sam';
  button(document, 'Add & create PIN').click();
  await waitFor(window, () => /PIN for Sam/.test(text(document.querySelector('.ts-pin-reveal'))));
  const samPin = text(document.querySelector('.ts-pin-reveal .ts-pin'));
  const sam = Object.values(store['timesheet-people']).find(p => p.name === 'Sam');
  assert.equal(sam.role, 'employee');
  assert.equal(sam.timeZone, 'America/Edmonton');

  // Employee unlocks and works.
  button(document, 'Lock').click();
  await enterPin(window, document, samPin);
  await waitFor(window, () => button(document, 'Clock in'));
  assert.match(text(document.querySelector('.ts-title')), /My Timesheet/);
  assert.deepEqual([...document.querySelectorAll('.ts-tab')].map(text), ['Clock', 'My hours']);
  assert.ok([...document.querySelectorAll('.ts-break button')].every(b => b.disabled), 'no breaks before clocking in');

  const task = document.querySelector('.ts-status select');
  task.value = 'Flyers and graphic design';
  button(document, 'Clock in').click();
  await waitFor(window, () => button(document, 'Clock out'));
  assert.match(text(document.querySelector('.ts-state-label')), /Working/);

  document.querySelector('.ts-break button').click(); // First rest break
  await waitFor(window, () => button(document, 'End break'));
  assert.match(text(document.querySelector('.ts-state-label')), /first rest break/i);
  assert.ok(!button(document, 'Clock in'));
  button(document, 'End break').click();
  await waitFor(window, () => /Working/.test(text(document.querySelector('.ts-state-label'))));

  button(document, 'Clock out').click();
  await waitFor(window, () => button(document, 'Clock in'));
  await openTab(window, document, 'My hours');
  assert.equal(document.querySelectorAll('.ts-table tbody tr').length, 7);

  const sessions = Object.values(store['timesheet-sessions']);
  assert.equal(sessions.length, 1);
  const [session] = sessions;
  const samId = Object.entries(store['timesheet-people']).find(([, p]) => p.name === 'Sam')[0];
  assert.equal(session.personId, samId);
  assert.equal(session.task, 'Flyers and graphic design');
  assert.ok(session.endAt >= session.startAt);
  assert.equal(session.breaks.length, 1);
  assert.equal(session.breaks[0].type, 'rest1');
  assert.equal(session.breaks[0].paid, true);
  assert.ok(session.breaks[0].endAt != null);

  const actions = Object.values(store['timesheet-audit']).map(a => a.action);
  for (const action of ['person-created', 'clock-in', 'break-start', 'break-end', 'clock-out']) {
    assert.ok(actions.includes(action), `audited: ${action}`);
  }

  // The GM sees Sam's week, with an export.
  button(document, 'Lock').click();
  await enterPin(window, document, gmPin);
  await openTab(window, document, 'Hours');
  await waitFor(window, () => /Timesheet · Sam/.test(text(document.querySelector('.timesheet-panel'))));
  assert.ok(button(document, 'Export CSV'));
  assert.equal(document.querySelectorAll('.ts-table tbody tr').length, 7, 'Wednesday to Tuesday');
  assert.match(text(document.querySelector('.ts-table thead')), /Day \(NZ\)/);

  assert.deepEqual(errors.filter(e => !/stylesheet|Could not parse CSS|Not implemented/i.test(e)), []);
  } finally {
    dom.window.close();
  }
});

test('GM settings change break allowances and tasks for everyone', async () => {
  const { dom, window, document, store } = host();
  try {
    await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
    loadTimesheet(window);
    document.querySelector('.db-list-toolcard[data-select="timesheet"]').click();
    await waitFor(window, () => /Set up Timesheet/.test(text(document.querySelector('.timesheet-panel'))));
    document.querySelector('.timesheet-panel input').value = 'Taran';
    button(document, 'Create GM PIN').click();
    await waitFor(window, () => document.querySelector('.ts-pin-reveal .ts-pin'));
    const gmPin = text(document.querySelector('.ts-pin-reveal .ts-pin'));
    await enterPin(window, document, gmPin);

    await openTab(window, document, 'People & PINs');
    document.querySelector('.ts-add input').value = 'Austin';
    button(document, 'Add & create PIN').click();
    await waitFor(window, () => /PIN for Austin/.test(text(document.querySelector('.ts-pin-reveal'))));
    const pin = text(document.querySelector('.ts-pin-reveal .ts-pin'));

    await openTab(window, document, 'Settings');
    const meal = document.querySelector('.ts-setting-break[data-break="meal"]');
    meal.querySelector('[data-field="label"]').value = 'Lunch';
    meal.querySelector('[data-field="minutes"]').value = '45';
    document.querySelector('.ts-settings textarea').value = 'Website\nFlyers\n\nWebsite';
    button(document, 'Save settings').click();
    await waitFor(window, () => /Settings saved/.test(text(document.querySelector('.ts-message'))));

    const saved = store['timesheet-settings'].main;
    assert.deepEqual(saved.tasks, ['Website', 'Flyers']);
    assert.deepEqual(saved.breaks.find(b => b.id === 'meal'), { id: 'meal', label: 'Lunch', minutes: 45, paid: false });
    assert.ok(Object.values(store['timesheet-audit']).some(a => a.action === 'settings-saved'));

    // Invalid minutes are refused.
    meal.querySelector('[data-field="minutes"]').value = '-5';
    await openTab(window, document, 'Settings');
    document.querySelector('.ts-setting-break[data-break="meal"] [data-field="minutes"]').value = '-5';
    button(document, 'Save settings').click();
    await waitFor(window, () => /between 0 and 240/.test(text(document.querySelector('.ts-message'))));
    assert.equal(store['timesheet-settings'].main.breaks.find(b => b.id === 'meal').minutes, 45);

    // The employee sees the new break and task list.
    button(document, 'Lock').click();
    await enterPin(window, document, pin);
    await waitFor(window, () => button(document, 'Clock in'));
    const options = [...document.querySelectorAll('.ts-status select option')].map(o => o.value).filter(Boolean);
    assert.deepEqual(options, ['Website', 'Flyers']);
    assert.match(text(document.querySelector('.timesheet-panel')), /Lunch · unpaid · 45 min/);
  } finally {
    dom.window.close();
  }
});
