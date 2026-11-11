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

  // null when there is no ?share= at all; '' when it is there but not a valid token.
  function shareToken(location) {
    try {
      const params = new URLSearchParams(location.search);
      if (!params.has('share')) return null;
      const token = params.get('share').trim();
      return /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : '';
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

  // Resolves to { share: { id, tool, label } } for a valid, unrevoked link to a
  // shareable tool, otherwise { reason } (shown on the page so a bad link is explained).
  async function checkShare(token, api) {
    if (!token) return { reason: 'This link is incomplete. Copy the whole link again from Manager Tools.' };
    if (!api || !api.db || typeof api.getDoc !== 'function' || typeof api.doc !== 'function') {
      return { reason: 'The dashboard database did not load. Check the connection and try again.' };
    }
    let id;
    let snap;
    try {
      id = await hashToken(token);
      snap = await api.getDoc(api.doc(api.db, SHARE_COLLECTION, id));
    } catch (error) {
      return { reason: `Could not check this link (${(error && (error.code || error.message)) || 'unknown error'}).` };
    }
    if (!snap || !snap.exists()) return { reason: 'This link was not found. Ask a manager for a new link.' };
    const link = snap.data() || {};
    if (link.revoked === true) return { reason: 'This link has been revoked. Ask a manager for a new link.' };
    if (!SHAREABLE_TOOLS[link.tool]) return { reason: 'This link is for a tool that cannot be shared.' };
    if (typeof api.updateDoc === 'function') {
      Promise.resolve()
        .then(() => api.updateDoc(api.doc(api.db, SHARE_COLLECTION, id), { lastUsedAt: Date.now() }))
        .catch(() => {});
    }
    return { share: { id, tool: link.tool, label: String(link.label || SHAREABLE_TOOLS[link.tool]) } };
  }

  async function validateShare(token, api) {
    return (await checkShare(token, api)).share || null;
  }

  // Replaces the page with a short explanation (used for a bad share link).
  function showMessage(win, title, text) {
    const doc = win.document;
    const box = doc.createElement('div');
    box.setAttribute('style', 'max-width:420px;margin:15vh auto;padding:28px;font-family:Inter,Arial,sans-serif;' +
      'color:#242424;background:#fff;border:1px solid #e2e1de;border-radius:10px;text-align:center;line-height:1.5');
    const heading = doc.createElement('h1');
    heading.setAttribute('style', 'font-size:20px;margin:0 0 10px');
    heading.textContent = title;
    const body = doc.createElement('p');
    body.setAttribute('style', 'margin:0 0 18px;color:#555');
    body.textContent = text;
    const link = doc.createElement('a');
    link.href = LOGIN_URL;
    link.textContent = 'Go to the dashboard sign-in';
    link.setAttribute('style', 'color:#242424;font-weight:600');
    box.append(heading, body, link);
    doc.body.replaceChildren(box);
    doc.body.setAttribute('style', 'margin:0;background:#f5f4f2');
    show(win);
  }

  root.MTW_SESSION_GUARD = {
    LOGIN_URL, SHARE_COLLECTION, SHAREABLE_TOOLS,
    isSignedIn, guard, signOut, hide, show,
    shareToken, hashToken, newToken, checkShare, validateShare, showMessage
  };
})(typeof self !== 'undefined' ? self : this);
