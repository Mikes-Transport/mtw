'use strict';

(function () {
  if (window.MTW_DASHBOARD_SHELL_STARTED) return;
  window.MTW_DASHBOARD_SHELL_STARTED = true;

  const shellSelector = '.mtw-dashboard-shell';
  let attempts = 0;

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

    if (typeof window.MTW_ENSURE_DASHBOARD_MARKUP === 'function') {
      window.MTW_ENSURE_DASHBOARD_MARKUP();
    }
    const original = document.querySelector('.db-main-wrapper');
    const left = original?.querySelector('.db-left-content');
    const right = original?.querySelector('.db-right-content');
    const menu = left?.querySelector('.db-menu-list');

    if (!original || !left || !right || !menu || typeof window.openDBTool !== 'function') {
      attempts += 1;
      if (attempts < 60) {
        window.setTimeout(mount, 100);
      } else {
        console.error('[dashboard] could not build the dashboard shell: required dashboard markup or navigation is missing.');
      }
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

    // Keep existing left-side nodes available to legacy modules during migration.
    // Only the menu is moved to the new navigation bar.
    left.hidden = true;
    left.style.display = 'none';
    content.appendChild(left);
    original.replaceWith(shell);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
