// Sign-in guard for the dashboard. The /admin sign-in page sets
// sessionStorage.mtw_admin_logged_in = 'true' (and mtw_admin_name). sessionStorage
// survives refreshes in the same tab but is cleared when the tab or browser closes,
// so a closed-and-reopened dashboard is signed out.
//
// Signed out: the page is hidden (display: none) and replaced with /admin, before
// any dashboard code or data loads. Signed in: nothing happens.
(function (root) {
  'use strict';

  const LOGIN_URL = '/admin';
  const KEYS = ['mtw_admin_logged_in', 'mtw_admin_name'];

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

  root.MTW_SESSION_GUARD = { LOGIN_URL, isSignedIn, guard, signOut };
})(typeof self !== 'undefined' ? self : this);
