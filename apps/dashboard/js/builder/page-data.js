// "Manage data": a spreadsheet-style editor for a custom tool's data tables (Managers).
// window.MTW_PAGE_DATA.open({ toolId, toolName, page }) shows a full-screen panel: a tab per
// table, a row per record, a column per field. Cells save to Firestore as you leave them;
// + Add row, delete row (asks first), search, Import and Export. Records update live.
(function (root) {
  'use strict';

  const core = () => root.MTW_PAGE_CORE;
  let current = null;

  function el(tag, className, text, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function button(className, text, title, onClick) {
    const node = el('button', className, text, { type: 'button' });
    if (title) node.title = title;
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  function when(ms) {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (error) {
      return '';
    }
  }

  function open(options) {
    if (current) current.close();
    current = new DataManager(options || {});
    return current;
  }

  function DataManager(options) {
    const c = core();
    const page = c.sanitizePage(options.page);
    const user = (root.sessionStorage && root.sessionStorage.getItem('mtw_admin_name')) || '';
    const tables = page.tables || [];
    const manager = this;
    const state = { tableId: (tables[0] || {}).id || null, search: '', pending: false, entry: null };

    // A runtime for this page gives live table subscriptions plus import/export.
    const runtime = root.MTW_PAGE_RUNTIME.create({ page, toolId: options.toolId, user, isManager: true });

    const overlay = el('div', 'mtw-pb-data', null, { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Manage data: ${options.toolName || options.toolId}` });
    const head = el('header', 'mtw-pb-data-head');
    const titles = el('div', 'mtw-pb-data-titles');
    titles.append(el('span', 'mtw-pb-top-kicker', 'Manage data'), el('strong', '', options.toolName || options.toolId));
    const status = el('span', 'mtw-pb-data-status', '', { role: 'status' });
    const close = button('mtw-pb-data-close', '×', 'Close');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => manager.close());
    head.append(titles, status, close);

    const tabs = el('div', 'mtw-pb-data-tabs', null, { role: 'tablist' });
    const tools = el('div', 'mtw-pb-data-tools');
    const search = el('input', 'mtw-pb-control mtw-pb-data-search', null, { type: 'search', placeholder: 'Search...', 'aria-label': 'Search records' });
    const addRow = button('mtw-pb-button mtw-pb-button-primary mtw-pb-data-add', '+ Add row', 'Add an empty record');
    const importBtn = button('mtw-pb-button mtw-pb-button-secondary mtw-pb-data-import', 'Import', 'Import rows from a CSV file');
    const exportBtn = button('mtw-pb-button mtw-pb-button-secondary mtw-pb-data-export', 'Export', 'Download as a CSV file (opens in Excel)');
    tools.append(search, addRow, importBtn, exportBtn);

    const body = el('div', 'mtw-pb-data-body');
    // An empty rendered page gives the messages, confirm box, download, file picking and
    // import preview (and binds them to the runtime); the grid goes inside it.
    const page0 = root.MTW_PAGE_RENDER.render({ sections: [] }, { runtime, document });
    page0.classList.add('mtw-pb-data-page');
    const renderedUi = page0.mtwUi;
    const gridWrap = el('div', 'mtw-pb-data-grid-wrap');
    const footer = el('p', 'mtw-pb-records-status mtw-pb-data-footer');
    page0.append(gridWrap, footer);
    body.appendChild(page0);
    overlay.append(head, tabs, tools, body);

    function flash(message, isError) {
      status.textContent = message;
      status.dataset.state = isError ? 'error' : 'ok';
    }

    function table() {
      return tables.find(t => t.id === state.tableId) || null;
    }

    function renderTabs() {
      tabs.replaceChildren();
      tables.forEach(t => {
        const tab = button('mtw-pb-data-tab', t.name, `Show ${t.name}`, () => {
          state.tableId = t.id;
          state.search = '';
          search.value = '';
          renderTabs();
          watchTable();
        });
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(t.id === state.tableId));
        tabs.appendChild(tab);
      });
    }

    function cellControl(field, row) {
      let control;
      const v = row[field.key];
      if (field.type === 'choice' || field.type === 'yesno') {
        control = el('select', 'mtw-pb-data-cell');
        const options = field.type === 'yesno' ? ['No', 'Yes'] : [''].concat(c.listItems(field.options));
        const value = field.type === 'yesno' ? (v === true || v === 'Yes' ? 'Yes' : 'No') : String(v === undefined || v === null ? '' : v);
        if (field.type === 'choice' && value && !options.includes(value)) options.push(value);
        options.forEach(text => {
          const option = el('option', '', text || '-');
          option.value = text;
          control.appendChild(option);
        });
        control.value = value;
      } else if (field.type === 'longtext') {
        control = el('textarea', 'mtw-pb-data-cell', null, { rows: '1' });
        control.value = v === undefined || v === null ? '' : String(v);
      } else {
        control = el('input', 'mtw-pb-data-cell');
        control.type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'image' ? 'url' : 'text';
        control.value = v === undefined || v === null ? '' : String(v);
      }
      control.setAttribute('aria-label', field.label);
      const original = control.value;
      const saveCell = async () => {
        if (control.value === original) return;
        control.classList.add('is-saving');
        try {
          await runtime.updateRecord(state.tableId, row._id, field.key, control.value);
          flash(`Saved ${field.label}.`);
          control.classList.remove('is-saving');
        } catch (error) {
          control.classList.remove('is-saving');
          control.classList.add('is-error');
          flash(error.message || 'Could not save.', true);
        }
      };
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'blur', saveCell);
      if (control.tagName === 'INPUT') {
        control.addEventListener('keydown', event => {
          if (event.key === 'Enter') control.blur();
          if (event.key === 'Escape') {
            control.value = original;
            control.blur();
          }
        });
      }
      if (field.required && !control.value) control.classList.add('is-missing');
      return control;
    }

    function draw() {
      const t = table();
      gridWrap.replaceChildren();
      if (!t) {
        gridWrap.appendChild(el('p', 'mtw-pb-muted', 'This tool has no data tables yet. Add one in the page builder\'s Data tab.'));
        footer.textContent = '';
        return;
      }
      const entry = state.entry;
      if (!entry || !entry.loaded) {
        footer.textContent = 'Loading...';
        return;
      }
      if (entry.error) {
        footer.textContent = `Could not load records: ${entry.error.message || entry.error.code || 'unknown error'}`;
        return;
      }
      const term = state.search.trim().toLowerCase();
      const rows = entry.rows.slice().reverse().filter(row => !term ||
        t.fields.some(f => String(row[f.key] === undefined ? '' : row[f.key]).toLowerCase().includes(term)));
      const grid = el('table', 'mtw-pb-table mtw-pb-data-grid');
      const headRow = grid.createTHead().insertRow();
      t.fields.forEach(f => {
        const th = el('th', '', f.label);
        if (f.required) th.appendChild(el('span', 'mtw-pb-required', ' *'));
        headRow.appendChild(th);
      });
      headRow.append(el('th', 'mtw-pb-records-when', 'Added'), el('th', 'mtw-pb-records-actions', ''));
      const tbody = grid.appendChild(el('tbody'));
      rows.forEach(row => {
        const tr = tbody.insertRow();
        tr.dataset.recordId = row._id;
        t.fields.forEach(f => {
          const td = tr.insertCell();
          td.appendChild(cellControl(f, row));
        });
        const added = tr.insertCell();
        added.className = 'mtw-pb-records-when';
        added.textContent = when(row._createdAt);
        if (row._createdBy) added.title = `Added by ${row._createdBy}${row._updatedBy ? `, last changed by ${row._updatedBy}` : ''}`;
        const actions = tr.insertCell();
        actions.className = 'mtw-pb-records-actions';
        const del = button('mtw-pb-records-delete', 'Delete', 'Delete this record', async () => {
          const ok = await renderedUi.confirm('Delete this record? This cannot be undone.');
          if (!ok) return;
          try {
            await runtime.remove(state.tableId, row._id);
            flash('Deleted.');
          } catch (error) {
            flash(`Could not delete: ${error.message || 'unknown error'}`, true);
          }
        });
        actions.appendChild(del);
      });
      gridWrap.appendChild(grid);
      if (state.focusNew) {
        const fresh = tbody.querySelector(`tr[data-record-id="${state.focusNew}"] .mtw-pb-data-cell`);
        if (fresh) {
          state.focusNew = null;
          fresh.focus();
        }
      }
      footer.textContent = !entry.rows.length ? 'No records yet. Use + Add row or Import.'
        : term ? `${rows.length} of ${entry.rows.length} records match.` : `${entry.rows.length} record${entry.rows.length === 1 ? '' : 's'}.`;
    }

    // Live: redraw when records change, but not under someone typing in a cell.
    function refresh() {
      if (gridWrap.contains(document.activeElement)) {
        state.pending = true;
        return;
      }
      state.pending = false;
      draw();
    }
    gridWrap.addEventListener('focusout', () => {
      root.setTimeout(() => {
        if (state.pending && !gridWrap.contains(document.activeElement)) refresh();
      }, 0);
    });

    function watchTable() {
      state.entry = null;
      draw();
      if (!state.tableId) return;
      runtime.watch(state.tableId, gridWrap, entry => {
        // Earlier tabs' listeners stay subscribed; only the shown table redraws.
        if (runtime.table(state.tableId) !== entry) return;
        state.entry = entry;
        refresh();
      });
    }

    search.addEventListener('input', () => {
      state.search = search.value;
      draw();
    });
    addRow.addEventListener('click', async () => {
      if (!state.tableId) return;
      // Leave any cell being edited (saves it) so the grid can show the new row.
      if (gridWrap.contains(document.activeElement)) document.activeElement.blur();
      addRow.disabled = true;
      try {
        const id = await runtime.addRecord(state.tableId);
        flash('Row added. Fill it in.');
        state.focusNew = id;
      } catch (error) {
        flash(error.message || 'Could not add a row.', true);
      } finally {
        addRow.disabled = false;
      }
    });
    exportBtn.addEventListener('click', async () => {
      if (!state.tableId) return;
      try {
        const count = await runtime.exportTable(state.tableId);
        flash(`Exported ${count} record${count === 1 ? '' : 's'}.`);
      } catch (error) {
        flash(error.message || 'Could not export.', true);
      }
    });
    importBtn.addEventListener('click', async () => {
      if (!state.tableId) return;
      try {
        const result = await runtime.importTable(state.tableId);
        if (result) flash(`Imported ${result.added}${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
      } catch (error) {
        flash(error.message || 'Could not import.', true);
      }
    });

    function onKey(event) {
      if (event.key === 'Escape' && !gridWrap.contains(document.activeElement) && !overlay.querySelector('.mtw-pb-ask, .mtw-pb-import')) {
        manager.close();
      }
    }

    this.close = () => {
      document.removeEventListener('keydown', onKey, true);
      runtime.dispose();
      overlay.remove();
      if (current === manager) current = null;
    };
    Object.defineProperty(this, 'element', { get: () => overlay });
    this.showTable = tableId => {
      if (!tables.some(t => t.id === tableId)) return;
      state.tableId = tableId;
      renderTabs();
      watchTable();
    };

    renderTabs();
    if (!tables.length) {
      addRow.disabled = true;
      importBtn.disabled = true;
      exportBtn.disabled = true;
    }
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    watchTable();
    close.focus();
  }

  root.MTW_PAGE_DATA = { open, get current() { return current; } };
})(typeof self !== 'undefined' ? self : this);
