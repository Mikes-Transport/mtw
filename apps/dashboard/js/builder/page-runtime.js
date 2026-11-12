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

    function tokens(text) {
      return String(text === undefined || text === null ? '' : text).replace(/\{([a-z][a-z0-9_]{0,39})\}/g, (match, name) => {
        if (name === 'user') return user;
        if (name === 'today') return today();
        if (name === 'now') return nowText();
        if (elements[name]) return String(value(name));
        return match;
      });
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
        state.data[tableId] = entry;
        const update = rows => {
          entry.rows = rows;
          entry.loaded = true;
          entry.error = null;
          entry.listeners.forEach(fn => fn(entry));
        };
        const fail = error => {
          entry.error = error;
          entry.loaded = true;
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
    function value(name) {
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
    async function save(tableId) {
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
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      record._createdAt = Date.now();
      record._createdBy = user;
      await api.addDoc(collectionRef(tableId), record);
      return record;
    }

    async function remove(tableId, id) {
      if (typeof api.deleteDoc !== 'function' || typeof api.doc !== 'function') throw new Error('The dashboard database is unavailable.');
      await api.deleteDoc(api.doc(api.db, c.dataCollection(opts.toolId, tableId), id));
    }

    // ---------- running steps ----------
    const STOP = { stop: true };

    async function runList(list, depth) {
      for (const step of list || []) {
        if (state.disposed) return STOP;
        const result = await runStep(step, depth);
        if (result === STOP) return STOP;
      }
      return null;
    }

    async function runStep(step, depth) {
      switch (step.type) {
        case 'save':
          try {
            await save(step.table);
          } catch (error) {
            if (ui.toast) ui.toast(error.message || 'Could not save.', 'danger');
            return STOP;
          }
          return null;
        case 'message':
          if (ui.toast) ui.toast(tokens(step.text), step.tone);
          return null;
        case 'confirm': {
          const yes = ui.confirm ? await ui.confirm(tokens(step.text)) : true;
          return yes ? null : STOP;
        }
        case 'clear':
          Object.keys(state.values).forEach(name => {
            const spec = inputSpec(elements[name]);
            setValue(name, spec.kind === 'yesno' ? 'No' : '');
          });
          return null;
        case 'setValue':
          setValue(step.target, tokens(step.value));
          return null;
        case 'setText':
          if (elements[step.target]) {
            if (elements[step.target].type === 'input') setValue(step.target, tokens(step.value));
            else {
              state.texts[step.target] = tokens(step.value);
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
          const pass = compare(value(step.left), step.op, tokens(step.right));
          return runList(pass ? step.then : step.else, depth + 1);
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
    function run(list) {
      if (opts.editing || !list || !list.length) return Promise.resolve();
      running = running.then(() => runList(list, 1)).catch(error => {
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
