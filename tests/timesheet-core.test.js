'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../apps/timesheet/js/timesheet-core.js');

const NZ = 'Pacific/Auckland';
const CALGARY = 'America/Edmonton';
const H = core.HOUR;
const M = core.MINUTE;

// UTC instant of a wall-clock time in a zone.
function at(date, time, zone) {
  const [h, m] = time.split(':').map(Number);
  return core.startOfDay(date, zone) + h * H + m * M;
}

test('reporting weeks run Wednesday to Tuesday', () => {
  assert.equal(core.weekStart('2026-11-11'), '2026-11-11'); // Wednesday
  assert.equal(core.weekStart('2026-11-17'), '2026-11-11'); // Tuesday
  assert.equal(core.weekStart('2026-11-18'), '2026-11-18'); // next Wednesday
  assert.deepEqual(core.weekDates('2026-11-11').map(d => core.WEEKDAYS[core.weekdayOf(d)]),
    ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday']);
});

test('a Tuesday shift in Calgary lands on Wednesday in NZ (next reporting week)', () => {
  // 2026-11-17 is a Tuesday. 16:00 in Calgary (Alberta Time, UTC-6) = 11:00 Wednesday NZ (NZDT, UTC+13).
  const start = at('2026-11-17', '16:00', CALGARY);
  assert.equal(core.dateKey(start, CALGARY), '2026-11-17');
  assert.equal(core.dateKey(start, NZ), '2026-11-18');
  assert.equal(core.weekStart(core.dateKey(start, NZ)), '2026-11-18');
  assert.equal(core.formatTime(start, NZ), '11:00 am');
});

test('Calgary uses IANA rules: Alberta stopped changing clocks in November 2026', () => {
  // Alberta moved to permanent "Alberta Time" (UTC-6) from 1 November 2026; before that it
  // switched between MST (UTC-7) and MDT (UTC-6). A fixed offset would be wrong either way.
  assert.equal(core.offsetAt(Date.UTC(2025, 11, 15, 12), CALGARY) / H, -7);
  assert.equal(core.offsetAt(Date.UTC(2026, 6, 15, 12), CALGARY) / H, -6);
  assert.equal(core.offsetAt(Date.UTC(2026, 11, 15, 12), CALGARY) / H, -6);
});

test('midnight in NZ is computed correctly across daylight-saving changes', () => {
  // NZ daylight saving ends 2026-04-05 03:00 (back to UTC+12) and starts 2026-09-27 02:00.
  assert.equal(core.startOfDay('2026-04-05', NZ), Date.UTC(2026, 3, 4, 11)); // still UTC+13 at midnight
  assert.equal(core.startOfDay('2026-04-06', NZ), Date.UTC(2026, 3, 5, 12)); // UTC+12
  assert.equal(core.startOfDay('2026-09-27', NZ), Date.UTC(2026, 8, 26, 12)); // UTC+12 at midnight
  assert.equal(core.startOfDay('2026-09-28', NZ), Date.UTC(2026, 8, 27, 11)); // UTC+13
  // The 2026-09-27 NZ day is only 23 hours long, 2026-04-05 is 25.
  assert.equal(core.startOfDay('2026-09-28', NZ) - core.startOfDay('2026-09-27', NZ), 23 * H);
  assert.equal(core.startOfDay('2026-04-06', NZ) - core.startOfDay('2026-04-05', NZ), 25 * H);
});

test('a 10-hour shift with all three breaks: 9h active, 9h30 payable (spec example)', () => {
  const start = at('2026-11-11', '08:00', NZ);
  const session = {
    startAt: start,
    endAt: start + 10 * H,
    task: 'Flyers and graphic design',
    breaks: [
      { type: 'rest1', startAt: start + 2 * H, endAt: start + 2 * H + 15 * M },
      { type: 'meal', startAt: start + 4 * H, endAt: start + 4 * H + 30 * M },
      { type: 'rest2', startAt: start + 7 * H, endAt: start + 7 * H + 15 * M }
    ]
  };
  const [day] = core.summarize([session], ['2026-11-11']);
  assert.equal(day.onClock, 10 * H);
  assert.equal(day.paidBreak, 30 * M);
  assert.equal(day.unpaidBreak, 30 * M);
  assert.equal(day.active, 9 * H);
  assert.equal(day.payable, 9 * H + 30 * M);
  assert.equal(day.tasks['Flyers and graphic design'], 9 * H);
  assert.deepEqual(day.flags, []);
  assert.ok(core.breakAllowances(day).every(b => b.remainingMs === 0 && !b.over));
});

test('five 10-hour shifts with a 30-minute unpaid meal give the spec week totals', () => {
  const start = '2026-11-11';
  const sessions = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17'].map(date => {
    const s = at(date, '08:00', NZ);
    return { startAt: s, endAt: s + 10 * H, breaks: [{ type: 'meal', startAt: s + 4 * H, endAt: s + 4 * H + 30 * M }] };
  });
  const week = core.weekSummary(sessions, start);
  assert.equal(week.totals.onClock, 50 * H);
  assert.equal(week.totals.active, 47.5 * H);
  assert.equal(week.totals.payable, 47.5 * H);
  assert.equal(week.days[3].onClock, 0); // Saturday
  assert.equal(week.end, '2026-11-17');
});

