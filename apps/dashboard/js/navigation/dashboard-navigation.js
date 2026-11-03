'use strict';

const { $, $$ } = window.MTW;

(function () {
  const navigationScript = document.currentScript;
  const DASHBOARD_THEME_URL = navigationScript && navigationScript.src
    ? new URL('../../styles/admin-dashboard.css', navigationScript.src).href
    : 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/styles/admin-dashboard.css';
  const DEVELOPER_TOOLS_URL = navigationScript && navigationScript.src
    ? new URL('../access/developer-tools.js', navigationScript.src).href
    : 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/js/access/developer-tools.js';

  const TOOLS = {
    'activity-logs': { panel: '.activity-logs-panel', name: 'Activity Logs', roles: ['Developer'] },
    'secondhand-tool': { panel: '.second-hand-panel', name: 'Secondhand Stock', roles: ['Counter', 'Admin'] },
    'product-info': { panel: '.product-tool-panel', name: 'Product Information', roles: ['Admin'] },
    'csv-config': { panel: '.csv-tool-panel', name: 'CSV Config', roles: ['Developer'] },
    'mte-config': { panel: '.master-list-config', name: 'MTE Config', roles: ['Developer'] },
    'promotion-label': { panel: '.et-body-wrapper', name: 'Promotional Labels', roles: ['Counter', 'Admin'] },
    'barcodes': { panel: '.barcode-label-panels', name: 'Barcode Labels', roles: ['Counter', 'Stores', 'KeyAccounts', 'Admin'] },
    'model-tool-access': { panel: '.model-access-panel', name: 'Assign Model Tool Access', roles: ['Developer'] },
    'developer-tools': { panel: '.developer-tools-panel', name: 'Developer Tools', roles: ['Developer'] }
  };

  const ROLE_NAMES = ['Counter', 'Stores', 'KeyAccounts', 'Admin', 'Developer'];
  let toolSettings = {};

  function hideAll() {

    Object.values(TOOLS).forEach(tool => {

      const el = $(tool.panel);

      if (el) {
        el.style.display = 'none';
      }
    });
  }

  function openDBTool(id) {

    const tool = TOOLS[id];

    if (!tool) return;

    $$('.db-list-toolcard').forEach(card => {
      const active = card.dataset.select === id;
      card.classList.toggle('is-active', active);
      if (active) {
        card.setAttribute('aria-current', 'page');
      } else {
        card.removeAttribute('aria-current');
      }
    });

    hideAll();

    const wrapper = $('.db-tool-wrapper');
    const heading = $('.tool-wrapper-h2');
    const breadcrumb =
      $('.db-heading-list[data-type="breadcrumb"]');

    const panel = $(tool.panel);

    if (wrapper) {
      wrapper.style.display = 'block';
    }

    if (panel) {
      panel.style.display = 'block';
    }

    if (heading) {
      heading.textContent =
        tool.name;
    }

    if (breadcrumb) {
      breadcrumb.textContent =
        tool.name;
    }

    document.dispatchEvent(
      new CustomEvent('db-tool-open', {
        detail: {
          id
        }
      })
    );
  }

  function closeDBTool() {

    $$('.db-list-toolcard').forEach(card => {
      card.classList.remove('is-active');
      card.removeAttribute('aria-current');
    });

    const wrapper =
      $('.db-tool-wrapper');

    if (wrapper) {
      wrapper.style.display = 'none';
    }

    hideAll();

    document.dispatchEvent(
      new CustomEvent('db-tool-close')
    );
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
  }

  function validRoles(value) {
    return Array.isArray(value)
      ? [...new Set(value.filter(role => ROLE_NAMES.includes(role)))]
      : [];
  }

  function updateCardName(card, name) {
    const heading = card.querySelector('.db-heading-list');
    if (heading) heading.textContent = name;
    else card.textContent = name;
  }

  function setDeveloperIcon(card) {
    const icon = card.querySelector('.db-list-icon');
    if (!icon) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const paths = [
      'M4 7h9',
      'M17 7h3',
      'M4 17h3',
      'M11 17h9',
      'M13 4v6',
      'M7 14v6',
      'M8 7a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0',
      'M7 17a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0'
    ];
    paths.forEach(d => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });

    icon.replaceChildren(svg);
    card.setAttribute('aria-label', 'Developer Tools');
  }

  function canShowTool(id, tool) {
    const user = sessionStorage.getItem('mtw_admin_name');
    if (id === 'developer-tools') return user === 'Developer';
    if (tool.custom) {
      return user === 'Developer' || tool.roles.includes(user);
    }
    return true;
  }

  function createCustomCard(id, name) {
    const list = $('.db-menu-list');
    const panels = $('.db-selected-panel-wrapper');
    const firstCard = $('.db-list-toolcard');
    if (!list || !panels || !firstCard) return;

    let card = $(`.db-list-toolcard[data-select="${id}"]`);
    if (!card) {
      card = firstCard.cloneNode(true);
      card.removeAttribute('id');
      card.dataset.select = id;
      card.style.display = '';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.classList.remove('is-active');
      card.removeAttribute('aria-current');
      card.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
      const dropdownToggle = card.querySelector('.db-list-dropdown-toggle');
      if (dropdownToggle) dropdownToggle.remove();
      list.appendChild(card);
    }

    updateCardName(card, name);
    if (id === 'developer-tools') setDeveloperIcon(card);
    card.onclick = () => openDBTool(id);
    card.style.display = canShowTool(id, TOOLS[id]) ? '' : 'none';
    card.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDBTool(id);
      }
    };

    const panelClass = id === 'developer-tools'
      ? 'developer-tools-panel'
      : `custom-dashboard-tool-${id}-panel`;
    let panel = $(`.${panelClass}`);
    if (!panel) {
      panel = document.createElement('section');
      panel.className = panelClass;
      panel.style.display = 'none';
      panels.appendChild(panel);
    }
    panel.replaceChildren();
    const description = String(toolSettings[id]?.description || '');
    if (description) {
      const note = document.createElement('p');
      note.textContent = description;
      panel.appendChild(note);
    }
    const help = document.createElement('p');
    help.textContent = 'This navigation item is ready to be connected to a tool by a developer.';
    panel.appendChild(help);
  }

  function applyToolSettings(snapshot) {
    toolSettings = snapshot && typeof snapshot === 'object' ? snapshot : {};
    window.MTW_TOOL_SETTINGS = toolSettings;

    Object.entries(TOOLS).forEach(([id, tool]) => {
      const settings = toolSettings[id] || {};
      if (typeof settings.name === 'string' && settings.name.trim()) {
        tool.name = settings.name.trim().slice(0, 80);
      }
      if (Array.isArray(settings.roles)) tool.roles = validRoles(settings.roles);
      if (typeof settings.enabled === 'boolean') tool.enabled = settings.enabled;

      const card = $(`.db-list-toolcard[data-select="${id}"]`);
      if (card) {
        updateCardName(card, tool.name);
        card.style.display = tool.enabled === false || !canShowTool(id, tool) ? 'none' : '';
      }
    });

    Object.entries(toolSettings).forEach(([id, settings]) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !settings || settings.custom !== true) return;
      TOOLS[id] = {
        panel: `.custom-dashboard-tool-${id}-panel`,
        name: String(settings.name || id).slice(0, 80),
        roles: validRoles(settings.roles),
        enabled: settings.enabled !== false,
        custom: true
      };
      createCustomCard(id, TOOLS[id].name);
      const card = $(`.db-list-toolcard[data-select="${id}"]`);
      if (card) {
        card.style.display = TOOLS[id].enabled && canShowTool(id, TOOLS[id]) ? '' : 'none';
      }
    });

    window.MTW_TOOL_SETTINGS = toolSettings;
    document.dispatchEvent(new CustomEvent('db-tools-ready', {
      detail: { settings: toolSettings }
    }));
  }

  async function loadToolSettings() {
    const api = window.MTW || {};
    if (!api.db || typeof api.getDocs !== 'function' || typeof api.collection !== 'function') {
      throw new Error('Dashboard database is unavailable.');
    }
    const snapshot = await api.getDocs(api.collection(api.db, 'dashboard-tools'));
    const settings = {};
    snapshot.forEach(item => {
      settings[item.id] = item.data() || {};
    });
    applyToolSettings(settings);
  }

  function loadDashboardTheme() {
    if (document.querySelector('link[data-mtw-dashboard-theme]')) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.dataset.mtwDashboardTheme = 'true';
    stylesheet.href = DASHBOARD_THEME_URL;
    stylesheet.onerror = function () {
      console.error('[dashboard] failed to load dashboard styles:', stylesheet.href);
    };
    document.head.appendChild(stylesheet);
  }

  function init() {

    loadDashboardTheme();
    const search = $('.db-menu-search');
    if (search) search.remove();
    hideAll();

    const wrapper =
      $('.db-tool-wrapper');

    if (wrapper) {
      wrapper.style.display = 'none';
    }

    $$('.db-list-toolcard')
      .forEach(card => {

        const id =
          card.dataset.select;

        if (
          !id ||
          !TOOLS[id]
        ) {
          return;
        }

        card.style.cursor =
          'pointer';

        card.onclick = () => {
          openDBTool(id);
        };
      });

    $$('#exit-btn')
      .forEach(button => {

        button.onclick =
          closeDBTool;
      });

    window.MTW_TOOL_REGISTRY = TOOLS;
    window.MTW_APPLY_TOOL_SETTINGS = applyToolSettings;
    createCustomCard('developer-tools', 'Developer Tools');
    loadToolSettings().catch(error => {
      console.error('[dashboard] could not load tool settings:', error);
      applyToolSettings({});
      document.dispatchEvent(new CustomEvent('db-tools-load-error', {
        detail: { message: 'Could not load saved tool settings. Built-in tools are still available.' }
      }));
    });

    if (!document.querySelector('script[data-mtw-developer-tools]')) {
      const manager = document.createElement('script');
      manager.dataset.mtwDeveloperTools = 'true';
      manager.src = DEVELOPER_TOOLS_URL;
      manager.onerror = function () {
        console.error('[dashboard] failed to load developer tools:', manager.src);
      };
      document.head.appendChild(manager);
    }
  }

  window.openDBTool =
    openDBTool;

  window.closeDBTool =
    closeDBTool;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
