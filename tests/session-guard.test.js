'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGuard() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', 'js', 'access', 'session-guard.js'), 'utf8'), { self: context });
  return context.MTW_SESSION_GUARD;
}

function fakeWindow(items) {
  const store = new Map(Object.entries(items || {}));
  const style = new Map();
  return {
    sessionStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      removeItem: k => store.delete(k)
    },
    document: { documentElement: { style: { setProperty: (k, v, p) => style.set(k, `${v}${p ? ' !' + p : ''}`) } } },
    store, style
  };
}

test('signed in this session: the dashboard loads, nothing is hidden', () => {
  const guard = loadGuard();
  const win = fakeWindow({ mtw_admin_logged_in: 'true', mtw_admin_name: 'Managers' });
  const redirects = [];
  assert.equal(guard.guard(win, url => redirects.push(url)), true);
  assert.deepEqual(redirects, []);
  assert.equal(win.style.size, 0);
});

test('not signed in (e.g. tab closed and reopened): hidden and sent to /admin', () => {
  const guard = loadGuard();
  for (const items of [{}, { mtw_admin_logged_in: 'false' }, { mtw_admin_name: 'Managers' }]) {
    const win = fakeWindow(items);
    const redirects = [];
    assert.equal(guard.guard(win, url => redirects.push(url)), false);
    assert.deepEqual(redirects, ['/admin']);
    assert.equal(win.style.get('display'), 'none !important');
  }
});

test('blocked storage counts as signed out', () => {
  const guard = loadGuard();
  const win = fakeWindow();
  win.sessionStorage.getItem = () => { throw new Error('SecurityError'); };
  const redirects = [];
  assert.equal(guard.guard(win, url => redirects.push(url)), false);
  assert.deepEqual(redirects, ['/admin']);
});

test('sign out clears the session and goes to /admin', () => {
  const guard = loadGuard();
  const win = fakeWindow({ mtw_admin_logged_in: 'true', mtw_admin_name: 'Managers', mtw_timesheet_person: 'x' });
  const redirects = [];
  guard.signOut(win, url => redirects.push(url));
  assert.equal(win.store.size, 0);
  assert.deepEqual(redirects, ['/admin']);
});

test('the loader checks the sign-in before loading anything else', () => {
  const loader = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', 'js', 'dashboard.js'), 'utf8');
  const body = loader.slice(loader.indexOf('async function start()'));
  const guardAt = body.indexOf("session-guard.js");
  assert.ok(guardAt > 0, 'guard imported');
  for (const later of ['stylesheet(', 'firebase.js', 'loadTemplates()', 'dashboard-navigation.js']) {
    assert.ok(body.indexOf(later) > guardAt, `${later} comes after the sign-in check`);
  }
  assert.match(body, /if \(!window\.MTW_SESSION_GUARD\.guard\(window\)\) return;/);
});
