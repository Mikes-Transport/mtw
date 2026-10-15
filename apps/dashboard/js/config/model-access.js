const {
  db,
  $,
  $$,
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc
} = window.MTW;

(function () {

  const TOOL_ID = 'model-tool-access';
  const PANEL_CLASS = 'model-access-panel';
  const COLL = 'model-access';

  let users = [];
  let overlay = null;

  function panel() {
    return document.querySelector('.' + PANEL_CLASS);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('model-access-styles')) return;

    const style = document.createElement('style');

    style.id = 'model-access-styles';
    style.textContent = [
      '.model-access-panel{max-width:760px;margin-left:auto;margin-right:auto}',
      '.ma-root{margin-top:20px}',
      '.ma-head{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:14px}',
      '.ma-btn{border:1px solid #ccc;background:#fff;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}',
      '.ma-btn:hover{background:#f5f5f5}',
      '.ma-btn.primary{background:#111;color:#fff;border-color:#111}',
      '.ma-btn.primary:hover{background:#333}',
      '.ma-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.ma-btn.danger{color:#b00020;border-color:#f0c4cc}',
      '.ma-list{display:flex;flex-direction:column;gap:10px}',
      '.ma-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:10px 12px}',
      '.ma-name{flex:1;min-width:0;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ma-code{width:110px;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font:inherit;font-size:13px;letter-spacing:2px;text-align:center}',
      '.ma-row .ma-btn{padding:7px 10px;font-size:12px;white-space:nowrap}',
      '.ma-empty{padding:24px 12px;text-align:center;font-size:13px;opacity:.6}',
      '.ma-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:rgba(0,0,0,.45)}',
      '.ma-box{width:min(420px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden}',
      '.ma-box-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eee}',
      '.ma-box-title{font-size:17px;font-weight:800;margin:0}',
      '.ma-box-x{width:32px;height:32px;border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;border-radius:6px}',
      '.ma-box-x:hover{background:#f2f2f2}',
      '.ma-box-body{padding:20px;display:flex;flex-direction:column;gap:12px}',
      '.ma-label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.65;margin-bottom:5px}',
      '.ma-input{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #ccc;border-radius:8px;font:inherit;font-size:13px}',
      '.ma-input:focus{outline:none;border-color:#111}',
      '.ma-coderow{display:flex;gap:8px}',
      '.ma-coderow .ma-input{flex:1;text-align:center;letter-spacing:3px;font-weight:800}',
      '.ma-error{font-size:12px;color:#b00020;min-height:16px}',
      '.ma-box-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #eee}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function shell() {
    return (
      '<div class="ma-root" data-ma-root>' +
        '<div class="ma-head">' +
          '<button type="button" class="ma-btn primary" id="maCreate">Create users</button>' +
        '</div>' +
        '<div class="ma-error" id="maListError"></div>' +
        '<div class="ma-list" id="maList"></div>' +
      '</div>'
    );
  }

  function usedCodes(exceptId) {
    const set = new Set();

    users.forEach(u => {
      if (u.id !== exceptId && u.code) set.add(String(u.code));
    });

    return set;
  }

  function generateUniqueCode(exceptId) {
    const used = usedCodes(exceptId);

    for (let i = 0; i < 100; i++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));

      if (!used.has(code)) return code;
    }

    return null;
  }

  async function load() {
    const list = document.getElementById('maList');
    const err = document.getElementById('maListError');

    try {
      if (!db) throw new Error('db unavailable');

      const snap = await getDocs(collection(db, COLL));

      users = [];
      snap.forEach(d => {
        const data = d.data() || {};

        users.push({
          id: d.id,
          name: data.name || 'Untitled',
          code: data.code != null ? String(data.code) : ''
        });
      });

      users.sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
      );

      if (err) err.textContent = '';

      render();
    } catch (e) {
      console.error('[model-access] load failed:', e);

      if (err) err.textContent = 'Could not load users.';
      if (list) list.innerHTML = '<div class="ma-empty">Could not load users.</div>';
    }
  }

  function render() {
    const list = document.getElementById('maList');

    if (!list) return;

    list.innerHTML = '';

    if (!users.length) {
      list.innerHTML = '<div class="ma-empty">No users yet — press Create users.</div>';
      return;
    }

    users.forEach(u => {
      const row = document.createElement('div');

      row.className = 'ma-row';
      row.dataset.id = u.id;

      const name = document.createElement('div');

      name.className = 'ma-name';
      name.textContent = u.name;
      name.title = u.name;

      const code = document.createElement('input');

      code.className = 'ma-code';
      code.type = 'password';
      code.value = u.code;
      code.readOnly = true;
      code.setAttribute('aria-label', 'Access code for ' + u.name);

      const show = document.createElement('button');

      show.type = 'button';
      show.className = 'ma-btn';
      show.textContent = 'Show';
      show.addEventListener('click', () => {
        const hidden = code.type === 'password';

        code.type = hidden ? 'text' : 'password';
        show.textContent = hidden ? 'Hide' : 'Show';
      });

      const regen = document.createElement('button');

      regen.type = 'button';
      regen.className = 'ma-btn';
      regen.textContent = 'Re-generate';
      regen.addEventListener('click', async () => {
        const next = generateUniqueCode(u.id);

        if (!next) {
          alert('Could not generate a unique code. Try again.');
          return;
        }

        regen.disabled = true;

        try {
          await updateDoc(doc(db, COLL, u.id), { code: next });

          u.code = next;
          code.value = next;
        } catch (e) {
          console.error('[model-access] re-generate failed:', e);
          alert('Could not update the code.');
        }

        regen.disabled = false;
      });

      const del = document.createElement('button');

      del.type = 'button';
      del.className = 'ma-btn danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!window.confirm('Delete user "' + u.name + '"?')) return;

        del.disabled = true;

        try {
          await deleteDoc(doc(db, COLL, u.id));

          users = users.filter(x => x.id !== u.id);
          render();
        } catch (e) {
          console.error('[model-access] delete failed:', e);
          alert('Could not delete the user.');
          del.disabled = false;
        }
      });

      row.appendChild(name);
      row.appendChild(code);
      row.appendChild(show);
      row.appendChild(regen);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function closeOverlay() {
    if (!overlay) return;

    overlay.remove();
    overlay = null;
  }

  function openOverlay() {
    closeOverlay();

    const modal = document.createElement('div');

    modal.className = 'ma-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML =
      '<div class="ma-box">' +
        '<div class="ma-box-head">' +
          '<h2 class="ma-box-title">Create users</h2>' +
          '<button type="button" class="ma-box-x" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="ma-box-body">' +
          '<div>' +
            '<label class="ma-label" for="maNewName">Placeholder name</label>' +
            '<input class="ma-input" id="maNewName" type="text" maxlength="80" placeholder="e.g. Showroom iPad" autocomplete="off">' +
          '</div>' +
          '<div>' +
            '<label class="ma-label" for="maNewCode">Access code</label>' +
            '<div class="ma-coderow">' +
              '<input class="ma-input" id="maNewCode" type="text" readonly placeholder="————" aria-label="Generated code">' +
              '<button type="button" class="ma-btn" id="maGen">Generate</button>' +
            '</div>' +
          '</div>' +
          '<div class="ma-error" id="maNewError"></div>' +
        '</div>' +
        '<div class="ma-box-foot">' +
          '<button type="button" class="ma-btn" id="maCancel">Cancel</button>' +
          '<button type="button" class="ma-btn primary" id="maConfirm">Confirm</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    overlay = modal;

    const nameInput = modal.querySelector('#maNewName');
    const codeInput = modal.querySelector('#maNewCode');
    const errBox = modal.querySelector('#maNewError');

    const fail = msg => {
      if (errBox) errBox.textContent = msg || '';
    };

    modal.querySelector('.ma-box-x').addEventListener('click', closeOverlay);
    modal.querySelector('#maCancel').addEventListener('click', closeOverlay);
    modal.addEventListener('click', e => {
      if (e.target === modal) closeOverlay();
    });
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeOverlay();
    });

    modal.querySelector('#maGen').addEventListener('click', () => {
      const next = generateUniqueCode(null);

      if (!next) {
        fail('Could not generate a unique code. Try again.');
        return;
      }

      fail('');
      codeInput.value = next;
    });

    modal.querySelector('#maConfirm').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const name = String(nameInput.value || '').trim();
      const code = String(codeInput.value || '').trim();

      if (!name) {
        fail('Enter a placeholder name.');
        nameInput.focus();
        return;
      }

      if (!code) {
        fail('Generate a code first.');
        return;
      }

      btn.disabled = true;

      try {
        await addDoc(collection(db, COLL), {
          name: name,
          code: code,
          createdAt: Date.now()
        });

        closeOverlay();
        await load();
      } catch (err) {
        console.error('[model-access] create failed:', err);
        fail('Could not save the user. Try again.');
        btn.disabled = false;
      }
    });

    setTimeout(() => nameInput.focus(), 50);
  }

  function wire() {
    const p = panel();

    if (!p || p.dataset.maWired === 'true') return;

    p.dataset.maWired = 'true';

    const create = document.getElementById('maCreate');

    if (create) {
      create.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openOverlay();
      });
    }
  }

  function ensureShell() {
    const p = panel();

    if (!p) return null;

    if (!p.querySelector('[data-ma-root]')) {
      p.innerHTML = shell();
    }

    return p;
  }

  function boot() {
    if (!ensureShell()) {
      setTimeout(boot, 200);
      return;
    }

    injectStyles();
    wire();
    load();
  }

  function onOpen(e) {
    if (e.detail && e.detail.id !== TOOL_ID) return;

    if (ensureShell()) {
      injectStyles();
      wire();
      load();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  document.addEventListener('db-tool-open', onOpen);

  window.MTWModelAccess = {
    open: onOpen,
    reload: load,
    createUser: openOverlay,
    get users() { return users.slice(); }
  };

})();
