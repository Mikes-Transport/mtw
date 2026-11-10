'use strict';

(function () {
  const ROLES = ['Counter', 'Stores', 'KeyAccounts', 'Admin', 'Developer'];
  const statusClass = 'developer-tools-status';

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function showStatus(panel, message, isError) {
    let status = panel.querySelector(`.${statusClass}`);
    if (!status) {
      status = node('p', statusClass);
      status.setAttribute('role', 'status');
      panel.prepend(status);
    }
    status.textContent = message;
    status.dataset.error = isError ? 'true' : 'false';
  }

  function getCurrentSettings() {
    return window.MTW_TOOL_SETTINGS || {};
  }

  function getDefaultRoles(tool) {
    return Array.isArray(tool.roles) ? tool.roles : [];
  }

  function buildToolForm(panel, id, registry, settings, isNew) {
    panel.dataset.view = 'form';
    panel.replaceChildren();
    panel.appendChild(node('h2', '', isNew ? 'Add a navigation item' : 'Tool settings'));
    panel.appendChild(node('p', '', 'Choose who can see this item. Turning it off hides it without deleting its settings or data.'));

    const form = node('form', 'developer-tool-form');
    const nameLabel = node('label', '', 'Display name');
    const nameInput = node('input');
    nameInput.type = 'text';
    nameInput.name = 'name';
    nameInput.maxLength = 80;
    nameInput.required = true;
    nameInput.value = settings.name || registry.name || '';
    nameLabel.appendChild(nameInput);
    form.appendChild(nameLabel);

    const descriptionLabel = node('label', '', 'Description (optional)');
    const descriptionInput = node('textarea');
    descriptionInput.name = 'description';
    descriptionInput.maxLength = 240;
    descriptionInput.rows = 3;
    descriptionInput.value = settings.description || '';
    descriptionLabel.appendChild(descriptionInput);
    form.appendChild(descriptionLabel);

    const roleGroup = node('fieldset', 'developer-tool-roles');
    roleGroup.appendChild(node('legend', '', 'Visible to'));
    const roles = Array.isArray(settings.roles) ? settings.roles : getDefaultRoles(registry);
    ROLES.forEach(role => {
      const label = node('label');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'roles';
      checkbox.value = role;
      checkbox.checked = roles.includes(role);
      label.append(checkbox, document.createTextNode(` ${role}`));
      roleGroup.appendChild(label);
    });
    form.appendChild(roleGroup);

    // Declared outside the block: the Disable button and submit handler both use it.
    let enabledInput = null;
    if (!isNew) {
      const enabledLabel = node('label');
      enabledInput = node('input');
      enabledInput.type = 'checkbox';
      enabledInput.name = 'enabled';
      enabledInput.checked = settings.enabled !== false;
      enabledLabel.append(enabledInput, document.createTextNode(' Show this item in navigation'));
      form.appendChild(enabledLabel);
    }

    const buttons = node('div', 'developer-tool-actions');
    const saveButton = node('button', '', isNew ? 'Add navigation item' : 'Save changes');
    saveButton.type = 'submit';
    buttons.appendChild(saveButton);
    if (!isNew) {
      const disableButton = node('button', 'developer-tool-disable', settings.enabled === false ? 'Re-enable item' : 'Disable item');
      disableButton.type = 'button';
      disableButton.addEventListener('click', () => {
        enabledInput.checked = !enabledInput.checked;
        form.requestSubmit();
      });
      buttons.appendChild(disableButton);
    }
    form.appendChild(buttons);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const selectedRoles = [...form.querySelectorAll('input[name="roles"]:checked')].map(input => input.value);
      if (!name) {
        showStatus(panel, 'Enter a display name before saving.', true);
        nameInput.focus();
        return;
      }
      if (selectedRoles.length === 0) {
        showStatus(panel, 'Select at least one role that can see this item.', true);
        return;
      }

      const record = {
        name,
        description: descriptionInput.value.trim(),
        roles: selectedRoles,
        enabled: isNew || !enabledInput ? true : enabledInput.checked,
        custom: isNew || settings.custom === true
      };
      saveButton.disabled = true;
      try {
        const api = window.MTW || {};
        if (!api.db || typeof api.doc !== 'function' || typeof api.setDoc !== 'function') {
          throw new Error('Dashboard database is unavailable.');
        }
        await api.setDoc(api.doc(api.db, 'dashboard-tools', id), record);
        const updated = { ...getCurrentSettings(), [id]: record };
        if (typeof window.MTW_APPLY_TOOL_SETTINGS !== 'function') {
          throw new Error('Dashboard navigation is not ready to apply these settings.');
        }
        window.MTW_APPLY_TOOL_SETTINGS(updated);
        showStatus(panel, 'Saved. The navigation and role access are updated.', false);
        if (isNew) {
          render(panel);
        }
      } catch (error) {
        console.error('[dashboard] could not save tool settings:', error);
        showStatus(panel, `Could not save changes: ${error.message || 'unknown error'}`, true);
      } finally {
        saveButton.disabled = false;
      }
    });

    panel.appendChild(form);
  }

  function render(panel) {
    panel.dataset.view = 'list';
    panel.replaceChildren();
    panel.appendChild(node('h2', '', 'Developer tools'));
    panel.appendChild(node('p', '', 'Manage navigation labels and access. New items create a safe placeholder only; a developer must connect the actual tool behavior in code.'));

    const addButton = node('button', 'developer-tool-add', 'Add navigation item');
    addButton.type = 'button';
    panel.appendChild(addButton);

    const list = node('div', 'developer-tool-list');
    const registry = window.MTW_TOOL_REGISTRY || {};
    const settings = getCurrentSettings();
    Object.entries(registry)
      .filter(([id]) => id !== 'developer-tools')
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([id, tool]) => {
        const config = settings[id] || {};
        const row = node('button', 'developer-tool-row');
        row.type = 'button';
        const name = node('strong', '', config.name || tool.name);
        const detail = node('span', '', config.enabled === false ? 'Disabled' : 'Edit name and access');
        row.append(name, detail);
        row.addEventListener('click', () => buildToolForm(panel, id, tool, config, false));
        list.appendChild(row);
      });
    panel.appendChild(list);

    addButton.addEventListener('click', () => {
      panel.dataset.view = 'form';
      panel.replaceChildren();
      panel.appendChild(node('h2', '', 'Add a navigation item'));
      const form = node('form', 'developer-tool-form');
      const label = node('label', '', 'Navigation ID (lowercase letters, numbers, and hyphens)');
      const idInput = node('input');
      idInput.name = 'id';
      idInput.required = true;
      idInput.pattern = '[a-z0-9]+(?:-[a-z0-9]+)*';
      idInput.maxLength = 48;
      label.appendChild(idInput);
      form.appendChild(label);
      const error = node('p', statusClass);
      error.setAttribute('role', 'status');
      form.appendChild(error);
      const next = node('button', '', 'Continue');
      next.type = 'submit';
      form.appendChild(next);
      const back = node('button', '', 'Cancel');
      back.type = 'button';
      back.addEventListener('click', () => render(panel));
      form.appendChild(back);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const id = idInput.value.trim();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
          error.textContent = 'Use lowercase letters, numbers, and single hyphens.';
          return;
        }
        if (registry[id] || settings[id]) {
          error.textContent = 'That ID is already in use. Choose a different one.';
          return;
        }
        buildToolForm(panel, id, { name: id.replace(/-/g, ' '), roles: [] }, { custom: true }, true);
      });
      panel.appendChild(form);
      idInput.focus();
    });
  }

  function init() {
    const user = sessionStorage.getItem('mtw_admin_name');
    if (user !== 'Developer') return;

    const panel = document.querySelector('.developer-tools-panel');
    if (!panel) return;
    const start = () => render(panel);
    if (window.MTW_TOOL_REGISTRY) start();
    document.addEventListener('db-tools-ready', () => {
      if (panel.dataset.view !== 'form') start();
    });

    // X while editing an item (or adding one) returns to the Developer Tools list.
    document.addEventListener('db-tool-exit-request', event => {
      if (event.detail?.id !== 'developer-tools' || panel.dataset.view !== 'form') return;
      event.preventDefault();
      render(panel);
    });

    // Leaving the tool (Overview, another tool) discards an unsaved edit view.
    document.addEventListener('db-tool-close', () => {
      if (panel.dataset.view === 'form') render(panel);
    });

    document.addEventListener('db-tools-load-error', event => {
      showStatus(panel, event.detail.message, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
