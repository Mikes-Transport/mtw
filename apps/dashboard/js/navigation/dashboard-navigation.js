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

  function hideAll() {

    Object.values(TOOLS).forEach(selector => {

      const el = $(selector);

      if (el) {
        el.style.display = 'none';
      }
    });
  }

  function openDBTool(id) {

    const selector = TOOLS[id];

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

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );

  } else {

    init();
  }

  window.openDBTool =
    openDBTool;

  window.closeDBTool =
    closeDBTool;

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

})();
