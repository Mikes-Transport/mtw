'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGuard() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', 'js', 'access', 'session-guard.js'), 'utf8'), {
    self: context, crypto: globalThis.crypto, TextEncoder, URLSearchParams, btoa
  });
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
  for (const later of ['stylesheet(', 'firebase.js', 'loadTemplates(', 'dashboard-navigation.js']) {
    assert.ok(body.indexOf(later) > guardAt, `${later} comes after the sign-in check`);
  }
  assert.match(body, /else if \(!guard\.guard\(window\)\) \{\s*return;/);
  // An invalid share link is sent to /admin before any styles, templates or tools load.
  const invalidAt = body.indexOf('if (!share) {');
  assert.ok(invalidAt > guardAt && invalidAt < body.indexOf('stylesheet('));
});

function fakeDb(docs) {
  const updates = [];
  return {
    updates,
    api: {
      db: {},
      doc: (db, collection, id) => ({ collection, id }),
      getDoc: async ref => {
        const data = ref.collection === 'dashboard-share-links' ? docs[ref.id] : undefined;
        return { exists: () => Boolean(data), data: () => data };
      },
      updateDoc: async (ref, patch) => { updates.push({ id: ref.id, patch }); }
    }
  };
}

test('share tokens: random, URL-safe, and only their hash identifies the link', async () => {
  const guard = loadGuard();
  const a = guard.newToken();
  const b = guard.newToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{30,}$/);
  const hash = await guard.hashToken(a);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, a);
  assert.equal(guard.shareToken({ search: `?share=${a}` }), a);
  assert.equal(guard.shareToken({ search: '' }), null);
  assert.equal(guard.shareToken({ search: '?share=short' }), null);
  assert.equal(guard.shareToken({ search: '?share=<script>alert(1)</script>xxxxxxxxxxxxxxx' }), null);
});

test('share links: valid opens the tool; revoked, unknown tool or missing do not', async () => {
  const guard = loadGuard();
  const good = guard.newToken();
  const revoked = guard.newToken();
  const other = guard.newToken();
  const missing = guard.newToken();
  const { api, updates } = fakeDb({
    [await guard.hashToken(good)]: { tool: 'timesheet', label: 'Workshop tablet', revoked: false },
    [await guard.hashToken(revoked)]: { tool: 'timesheet', label: 'Old tablet', revoked: true },
    [await guard.hashToken(other)]: { tool: 'developer-tools', label: 'Nope', revoked: false }
  });
  const share = await guard.validateShare(good, api);
  assert.equal(share.tool, 'timesheet');
  assert.equal(share.label, 'Workshop tablet');
  assert.equal(share.id, await guard.hashToken(good));
  assert.equal(updates.length, 1);
  assert.equal(typeof updates[0].patch.lastUsedAt, 'number');
  assert.equal(await guard.validateShare(revoked, api), null);
  assert.equal(await guard.validateShare(other, api), null);
  assert.equal(await guard.validateShare(missing, api), null);
  assert.equal(await guard.validateShare(good, null), null);
});
