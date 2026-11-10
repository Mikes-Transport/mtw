'use strict';

(function () {

  const ACCESS = {
    Counter: [
      'promotion-label',
      'barcodes',
      'secondhand-tool'
    ],
    Stores: [
      'barcodes'
    ],
    KeyAccounts: [
      'barcodes'
    ],
    Managers: '*'
  };

  function init() {

    const loggedIn =
      sessionStorage.getItem(
        'mtw_admin_logged_in'
      );

    const stored =
      sessionStorage.getItem(
        'mtw_admin_name'
      );
    // 'Manager' is accepted as Managers.
    const user = stored === 'Manager' ? 'Managers' : stored;

    if (loggedIn !== 'true') {
      window.location.href = '/admin';
      return;
    }

    function applyAccess(settings) {
      const allowed = ACCESS[user];
      document.querySelectorAll('.db-list-toolcard').forEach(card => {
        const tool = card.dataset.select;
        const configured = settings && settings[tool];
        const roleOverrides = configured && Array.isArray(configured.roles);
        const canAccess = user === 'Managers' ||
          (roleOverrides
            ? configured.roles.includes(user)
            : allowed === '*' || allowed?.includes(tool));
        const enabled = !configured || configured.enabled !== false;
        card.style.display = canAccess && enabled ? '' : 'none';
      });
    }

    applyAccess(window.MTW_TOOL_SETTINGS || {});
    document.addEventListener('db-tools-ready', event => {
      applyAccess(event.detail && event.detail.settings);
    });

    const userField =
      document.querySelector(
        '.user-field-text'
      );

    if (userField) {
      userField.textContent =
        user;
    }

    document
      .querySelector(
        '.logout-text'
      )
      ?.addEventListener(
        'click',
        () => {
          sessionStorage.clear();
          window.location.href =
            '/admin';
        }
      );
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

})();
