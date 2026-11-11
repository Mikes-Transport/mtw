'use strict';

(function () {
  if (window.MTW_DASHBOARD_SHELL_STARTED) return;
  window.MTW_DASHBOARD_SHELL_STARTED = true;

  const shellSelector = '.mtw-dashboard-shell';
  const STARTUP_TIMEOUT_MS = Number(window.MTW_DASHBOARD_STARTUP_TIMEOUT_MS) || 15000;
  const shellScript = document.currentScript;
  const NAVIGATION_URL = shellScript && shellScript.src
    ? new URL('./dashboard-navigation.js', shellScript.src).href
    : 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/js/navigation/dashboard-navigation.js';
  let built = false;
  let timeoutId = null;
  let navigationLoadError = null;

  // Either script can be the page's entry point. If Webflow only includes the shell,
  // load navigation (from the same base URL, so versions always match).
  function ensureNavigationLoaded() {
    if (window.MTW_DASHBOARD_NAVIGATION_STARTED) return;
    if (document.querySelector('script[data-mtw-dashboard-navigation], script[src*="dashboard-navigation.js"]')) return;
    const script = document.createElement('script');
    script.dataset.mtwDashboardNavigation = 'true';
    script.src = NAVIGATION_URL;
    script.onerror = function () {
      navigationLoadError = script.src;
      console.error('[dashboard] failed to load dashboard navigation:', script.src);
    };
    document.head.appendChild(script);
  }

  function missingRequirements() {
    const missing = [];
    const original = document.querySelector('.db-main-wrapper');
    if (!original) missing.push('.db-main-wrapper');
    if (!original?.querySelector('.db-left-content')) missing.push('.db-left-content');
    if (!original?.querySelector('.db-right-content')) missing.push('.db-right-content');
    if (!original?.querySelector('.db-left-content .db-menu-list')) missing.push('.db-menu-list');
    if (typeof window.openDBTool !== 'function') missing.push('window.openDBTool');
    if (typeof window.closeDBTool !== 'function') missing.push('window.closeDBTool');
    return missing;
  }

  function reportStartupFailure() {
    if (built || document.querySelector(shellSelector)) return;
    const missing = missingRequirements();
    let cause;
    if (navigationLoadError) {
      cause = 'dashboard-navigation.js could not be downloaded from ' + navigationLoadError + '.';
    } else if (!window.MTW_DASHBOARD_NAVIGATION_STARTED) {
      cause = 'dashboard-navigation.js never ran. Check the page for an earlier script error or a 404.';
    } else if (!window.MTW_DASHBOARD_NAVIGATION_READY) {
      cause = 'dashboard-navigation.js started but did not finish initialising. Check for an earlier error.';
    } else {
      cause = 'navigation finished, but the shell requirements are still missing.';
    }
    console.error('[dashboard] could not build the dashboard shell: ' + cause +
      ' Missing: ' + (missing.join(', ') || 'none') +
      '. See docs/dashboard-troubleshooting.md.');
  }

  function tryMount() {
    if (built) return;
    mount();
    if (document.querySelector(shellSelector)) {
      built = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener('mtw-dashboard-navigation-ready', tryMount);
      document.dispatchEvent(new CustomEvent('mtw-dashboard-shell-ready'));
    }
  }

  function start() {
    ensureNavigationLoaded();
    document.addEventListener('mtw-dashboard-navigation-ready', tryMount);
    timeoutId = window.setTimeout(reportStartupFailure, STARTUP_TIMEOUT_MS);
    tryMount();
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function mount() {
    const mountedShell = document.querySelector(shellSelector);
    if (mountedShell) {
      mountedShell.querySelectorAll('[data-select="custom-web-element"]').forEach(card => card.remove());
      return;
    }

    // Navigation owns the markup and tool registry; wait for its ready signal.
    if (!window.MTW_DASHBOARD_NAVIGATION_READY) return;

    if (typeof window.MTW_ENSURE_DASHBOARD_MARKUP === 'function') {
      window.MTW_ENSURE_DASHBOARD_MARKUP();
    }
    const original = document.querySelector('.db-main-wrapper');
    const left = original?.querySelector('.db-left-content');
    const right = original?.querySelector('.db-right-content');
    const menu = left?.querySelector('.db-menu-list');

    if (missingRequirements().length) {
      reportStartupFailure();
      return;
    }

    const shell = element('section', 'db-main-wrapper mtw-dashboard-shell');
    shell.setAttribute('aria-label', 'MTW dashboard');

    const header = element('header', 'mtw-shell-header');
    const brand = element('div', 'mtw-shell-brand');
    const mark = element('span', 'mtw-shell-mark', 'M');
    mark.setAttribute('aria-hidden', 'true');

    const brandText = element('div', 'mtw-shell-brand-text');
    brandText.append(
      element('h1', 'mtw-shell-title', 'MTW Dashboard'),
      element('p', 'mtw-shell-subtitle', 'Operations workspace')
    );
    brand.append(mark, brandText);

    const role = sessionStorage.getItem('mtw_admin_name');
    const account = element('div', 'mtw-shell-account');
    account.append(
      element('span', 'mtw-shell-account-label', 'Signed in as'),
      element('strong', 'mtw-shell-account-role', role || 'Dashboard user')
    );
    const signOut = element('button', 'mtw-shell-signout', 'Sign out');
    signOut.type = 'button';
    signOut.addEventListener('click', () => {
      if (window.MTW_SESSION_GUARD) {
        window.MTW_SESSION_GUARD.signOut(window);
      } else {
        sessionStorage.removeItem('mtw_admin_logged_in');
        sessionStorage.removeItem('mtw_admin_name');
        sessionStorage.removeItem('mtw_timesheet_person');
        window.location.replace('/admin');
      }
    });
    account.append(signOut);
    header.append(brand, account);

    const navigation = element('nav', 'mtw-shell-navigation');
    navigation.setAttribute('aria-label', 'Dashboard tools');

    const home = element('button', 'mtw-home-tab', 'Overview');
    home.type = 'button';
    home.setAttribute('aria-current', 'page');
    home.addEventListener('click', () => window.closeDBTool());
    menu.prepend(home);
    navigation.append(menu);

    const registry = window.MTW_TOOL_REGISTRY || {};
    menu.querySelectorAll(':scope > .db-list-toolcard').forEach(card => {
      if (!registry[card.dataset.select]) card.remove();
    });
    const removeRetiredElementsTool = () => {
      menu.querySelectorAll('[data-select="custom-web-element"]').forEach(card => card.remove());
    };
    removeRetiredElementsTool();
    document.addEventListener('db-tools-ready', removeRetiredElementsTool);

    document.addEventListener('db-tool-open', () => {
      home.removeAttribute('aria-current');
    });
    document.addEventListener('db-tool-close', () => {
      home.setAttribute('aria-current', 'page');
    });

    const content = element('main', 'mtw-shell-content');
    content.appendChild(right);
    shell.append(header, navigation, content);

    // The old sidebar is kept for tools that edit in it: promotion-cards.js adds
    // .editing and its edit panel here. CSS hides it until then and shows it as a
    // drawer while editing. The menu itself moves to the navigation bar.
    left.removeAttribute('hidden');
    left.style.removeProperty('display');
    left.classList.add('mtw-shell-editor');
    content.appendChild(left);
    // Keep any other Webflow children (panels, overlays, modals) instead of dropping
    // them with the old wrapper. Moving keeps the element references tool scripts hold.
    [...original.children].forEach(child => content.appendChild(child));
    original.replaceWith(shell);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