test('a session across NZ midnight is split between the two days and weeks', () => {
  const start = at('2026-11-17', '22:00', NZ); // Tuesday 22:00, last day of the week
  const session = { startAt: start, endAt: start + 4 * H, breaks: [] };
  const days = core.summarize([session], ['2026-11-17', '2026-11-18']);
  assert.equal(days[0].onClock, 2 * H);
  assert.equal(days[1].onClock, 2 * H);
  assert.equal(core.weekSummary([session], '2026-11-11').totals.onClock, 2 * H);
  assert.equal(core.weekSummary([session], '2026-11-18').totals.onClock, 2 * H);
});

test('open sessions run to now, overlong breaks are flagged, not truncated', () => {
  const start = at('2026-11-11', '08:00', NZ);
  const now = start + 3 * H;
  const session = { startAt: start, endAt: null, breaks: [{ type: 'rest1', startAt: start + H, endAt: start + H + 25 * M }] };
  const [day] = core.summarize([session], ['2026-11-11'], { now });
  assert.equal(day.onClock, 3 * H);
  assert.equal(day.paidBreak, 25 * M);
  assert.ok(day.flags.includes('open'));
  assert.ok(day.flags.includes('break-over:rest1'));
  const rest1 = core.breakAllowances(day).find(b => b.id === 'rest1');
  assert.equal(rest1.usedMs, 25 * M);
  assert.equal(rest1.over, true);

  const [late] = core.summarize([session], ['2026-11-11', '2026-11-12'], { now: start + 15 * H });
  assert.ok(late.flags.includes('open-long'), 'possible missed clock-out');
});

test('status reports working, on break or off', () => {
  const s = { startAt: 1, endAt: null, breaks: [] };
  assert.equal(core.status([]).state, 'off');
  assert.equal(core.status([s]).state, 'working');
  assert.equal(core.status([{ ...s, breaks: [{ type: 'meal', startAt: 2, endAt: null }] }]).state, 'break');
  assert.equal(core.status([{ ...s, endAt: 5 }]).state, 'off');
});

test('PINs are 6 digits and stored as salted hashes', async () => {
  const pin = core.generatePin();
  assert.match(pin, /^\d{6}$/);
  const salt = core.generateSalt();
  const hash = await core.hashPin(pin, salt);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(await core.hashPin(` ${pin} `, salt), hash);
  assert.notEqual(await core.hashPin(pin, core.generateSalt()), hash);
});

test('formatting', () => {
  assert.equal(core.formatDuration(9 * H + 30 * M), '9:30');
  assert.equal(core.formatHours(9 * H + 30 * M), '9.50');
  assert.equal(core.formatDate('2026-11-11'), 'Wed, 11 Nov 2026');
  assert.equal(core.formatTime(Date.UTC(2026, 10, 11, 4, 5), NZ), '5:05 pm');
  assert.equal(core.formatTime(Date.UTC(2026, 10, 10, 11, 0), NZ), '12:00 am');
  assert.equal(core.formatTime(Date.UTC(2026, 10, 10, 23, 30), NZ), '12:30 pm');
});

test('filed by the employee\'s work date: a Calgary Monday shift is Monday, not NZ Tuesday', () => {
  // Monday 9 Nov 2026, 07:30-17:00 in Calgary (UTC-6) = Tuesday 02:30-12:00 in NZ.
  const start = at('2026-11-09', '07:30', CALGARY);
  const session = { startAt: start, endAt: start + 9.5 * H, breaks: [{ type: 'meal', startAt: start + 4 * H, endAt: start + 4.5 * H }] };
  assert.equal(core.dateKey(start, NZ), '2026-11-10');
  const [monday, tuesday] = core.summarize([session], ['2026-11-09', '2026-11-10'], { timeZone: CALGARY });
  assert.equal(monday.weekday, 'Monday');
  assert.equal(monday.onClock, 9.5 * H);
  assert.equal(monday.payable, 9 * H);
  assert.equal(tuesday.onClock, 0);
  // Weeks still run Wednesday to Tuesday, in Calgary dates: Wed-Fri land in the week of 11 Nov.
  const week = core.weekSummary(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map(date => {
    const s = at(date, '07:30', CALGARY);
    return { startAt: s, endAt: s + 9.5 * H, breaks: [] };
  }), '2026-11-11', { timeZone: CALGARY });
  assert.deepEqual(week.days.filter(d => d.onClock > 0).map(d => d.weekday), ['Wednesday', 'Thursday', 'Friday']);
});
