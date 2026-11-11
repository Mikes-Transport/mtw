// Sign-in guard for the dashboard. The /admin sign-in page sets
// sessionStorage.mtw_admin_logged_in = 'true' (and mtw_admin_name). sessionStorage
// survives refreshes in the same tab but is cleared when the tab or browser closes,
// so a closed-and-reopened dashboard is signed out.
//
// Signed out: the page is hidden (display: none) and replaced with /admin, before
// any dashboard code or data loads. Signed in: nothing happens.
//
// Share links: /dashboard?share=<token> opens one shareable tool without the sign-in.
// Managers create them in Manager Tools. Firestore keeps only a SHA-256 hash of the
// token (dashboard-share-links/<hash>: { tool, label, revoked, createdAt, ... }), so
// the link can't be rebuilt from the database. Revoked or unknown links go to /admin.
(function (root) {
  'use strict';

  const LOGIN_URL = '/admin';
  const KEYS = ['mtw_admin_logged_in', 'mtw_admin_name'];
  const SHARE_COLLECTION = 'dashboard-share-links';
  // Tools that may be opened through a share link (their own PIN still applies).
  const SHAREABLE_TOOLS = { timesheet: 'Timesheet' };

  function isSignedIn(storage) {
    try {
      return Boolean(storage) && storage.getItem('mtw_admin_logged_in') === 'true';
    } catch (error) {
      return false; // storage blocked: treat as signed out
    }
  }

  function guard(win, redirect) {
    if (isSignedIn(win.sessionStorage)) return true;
    win.document.documentElement.style.setProperty('display', 'none', 'important');
    (redirect || (url => win.location.replace(url)))(LOGIN_URL);
    return false;
  }

  function signOut(win, redirect) {
    try {
      KEYS.forEach(key => win.sessionStorage.removeItem(key));
      win.sessionStorage.removeItem('mtw_timesheet_person');
    } catch (error) { /* nothing to clear */ }
    (redirect || (url => win.location.replace(url)))(LOGIN_URL);
  }

  function hide(win) {
    win.document.documentElement.style.setProperty('display', 'none', 'important');
  }

  function show(win) {
    win.document.documentElement.style.removeProperty('display');
  }

  function shareToken(location) {
    try {
      const token = new URLSearchParams(location.search).get('share');
      return token && /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : null;
    } catch (error) {
      return null;
    }
  }

  function cryptoApi() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error('Web Crypto is unavailable.');
    return c;
  }

  async function hashToken(token) {
    const digest = await cryptoApi().subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  function newToken() {
    const bytes = new Uint8Array(24);
    cryptoApi().getRandomValues(bytes);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Resolves to { id, tool, label } for a valid, unrevoked link to a shareable tool.
  async function validateShare(token, api) {
    if (!token || !api || !api.db || typeof api.getDoc !== 'function' || typeof api.doc !== 'function') return null;
    try {
      const id = await hashToken(token);
      const snap = await api.getDoc(api.doc(api.db, SHARE_COLLECTION, id));
      if (!snap || !snap.exists()) return null;
      const link = snap.data() || {};
      if (link.revoked === true || !SHAREABLE_TOOLS[link.tool]) return null;
      if (typeof api.updateDoc === 'function') {
        api.updateDoc(api.doc(api.db, SHARE_COLLECTION, id), { lastUsedAt: Date.now() }).catch(() => {});
      }
      return { id, tool: link.tool, label: String(link.label || SHAREABLE_TOOLS[link.tool]) };
    } catch (error) {
      return null;
    }
  }

  root.MTW_SESSION_GUARD = {
    LOGIN_URL, SHARE_COLLECTION, SHAREABLE_TOOLS,
    isSignedIn, guard, signOut, hide, show,
    shareToken, hashToken, newToken, validateShare
  };
})(typeof self !== 'undefined' ? self : this);
