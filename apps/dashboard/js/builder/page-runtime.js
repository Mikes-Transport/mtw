// What makes a built page work: input values, live data-table records, and running
// "When -> Do" step lists. window.MTW_PAGE_RUNTIME.create(options) returns a runtime
// the renderer draws with (page-render.js).
//
// Elements are referred to by element name. Text in steps can use {element_name},
// {user}, {today} and {now}. Records are stored in Firestore collection
// dashboard-data-<tool>-<table> with the table's field keys plus _createdAt/_createdBy.
(function (root) {
  'use strict';

  const core = () => root.MTW_PAGE_CORE;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function nowText() {
    try {
      return new Date().toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (error) {
      const d = new Date();
      return `${d.getHours()}:${pad(d.getMinutes())}`;
    }
  }

  function readSnapshot(snap) {
    const rows = [];
    if (snap && typeof snap.forEach === 'function') {
      snap.forEach(item => {
        const data = typeof item.data === 'function' ? item.data() : item.data;
        rows.push({ ...(data || {}), _id: item.id });
      });
    }
    return rows.sort((a, b) => (Number(a._createdAt) || 0) - (Number(b._createdAt) || 0));
  }

  function compare(left, op, right) {
    const a = left === undefined || left === null ? '' : String(left).trim();
    const b = right === undefined || right === null ? '' : String(right).trim();
    const na = Number(a);
    const nb = Number(b);
    const numeric = a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb);
    switch (op) {
      case 'equals': return numeric ? na === nb : a.toLowerCase() === b.toLowerCase();
      case 'notEquals': return numeric ? na !== nb : a.toLowerCase() !== b.toLowerCase();
      case 'contains': return a.toLowerCase().includes(b.toLowerCase());
      case 'empty': return a === '';
      case 'notEmpty': return a !== '';
      case 'greater': return numeric ? na > nb : a.localeCompare(b) > 0;
      case 'less': return numeric ? na < nb : a.localeCompare(b) < 0;
      default: return false;
    }
  }

  // options: { page, toolId, api, user, isManager, editing, ui }
  //   ui (from the renderer): { toast(text, tone), confirm(text) -> Promise<boolean>,
  //   update(name) to redraw one element, openTool(id), openUrl(url, newTab) }
  function create(options) {
    const c = core();
    const opts = options || {};
    const page = c.sanitizePage(opts.page);
    const api = opts.api || root.MTW || {};
    const user = opts.user || '';
    const elements = {};
    c.pageElements(page).forEach(item => { elements[item.name] = item.block; });
    const tables = {};
    (page.tables || []).forEach(table => { tables[table.id] = table; });

    const state = {
      values: {},
      texts: {},
      hidden: new Set(),
      // tableId -> { rows, loaded, error, unsubscribe, listeners:Set }. The builder passes a
      // shared cache so redrawing the canvas doesn't resubscribe on every edit.
      data: opts.shared ? opts.shared.data : {},
      disposed: false
    };
    let ui = opts.ui || {};

    // ctx.record: the clicked row or card's record (for {record.field} and record.field).
    function tokens(text, ctx) {
      return String(text === undefined || text === null ? '' : text).replace(/\{(record\.[a-z_][a-z0-9_]{0,39}|[a-z][a-z0-9_]{0,39})\}/g, (match, name) => {
        if (name === 'user') return user;
        if (name === 'today') return today();
        if (name === 'now') return nowText();
        if (name.startsWith('record.')) return ctx && ctx.record ? fmtValue(ctx.record[name.slice(7)]) : '';
        if (elements[name]) return String(value(name));
        return match;
      });
    }

    function fmtValue(v) {
      if (v === undefined || v === null) return '';
      if (typeof v === 'number' && v > 1e12) return new Date(v).toLocaleString('en-NZ');
      return String(v);
    }

    // Field definition for a bound input (or null).
    function boundField(block) {
      const bind = block.props.bind;
      if (!bind) return null;
      const [tableId, key] = bind.split('.');
      const table = tables[tableId];
      return table ? table.fields.find(field => field.key === key) || null : null;
    }

    function inputSpec(block) {
      const field = boundField(block);
      return {
        kind: field ? field.type : block.props.kind,
        required: field ? field.required : block.props.required === 'yes',
        options: c.listItems(field ? field.options : block.props.options)
      };
    }

    Object.values(elements).forEach(block => {
      if (block.hidden) state.hidden.add(block.name);
      if (block.type === 'input') {
        const spec = inputSpec(block);
        let start = tokens(block.props.defaultValue);
        if (spec.kind === 'yesno' && !start) start = 'No';
        state.values[block.name] = start;
      }
    });

    // ---------- data tables ----------
    function collectionRef(tableId) {
      return api.collection(api.db, c.dataCollection(opts.toolId, tableId));
    }

    function table(tableId) {
      if (!tables[tableId]) return null;
      if (!state.data[tableId]) {
        const entry = { rows: [], loaded: false, error: null, unsubscribe: null, listeners: new Set() };
        entry.ready = new Promise(resolve => { entry.resolve = resolve; });
        state.data[tableId] = entry;
        const update = rows => {
          entry.rows = rows;
          entry.loaded = true;
          entry.error = null;
          entry.resolve();
          entry.listeners.forEach(fn => fn(entry));
        };
        const fail = error => {
          entry.error = error;
          entry.loaded = true;
          entry.resolve();
          entry.listeners.forEach(fn => fn(entry));
        };
        if (!api.db || typeof api.collection !== 'function') {
          fail(new Error('The dashboard database is unavailable.'));
        } else if (typeof api.onSnapshot === 'function') {
          try {
            entry.unsubscribe = api.onSnapshot(collectionRef(tableId), snap => update(readSnapshot(snap)), fail);
          } catch (error) {
            fail(error);
          }
        } else if (typeof api.getDocs === 'function') {
          api.getDocs(collectionRef(tableId)).then(snap => update(readSnapshot(snap)), fail);
        }
      }
      return state.data[tableId];
    }

    // Calls fn(entry) now and on every change, while `node` is on the page.
    function watch(tableId, node, fn) {
      const entry = table(tableId);
      if (!entry) return;
      const listener = current => {
        if (node && !node.isConnected) {
          entry.listeners.delete(listener);
          return;
        }
        fn(current);
      };
      entry.listeners.add(listener);
      fn(entry);
    }

    function count(block) {
      const entry = table(block.props.table);
      if (!entry || !entry.loaded) return '';
      if (!block.props.filterField) return entry.rows.length;
      return entry.rows.filter(row => compare(row[block.props.filterField], 'equals', tokens(block.props.filterValue))).length;
    }

    // ---------- element values ----------
    function value(name, ctx) {
      if (typeof name === 'string' && name.startsWith('record.')) {
        return ctx && ctx.record ? fmtValue(ctx.record[name.slice(7)]) : '';
      }
      const block = elements[name];
      if (!block) return '';
      if (block.type === 'input') return state.values[name] === undefined ? '' : state.values[name];
      if (state.texts[name] !== undefined) return state.texts[name];
      const p = block.props;
      switch (block.type) {
        case 'heading':
        case 'text': return p.text;
        case 'notice': return p.text;
        case 'button': return p.label;
        case 'card': return p.title;
        case 'stat': return p.source === 'count' ? count(block) : p.value;
        case 'records': {
          const entry = table(p.table);
          return entry ? entry.rows.length : 0;
        }
        case 'table': return p.rows.length;
        case 'list': return c.listItems(p.items).length;
        default: return '';
      }
    }

    function refresh(name) {
      if (ui.update) ui.update(name);
    }

    // fromUser: typed by the person, so their control already shows it.
    function setValue(name, next, fromUser) {
      if (!elements[name] || elements[name].type !== 'input') return;
      state.values[name] = next === undefined || next === null ? '' : String(next);
      if (!fromUser) refresh(name);
    }

    // ---------- records ----------
    // The record an "Edit this record" step loaded into the inputs (next Save updates it).
    state.editing = null;

    function editRecord(ctx) {
      if (!ctx || !ctx.record || !ctx.table || !tables[ctx.table]) return;
      tables[ctx.table].fields.forEach(field => {
        Object.values(elements).forEach(block => {
          if (block.type === 'input' && block.props.bind === `${ctx.table}.${field.key}`) {
            const v = ctx.record[field.key];
            setValue(block.name, v === undefined || v === null ? '' : field.type === 'yesno' ? (v === true || v === 'Yes' ? 'Yes' : 'No') : String(v));
          }
        });
      });
      state.editing = { table: ctx.table, id: ctx.record._id };
    }

    function stopEditing() {
      state.editing = null;
    }

    async function save(tableId, mode) {
      const def = tables[tableId];
      if (!def) throw new Error('Pick a data table for the Save step.');
      const record = {};
      const missing = [];
      def.fields.forEach(field => {
        const input = Object.values(elements).find(block => block.type === 'input' && block.props.bind === `${tableId}.${field.key}`);
        let v = input ? String(value(input.name)).trim() : '';
        if (field.required && !v) missing.push(input ? (input.props.label || field.label) : field.label);
        if (field.type === 'number' && v !== '') {
          const n = Number(v);
          if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
          v = n;
        }
        record[field.key] = typeof v === 'string' ? v.slice(0, c.LIMITS.text) : v;
      });
      if (missing.length) throw new Error(`Please fill in: ${missing.join(', ')}.`);
      const editing = mode !== 'add' && state.editing && state.editing.table === tableId ? state.editing : null;
      if (editing) {
        if (opts.dryRun) {
          state.editing = null;
          return record;
        }
        if (typeof api.updateDoc !== 'function' || typeof api.doc !== 'function') throw new Error('The dashboard database is unavailable.');
        await api.updateDoc(api.doc(api.db, c.dataCollection(opts.toolId, tableId), editing.id), { ...record, _updatedAt: Date.now(), _updatedBy: user });
        state.editing = null;
        return record;
      }
      record._createdAt = Date.now();
      record._createdBy = user;
      if (opts.dryRun) return record; // builder preview: everything runs, nothing is written
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      await api.addDoc(collectionRef(tableId), record);
      return record;
    }

    async function remove(tableId, id) {
      if (opts.dryRun) return;
      if (typeof api.deleteDoc !== 'function' || typeof api.doc !== 'function') throw new Error('The dashboard database is unavailable.');
      await api.deleteDoc(api.doc(api.db, c.dataCollection(opts.toolId, tableId), id));
    }

    // ---------- running steps ----------
    const STOP = { stop: true };

    async function runList(list, depth, ctx) {
      for (const step of list || []) {
        if (state.disposed) return STOP;
        const result = await runStep(step, depth, ctx);
        if (result === STOP) return STOP;
      }
      return null;
    }

    async function exportTable(tableId) {
      const def = tables[tableId];
      if (!def) throw new Error('Pick a data table to export.');
      const entry = table(tableId);
      await Promise.race([entry.ready, new Promise(resolve => root.setTimeout(resolve, 8000))]);
      if (entry.error) throw entry.error;
      const header = def.fields.map(f => f.label).concat('Added', 'Added by');
      const rows = entry.rows.map(row => def.fields.map(f => fmtValue(row[f.key]))
        .concat(row._createdAt ? new Date(row._createdAt).toLocaleString('en-NZ') : '', row._createdBy || ''));
      const name = `${def.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'export'} ${today()}.csv`;
      if (!ui.download) throw new Error('Downloads are not available here.');
      ui.download(name, `\uFEFF${c.toCsv([header].concat(rows))}`, 'text/csv;charset=utf-8');
      return rows.length;
    }

    async function importTable(tableId) {
      const def = tables[tableId];
      if (!def) throw new Error('Pick a data table to import into.');
      if (!ui.pickFile) throw new Error('Picking files is not available here.');
      const text = await ui.pickFile('.csv,text/csv');
      if (text === null || text === undefined) return null; // cancelled
      const parsed = c.parseCsv(text);
      if (parsed.length < 2) throw new Error('That file has no rows under its header row.');
      const header = parsed[0];
      const keys = c.matchColumns(header, def);
      if (!keys.some(Boolean)) throw new Error(`None of the file's columns match ${def.name}'s fields (${def.fields.map(f => f.label).join(', ')}).`);
      const rows = [];
      const skipped = [];
      parsed.slice(1, 2001).forEach((cells, i) => {
        const record = {};
        def.fields.forEach(f => { record[f.key] = ''; });
        keys.forEach((key, col) => { if (key) record[key] = String(cells[col] === undefined ? '' : cells[col]).trim().slice(0, c.LIMITS.text); });
        let problem = '';
        def.fields.forEach(f => {
          if (f.required && !record[f.key]) problem = problem || `${f.label} is empty`;
          if (f.type === 'number' && record[f.key] !== '') {
            const n = Number(record[f.key].replace(/,/g, ''));
            if (Number.isFinite(n)) record[f.key] = n;
            else problem = problem || `${f.label} isn't a number`;
          }
        });
        if (problem) skipped.push(`Row ${i + 2}: ${problem}`);
        else rows.push(record);
      });
      const ok = ui.importPreview ? await ui.importPreview({
        table: def,
        matched: header.map((cell, i) => ({ column: cell, field: keys[i] ? def.fields.find(f => f.key === keys[i]).label : null })),
        rows,
        skipped,
        total: parsed.length - 1
      }) : true;
      if (!ok) return null;
      if (opts.dryRun) return { added: rows.length, skipped: skipped.length };
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      const now = Date.now();
      for (let i = 0; i < rows.length; i += 1) {
        await api.addDoc(collectionRef(tableId), { ...rows[i], _createdAt: now + i, _createdBy: user });
      }
      return { added: rows.length, skipped: skipped.length };
    }

    async function runStep(step, depth, ctx) {
      switch (step.type) {
        case 'save':
          try {
            await save(step.table, step.mode);
          } catch (error) {
            if (ui.toast) ui.toast(error.message || 'Could not save.', 'danger');
            return STOP;
          }
          return null;
        case 'message':
          if (ui.toast) ui.toast(tokens(step.text, ctx), step.tone);
          return null;
        case 'confirm': {
          const yes = ui.confirm ? await ui.confirm(tokens(step.text, ctx)) : true;
          return yes ? null : STOP;
        }
        case 'openPopup':
          if (step.target && ui.openPopup) ui.openPopup(step.target);
          return null;
        case 'closePopup':
          if (ui.closePopup) ui.closePopup(step.target || '');
          stopEditing();
          return null;
        case 'fillFromRecord':
          editRecord(ctx);
          return null;
        case 'exportCsv':
          try {
            const count = await exportTable(step.table);
            if (ui.toast) ui.toast(`Exported ${count} record${count === 1 ? '' : 's'}.`, 'success');
          } catch (error) {
            if (ui.toast) ui.toast(error.message || 'Could not export.', 'danger');
            return STOP;
          }
          return null;
        case 'importCsv':
          try {
            const result = await importTable(step.table);
            if (!result) return STOP;
            if (ui.toast) {
              ui.toast(`Imported ${result.added} record${result.added === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped}` : ''}.`,
                result.skipped ? 'warning' : 'success');
            }
          } catch (error) {
            if (ui.toast) ui.toast(error.message || 'Could not import.', 'danger');
            return STOP;
          }
          return null;
        case 'deleteRecord': {
          if (!ctx || !ctx.record || !ctx.table) return null;
          if (step.confirm === 'yes' && ui.confirm && !(await ui.confirm('Delete this record? This cannot be undone.'))) return STOP;
          try {
            await remove(ctx.table, ctx.record._id);
          } catch (error) {
            if (ui.toast) ui.toast(`Could not delete: ${error.message || 'unknown error'}`, 'danger');
            return STOP;
          }
          return null;
        }
        case 'clear':
          Object.keys(state.values).forEach(name => {
            const spec = inputSpec(elements[name]);
            setValue(name, spec.kind === 'yesno' ? 'No' : '');
          });
          return null;
        case 'setValue':
          setValue(step.target, tokens(step.value, ctx));
          return null;
        case 'setText':
          if (elements[step.target]) {
            if (elements[step.target].type === 'input') setValue(step.target, tokens(step.value, ctx));
            else {
              state.texts[step.target] = tokens(step.value, ctx);
              refresh(step.target);
            }
          }
          return null;
        case 'show':
        case 'hide':
          if (elements[step.target]) {
            if (step.type === 'hide') state.hidden.add(step.target);
            else state.hidden.delete(step.target);
            refresh(step.target);
          }
          return null;
        case 'if': {
          const pass = compare(value(step.left, ctx), step.op, tokens(step.right, ctx));
          return runList(pass ? step.then : step.else, depth + 1, ctx);
        }
        case 'openTool':
          if (step.tool && ui.openTool) ui.openTool(step.tool);
          return null;
        case 'openUrl':
          if (step.url && ui.openUrl) ui.openUrl(step.url, step.newTab === 'yes');
          return null;
        case 'stop':
          return STOP;
        default:
          return null;
      }
    }

    let running = Promise.resolve();
    // Runs a step list. Lists run one at a time, in order.
    function run(list, ctx) {
      if (opts.editing || !list || !list.length) return Promise.resolve();
      running = running.then(() => runList(list, 1, ctx || null)).catch(error => {
        console.error('[dashboard] page steps:', error);
        if (ui.toast) ui.toast('Something went wrong running those steps.', 'danger');
      });
      return running;
    }

    function dispose() {
      state.disposed = true;
      if (!opts.shared) disposeShared({ data: state.data });
    }

    return {
      page,
      editing: Boolean(opts.editing),
      user,
      isManager: Boolean(opts.isManager),
      elements,
      tables,
      state,
      setUi(next) { ui = next || {}; },
      tokens,
      inputSpec,
      value,
      setValue,
      isHidden: name => state.hidden.has(name),
      text: name => (state.texts[name] !== undefined ? state.texts[name] : null),
      table,
      watch,
      count,
      save,
      remove,
      exportTable,
      importTable,
      stopEditing,
      run,
      started: () => running,
      dispose
    };
  }

  function disposeShared(shared) {
    Object.values((shared && shared.data) || {}).forEach(entry => {
      if (typeof entry.unsubscribe === 'function') {
        try { entry.unsubscribe(); } catch (error) { /* already gone */ }
      }
      entry.listeners.clear();
    });
    if (shared) shared.data = {};
  }

  root.MTW_PAGE_RUNTIME = { create, compare, disposeShared, createShared: () => ({ data: {} }) };
})(typeof self !== 'undefined' ? self : this);
