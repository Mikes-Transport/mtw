// Timesheet maths: no DOM, no Firebase. Used by the browser tool (as
// window.MTW_TIMESHEET_CORE) and by the Node tests (require()).
//
// Every timestamp is a UTC instant in milliseconds. Dates are 'YYYY-MM-DD' strings
// in the reporting time zone (New Zealand). Reporting weeks run Wednesday 00:00 to
// Tuesday 23:59:59 NZ time. Time zones are IANA names, so daylight saving is handled
// by the platform, never by fixed offsets.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTW_TIMESHEET_CORE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEDNESDAY = 3;
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const DEFAULTS = Object.freeze({
    reportingTimeZone: 'Pacific/Auckland',
    employeeTimeZone: 'America/Edmonton',
    // Proposed defaults from the spec; confirm against the employment agreement.
    breaks: [
      { id: 'rest1', label: 'First rest break', minutes: 15, paid: true },
      { id: 'meal', label: 'Meal break', minutes: 30, paid: false },
      { id: 'rest2', label: 'Second rest break', minutes: 15, paid: true }
    ],
    tasks: [
      'Website maintenance and product uploads',
      'Product descriptions and data',
      'Flyers and graphic design',
      'Product photography and editing',
      'Technical drawings/manuals',
      'Pricing and promotions',
      'Social media and content',
      'Events',
      'Other marketing/admin',
      'Meetings'
    ],
    // An open session longer than this is flagged as a possible missed clock-out.
    longSessionHours: 14
  });

  const formatters = new Map();
  function formatter(timeZone) {
    if (!formatters.has(timeZone)) {
      formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }));
    }
    return formatters.get(timeZone);
  }

  // Wall-clock parts of an instant in a time zone.
  function zonedParts(ms, timeZone) {
    const parts = {};
    for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
      if (p.type !== 'literal') parts[p.type] = Number(p.value);
    }
    return parts;
  }

  // Offset of the zone from UTC at that instant (ms, positive east of UTC).
  function offsetAt(ms, timeZone) {
    const p = zonedParts(ms, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  const pad = n => String(n).padStart(2, '0');

  function dateKey(ms, timeZone) {
    const p = zonedParts(ms, timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }

  function parseDate(date) {
    const [y, m, d] = String(date).split('-').map(Number);
    return { y, m, d };
  }

  // Pure calendar arithmetic on 'YYYY-MM-DD'.
  function addDays(date, n) {
    const { y, m, d } = parseDate(date);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }

  function weekdayOf(date) {
    const { y, m, d } = parseDate(date);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  // UTC instant of 00:00 on a calendar date in a zone (DST-safe: refine twice).
  function startOfDay(date, timeZone) {
    const { y, m, d } = parseDate(date);
    const wall = Date.UTC(y, m - 1, d);
    let guess = wall - offsetAt(wall, timeZone);
    guess = wall - offsetAt(guess, timeZone);
    return wall - offsetAt(guess, timeZone);
  }

  // Wednesday on or before the date.
  function weekStart(date) {
    return addDays(date, -((weekdayOf(date) - WEDNESDAY + 7) % 7));
  }

  function weekDates(start) {
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  // Split [start, end) into pieces that each fall on one calendar day in the zone.
  function splitByDay(start, end, timeZone) {
    const pieces = [];
    let cursor = start;
    while (cursor < end) {
      const date = dateKey(cursor, timeZone);
      const next = startOfDay(addDays(date, 1), timeZone);
      const pieceEnd = Math.min(end, next);
      pieces.push({ date, start: cursor, end: pieceEnd });
      cursor = pieceEnd;
    }
    return pieces;
  }

  function toMillis(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }

  function emptyTotals() {
    return { onClock: 0, paidBreak: 0, unpaidBreak: 0, active: 0, payable: 0 };
  }

  function finish(t) {
    t.active = Math.max(0, t.onClock - t.paidBreak - t.unpaidBreak);
    t.payable = t.active + t.paidBreak;
    return t;
  }

  // Per-day totals for the given dates. Sessions: { startAt, endAt|null, task,
  // breaks: [{ type, paid, startAt, endAt|null }] }. Open sessions and breaks run to `now`.
  function summarize(sessions, dates, options = {}) {
    const timeZone = options.timeZone || DEFAULTS.reportingTimeZone;
    const now = options.now == null ? Date.now() : options.now;
    const longMs = (options.longSessionHours || DEFAULTS.longSessionHours) * HOUR;
    const breakConfig = options.breaks || DEFAULTS.breaks;
    const days = new Map(dates.map(date => [date, {
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      ...emptyTotals(),
      sessions: [],
      tasks: {},
      breakUsage: {},
      flags: []
    }]));

    for (const session of sessions || []) {
      const start = toMillis(session.startAt);
      if (start == null) continue;
      const open = toMillis(session.endAt) == null;
      const end = open ? Math.max(start, now) : toMillis(session.endAt);

      for (const piece of splitByDay(start, end, timeZone)) {
        const day = days.get(piece.date);
        if (!day) continue;
        const span = piece.end - piece.start;
        day.onClock += span;
        const task = session.task || 'Unassigned';
        day.tasks[task] = (day.tasks[task] || 0) + span;
        if (!day.sessions.includes(session)) day.sessions.push(session);
        if (open && end - start > longMs && !day.flags.includes('open-long')) day.flags.push('open-long');
        else if (open && !day.flags.includes('open')) day.flags.push('open');
      }

      for (const b of session.breaks || []) {
        const bStart = Math.max(start, toMillis(b.startAt) ?? start);
        const bEndRaw = toMillis(b.endAt);
        const bEnd = Math.min(end, bEndRaw == null ? now : bEndRaw);
        if (bEnd <= bStart) continue;
        const config = breakConfig.find(c => c.id === b.type);
        const paid = typeof b.paid === 'boolean' ? b.paid : Boolean(config && config.paid);
        for (const piece of splitByDay(bStart, bEnd, timeZone)) {
          const day = days.get(piece.date);
          if (!day) continue;
          const span = piece.end - piece.start;
          if (paid) day.paidBreak += span; else day.unpaidBreak += span;
          const task = session.task || 'Unassigned';
          day.tasks[task] = Math.max(0, (day.tasks[task] || 0) - span);
          day.breakUsage[b.type] = (day.breakUsage[b.type] || 0) + span;
        }
      }
    }

    for (const day of days.values()) {
      finish(day);
      for (const config of breakConfig) {
        const used = day.breakUsage[config.id] || 0;
        if (used > config.minutes * MINUTE) day.flags.push(`break-over:${config.id}`);
      }
    }
    return [...days.values()];
  }

  function weekSummary(sessions, start, options = {}) {
    const days = summarize(sessions, weekDates(start), options);
    const totals = days.reduce((t, day) => {
      for (const k of Object.keys(emptyTotals())) t[k] += day[k];
      return t;
    }, emptyTotals());
    const tasks = {};
    for (const day of days) {
      for (const [task, ms] of Object.entries(day.tasks)) tasks[task] = (tasks[task] || 0) + ms;
    }
    return { start, end: addDays(start, 6), days, totals, tasks };
  }

  // Break allowance usage for one day: [{ id, label, paid, allowedMs, usedMs, remainingMs, over }].
  function breakAllowances(day, breakConfig = DEFAULTS.breaks) {
    return breakConfig.map(config => {
      const usedMs = (day && day.breakUsage && day.breakUsage[config.id]) || 0;
      const allowedMs = config.minutes * MINUTE;
      return {
        id: config.id,
        label: config.label,
        paid: config.paid,
        allowedMs,
        usedMs,
        remainingMs: Math.max(0, allowedMs - usedMs),
        over: usedMs > allowedMs
      };
    });
  }

  // Current state of a person from their sessions.
  function status(sessions) {
    const open = (sessions || []).find(s => toMillis(s.endAt) == null && toMillis(s.startAt) != null);
    if (!open) return { state: 'off', session: null, break: null };
    const activeBreak = (open.breaks || []).find(b => toMillis(b.endAt) == null);
    return { state: activeBreak ? 'break' : 'working', session: open, break: activeBreak || null };
  }

  function formatDuration(ms) {
    const minutes = Math.round(Math.max(0, ms) / MINUTE);
    return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
  }

  // Live timer text with seconds: 'm:ss' under an hour, 'h:mm:ss' after.
  function formatClock(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  }

  function formatHours(ms) {
    return (Math.max(0, ms) / HOUR).toFixed(2);
  }

  function formatTime(ms, timeZone) {
    if (ms == null) return '';
    const p = zonedParts(ms, timeZone);
    return `${pad(p.hour)}:${pad(p.minute)}`;
  }

  function formatDate(date) {
    const { y, m, d } = parseDate(date);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', {
      timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  // PINs: 6 random digits, stored only as a salted SHA-256 hash.
  function cryptoApi() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle || !c.getRandomValues) throw new Error('Web Crypto is unavailable.');
    return c;
  }

  function generatePin(length = 6) {
    const digits = new Uint32Array(length);
    cryptoApi().getRandomValues(digits);
    return Array.from(digits, n => String(n % 10)).join('');
  }

  function generateSalt() {
    const bytes = new Uint8Array(16);
    cryptoApi().getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPin(pin, salt) {
    const data = new TextEncoder().encode(`${salt}:${String(pin).trim()}`);
    const digest = await cryptoApi().subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  return {
    DEFAULTS, MINUTE, HOUR, DAY, WEEKDAYS,
    zonedParts, offsetAt, dateKey, addDays, weekdayOf, startOfDay, weekStart, weekDates,
    splitByDay, toMillis, summarize, weekSummary, breakAllowances, status,
    formatDuration, formatClock, formatHours, formatTime, formatDate,
    generatePin, generateSalt, hashPin
  };
});
