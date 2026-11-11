'use strict';

(function () {
  // Webflow hosts the script, but the dashboard is constructed from this repository.
  // Ignore duplicate script includes so navigation and event handlers mount only once.
  if (window.MTW_DASHBOARD_NAVIGATION_STARTED) return;
  window.MTW_DASHBOARD_NAVIGATION_STARTED = true;

  const $ = window.MTW && typeof window.MTW.$ === 'function'
    ? window.MTW.$
    : selector => document.querySelector(selector);
  const $$ = window.MTW && typeof window.MTW.$$ === 'function'
    ? window.MTW.$$
    : selector => [...document.querySelectorAll(selector)];
  const navigationScript = document.currentScript;
  // apps/dashboard/ — set by js/dashboard.js, or derived from this script's own URL.
  const BASE_URL = window.MTW_DASHBOARD_BASE_URL ||
    (navigationScript && navigationScript.src
      ? new URL('../../', navigationScript.src).href
      : 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/');
  const DASHBOARD_THEME_URL = new URL('styles/admin-dashboard.css', BASE_URL).href;
  const DEVELOPER_TOOLS_URL = new URL('js/access/developer-tools.js', BASE_URL).href;
  const DASHBOARD_SHELL_URL = new URL('js/navigation/dashboard-shell.js', BASE_URL).href;

  // Bump on each release so the live page can be checked for the version it runs.
  const NAVIGATION_BUILD = '2026-11-11.14';

  const TOOLS = {
    'activity-logs': { panel: '.activity-logs-panel', name: 'Activity Logs', roles: ['Managers'] },
    'secondhand-tool': { panel: '.second-hand-panel', name: 'Secondhand Stock', roles: ['Counter'] },
    'product-info': { panel: '.product-tool-panel', name: 'Product Information', roles: ['Managers'] },
    'csv-config': { panel: '.csv-tool-panel', name: 'CSV Config', roles: ['Managers'] },
    'mte-config': { panel: '.master-list-config', name: 'MTE Config', roles: ['Managers'] },
    'promotion-label': { panel: '.et-body-wrapper', name: 'Promotional Labels', roles: ['Counter'] },
    'barcodes': { panel: '.barcode-label-panels', name: 'Barcode Labels', roles: ['Counter', 'Stores', 'KeyAccounts'] },
    'model-tool-access': { panel: '.model-access-panel', name: 'Assign Model Tool Access', roles: ['Managers'] },
    'timesheet': { panel: '.timesheet-panel', name: 'Timesheet', roles: ['Managers'] },
    'developer-tools': { panel: '.developer-tools-panel', name: 'Manager Tools', roles: ['Managers'] }
  };

  // Panel markup lives in apps/dashboard/templates/<tool>.html. js/dashboard.js fetches
  // it into window.MTW_DASHBOARD_TEMPLATES before this script runs, so every panel
  // exists before the tool scripts look for their elements.
  function installTemplates(right, panels) {
    const templates = window.MTW_DASHBOARD_TEMPLATES;
    if (!templates) return;
    Object.entries(templates).forEach(([id, html]) => {
      const selector = id === 'change-logs' ? '.change-logs' : TOOLS[id] && TOOLS[id].panel;
      if (!selector || document.querySelector(selector)) return;
      const holder = document.createElement('template');
      holder.innerHTML = String(html).split('{{BASE}}').join(BASE_URL);
      const fragment = holder.content;
      // Webflow forms submitted the page on Enter; tools save through their own buttons.
      fragment.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', event => event.preventDefault());
      });
      if (id === 'change-logs') right.prepend(fragment);
      else panels.appendChild(fragment);
    });
  }

  function setCardVisible(card, visible) {
    const target = card.closest('.db-list-dropdown-wrapper') || card;
    target.style.display = visible ? '' : 'none';
    if (target !== card) card.style.display = visible ? '' : 'none';
  }

  // Create the layout and navigation when no Webflow Designer markup exists.
  // Existing Webflow sections are reused rather than overwritten during migration.
  function ensureDashboardMarkup() {
    let root = document.querySelector('.db-main-wrapper');
    if (!root) {
      root = document.createElement('section');
      root.className = 'db-main-wrapper';
      root.dataset.mtwDashboardGenerated = 'true';
      const mountPoint = document.querySelector('[data-mtw-dashboard-mount]') ||
        document.getElementById('mtw-dashboard-root') || document.body;
      mountPoint.appendChild(root);
    }

    let left = root.querySelector('.db-left-content');
    if (!left) {
      left = document.createElement('div');
      left.className = 'db-left-content';
      root.prepend(left);
    }

    let right = root.querySelector('.db-right-content');
    if (!right) {
      right = document.createElement('div');
      right.className = 'db-right-content';
      root.appendChild(right);
    }

    // Webflow pages put .change-logs and .db-tool-wrapper directly in <body>, outside
    // the dashboard. When the repository templates are loaded they own the panels, so
    // the Webflow copies are removed; otherwise they are adopted into the dashboard.
    const templates = window.MTW_DASHBOARD_TEMPLATES;
    const outside = selector => [...document.querySelectorAll(selector)].filter(el => !root.contains(el));
    outside('.db-tool-wrapper').concat(outside('.change-logs')).forEach(el => {
      if (templates) {
        console.info('[dashboard] removed Webflow ' + el.className.split(' ')[0] +
          ' markup; the repository templates replace it.');
        el.remove();
      } else if (el.matches('.change-logs')) {
        right.prepend(el);
      } else {
        right.appendChild(el);
      }
    });

    let menu = root.querySelector('.db-menu-list');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'db-menu-list';
      left.appendChild(menu);
    } else if (!left.contains(menu)) {
      left.appendChild(menu);
    }

    // Reuse Webflow's tool wrapper wherever it sits in the dashboard (it may be a
    // direct child of .db-main-wrapper). Move it, never recreate it: tool scripts
    // hold references to the panels inside it.
    let wrapper = root.querySelector('.db-tool-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('section');
      wrapper.className = 'db-tool-wrapper';
      right.appendChild(wrapper);
    } else if (!right.contains(wrapper)) {
      right.appendChild(wrapper);
    }
    if (!wrapper.querySelector('.tool-wrapper-h2')) {
      const heading = document.createElement('h2');
      heading.className = 'tool-wrapper-h2';
      heading.textContent = 'Dashboard Tool';
      wrapper.prepend(heading);
    }
    if (!wrapper.querySelector('.db-heading-list[data-type="breadcrumb"]')) {
      const breadcrumb = document.createElement('div');
      breadcrumb.className = 'db-tool-breadcrumb';
      const label = document.createElement('span');
      label.className = 'db-heading-list';
      label.dataset.type = 'breadcrumb';
      label.textContent = 'Dashboard Tool';
      breadcrumb.appendChild(label);
      wrapper.appendChild(breadcrumb);
    }
    if (!wrapper.querySelector('#exit-btn')) {
      const exit = document.createElement('button');
      exit.id = 'exit-btn';
      exit.type = 'button';
      exit.textContent = '×';
      exit.setAttribute('aria-label', 'Close dashboard tool');
      wrapper.appendChild(exit);
    }
    let panels = root.querySelector('.db-selected-panel-wrapper');
    if (!panels) {
      panels = document.createElement('div');
      panels.className = 'db-selected-panel-wrapper';
      wrapper.appendChild(panels);
    } else if (!wrapper.contains(panels)) {
      wrapper.appendChild(panels);
    }

    installTemplates(right, panels);

    // Generate navigation cards from the code registry; no Designer cards needed.
    Object.entries(TOOLS).forEach(([id, tool]) => {
      if (menu.querySelector(`.db-list-toolcard[data-select="${id}"]`)) return;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'db-list-toolcard dark';
      card.dataset.select = id;
      const label = document.createElement('span');
      label.className = 'db-heading-list';
      label.textContent = tool.name;
      card.append(label);
      setToolIcon(card, id);
      if (id === 'barcodes') {
        // barcodes.js looks for #barcode-drop inside .db-list-dropdown-wrapper and adds
        // the x2/x8/x10/x30 label-sheet choices to it.
        card.id = 'barcode-drop';
        const dropdown = document.createElement('div');
        dropdown.className = 'db-list-dropdown-wrapper';
        dropdown.appendChild(card);
        menu.appendChild(dropdown);
      } else {
        menu.appendChild(card);
      }
    });

    // Standalone overview: visible until a tool is selected.
    if (!right.querySelector('.mtw-dashboard-overview') &&
        !right.querySelector('.change-logs')) {
      const overview = document.createElement('section');
      overview.className = 'mtw-dashboard-overview';
      const title = document.createElement('h2');
      title.textContent = 'Operations workspace';
      const description = document.createElement('p');
      description.textContent = 'Choose a tool from the navigation to get started.';
      overview.append(title, description);
      right.prepend(overview);
      document.addEventListener('db-tool-open', () => { overview.hidden = true; });
      document.addEventListener('db-tool-close', () => { overview.hidden = false; });
    }

    return root;
  }

  window.MTW_ENSURE_DASHBOARD_MARKUP = ensureDashboardMarkup;

  // Roles set by the /admin sign-in page (sessionStorage.mtw_admin_name). Managers see
  // every tool. 'Manager' is accepted as Managers; 'Developer' (the old name) in saved
  // tool settings becomes Managers; the Admin role was removed.
  const ROLE_NAMES = ['Counter', 'Stores', 'KeyAccounts', 'Managers'];
  const MANAGER = 'Managers';
  const normalizeRole = role => {
    const value = String(role || '').trim();
    return value === 'Manager' || value === 'Developer' ? MANAGER : value;
  };
  const isManager = role => normalizeRole(role) === MANAGER;
  let toolSettings = {};
  let activeToolId = null;

  function hideAll() {

    Object.values(TOOLS).forEach(tool => {

      const el = $(tool.panel);

      if (el) {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  function openDBTool(id) {

    const tool = TOOLS[id];

    if (!tool || tool.enabled === false || !canShowTool(id, tool)) return;
    activeToolId = id;

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
    let missingPanel = $('.mtw-dashboard-missing-tool');
    if (!panel && wrapper) {
      if (!missingPanel) {
        missingPanel = document.createElement('p');
        missingPanel.className = 'mtw-dashboard-missing-tool';
        const target = $('.db-selected-panel-wrapper') || wrapper;
        target.appendChild(missingPanel);
      }
      missingPanel.textContent = tool.name +
        ' has no repository-built interface yet. Its existing Webflow panel must be migrated.';
      console.warn('[dashboard] ' + tool.name + ': no element matches ' + tool.panel +
        ' on this page. Run MTW_DASHBOARD_DIAGNOSE() in the console for details.');
      missingPanel.style.display = 'block';
    } else if (missingPanel) {
      missingPanel.style.display = 'none';
    }

    if (wrapper) {
      wrapper.style.display = 'block';
    }

    if (panel) {
      panel.style.setProperty('display', 'block', 'important');
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

    if (panel) {
      panel.style.setProperty('display', 'block', 'important');
    }
  }

  // The tool's X button steps back one level first: a tool showing a sub-view
  // (e.g. Manager Tools editing one item) cancels 'db-tool-exit-request' and
  // handles the step itself. Only when nothing cancels does the tool close.
  function exitDBTool() {
    const request = new CustomEvent('db-tool-exit-request', {
      cancelable: true,
      detail: { id: activeToolId }
    });
    if (!document.dispatchEvent(request)) return;
    closeDBTool();
  }

  function closeDBTool() {
    activeToolId = null;

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
      ? [...new Set(value.map(normalizeRole).filter(role => ROLE_NAMES.includes(role)))]
      : [];
  }

  function updateCardName(card, name) {
    const heading = card.querySelector('.db-heading-list');
    if (heading) heading.textContent = name;
    else card.textContent = name;
  }

  // 24×24 stroke icons (drawn for this dashboard). Custom tools use 'default'.
  const TOOL_ICONS = {
    'activity-logs': ['M3 12h4l3-8 4 16 3-8h4'],
    'secondhand-tool': ['M3 7.5 12 3l9 4.5-9 4.5-9-4.5z', 'M3 7.5v9L12 21l9-4.5v-9', 'M12 12v9'],
    'product-info': ['M3 3h8l10 10-8 8L3 11z', 'M7.5 7.5h.01'],
    'csv-config': ['M3 4h18v16H3z', 'M3 9.5h18', 'M3 15h18', 'M9 4v16'],
    'mte-config': ['M12 3l9 5-9 5-9-5z', 'M3 12.5l9 5 9-5', 'M3 17l9 5 9-5'],
    'promotion-label': ['M19 5 5 19', 'M5 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0', 'M16 17.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0'],
    'barcodes': ['M4 5v14', 'M7 5v14', 'M10.5 5v14', 'M14 5v14', 'M16.5 5v14', 'M20 5v14'],
    'model-tool-access': ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
    'timesheet': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
    'developer-tools': ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M8 7a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0', 'M7 17a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0'],
    default: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z']
  };

  function setToolIcon(card, id) {
    let icon = card.querySelector('.db-list-icon');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'db-list-icon';
      card.prepend(icon);
    }
    icon.setAttribute('aria-hidden', 'true');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (TOOL_ICONS[id] || TOOL_ICONS.default).forEach(d => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    icon.replaceChildren(svg);
  }

  function canShowTool(id, tool) {
    const user = sessionStorage.getItem('mtw_admin_name');
    return isManager(user) || (Array.isArray(tool.roles) && tool.roles.includes(normalizeRole(user)));
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
    setToolIcon(card, id);
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
    help.textContent = 'This navigation item is not connected to a tool yet.';
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
        setCardVisible(card, tool.enabled !== false && canShowTool(id, tool));
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
        setCardVisible(card, TOOLS[id].enabled && canShowTool(id, TOOLS[id]));
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

    ensureDashboardMarkup();
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

        button.onclick = exitDBTool;
      });

    window.MTW_TOOL_REGISTRY = TOOLS;
    window.MTW_APPLY_TOOL_SETTINGS = applyToolSettings;
    applyToolSettings({});
    createCustomCard('developer-tools', 'Manager Tools');
    loadToolSettings().catch(error => {
      console.error('[dashboard] could not load tool settings:', error);
      applyToolSettings({});
      document.dispatchEvent(new CustomEvent('db-tools-load-error', {
        detail: { message: 'Could not load saved tool settings. Built-in tools are still available.' }
      }));
    });

    if (!document.querySelector('script[data-mtw-developer-tools], script[src*="developer-tools.js"]')) {
      const manager = document.createElement('script');
      manager.dataset.mtwDeveloperTools = 'true';
      manager.src = DEVELOPER_TOOLS_URL;
      manager.onerror = function () {
        console.error('[dashboard] failed to load manager tools:', manager.src);
      };
      document.head.appendChild(manager);
    }

    // Navigation globals are in place: let the shell (loaded now or already waiting) build.
    window.MTW_DASHBOARD_NAVIGATION_READY = true;
    document.dispatchEvent(new CustomEvent('mtw-dashboard-navigation-ready'));

    // Load the shell once, even if Webflow also includes it with its own <script> tag.
    if (!window.MTW_DASHBOARD_SHELL_STARTED &&
        !document.querySelector('script[data-mtw-dashboard-shell], script[src*="dashboard-shell.js"]')) {
      const shell = document.createElement('script');
      shell.dataset.mtwDashboardShell = 'true';
      shell.src = DASHBOARD_SHELL_URL;
      shell.onerror = function () {
        console.error('[dashboard] failed to load dashboard shell:', shell.src);
      };
      document.head.appendChild(shell);
    }
  }

  // Paste the output of MTW_DASHBOARD_DIAGNOSE() into a bug report.
  function diagnose() {
    const scripts = [...document.scripts]
      .map(script => script.src)
      .filter(src => /mtw|dashboard|githack|jsdelivr/i.test(src));
    const tools = Object.entries(TOOLS).map(([id, tool]) => {
      const panel = document.querySelector(tool.panel);
      return {
        id,
        panel: tool.panel,
        found: Boolean(panel),
        insideShell: Boolean(panel && panel.closest('.mtw-dashboard-shell')),
        children: panel ? panel.children.length : 0,
        visibleCard: Boolean(document.querySelector(`.db-list-toolcard[data-select="${id}"]`)?.offsetParent)
      };
    });
    const report = {
      navigationBuild: NAVIGATION_BUILD,
      role: sessionStorage.getItem('mtw_admin_name'),
      firebase: Boolean(window.MTW && window.MTW.db),
      shells: document.querySelectorAll('.mtw-dashboard-shell').length,
      toolWrappers: document.querySelectorAll('.db-tool-wrapper').length,
      scripts,
      tools,
      // Label-sheet backgrounds in the barcode tool: loaded means naturalWidth > 0.
      labelImages: [...document.querySelectorAll('.barcode-page img.image')].map(img => ({
        src: img.currentSrc || img.src,
        generatedPage: Boolean(img.closest('.barcode-page[data-generated]')),
        loaded: img.complete && img.naturalWidth > 0
      }))
    };
    console.table(tools);
    return JSON.stringify(report, null, 2);
  }
  window.MTW_DASHBOARD_DIAGNOSE = diagnose;

  window.openDBTool =
    openDBTool;

  window.closeDBTool =
    closeDBTool;

  window.exitDBTool = exitDBTool;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
