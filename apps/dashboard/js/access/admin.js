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
    Admin: [
      'promotion-label',
      'barcodes',
      'secondhand-tool',
      'product-info',
      'custom-web-element'
    ],

    Developer: '*'
  };

  function init() {

    const loggedIn =
      sessionStorage.getItem(
        'mtw_admin_logged_in'
      );

    const user =
      sessionStorage.getItem(
        'mtw_admin_name'
      );

    if (loggedIn !== 'true') {
      window.location.href = '/admin';
      return;
    }

    const allowed =
      ACCESS[user];

    document
      .querySelectorAll(
        '.db-list-toolcard'
      )
      .forEach(card => {

        const tool =
          card.dataset.select;

        const canAccess =
          allowed === '*' ||
          allowed?.includes(tool);

        card.style.display =
          canAccess ? '' : 'none';
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
