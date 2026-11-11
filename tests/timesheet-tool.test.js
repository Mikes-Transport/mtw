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
  const listeners = {};
  let next = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const table = name => (store[name] = store[name] || {});
  const snapshot = name => {
    const rows = Object.entries(table(name));
    return { forEach(fn) { rows.forEach(([id, data]) => fn({ id, data: () => copy(data) })); } };
  };
  // Like Firestore: listeners get the current data at once and after every write.
  const notify = name => (listeners[name] || []).forEach(fn => setTimeout(() => fn(snapshot(name)), 0));
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
      addDoc: async (ref, data) => { const id = `doc${++next}`; table(ref.name)[id] = copy(data); notify(ref.name); return { id }; },
      setDoc: async (ref, data) => { table(ref.name)[ref.id] = copy(data); notify(ref.name); },
      updateDoc: async (ref, data) => { Object.assign(table(ref.name)[ref.id], copy(data)); notify(ref.name); },
      deleteDoc: async ref => { delete table(ref.name)[ref.id]; notify(ref.name); },
      onSnapshot: (ref, onNext) => {
        (listeners[ref.name] = listeners[ref.name] || []).push(onNext);
        setTimeout(() => onNext(snapshot(ref.name)), 0);
        return () => { listeners[ref.name] = listeners[ref.name].filter(fn => fn !== onNext); };
      }
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
  assert.deepEqual([...document.querySelectorAll('.ts-tab')].map(text), ['Team status', 'Hours', 'Requests', 'People & PINs', 'Settings']);
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
  assert.deepEqual([...document.querySelectorAll('.ts-tab')].map(text), ['Clock', 'My hours', 'Requests']);
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
  assert.ok(document.querySelector('.ts-timer.is-break [data-live="remaining"]'), 'break timer shows time left');
  button(document, 'End break').click();
  await waitFor(window, () => /Working/.test(text(document.querySelector('.ts-state-label'))));

  // Each break once per day: the first rest break is now "Taken" and disabled.
  const firstBreak = document.querySelector('.ts-break button');
  assert.equal(text(firstBreak), 'Taken');
  assert.equal(firstBreak.disabled, true);
  assert.match(text(document.querySelector('.ts-break')), /Taken ·/);

  // Work summary for today.
  document.querySelector('.ts-card textarea').value = 'Uploaded 12 products';
  button(document, 'Save summary').click();
  await waitFor(window, () => /summary saved/i.test(text(document.querySelector('.ts-message'))));

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
  assert.match(text(document.querySelector('.ts-summaries')), /Uploaded 12 products/, 'GM sees the work summary');

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

// Shared setup: first GM and one employee; returns their PINs.
async function setUpPeople(window, document) {
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
  return { gmPin, employeePin: text(document.querySelector('.ts-pin-reveal .ts-pin')) };
}

test('GM Team status updates live when the employee clocks in elsewhere', async () => {
  const { dom, window, document, store } = host();
  try {
    await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
    loadTimesheet(window);
    await setUpPeople(window, document);
    await openTab(window, document, 'Team status');
    await waitFor(window, () => /Clocked out/.test(text(document.querySelector('.ts-member'))));

    // The employee clocks in on their own computer: only Firestore changes here.
    const austinId = Object.entries(store['timesheet-people']).find(([, p]) => p.name === 'Austin')[0];
    await window.MTW.addDoc(window.MTW.collection(window.MTW.db, 'timesheet-sessions'), {
      personId: austinId, startAt: Date.now() - 60000, endAt: null, task: 'Events', breaks: []
    });
    await waitFor(window, () => /Working/.test(text(document.querySelector('.ts-member'))));
    assert.match(text(document.querySelector('.ts-member')), /Events/);
  } finally {
    dom.window.close();
  }
});

test('employee requests a day off; GM approves; it shows on the timesheet', async () => {
  const { dom, window, document, store } = host();
  try {
    await waitFor(window, () => document.querySelector('.mtw-dashboard-shell'));
    loadTimesheet(window);
    const { gmPin, employeePin } = await setUpPeople(window, document);

    button(document, 'Lock').click();
    await enterPin(window, document, employeePin);
    await openTab(window, document, 'Requests');
    const form = document.querySelector('.ts-request-form');
    form.querySelector('select').value = 'Day off';
    const day = window.MTW_TIMESHEET_CORE.dateKey(Date.now(), 'Pacific/Auckland');
    const [from, to] = form.querySelectorAll('input[type="date"]');
    from.value = day;
    to.value = day;
    form.querySelector('textarea').value = 'Dentist';
    button(document, 'Send request').click();
    await waitFor(window, () => /Request sent/.test(text(document.querySelector('.ts-message'))));
    assert.match(text(document.querySelector('.ts-request')), /Day off .*Pending/);
    const [request] = Object.values(store['timesheet-requests']);
    assert.equal(request.status, 'pending');
    assert.equal(request.from, day);

    // End date before start is refused.
    to.value = window.MTW_TIMESHEET_CORE.addDays(day, -1);
    document.querySelector('.ts-request-form select').value = 'Sick leave';
    const [from2, to2] = document.querySelectorAll('.ts-request-form input[type="date"]');
    from2.value = day;
    to2.value = window.MTW_TIMESHEET_CORE.addDays(day, -1);
    button(document, 'Send request').click();
    await waitFor(window, () => /on or after/.test(text(document.querySelector('.ts-message'))));

    button(document, 'Lock').click();
    await enterPin(window, document, gmPin);
    await waitFor(window, () => tab(document, 'Requests (1)'));
    await openTab(window, document, 'Requests (1)');
    assert.match(text(document.querySelector('.ts-request')), /Austin/);
    document.querySelector('.ts-review input').value = 'Enjoy';
    button(document, 'Approve').click();
    await waitFor(window, () => /Request approved/.test(text(document.querySelector('.ts-message'))));
    assert.equal(Object.values(store['timesheet-requests'])[0].status, 'approved');
    assert.ok(tab(document, 'Requests'), 'pending count cleared');

    await openTab(window, document, 'Hours');
    await waitFor(window, () => /Day off/.test(text(document.querySelector('.ts-table tbody'))));

    button(document, 'Lock').click();
    await enterPin(window, document, employeePin);
    await openTab(window, document, 'Requests');
    assert.match(text(document.querySelector('.ts-request')), /Approved/);
    assert.match(text(document.querySelector('.ts-request')), /GM note: Enjoy/);
  } finally {
    dom.window.close();
  }
});
