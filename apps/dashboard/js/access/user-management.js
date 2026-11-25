// Manager Tools > Manage Users. The existing /admin sign-in code is intentionally unchanged.
// Uses admin-users documents: name, email, pin, plus optional tools:string[].
// IMPORTANT: UI visibility is not a security boundary. Secure Firestore rules and
// server-side authentication are required before delegating this to untrusted users.
'use strict';
(function () {
  if (window.MTW_USER_MANAGEMENT) return;
  const COLLECTION = 'admin-users';
  const RESERVED = new Set(['Managers', 'Manager', 'Developer']);
  const LOCKED_TO_MANAGERS = new Set([
    'developer-tools', 'model-tool-access', 'mtwstudio',
    'activity-logs', 'csv-config', 'mte-config'
  ]);
  const el = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value != null) n.textContent = value;
    return n;
  };
  const manager = () => ['Managers', 'Manager'].includes(sessionStorage.getItem('mtw_admin_name'));
  const api = () => window.MTW || {};
  let users = [];
  let listVersion = 0;

  function styles() {
    if (document.getElementById('mtw-user-management-css')) return;
    const style = el('style');
    style.id = 'mtw-user-management-css';
    style.textContent = `
      .um-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0;flex-wrap:wrap}
      .um-button{background:#fff;border:1px solid #c9c8c4;color:#262626;border-radius:7px;padding:9px 13px;font:600 13px inherit;cursor:pointer}
      .um-button.primary{background:#242424;color:#fff;border-color:#242424}
      .um-button.danger{color:#b42318;border-color:#ebc3bc}
      .um-button:disabled{opacity:.45;cursor:not-allowed}
      .um-list{display:grid;gap:9px}
      .um-user{display:flex;align-items:center;gap:15px;padding:14px;background:#fff;border:1px solid #e4e3df;border-radius:9px;flex-wrap:wrap}
      .um-info{flex:1;min-width:160px}.um-info strong{display:block;font-size:14px}.um-info small{color:#777;display:block;margin-top:3px}
      .um-actions{display:flex;gap:7px}.um-muted{color:#737373;font-size:12px}
      .um-form{display:grid;gap:15px;max-width:650px}.um-field{display:grid;gap:5px;font-size:13px;font-weight:600}
      .um-field input{padding:10px 12px;border:1px solid #c9c8c4;border-radius:7px;font:inherit;min-width:0}
      .um-perms{border:1px solid #deddd9;border-radius:8px;padding:12px}
      .um-perm-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:10px;margin-top:12px}
      .um-perm{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:500}
      .um-perm input{accent-color:#333}.um-footer{display:flex;gap:9px;flex-wrap:wrap}
      .um-status{font-size:13px;color:#555}.um-status[data-error="true"]{color:#b42318}
    `;
    document.head.appendChild(style);
  }

  function status(panel, message, error) {
    let s = panel.querySelector('.um-status');
    if (!s) { s = el('p', 'um-status'); panel.appendChild(s); }
    s.textContent = message;
    s.dataset.error = error ? 'true' : 'false';
  }

  function button(label, cls, onClick) {
    const b = el('button', 'um-button' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function header(panel, title) {
    panel.dataset.view = 'users';
    panel.replaceChildren();
    const bar = el('div', 'um-toolbar');
    const h = el('h2', '', title);
    bar.append(h, button('Back to Manager Tools', '', () => {
      // Manager Tools owns its overview rendering; reopening the same dashboard tool resets it.
      if (typeof window.openDBTool === 'function') window.openDBTool('developer-tools');
    }));
    panel.appendChild(bar);
  }

  function availableTools() {
    const registry = window.MTW_TOOL_REGISTRY || {};
    const settings = window.MTW_TOOL_SETTINGS || {};
    return Object.entries(registry)
      .filter(([id, tool]) => id !== 'developer-tools' && !LOCKED_TO_MANAGERS.has(id) && tool.enabled !== false && settings[id]?.enabled !== false)
      .map(([id, tool]) => ({ id, name: settings[id]?.name || tool.name || id, roles: tool.roles || [] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function load() {
    const dbapi = api();
    if (!dbapi.db || !dbapi.collection || !dbapi.getDocs) throw Error('Firebase dashboard connection unavailable.');
    const result = [];
    const snap = await dbapi.getDocs(dbapi.collection(dbapi.db, COLLECTION));
    snap.forEach(item => result.push({ id: item.id, ...item.data() }));
    result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    users = result;
    return result;
  }

  function sameName(name, exceptId) {
    return users.some(u => u.id !== exceptId && String(u.name || '').toLowerCase() === name.toLowerCase());
  }

  function openForm(panel, user) {
    if (!manager()) return;
    const existing = Boolean(user);
    header(panel, existing ? 'Edit User' : 'Create User');
    const form = el('form', 'um-form');
    const field = (label, value, type, autocomplete) => {
      const wrapper = el('label', 'um-field', label);
      const input = el('input');
      input.type = type || 'text';
      input.value = value || '';
      input.autocomplete = autocomplete || 'off';
      input.required = true;
      wrapper.appendChild(input);
      form.appendChild(wrapper);
      return input;
    };
    const name = field('User name / role', existing ? user.name : '', 'text');
    name.maxLength = 80;
    const email = field('Email', existing ? user.email : '', 'email');
    email.maxLength = 180;
    const pin = field(existing ? 'Login PIN (leave blank to keep existing)' : 'Login PIN', '', 'password', 'new-password');
    pin.required = !existing;
    pin.minLength = 4;
    pin.maxLength = 32;
    const permBox = el('fieldset', 'um-perms');
    permBox.appendChild(el('legend', '', 'Assign Dashboard Tools'));
    const perms = el('div', 'um-perm-list');
    const choices = availableTools();
    const oldAssigned = Array.isArray(user?.tools) ? new Set(user.tools) :
      new Set(choices.filter(t => (t.roles || []).includes(user?.name)).map(t => t.id));
    if (RESERVED.has(name.value)) choices.forEach(t => oldAssigned.add(t.id));
    choices.forEach(tool => {
      const label = el('label', 'um-perm');
      const check = el('input');
      check.type = 'checkbox';
      check.value = tool.id;
      check.checked = oldAssigned.has(tool.id);
      label.append(check, document.createTextNode(tool.name));
      perms.appendChild(label);
    });
    if (!choices.length) permBox.appendChild(el('p', 'um-muted', 'No assignable dashboard tools found.'));
    else permBox.appendChild(perms); // labels above use fieldset for compact layout
    form.appendChild(permBox);
    const note = el('p', 'um-muted', 'Existing accounts without saved tool assignments retain their current defaults. Managers retain full dashboard access.');
    form.appendChild(note);
    const actions = el('div', 'um-footer');
    const save = button(existing ? 'Save Changes' : 'Create User', 'primary', () => form.requestSubmit());
    actions.append(save, button('Cancel', '', () => render(panel)));
    form.appendChild(actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const n = name.value.trim(), e = email.value.trim(), p = pin.value;
      const checked = [...permBox.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.value);
      if (!n || !e || (!existing && !p)) return status(panel, 'Fill in the required fields.', true);
      if (sameName(n, existing ? user.id : null)) return status(panel, 'A user with that name already exists.', true);
      if (existing && user.name === sessionStorage.getItem('mtw_admin_name') && n !== user.name)
        return status(panel, 'You cannot rename the account currently signed in.', true);
      const data = { name: n, email: e, tools: checked };
      if (p) data.pin = p;
      save.disabled = true;
      try {
        const dbapi = api();
        if (existing) await dbapi.updateDoc(dbapi.doc(dbapi.db, COLLECTION, user.id), data);
        else await dbapi.addDoc(dbapi.collection(dbapi.db, COLLECTION), { ...data, pin: p });
        await render(panel);
        status(panel, existing ? 'User updated.' : 'User created.', false);
      } catch (err) {
        console.error('[user-management] save failed', err);
        status(panel, 'Could not save user: ' + (err.message || 'unknown error'), true);
      } finally { save.disabled = false; }
    });
    panel.appendChild(form);
    name.focus();
  }

  async function remove(panel, user) {
    if (!manager()) return;
    if (user.name === sessionStorage.getItem('mtw_admin_name') || RESERVED.has(user.name))
      return status(panel, 'This manager account cannot be deleted here.', true);
    if (!window.confirm('Permanently delete user "' + user.name + '" from admin-users?')) return;
    try {
      const dbapi = api();
      await dbapi.deleteDoc(dbapi.doc(dbapi.db, COLLECTION, user.id));
      await render(panel);
      status(panel, 'User deleted.', false);
    } catch (err) {
      console.error('[user-management] delete failed', err);
      status(panel, 'Could not delete user: ' + (err.message || 'unknown error'), true);
    }
  }

  async function render(panel) {
    if (!manager() || window.MTW_DASHBOARD_SHARE) return;
    styles();
    const version = ++listVersion;
    header(panel, 'Manage Users');
    const toolbar = el('div', 'um-toolbar');
    toolbar.append(el('p', 'um-muted', 'Users are stored in Firebase admin-users. Assign tools individually to each user.'),
      button('Create User', 'primary', () => openForm(panel, null)));
    panel.appendChild(toolbar);
    const list = el('div', 'um-list');
    panel.appendChild(list);
    list.appendChild(el('p', 'um-muted', 'Loading users…'));
    try {
      const loaded = await load();
      if (version !== listVersion || panel.dataset.view !== 'users') return;
      list.replaceChildren();
      if (!loaded.length) list.appendChild(el('p', 'um-muted', 'No users found.'));
      loaded.forEach(user => {
        const row = el('div', 'um-user');
        const info = el('div', 'um-info');
        info.append(el('strong', '', String(user.name || '(no name)')),
          el('small', '', String(user.email || 'No email') + ' · ' +
            (Array.isArray(user.tools) ? user.tools.length + ' assigned tools' : 'Legacy default access')));
        const buttons = el('div', 'um-actions');
        buttons.appendChild(button('Edit', '', () => openForm(panel, user)));
        if (!RESERVED.has(user.name) && user.name !== sessionStorage.getItem('mtw_admin_name'))
          buttons.appendChild(button('Delete', 'danger', () => remove(panel, user)));
        row.append(info, buttons);
        list.appendChild(row);
      });
    } catch (err) {
      console.error('[user-management] load failed', err);
      list.replaceChildren();
      status(panel, 'Could not load users: ' + (err.message || 'unknown error'), true);
    }
  }

  window.MTW_USER_MANAGEMENT = { render };
})();
