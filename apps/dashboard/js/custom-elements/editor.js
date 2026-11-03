'use strict';

(function () {
  function hideRetiredCustomElementTool() {
    document.querySelectorAll('.db-list-toolcard[data-select="custom-web-element"]')
      .forEach(card => {
        card.style.display = 'none';
      });

    const panel = document.querySelector('.custom-web-element-panel');
    if (panel) panel.style.display = 'none';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideRetiredCustomElementTool, { once: true });
  } else {
    hideRetiredCustomElementTool();
  }
})();
