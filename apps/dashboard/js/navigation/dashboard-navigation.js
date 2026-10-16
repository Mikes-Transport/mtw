'use strict';

const { $, $$ } = window.MTW;

(function () {

  const TOOLS = {
    'activity-logs': '.activity-logs-panel',
    'secondhand-tool': '.second-hand-panel',
    'product-info': '.product-tool-panel',
    'csv-config': '.csv-tool-panel',
    'mte-config': '.master-list-config',
    'promotion-label': '.et-body-wrapper',
    'barcodes': '.barcode-label-panels',
    'model-tool-access': '.model-access-panel',
    'custom-web-element': '.custom-web-element-panel'
  };

  const NAMES = {
    'activity-logs': 'Activity Logs',
    'secondhand-tool': 'Secondhand Stock',
    'product-info': 'Product Information',
    'csv-config': 'CSV Config',
    'mte-config': 'MTE Config',
    'promotion-label': 'Promotional Labels',
    'barcodes': 'Barcode Labels',
    'model-tool-access': 'Assign Model Tool Access',
    'custom-web-element': 'Custom Web Element Builder'
  };
  const GENERATED_MENU_ROLES = ['Counter', 'Stores', 'KeyAccounts', 'Admin', 'Developer'];
  const generatedMenus = new Map();

  function hideAll() {

    const selectors = [...Object.values(TOOLS), ...Array.from(generatedMenus.keys(), id => `.${id}-panel`)];
    selectors.forEach(selector => {

      const el = $(selector);

      if (el) {
        el.style.display = 'none';
      }
    });
  }

  function openDBTool(id) {

    const menu = generatedMenus.get(id);
    if (menu && !menu.allowedRoles.includes(sessionStorage.getItem('mtw_admin_name'))) return;
    const selector = menu ? `.${id}-panel` : TOOLS[id];

    if (!selector && id !== 'barcodes') return;

    hideAll();

    const wrapper = $('.db-tool-wrapper');
    const heading = $('.tool-wrapper-h2');
    const breadcrumb =
      $('.db-heading-list[data-type="breadcrumb"]');

    const panel = $(selector);

    if (wrapper) {
      wrapper.style.display = 'block';
    }

    if (panel) {
      panel.style.display = 'block';
    }

    if (heading) {
      heading.textContent =
        NAMES[id] || '';
    }

    if (breadcrumb) {
      breadcrumb.textContent =
        NAMES[id] || '';
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

  function init() {

    registerGeneratedMenus();
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
  }

  window.openDBTool =
    openDBTool;

  window.closeDBTool =
    closeDBTool;

  function registerGeneratedMenus() {
    const menus = Array.isArray(window.MTW_ADMIN_MENUS) ? window.MTW_ADMIN_MENUS : [];
    const firstCard = document.querySelector('.db-list-toolcard');
    const wrapper = document.querySelector('.db-tool-wrapper');
    if (!firstCard || !firstCard.parentElement || !wrapper) {
      if (menus.length) console.error('[dashboard] cannot register generated menu items; dashboard tool shell was not found.');
      return;
    }
    let panelWrapper = document.querySelector('.db-selected-panel-wrapper');
    if (!panelWrapper) {
      panelWrapper = document.createElement('div');
      panelWrapper.className = 'db-selected-panel-wrapper';
      wrapper.appendChild(panelWrapper);
    }
    const role = sessionStorage.getItem('mtw_admin_name');

    menus.forEach(menu => {
      if (!menu || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(menu.id) ||
          TOOLS[menu.id] || !menu.title || !Array.isArray(menu.allowedRoles) ||
          !menu.allowedRoles.length || menu.allowedRoles.some(role => !GENERATED_MENU_ROLES.includes(role)) ||
          new Set(menu.allowedRoles).size !== menu.allowedRoles.length ||
          !menu.allowedRoles.includes(role) ||
          generatedMenus.has(menu.id)) return;
      generatedMenus.set(menu.id, menu);
      TOOLS[menu.id] = `.${menu.id}-panel`;
      NAMES[menu.id] = menu.title;

      let card = document.querySelector(`.db-list-toolcard[data-select="${menu.id}"]`);
      if (!card) {
        card = firstCard.cloneNode(true);
        card.removeAttribute('id');
        card.dataset.select = menu.id;
        card.classList.add('dark');
        card.textContent = menu.title;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        firstCard.parentElement.appendChild(card);
      }
      card.style.display = menu.allowedRoles.includes(role) ? '' : 'none';
      card.dataset.generatedMenu = 'true';
      card.dataset.allowedRoles = menu.allowedRoles.join(',');
      card.style.cursor = 'pointer';
      const open = () => openDBTool(menu.id);
      card.onclick = open;
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      };

      let panel = document.querySelector(`.${menu.id}-panel`);
      if (!panel) {
        panel = document.createElement('section');
        panel.className = `${menu.id}-panel`;
        panel.dataset.select = menu.id;
        panel.style.display = 'none';
        panel.innerHTML = `
          <div class="db-menu-item-panel">
            <h2>${escapeHtml(menu.title)}</h2>
            <label>Panel template
              <select aria-label="Panel template">
                <option value="blank">Blank panel</option>
              </select>
            </label>
            <div class="db-menu-item-panel-content">This panel is ready for its first dashboard tool.</div>
          </div>`;
        panelWrapper.appendChild(panel);
      }
    });
    document.dispatchEvent(new CustomEvent('mtw-admin-menus-ready'));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function loadGeneratedMenus() {
    if (Array.isArray(window.MTW_ADMIN_MENUS)) return Promise.resolve();
    const navigationScript = document.currentScript;
    const src = navigationScript && navigationScript.src
      ? new URL('../custom-elements/generated-admin-menus.js', navigationScript.src).href
      : 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/js/custom-elements/generated-admin-menus.js';
    return new Promise(resolve => {
      const registry = document.createElement('script');
      registry.src = `${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}`;
      registry.onload = resolve;
      registry.onerror = () => {
        console.error('[dashboard] failed to load generated menu registry:', registry.src);
        resolve();
      };
      document.head.appendChild(registry);
    });
  }

  function start() {
    loadGeneratedMenus().then(() => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    });
  }

  function loadCustomElementEditor() {
    if (document.querySelector('script[data-mtw-custom-element-editor]')) return;

    const navigationScript = document.currentScript;
    const editor = document.createElement('script');
    editor.dataset.mtwCustomElementEditor = 'true';
    editor.src = navigationScript && navigationScript.src
      ? new URL('../custom-elements/editor.js', navigationScript.src).href
      : 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/js/custom-elements/editor.js';
    editor.onerror = function () {
      console.error('[dashboard] failed to load the custom web element editor:', editor.src);
    };
    document.head.appendChild(editor);
  }

  loadCustomElementEditor();
  start();

})();
