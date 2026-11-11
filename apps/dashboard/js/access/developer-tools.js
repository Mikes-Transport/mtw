'use strict';

(function () {
  const ROLES = ['Counter', 'Stores', 'KeyAccounts', 'Managers'];
  const isManager = role => ['Managers', 'Manager'].includes(String(role || '').trim());
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
    const roles = (Array.isArray(settings.roles) ? settings.roles : getDefaultRoles(registry))
      .map(role => (role === 'Developer' || role === 'Manager' ? 'Managers' : role));
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
    panel.appendChild(node('h2', '', 'Manager tools'));
    panel.appendChild(node('p', '', 'Manage navigation labels and access. New items create a placeholder only; the tool itself is added in code.'));

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
    renderShareLinks(panel);

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

  // Share links: open one tool (e.g. the Timesheet on a tablet) without the /admin
  // sign-in. The tool's own PIN still applies. Only a hash of each token is stored.
  function shareUrl(token) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('share', token);
    return url.href;
  }

  function formatWhen(value) {
    if (!value) return 'never';
    try {
      return new Date(value).toLocaleString('en-NZ', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch (error) {
      return 'unknown';
    }
  }

  async function copyText(text, input) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      if (input) { input.focus(); input.select(); }
      return false;
    }
  }

  function renderShareLinks(panel) {
    const guard = window.MTW_SESSION_GUARD;
    const api = window.MTW || {};
    const section = node('section', 'developer-share-links');
    section.appendChild(node('h3', '', 'Share links'));
    section.appendChild(node('p', '', 'Open one tool on a tablet or desktop shortcut without the dashboard sign-in. The tool\'s own PIN still applies. Revoke a link to stop it working.'));
    panel.appendChild(section);
    if (!guard || !api.db || typeof api.setDoc !== 'function') {
      section.appendChild(node('p', statusClass, 'Share links need the dashboard database connection.'));
      return;
    }

    const form = node('form', 'developer-share-form');
    const toolLabel = node('label', '', 'Tool');
    const toolSelect = node('select');
    toolSelect.name = 'tool';
    Object.entries(guard.SHAREABLE_TOOLS).forEach(([id, name]) => {
      const option = node('option', '', name);
      option.value = id;
      toolSelect.appendChild(option);
    });
    toolLabel.appendChild(toolSelect);
    const nameLabel = node('label', '', 'Label');
    const nameInput = node('input');
    nameInput.name = 'label';
    nameInput.placeholder = 'Workshop tablet';
    nameInput.maxLength = 60;
    nameInput.required = true;
    nameLabel.appendChild(nameInput);
    const create = node('button', 'developer-share-create', 'Create link');
    create.type = 'submit';
    form.append(toolLabel, nameLabel, create);
    section.appendChild(form);

    const created = node('div', 'developer-share-created');
    section.appendChild(created);
    const list = node('div', 'developer-share-list');
    section.appendChild(list);

    const loadList = async () => {
      try {
        const snapshot = await api.getDocs(api.collection(api.db, guard.SHARE_COLLECTION));
        const links = [];
        snapshot.forEach(item => links.push({ id: item.id, ...item.data() }));
        links.sort((a, b) => (a.revoked === b.revoked ? (b.createdAt || 0) - (a.createdAt || 0) : a.revoked ? 1 : -1));
        list.replaceChildren();
        if (!links.length) list.appendChild(node('p', '', 'No share links yet.'));
        links.forEach(link => {
          const row = node('div', 'developer-share-row');
          row.dataset.revoked = link.revoked ? 'true' : 'false';
          const info = node('div');
          info.appendChild(node('strong', '', `${link.label || 'Untitled'} · ${guard.SHAREABLE_TOOLS[link.tool] || link.tool}`));
          info.appendChild(node('span', '', link.revoked
            ? `Revoked ${formatWhen(link.revokedAt)}`
            : `Created ${formatWhen(link.createdAt)} by ${link.createdBy || 'a manager'} · last used ${formatWhen(link.lastUsedAt)}`));
          row.appendChild(info);
          if (!link.revoked) {
            const revoke = node('button', 'developer-share-revoke', 'Revoke');
            revoke.type = 'button';
            revoke.addEventListener('click', async () => {
              revoke.disabled = true;
              try {
                await api.updateDoc(api.doc(api.db, guard.SHARE_COLLECTION, link.id), {
                  revoked: true, revokedAt: Date.now(), revokedBy: sessionStorage.getItem('mtw_admin_name') || ''
                });
                showStatus(panel, `Revoked "${link.label}". That link no longer opens.`, false);
                loadList();
              } catch (error) {
                revoke.disabled = false;
                showStatus(panel, `Could not revoke the link: ${error.message || 'unknown error'}`, true);
              }
            });
            row.appendChild(revoke);
          }
          list.appendChild(row);
        });
      } catch (error) {
        list.replaceChildren(node('p', statusClass, `Could not load share links: ${error.message || 'unknown error'}`));
      }
    };

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const label = nameInput.value.trim();
      if (!label) {
        showStatus(panel, 'Give the link a label, e.g. "Workshop tablet".', true);
        return;
      }
      create.disabled = true;
      try {
        const token = guard.newToken();
        const id = await guard.hashToken(token);
        await api.setDoc(api.doc(api.db, guard.SHARE_COLLECTION, id), {
          tool: toolSelect.value,
          label,
          revoked: false,
          createdAt: Date.now(),
          createdBy: sessionStorage.getItem('mtw_admin_name') || '',
          lastUsedAt: null
        });
        const url = shareUrl(token);
        const box = node('div', 'developer-share-new');
        const urlInput = node('input');
        urlInput.readOnly = true;
        urlInput.value = url;
        urlInput.setAttribute('aria-label', 'Share link');
        const copy = node('button', 'developer-share-copy', 'Copy');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
          copy.textContent = (await copyText(url, urlInput)) ? 'Copied' : 'Select and copy';
        });
        box.append(urlInput, copy, node('p', '', 'Copy it now: it is only shown once. Open it on the tablet and add it to the home screen or desktop.'));
        created.replaceChildren(box);
        nameInput.value = '';
        showStatus(panel, `Share link "${label}" created.`, false);
        loadList();
      } catch (error) {
        showStatus(panel, `Could not create the link: ${error.message || 'unknown error'}`, true);
      } finally {
        create.disabled = false;
      }
    });

    loadList();
  }

  function init() {
    if (window.MTW_DASHBOARD_SHARE) return;
    const user = sessionStorage.getItem('mtw_admin_name');
    if (!isManager(user)) return;

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
