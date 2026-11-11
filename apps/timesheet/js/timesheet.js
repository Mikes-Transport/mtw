// Timesheet tool for the MTW dashboard (Managers only in the navigation).
//
// A PIN identifies the person using it:
//   - employee: clock in/out, task, breaks, today and this week, daily work summary;
//   - gm: live team status, weekly timesheets for any employee, CSV export, people & PINs.
// PINs are 6 digits, generated here and stored in Firestore only as salted SHA-256 hashes.
//
// Firestore collections:
//   timesheet-people    { name, role: 'employee'|'gm', timeZone, pinSalt, pinHash, active, createdAt }
//   timesheet-sessions  { personId, startAt, endAt|null, task, breaks: [{ type, paid, startAt, endAt|null }], createdAt, updatedAt }
//   timesheet-summaries { personId, date, text, updatedAt }            (id: `${personId}_${date}`)
//   timesheet-audit     { actorId, action, targetType, targetId, at, details }
//   timesheet-settings  main: { breaks: [{ id, label, minutes, paid }], tasks: [..], longSessionHours }
//   timesheet-requests  { personId, type, from, to, note, status: 'pending'|'approved'|'declined'|'cancelled',
//                         createdAt, reviewedBy, reviewedAt, reviewNote }   (from/to are NZ dates)
// Times are UTC milliseconds. Reporting dates and weeks use New Zealand time.
(function () {
  'use strict';

  if (window.MTW_TIMESHEET_STARTED) return;
  window.MTW_TIMESHEET_STARTED = true;

  const TOOL_ID = 'timesheet';
  const PANEL_CLASS = 'timesheet-panel';
  const UNLOCK_KEY = 'mtw_timesheet_person';
  const C = {
    people: 'timesheet-people',
    sessions: 'timesheet-sessions',
    summaries: 'timesheet-summaries',
    audit: 'timesheet-audit',
    settings: 'timesheet-settings',
    requests: 'timesheet-requests'
  };

  const REQUEST_TYPES = ['Day off', 'Annual leave', 'Sick leave', 'Unpaid leave', 'Shift change', 'Other'];

  const core = () => window.MTW_TIMESHEET_CORE;
  const api = () => window.MTW || {};

  const state = {
    people: [],
    sessions: [],
    person: null,
    weekStart: null,
    viewPersonId: null,
    message: null,
    busy: false,
    loaded: false,
    settings: null,
    summaries: [],
    requests: [],
    tab: null,
    // A newly created PIN, shown until unlock, tab change or another PIN: kept in state so
    // live re-renders don't wipe it.
    reveal: null,
    pendingRender: false
  };
  let unsubscribers = [];
  let panel = null;
  let ticker = null;
  let refresher = null;

  // ---------- helpers ----------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key in el && typeof value !== 'string') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function reportingZone() { return core().DEFAULTS.reportingTimeZone; }

  // GM-editable settings (timesheet-settings/main), merged over the defaults.
  function cfg() {
    const d = core().DEFAULTS;
    const saved = state.settings || {};
    const breaks = d.breaks.map(def => {
      const s = (Array.isArray(saved.breaks) ? saved.breaks : []).find(b => b && b.id === def.id) || {};
      return {
        id: def.id,
        label: typeof s.label === 'string' && s.label.trim() ? s.label.trim().slice(0, 40) : def.label,
        minutes: Number.isFinite(Number(s.minutes)) && Number(s.minutes) >= 0 ? Number(s.minutes) : def.minutes,
        paid: typeof s.paid === 'boolean' ? s.paid : def.paid
      };
    });
    const tasks = Array.isArray(saved.tasks) && saved.tasks.length
      ? saved.tasks.map(t => String(t).trim()).filter(Boolean)
      : [...d.tasks];
    const longSessionHours = Number(saved.longSessionHours) > 0 ? Number(saved.longSessionHours) : d.longSessionHours;
    return { breaks, tasks, longSessionHours };
  }

  function calcOptions() {
    const c = cfg();
    return { breaks: c.breaks, longSessionHours: c.longSessionHours };
  }

  function personZone(person) {
    return (person && person.timeZone) || core().DEFAULTS.employeeTimeZone;
  }

  function today() { return core().dateKey(Date.now(), reportingZone()); }

  function sessionsFor(personId) {
    return state.sessions.filter(s => s.personId === personId);
  }

  // Errors meant for the person using the tool (shown in the panel, not logged as bugs).
  function userError(message) {
    const error = new Error(message);
    error.userFacing = true;
    return error;
  }

  function requireDb() {
    const a = api();
    if (!a.db || typeof a.collection !== 'function' || typeof a.getDocs !== 'function') {
      throw userError('The dashboard database is unavailable.');
    }
    return a;
  }

  async function readAll(name) {
    const a = requireDb();
    const snapshot = await a.getDocs(a.collection(a.db, name));
    const rows = [];
    snapshot.forEach(item => rows.push({ id: item.id, ...(item.data() || {}) }));
    return rows;
  }

  async function audit(action, targetType, targetId, details) {
    try {
      const a = requireDb();
      await a.addDoc(a.collection(a.db, C.audit), {
        actorId: state.person ? state.person.id : null,
        action, targetType, targetId: targetId || null,
        at: Date.now(),
        details: details || null
      });
    } catch (error) {
      console.warn('[timesheet] audit write failed:', error);
    }
  }

  const apply = {
    [C.people](rows) {
      state.people = rows.filter(p => p.active !== false);
      const unlockedId = sessionStorage.getItem(UNLOCK_KEY);
      state.person = state.people.find(p => p.id === unlockedId) || null;
      if (!state.person) sessionStorage.removeItem(UNLOCK_KEY);
    },
    [C.sessions](rows) {
      state.sessions = rows.map(s => ({
        ...s,
        startAt: core().toMillis(s.startAt),
        endAt: core().toMillis(s.endAt),
        breaks: (s.breaks || []).map(b => ({ ...b, startAt: core().toMillis(b.startAt), endAt: core().toMillis(b.endAt) }))
      }));
    },
    [C.summaries](rows) { state.summaries = rows; },
    [C.requests](rows) { state.requests = rows; },
    [C.settings](rows) { state.settings = rows.find(row => row.id === 'main') || null; }
  };

  async function load() {
    const names = [C.people, C.sessions, C.summaries, C.settings, C.requests];
    const results = await Promise.all(names.map(readAll));
    names.forEach((name, i) => apply[name](results[i]));
    state.loaded = true;
  }

  // Live updates: Firestore listeners when the page provides onSnapshot, so GMs see
  // clock-ins, breaks and summaries as they happen. Otherwise poll every 30 seconds.
  function subscribe() {
    unsubscribe();
    const a = api();
    if (typeof a.onSnapshot !== 'function' || !a.db) return false;
    try {
      unsubscribers = [C.people, C.sessions, C.summaries, C.settings, C.requests].map(name =>
        a.onSnapshot(a.collection(a.db, name), snapshot => {
          const rows = [];
          snapshot.forEach(item => rows.push({ id: item.id, ...(item.data() || {}) }));
          apply[name](rows);
          state.loaded = true;
          scheduleRender();
        }, error => console.warn(`[timesheet] live updates stopped for ${name}:`, error)));
      return true;
    } catch (error) {
      console.warn('[timesheet] live updates unavailable, polling instead:', error);
      unsubscribe();
      return false;
    }
  }

  function unsubscribe() {
    unsubscribers.forEach(stop => { try { stop(); } catch (error) { /* already stopped */ } });
    unsubscribers = [];
  }

  // Don't redraw under someone typing; catch up when they leave the field.
  function typingInPanel() {
    const active = document.activeElement;
    return Boolean(panel && active && panel.contains(active) &&
      (active.matches('input, textarea') || (active.matches('select') && !active.closest('.ts-status'))));
  }

  function scheduleRender() {
    if (state.busy) return;
    if (typingInPanel()) {
      state.pendingRender = true;
      return;
    }
    state.pendingRender = false;
    render();
  }

  function summaryText(personId, date) {
    const row = state.summaries.find(r => r.personId === personId && r.date === date);
    return row ? String(row.text || '') : '';
  }

  // Break types started on the given NZ date (each may be taken once per day).
  function breaksTaken(personId, date) {
    const taken = new Set();
    for (const session of sessionsFor(personId)) {
      for (const b of session.breaks || []) {
        if (b.startAt != null && core().dateKey(b.startAt, reportingZone()) === date) taken.add(b.type);
      }
    }
    return taken;
  }

  // Approved requests covering a date, for a person.
  function approvedOn(personId, date) {
    return state.requests.filter(r => r.personId === personId && r.status === 'approved' && r.from <= date && date <= r.to);
  }

  function pendingRequests() {
    return state.requests.filter(r => r.status === 'pending');
  }

  async function submitRequest(type, from, to, note) {
    if (!REQUEST_TYPES.includes(type)) throw userError('Choose a request type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) throw userError('Choose a start date.');
    const end = to || from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < from) throw userError('The end date must be on or after the start date.');
    const a = requireDb();
    const ref = await a.addDoc(a.collection(a.db, C.requests), {
      personId: state.person.id,
      type, from, to: end,
      note: String(note || '').trim().slice(0, 1000),
      status: 'pending',
      createdAt: Date.now(),
      reviewedBy: null, reviewedAt: null, reviewNote: null
    });
    await audit('request-submitted', 'request', ref && ref.id, { type, from, to: end });
    say('Request sent to your GM.');
  }

  async function reviewRequest(request, status, reviewNote) {
    const a = requireDb();
    const changes = status === 'cancelled'
      ? { status }
      : { status, reviewedBy: state.person.id, reviewedAt: Date.now(), reviewNote: String(reviewNote || '').trim().slice(0, 1000) || null };
    await a.updateDoc(a.doc(a.db, C.requests, request.id), changes);
    await audit(`request-${status}`, 'request', request.id, changes);
    say(status === 'cancelled' ? 'Request cancelled.' : `Request ${status}.`);
  }

  function requestRange(r) {
    return r.from === r.to ? core().formatDate(r.from) : `${core().formatDate(r.from)} – ${core().formatDate(r.to)}`;
  }

  function requestCard(r, controls) {
    const person = state.people.find(p => p.id === r.personId);
    return h('div', { class: `ts-request ts-request-${r.status}` },
      h('div', { class: 'ts-request-main' },
        h('strong', { text: `${r.type} · ${requestRange(r)}` }),
        controls.showName && person ? h('span', { class: 'ts-hint', text: ` · ${person.name}` }) : null,
        r.note ? h('p', { text: r.note }) : null,
        r.reviewNote ? h('p', { class: 'ts-hint', text: `GM note: ${r.reviewNote}` }) : null),
      h('div', { class: 'ts-request-side' },
        h('span', { class: `ts-status-pill ${r.status}`, text: r.status[0].toUpperCase() + r.status.slice(1) }),
        controls.buttons || null));
  }

  function say(text, kind = 'info') {
    state.message = text ? { text, kind } : null;
  }

  async function act(work) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      await work();
    } catch (error) {
      if (!error.userFacing) console.error('[timesheet]', error);
      say(error.message || 'Something went wrong.', 'error');
    } finally {
      state.busy = false;
      try { await load(); } catch (error) { say(error.message, 'error'); }
      render();
    }
  }

  // ---------- PINs and people ----------

  async function createPerson(name, role, timeZone) {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) throw userError('Enter a name.');
    const pin = core().generatePin();
    const pinSalt = core().generateSalt();
    const pinHash = await core().hashPin(pin, pinSalt);
    const a = requireDb();
    const ref = await a.addDoc(a.collection(a.db, C.people), {
      name: clean,
      role: role === 'gm' ? 'gm' : 'employee',
      timeZone: timeZone || (role === 'gm' ? reportingZone() : core().DEFAULTS.employeeTimeZone),
      pinSalt, pinHash,
      active: true,
      createdAt: Date.now()
    });
    await audit('person-created', 'person', ref && ref.id, { name: clean, role });
    return pin;
  }

  async function resetPin(person) {
    const pin = core().generatePin();
    const pinSalt = core().generateSalt();
    const pinHash = await core().hashPin(pin, pinSalt);
    const a = requireDb();
    await a.updateDoc(a.doc(a.db, C.people, person.id), { pinSalt, pinHash });
    await audit('pin-reset', 'person', person.id);
    return pin;
  }

  async function unlock(pin) {
    const value = String(pin || '').trim();
    if (!/^\d{6}$/.test(value)) throw userError('Enter your 6-digit PIN.');
    await load();
    for (const person of state.people) {
      if (person.pinSalt && person.pinHash === await core().hashPin(value, person.pinSalt)) {
        sessionStorage.setItem(UNLOCK_KEY, person.id);
        state.person = person;
        state.weekStart = core().weekStart(today());
        state.viewPersonId = null;
        state.tab = person.role === 'gm' ? 'status' : 'clock';
        state.reveal = null;
        say(null);
        return;
      }
    }
    throw userError('That PIN does not match anyone.');
  }

  function lock() {
    sessionStorage.removeItem(UNLOCK_KEY);
    state.person = null;
    say(null);
    render();
  }

  // ---------- sessions and breaks ----------

  function currentStatus(personId) {
    return core().status(sessionsFor(personId));
  }

  async function clockIn(task) {
    await load();
    if (currentStatus(state.person.id).state !== 'off') throw userError('You are already clocked in.');
    const a = requireDb();
    const now = Date.now();
    const ref = await a.addDoc(a.collection(a.db, C.sessions), {
      personId: state.person.id,
      startAt: now,
      endAt: null,
      task: task || null,
      breaks: [],
      createdAt: now,
      updatedAt: now
    });
    await audit('clock-in', 'session', ref && ref.id, { task });
    say('Clocked in.');
  }

  async function updateSession(session, changes, action) {
    const a = requireDb();
    await a.updateDoc(a.doc(a.db, C.sessions, session.id), { ...changes, updatedAt: Date.now() });
    await audit(action, 'session', session.id, changes);
  }

  async function clockOut() {
    await load();
    const { session } = currentStatus(state.person.id);
    if (!session) throw userError('You are not clocked in.');
    const now = Date.now();
    const breaks = (session.breaks || []).map(b => (b.endAt == null ? { ...b, endAt: now } : b));
    await updateSession(session, { endAt: now, breaks }, 'clock-out');
    say('Clocked out.');
  }

  async function changeTask(task) {
    const { session } = currentStatus(state.person.id);
    if (!session) return;
    await updateSession(session, { task }, 'task-changed');
  }

  async function startBreak(type) {
    await load();
    const status = currentStatus(state.person.id);
    if (status.state === 'off') throw userError('Clock in before starting a break.');
    if (status.state === 'break') throw userError('A break is already running.');
    const config = cfg().breaks.find(b => b.id === type);
    if (breaksTaken(state.person.id, today()).has(type)) {
      throw userError(`${config ? config.label : 'That break'} has already been taken today.`);
    }
    const breaks = [...(status.session.breaks || []), { type, paid: Boolean(config && config.paid), startAt: Date.now(), endAt: null }];
    await updateSession(status.session, { breaks }, 'break-start');
    say(`${config ? config.label : 'Break'} started.`);
  }

  async function endBreak() {
    await load();
    const status = currentStatus(state.person.id);
    if (status.state !== 'break') throw userError('No break is running.');
    const now = Date.now();
    const breaks = status.session.breaks.map(b => (b.endAt == null ? { ...b, endAt: now } : b));
    await updateSession(status.session, { breaks }, 'break-end');
    say('Break ended.');
  }

  async function saveSummary(date, text) {
    const a = requireDb();
    await a.setDoc(a.doc(a.db, C.summaries, `${state.person.id}_${date}`), {
      personId: state.person.id, date, text: String(text || '').slice(0, 4000), updatedAt: Date.now()
    });
    say('Work summary saved.');
  }

  // ---------- rendering ----------

  function clockLine(person) {
    const now = Date.now();
    const nz = `${core().formatTime(now, reportingZone())} NZ`;
    const local = personZone(person) === reportingZone()
      ? null
      : `${core().formatTime(now, personZone(person))} ${person && person.role === 'employee' ? 'Calgary' : 'local'}`;
    return h('span', { class: 'ts-clocks', 'data-live': 'clocks' }, local ? `${local} · ${nz}` : nz);
  }

  function header(title) {
    return h('div', { class: 'ts-header' },
      h('div', null,
        h('h2', { class: 'ts-title', text: title }),
        state.person ? h('p', { class: 'ts-sub' },
          `${state.person.name} · ${state.person.role === 'gm' ? 'GM' : 'Employee'} · `, clockLine(state.person)) : null),
      state.person ? h('button', { type: 'button', class: 'ts-btn', onclick: lock, text: 'Lock' }) : null);
  }

  function messageBar() {
    if (!state.message) return null;
    return h('p', { class: `ts-message ts-${state.message.kind}`, role: 'status', text: state.message.text });
  }

  function pinReveal(name, pin) {
    return h('div', { class: 'ts-pin-reveal', role: 'status' },
      h('strong', { text: `PIN for ${name}: ` }),
      h('span', { class: 'ts-pin', text: pin }),
      h('p', { class: 'ts-hint', text: 'Shown once. Give it to them now; you can reset it later.' }));
  }

  function renderSetup() {
    const name = h('input', { class: 'ts-input', type: 'text', placeholder: 'Your name', maxLength: 60 });
    const box = h('div', { class: 'ts-card' },
      h('h3', { text: 'Set up Timesheet' }),
      h('p', { class: 'ts-hint', text: 'No one has a Timesheet PIN yet. Create the first GM PIN; GMs can then add employees and other GMs.' }),
      h('label', { class: 'ts-field' }, 'GM name', name),
      h('button', {
        type: 'button', class: 'ts-btn primary', text: 'Create GM PIN',
        onclick: () => act(async () => {
          const pin = await createPerson(name.value, 'gm', reportingZone());
          state.reveal = { name: name.value.trim(), pin };
          say('GM created. Use the PIN below to unlock.');
        })
      }));
    return box;
  }

  function renderUnlock() {
    const pin = h('input', {
      class: 'ts-input ts-pin-input', type: 'password', inputMode: 'numeric', autocomplete: 'off',
      maxLength: 6, placeholder: '••••••', 'aria-label': 'Timesheet PIN'
    });
    const submit = () => act(() => unlock(pin.value));
    pin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(() => pin.focus(), 0);
    return h('div', { class: 'ts-card ts-unlock' },
      h('h3', { text: 'Enter your PIN' }),
      h('p', { class: 'ts-hint', text: 'Your 6-digit Timesheet PIN identifies you.' }),
      pin,
      h('button', { type: 'button', class: 'ts-btn primary', text: 'Unlock', onclick: submit }));
  }

  function totalsGrid(t) {
    const cell = (label, ms, strong) => h('div', { class: `ts-stat${strong ? ' strong' : ''}` },
      h('span', { class: 'ts-stat-label', text: label }),
      h('span', { class: 'ts-stat-value', text: core().formatDuration(ms) }));
    return h('div', { class: 'ts-stats' },
      cell('On clock', t.onClock), cell('Active work', t.active), cell('Paid breaks', t.paidBreak),
      cell('Unpaid breaks', t.unpaidBreak), cell('Payable', t.payable, true));
  }

  function flagText(flag) {
    if (flag === 'open') return 'In progress';
    if (flag === 'open-long') return 'Possible missed clock-out';
    if (flag.startsWith('break-over:')) {
      const config = cfg().breaks.find(b => b.id === flag.split(':')[1]);
      return `${config ? config.label : 'Break'} over allowance`;
    }
    return flag;
  }

  function weekNav() {
    const move = n => () => { state.weekStart = core().addDays(state.weekStart, 7 * n); render(); };
    return h('div', { class: 'ts-weeknav' },
      h('button', { type: 'button', class: 'ts-btn', onclick: move(-1), 'aria-label': 'Previous week', text: '‹' }),
      h('span', { class: 'ts-week-label', text: `${core().formatDate(state.weekStart)} – ${core().formatDate(core().addDays(state.weekStart, 6))} (NZ)` }),
      h('button', { type: 'button', class: 'ts-btn', onclick: move(1), 'aria-label': 'Next week', text: '›' }),
      h('button', { type: 'button', class: 'ts-btn', text: 'This week', onclick: () => { state.weekStart = core().weekStart(today()); render(); } }));
  }

  function weekTable(person, week) {
    const zone = reportingZone();
    const rows = week.days.map(day => {
      const spans = day.sessions.map(s =>
        `${core().formatTime(s.startAt, zone)}–${s.endAt == null ? 'now' : core().formatTime(s.endAt, zone)}`).join(', ');
      return h('tr', { class: day.date === today() ? 'is-today' : null },
        h('td', null, h('strong', { text: day.weekday.slice(0, 3) }), ` ${day.date.slice(8)}/${day.date.slice(5, 7)}`),
        h('td', { text: spans || '—' }),
        h('td', { class: 'num', text: core().formatDuration(day.onClock) }),
        h('td', { class: 'num', text: core().formatDuration(day.active) }),
        h('td', { class: 'num', text: core().formatDuration(day.paidBreak) }),
        h('td', { class: 'num', text: core().formatDuration(day.unpaidBreak) }),
        h('td', { class: 'num strong', text: core().formatDuration(day.payable) }),
        h('td', null,
          approvedOn(person.id, day.date).map(r => h('span', { class: 'ts-flag ok', text: r.type })),
          day.flags.map(f => h('span', { class: `ts-flag ${f.startsWith('open') ? 'warn' : 'alert'}`, text: flagText(f) }))));
    });
    const t = week.totals;
    return h('div', { class: 'ts-table-wrap' },
      h('table', { class: 'ts-table' },
        h('thead', null, h('tr', null,
          ['Day (NZ)', 'Sessions (NZ time)', 'On clock', 'Active', 'Paid brk', 'Unpaid brk', 'Payable', 'Notes']
            .map(label => h('th', { text: label })))),
        h('tbody', null, rows),
        h('tfoot', null, h('tr', null,
          h('td', { text: 'Week total' }), h('td'),
          h('td', { class: 'num', text: core().formatDuration(t.onClock) }),
          h('td', { class: 'num', text: core().formatDuration(t.active) }),
          h('td', { class: 'num', text: core().formatDuration(t.paidBreak) }),
          h('td', { class: 'num', text: core().formatDuration(t.unpaidBreak) }),
          h('td', { class: 'num strong', text: `${core().formatDuration(t.payable)} (${core().formatHours(t.payable)} h)` }),
          h('td')))));
  }

  function renderMyRequests(person) {
    const type = h('select', { class: 'ts-input', 'aria-label': 'Request type' }, REQUEST_TYPES.map(t => h('option', { value: t, text: t })));
    const from = h('input', { class: 'ts-input', type: 'date', value: today(), 'aria-label': 'From (NZ date)' });
    const to = h('input', { class: 'ts-input', type: 'date', value: today(), 'aria-label': 'To (NZ date)' });
    from.addEventListener('change', () => { if (!to.value || to.value < from.value) to.value = from.value; });
    const note = h('textarea', { class: 'ts-input', rows: 3, maxLength: 1000, placeholder: 'Reason or details (optional)' });
    const mine = state.requests.filter(r => r.personId === person.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return [
      h('div', { class: 'ts-card ts-request-form' },
        h('h3', { text: 'New request' }),
        h('div', { class: 'ts-request-fields' },
          h('label', { class: 'ts-field' }, 'Type', type),
          h('label', { class: 'ts-field' }, 'From (NZ date)', from),
          h('label', { class: 'ts-field' }, 'To (NZ date)', to)),
        h('label', { class: 'ts-field' }, 'Note', note),
        h('div', { class: 'ts-actions ts-settings-actions' },
          h('button', { type: 'button', class: 'ts-btn primary', text: 'Send request', onclick: () => act(() => submitRequest(type.value, from.value, to.value, note.value)) }))),
      h('div', { class: 'ts-card' },
        h('h3', { text: 'My requests' }),
        mine.length
          ? mine.map(r => requestCard(r, {
            buttons: r.status === 'pending'
              ? h('button', { type: 'button', class: 'ts-btn', text: 'Cancel request', onclick: () => act(() => reviewRequest(r, 'cancelled')) })
              : null
          }))
          : h('p', { class: 'ts-hint', text: 'No requests yet.' }))
    ];
  }

  function renderGmRequests() {
    const sorted = [...state.requests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const pending = sorted.filter(r => r.status === 'pending');
    const done = sorted.filter(r => r.status !== 'pending').slice(0, 50);
    return [
      h('div', { class: 'ts-card' },
        h('h3', { text: `Waiting for review (${pending.length})` }),
        pending.length
          ? pending.map(r => {
            const reply = h('input', { class: 'ts-input', type: 'text', maxLength: 1000, placeholder: 'Note to employee (optional)', 'aria-label': 'Note to employee' });
            return requestCard(r, {
              showName: true,
              buttons: h('div', { class: 'ts-review' }, reply,
                h('div', { class: 'ts-actions' },
                  h('button', { type: 'button', class: 'ts-btn danger', text: 'Decline', onclick: () => act(() => reviewRequest(r, 'declined', reply.value)) }),
                  h('button', { type: 'button', class: 'ts-btn primary', text: 'Approve', onclick: () => act(() => reviewRequest(r, 'approved', reply.value)) })))
            });
          })
          : h('p', { class: 'ts-hint', text: 'Nothing waiting.' })),
      h('div', { class: 'ts-card' },
        h('h3', { text: 'History' }),
        done.length ? done.map(r => requestCard(r, { showName: true })) : h('p', { class: 'ts-hint', text: 'No reviewed requests yet.' }))
    ];
  }

  // Daily work summaries written by the employee, for the week shown.
  function summariesList(person, week) {
    const rows = week.days.map(day => ({ day, text: summaryText(person.id, day.date) })).filter(r => r.text.trim());
    return h('div', { class: 'ts-summaries' },
      h('h4', { text: 'Work summaries' }),
      rows.length
        ? rows.map(({ day, text }) => h('div', { class: 'ts-summary' },
          h('strong', { text: core().formatDate(day.date) }),
          h('p', { text })))
        : h('p', { class: 'ts-hint', text: 'No work summaries written this week.' }));
  }

  function taskTotals(week) {
    const entries = Object.entries(week.tasks).filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    return h('div', { class: 'ts-tasks' },
      h('h4', { text: 'Active time by task' }),
      h('ul', null, entries.map(([task, ms]) => h('li', null, h('span', { text: task }), h('span', { class: 'num', text: core().formatDuration(ms) })))));
  }

  function renderEmployee() {
    const person = state.person;
    const mine = sessionsFor(person.id);
    const status = core().status(mine);
    const [todayRow] = core().summarize(mine, [today()], calcOptions());
    const tasks = cfg().tasks;

    const taskSelect = h('select', { class: 'ts-input', 'aria-label': 'Task' },
      h('option', { value: '', text: 'Select a task…' }),
      tasks.map(t => h('option', { value: t, text: t, selected: status.session && status.session.task === t })));
    if (status.session) taskSelect.addEventListener('change', () => act(() => changeTask(taskSelect.value || null)));

    const runningBreak = status.state === 'break'
      ? cfg().breaks.find(b => b.id === status.break.type) || { id: status.break.type, label: 'Break', minutes: 0 }
      : null;
    const stateText = status.state === 'off'
      ? 'Clocked out'
      : runningBreak ? `On ${runningBreak.label.toLowerCase()}` : 'Working';

    // Big live timer: the break while on one, otherwise the session.
    const timer = runningBreak
      ? h('div', { class: 'ts-timer is-break' },
        h('div', null,
          h('span', { class: 'ts-timer-value', 'data-live': 'elapsed', 'data-from': String(status.break.startAt), text: core().formatClock(Date.now() - status.break.startAt) }),
          h('span', { class: 'ts-timer-label', text: 'on break' })),
        h('div', null,
          h('span', {
            class: 'ts-timer-value', 'data-live': 'remaining', 'data-from': String(status.break.startAt),
            'data-allowed': String(runningBreak.minutes * core().MINUTE),
            text: core().formatClock(Math.abs(runningBreak.minutes * core().MINUTE - (Date.now() - status.break.startAt)))
          }),
          h('span', {
            class: 'ts-timer-label', 'data-live-label': 'remaining',
            text: Date.now() - status.break.startAt > runningBreak.minutes * core().MINUTE ? 'over the allowance' : 'left'
          })))
      : status.session
        ? h('div', { class: 'ts-timer' },
          h('div', null,
            h('span', { class: 'ts-timer-value', 'data-live': 'elapsed', 'data-from': String(status.session.startAt), text: core().formatClock(Date.now() - status.session.startAt) }),
            h('span', { class: 'ts-timer-label', text: 'since clock-in' })))
        : null;

    const clockCard = h('div', { class: `ts-card ts-status ts-state-${status.state}` },
      h('div', { class: 'ts-status-row' },
        h('div', null,
          h('span', { class: 'ts-state-label', text: stateText }),
          status.session ? h('p', { class: 'ts-hint' },
            `Clocked in ${core().formatTime(status.session.startAt, personZone(person))} your time (${core().formatTime(status.session.startAt, reportingZone())} NZ)`) : null),
        status.state === 'off'
          ? h('button', { type: 'button', class: 'ts-btn primary big', text: 'Clock in', disabled: state.busy, onclick: () => act(() => clockIn(taskSelect.value || null)) })
          : h('button', { type: 'button', class: 'ts-btn danger big', text: 'Clock out', disabled: state.busy, onclick: () => act(clockOut) })),
      timer,
      h('label', { class: 'ts-field' }, 'Task', taskSelect));

    const allowances = core().breakAllowances(todayRow, cfg().breaks);
    const taken = breaksTaken(person.id, today());
    const breakCard = h('div', { class: 'ts-card' },
      h('h3', { text: 'Breaks today' }),
      h('p', { class: 'ts-hint', text: 'Each break can be taken once per day. Going over the allowance is recorded on that day.' }),
      allowances.map(b => {
        const running = Boolean(runningBreak) && runningBreak.id === b.id;
        const used = taken.has(b.id);
        let detail;
        if (running) {
          detail = h('span', { 'data-live': 'break-row', 'data-from': String(status.break.startAt), 'data-allowed': String(b.allowedMs) },
            `Running · ${core().formatClock(Date.now() - status.break.startAt)}`);
        } else if (used) {
          detail = b.over
            ? `Taken · ${core().formatClock(b.usedMs)} · over by ${core().formatClock(b.usedMs - b.allowedMs)}`
            : `Taken · ${core().formatClock(b.usedMs)}`;
        } else {
          detail = 'Not taken yet';
        }
        return h('div', { class: `ts-break${b.over ? ' over' : ''}${running ? ' running' : ''}${used && !running ? ' taken' : ''}` },
          h('div', null,
            h('strong', { text: b.label }), ` · ${b.paid ? 'paid' : 'unpaid'} · ${Math.round(b.allowedMs / 60000)} min`,
            h('p', { class: 'ts-hint' }, detail)),
          running
            ? h('button', { type: 'button', class: 'ts-btn primary', text: 'End break', disabled: state.busy, onclick: () => act(endBreak) })
            : used
              ? h('button', { type: 'button', class: 'ts-btn', text: 'Taken', disabled: true })
              : h('button', {
                type: 'button', class: 'ts-btn', text: 'Start',
                disabled: state.busy || status.state !== 'working',
                onclick: () => act(() => startBreak(b.id))
              }));
      }));

    const summaryInput = h('textarea', { class: 'ts-input', rows: 4, maxLength: 4000, placeholder: 'Products uploaded, pages updated, flyers finished, meetings…' });
    const summaryCard = h('div', { class: 'ts-card' },
      h('h3', { text: `Work summary · ${core().formatDate(today())}` }),
      summaryInput,
      h('button', { type: 'button', class: 'ts-btn', text: 'Save summary', onclick: () => act(() => saveSummary(today(), summaryInput.value)) }));
    summaryInput.value = summaryText(person.id, today());

    const week = core().weekSummary(mine, state.weekStart || core().weekStart(today()), calcOptions());
    if (state.tab === 'requests') return renderMyRequests(person);
    if (state.tab === 'hours') {
      return [
        h('div', { class: 'ts-card' }, h('h3', { text: 'My hours' }), weekNav(), totalsGrid(week.totals), weekTable(person, week), taskTotals(week), summariesList(person, week))
      ];
    }
    return [
      h('div', { class: 'ts-grid' }, clockCard, h('div', { class: 'ts-card' },
        h('h3', { text: `Today · ${core().formatDate(today())} (NZ)` }),
        totalsGrid(todayRow),
        todayRow.flags.length ? h('div', { class: 'ts-day-notes' }, todayRow.flags.map(f => h('span', { class: `ts-flag ${f.startsWith('open') ? 'warn' : 'alert'}`, text: flagText(f) }))) : null)),
      h('div', { class: 'ts-grid' }, breakCard, summaryCard)
    ];
  }

  function csvFor(person, week) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const zone = reportingZone();
    const lines = [['Employee', 'NZ date', 'Weekday', 'Sessions (NZ)', 'On clock (h)', 'Active (h)', 'Paid breaks (h)', 'Unpaid breaks (h)', 'Payable (h)', 'Notes', 'Work summary'].map(q).join(',')];
    for (const day of week.days) {
      const spans = day.sessions.map(s => `${core().formatTime(s.startAt, zone)}-${s.endAt == null ? 'open' : core().formatTime(s.endAt, zone)}`).join(' ');
      lines.push([person.name, day.date, day.weekday, spans, core().formatHours(day.onClock), core().formatHours(day.active),
        core().formatHours(day.paidBreak), core().formatHours(day.unpaidBreak), core().formatHours(day.payable),
        approvedOn(person.id, day.date).map(r => r.type).concat(day.flags.map(flagText)).join('; '),
        summaryText(person.id, day.date)].map(q).join(','));
    }
    const t = week.totals;
    lines.push([person.name, `${week.start} to ${week.end}`, 'Week total', '', core().formatHours(t.onClock), core().formatHours(t.active),
      core().formatHours(t.paidBreak), core().formatHours(t.unpaidBreak), core().formatHours(t.payable), '', ''].map(q).join(','));
    return lines.join('\r\n');
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderGm() {
    const employees = state.people.filter(p => p.role === 'employee');
    if (!employees.find(p => p.id === state.viewPersonId)) state.viewPersonId = employees.length ? employees[0].id : null;

    if (state.tab === 'people') return [renderPeople()];
    if (state.tab === 'requests') return renderGmRequests();
    if (state.tab === 'settings') return [renderSettings()];

    if (state.tab === 'hours') {
      const viewing = employees.find(p => p.id === state.viewPersonId);
      if (!viewing) return [h('div', { class: 'ts-card' }, h('p', { class: 'ts-hint', text: 'No employees yet. Add one under People & PINs.' }))];
      const week = core().weekSummary(sessionsFor(viewing.id), state.weekStart || core().weekStart(today()), calcOptions());
      const picker = h('select', { class: 'ts-input ts-person-picker', 'aria-label': 'Employee' },
        employees.map(p => h('option', { value: p.id, text: p.name, selected: p.id === viewing.id })));
      picker.addEventListener('change', () => { state.viewPersonId = picker.value; render(); });
      return [h('div', { class: 'ts-card' },
        h('div', { class: 'ts-card-head' },
          h('h3', { text: `Timesheet · ${viewing.name}` }),
          h('div', { class: 'ts-actions' },
            employees.length > 1 ? picker : null,
            h('button', {
              type: 'button', class: 'ts-btn', text: 'Export CSV',
              onclick: () => download(`timesheet-${viewing.name.replace(/\W+/g, '-').toLowerCase()}-${week.start}.csv`, csvFor(viewing, week))
            }))),
        weekNav(), totalsGrid(week.totals), weekTable(viewing, week), taskTotals(week), summariesList(viewing, week))];
    }

    // Team status
    return [h('div', { class: 'ts-card' },
      h('h3', { text: 'Team status' }),
      employees.length
        ? h('div', { class: 'ts-team' }, employees.map(p => {
          const status = currentStatus(p.id);
          const [todayRow] = core().summarize(sessionsFor(p.id), [today()], calcOptions());
          const label = status.state === 'off' ? 'Clocked out' : status.state === 'break' ? 'On break' : 'Working';
          return h('button', {
            type: 'button', class: `ts-member ts-state-${status.state}`,
            title: 'Open this person\'s hours',
            onclick: () => { state.viewPersonId = p.id; state.tab = 'hours'; render(); }
          },
          h('strong', { text: p.name }),
          h('span', { class: 'ts-state-label', text: label }),
          approvedOn(p.id, today()).map(r => h('span', { class: 'ts-flag ok', text: `${r.type} today` })),
          status.session ? h('span', { class: 'ts-hint', text: `since ${core().formatTime(status.break ? status.break.startAt : status.session.startAt, reportingZone())} NZ` }) : null,
          status.session && status.session.task ? h('span', { class: 'ts-hint', text: status.session.task }) : null,
          h('span', { class: 'ts-hint', text: `Today ${core().formatDuration(todayRow.payable)} payable` }),
          todayRow.flags.filter(f => f !== 'open').map(f => h('span', { class: `ts-flag ${f.startsWith('open') ? 'warn' : 'alert'}`, text: flagText(f) })),
          summaryText(p.id, today()) ? h('span', { class: 'ts-hint ts-summary-snippet', text: `“${summaryText(p.id, today()).slice(0, 90)}${summaryText(p.id, today()).length > 90 ? '…' : ''}”` }) : null);
        }))
        : h('p', { class: 'ts-hint', text: 'No employees yet. Add one under People & PINs.' }))];
  }

  function renderSettings() {
    const c = cfg();
    const rows = c.breaks.map(b => {
      const label = h('input', { class: 'ts-input', type: 'text', value: b.label, maxLength: 40, 'data-field': 'label', 'aria-label': 'Break name' });
      const minutes = h('input', { class: 'ts-input', type: 'number', min: 0, max: 240, step: 1, value: String(b.minutes), 'data-field': 'minutes', 'aria-label': 'Minutes' });
      const paid = h('select', { class: 'ts-input', 'data-field': 'paid', 'aria-label': 'Paid or unpaid' },
        h('option', { value: 'true', text: 'Paid', selected: b.paid }),
        h('option', { value: 'false', text: 'Unpaid', selected: !b.paid }));
      return h('div', { class: 'ts-setting-break', 'data-break': b.id }, label, minutes, paid);
    });
    const tasks = h('textarea', { class: 'ts-input', rows: 10, 'aria-label': 'Tasks, one per line' });
    tasks.value = c.tasks.join('\n');
    const longHours = h('input', { class: 'ts-input', type: 'number', min: 1, max: 48, step: 1, value: String(c.longSessionHours), 'aria-label': 'Hours' });

    const save = () => act(async () => {
      const breaks = rows.map(row => {
        const field = name => row.querySelector(`[data-field="${name}"]`).value;
        const minutes = Math.round(Number(field('minutes')));
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240) throw userError('Break minutes must be between 0 and 240.');
        return { id: row.dataset.break, label: field('label').trim() || row.dataset.break, minutes, paid: field('paid') === 'true' };
      });
      const taskList = [...new Set(tasks.value.split('\n').map(t => t.trim()).filter(Boolean))].slice(0, 50);
      if (!taskList.length) throw userError('Add at least one task.');
      const hours = Math.round(Number(longHours.value));
      if (!(hours >= 1 && hours <= 48)) throw userError('Missed clock-out hours must be between 1 and 48.');
      const record = { breaks, tasks: taskList, longSessionHours: hours, updatedAt: Date.now(), updatedBy: state.person.id };
      const a = requireDb();
      await a.setDoc(a.doc(a.db, C.settings, 'main'), record);
      await audit('settings-saved', 'settings', 'main', { breaks, tasks: taskList, longSessionHours: hours });
      say('Settings saved.');
    });

    return h('div', { class: 'ts-card ts-settings' },
      h('h3', { text: 'Settings' }),
      h('p', { class: 'ts-hint', text: 'Changes apply to every timesheet, including past weeks (breaks over the allowance are re-checked). Confirm break rules against the employment agreement.' }),
      h('h4', { text: 'Breaks per day' }),
      h('div', { class: 'ts-setting-break ts-setting-head' }, h('span', { text: 'Name' }), h('span', { text: 'Minutes' }), h('span', { text: 'Pay' })),
      rows,
      h('h4', { text: 'Tasks' }),
      h('p', { class: 'ts-hint', text: 'One per line. Employees pick one when they clock in; it categorises time, it is not proof of output.' }),
      tasks,
      h('h4', { text: 'Missed clock-out' }),
      h('label', { class: 'ts-field' }, 'Flag a session still open after this many hours', longHours),
      h('div', { class: 'ts-actions ts-settings-actions' },
        h('button', { type: 'button', class: 'ts-btn', text: 'Reset to defaults', onclick: () => { state.settings = null; render(); say('Defaults loaded. Save to keep them.'); render(); } }),
        h('button', { type: 'button', class: 'ts-btn primary', text: 'Save settings', onclick: save })));
  }

  function renderPeople() {
    const list = h('div', { class: 'ts-people' }, state.people.map(p =>
      h('div', { class: 'ts-person' },
        h('div', null, h('strong', { text: p.name }), ` · ${p.role === 'gm' ? 'GM' : 'Employee'} · ${p.timeZone || ''}`),
        h('div', { class: 'ts-actions' },
          h('button', {
            type: 'button', class: 'ts-btn', text: 'Reset PIN',
            onclick: () => act(async () => { state.reveal = { name: p.name, pin: await resetPin(p) }; say(`New PIN created for ${p.name}.`); })
          }),
          p.id === state.person.id ? null : h('button', {
            type: 'button', class: 'ts-btn danger', text: 'Remove',
            onclick: () => act(async () => {
              const a = requireDb();
              await a.updateDoc(a.doc(a.db, C.people, p.id), { active: false });
              await audit('person-removed', 'person', p.id);
              say(`${p.name} removed. Their timesheet records are kept.`);
            })
          })))));

    const name = h('input', { class: 'ts-input', type: 'text', placeholder: 'Name', maxLength: 60 });
    const role = h('select', { class: 'ts-input' }, h('option', { value: 'employee', text: 'Employee' }), h('option', { value: 'gm', text: 'GM' }));
    const zone = h('select', { class: 'ts-input' },
      h('option', { value: 'America/Edmonton', text: 'Calgary (America/Edmonton)' }),
      h('option', { value: 'Pacific/Auckland', text: 'New Zealand (Pacific/Auckland)' }));
    role.addEventListener('change', () => { zone.value = role.value === 'gm' ? 'Pacific/Auckland' : 'America/Edmonton'; });

    return h('div', { class: 'ts-card ts-people-card' },
      state.reveal ? pinReveal(state.reveal.name, state.reveal.pin) : null,
      h('h3', { text: 'People & PINs' }),
      list,
      h('div', { class: 'ts-add' },
        name, role, zone,
        h('button', {
          type: 'button', class: 'ts-btn primary', text: 'Add & create PIN',
          onclick: () => act(async () => {
            state.reveal = { name: name.value.trim(), pin: await createPerson(name.value, role.value, zone.value) };
            say('Person added.');
          })
        })));
  }

  function tabs(list) {
    return h('div', { class: 'ts-tabs', role: 'tablist' }, list.map(([id, label]) => h('button', {
      type: 'button',
      role: 'tab',
      class: `ts-tab${state.tab === id ? ' active' : ''}`,
      'aria-selected': String(state.tab === id),
      'data-tab': id,
      onclick: () => { state.tab = id; state.reveal = null; say(null); render(); }
    }, label)));
  }

  function render() {
    if (!panel) return;
    const body = h('div', { class: 'ts-body' });
    let title = 'Timesheet';
    if (!core()) {
      body.append(h('p', { class: 'ts-message ts-error', text: 'Timesheet could not load (timesheet-core.js missing).' }));
    } else if (!state.loaded) {
      body.append(h('p', { class: 'ts-hint', text: 'Loading…' }));
    } else if (!state.people.length) {
      body.append(renderSetup());
    } else if (!state.person) {
      if (state.reveal) body.append(pinReveal(state.reveal.name, state.reveal.pin));
      body.append(renderUnlock());
    } else {
      if (!state.weekStart) state.weekStart = core().weekStart(today());
      title = state.person.role === 'gm' ? 'Timesheets' : 'My Timesheet';
      const list = state.person.role === 'gm'
        ? [['status', 'Team status'], ['hours', 'Hours'],
          ['requests', pendingRequests().length ? `Requests (${pendingRequests().length})` : 'Requests'],
          ['people', 'People & PINs'], ['settings', 'Settings']]
        : [['clock', 'Clock'], ['hours', 'My hours'], ['requests', 'Requests']];
      if (!list.some(([id]) => id === state.tab)) state.tab = list[0][0];
      body.append(tabs(list));
      body.append(...[].concat(state.person.role === 'gm' ? renderGm() : renderEmployee()).filter(Boolean));
    }
    panel.replaceChildren(header(title), messageBar() || '', body);
    panel.classList.toggle('is-busy', state.busy);
  }

  // Live clocks, elapsed time and break countdowns, without re-rendering.
  function tick() {
    if (!panel || !panel.isConnected) return;
    const now = Date.now();
    panel.querySelectorAll('[data-live="elapsed"]').forEach(el => {
      el.textContent = core().formatClock(now - Number(el.dataset.from));
    });
    panel.querySelectorAll('[data-live="remaining"]').forEach(el => {
      const left = Number(el.dataset.allowed) - (now - Number(el.dataset.from));
      el.textContent = core().formatClock(Math.abs(left));
      el.classList.toggle('over', left < 0);
      const label = el.parentElement && el.parentElement.querySelector('[data-live-label="remaining"]');
      if (label) label.textContent = left < 0 ? 'over the allowance' : 'left';
      el.closest('.ts-timer')?.classList.toggle('is-over', left < 0);
    });
    panel.querySelectorAll('[data-live="break-row"]').forEach(el => {
      const elapsed = now - Number(el.dataset.from);
      const over = elapsed - Number(el.dataset.allowed);
      el.textContent = over > 0
        ? `Running · ${core().formatClock(elapsed)} · over by ${core().formatClock(over)}`
        : `Running · ${core().formatClock(elapsed)} · ${core().formatClock(-over)} left`;
    });
    panel.querySelectorAll('[data-live="clocks"]').forEach(el => {
      el.replaceWith(clockLine(state.person));
    });
  }

  function ensurePanel() {
    panel = document.querySelector(`.${PANEL_CLASS}`);
    if (panel) return panel;
    const host = document.querySelector('.db-selected-panel-wrapper');
    if (!host) return null;
    panel = h('section', { class: PANEL_CLASS, 'data-panel': TOOL_ID, style: 'display: none' });
    panel.addEventListener('focusout', () => {
      setTimeout(() => { if (state.pendingRender && !typingInPanel()) scheduleRender(); }, 0);
    });
    host.appendChild(panel);
    return panel;
  }

  async function open() {
    if (!ensurePanel()) return;
    render();
    try {
      await load();
    } catch (error) {
      console.error('[timesheet] load failed:', error);
      say(error.message || 'Could not load timesheets.', 'error');
      state.loaded = true;
    }
    render();
    clearInterval(ticker);
    ticker = setInterval(tick, 1000);
    clearInterval(refresher);
    if (!subscribe()) {
      refresher = setInterval(() => {
        if (!state.busy) load().then(scheduleRender).catch(() => {});
      }, 30000);
    }
  }

  function close() {
    clearInterval(ticker);
    clearInterval(refresher);
    unsubscribe();
  }

  document.addEventListener('db-tool-open', event => {
    if (event.detail && event.detail.id === TOOL_ID) open();
    else close();
  });
  document.addEventListener('db-tool-close', close);

  // Create the (hidden) panel now so navigation can show it.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
  else ensurePanel();

  window.MTW_TIMESHEET = { open, lock, state };
})();
