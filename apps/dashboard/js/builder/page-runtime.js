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

  // "3 days", "4h", "90 min" -> minutes (null if it isn't a length of time).
  function durationMinutes(text) {
    const m = String(text === undefined || text === null ? '' : text).trim().toLowerCase()
      .match(/^(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)$/);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = m[2][0];
    return unit === 'w' ? n * 10080 : unit === 'd' ? n * 1440 : unit === 'h' ? n * 60 : unit === 's' ? n / 60 : n;
  }

  // Like compare, but "3 days" etc. on the right count as minutes (timer values).
  function compareTime(left, op, right) {
    const minutes = durationMinutes(right);
    return compare(left, op, minutes === null ? right : minutes);
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

  // The first colour rule that matches a record (rules: see core sanitizeColorRules).
  // A rule with minutes also needs the field to have had its value that long.
  // def: the record's data table, so Timer and date fields compare as times.
  function colorFor(rules, record, now, def) {
    const c = core();
    const at = now || Date.now();
    for (const rule of rules || []) {
      if (!rule || (!rule.background && !rule.color)) continue;
      if (def && rule.field) {
        if (!matchField(def, record, rule.field, rule.op, rule.value, at)) continue;
      } else {
        let v = record ? (rule.field ? record[rule.field] : record.value) : '';
        if (v === true) v = 'Yes';
        if (v === false) v = 'No';
        if (!compareTime(v, rule.op, rule.value)) continue;
      }
      if (rule.minutes && rule.field && at - c.sinceOf(record, rule.field) < rule.minutes * 60000) continue;
      return rule;
    }
    return null;
  }

  // One field of a record against a value. Timer fields compare as time (exactly, so
  // "10 seconds" works); a date field against "3 days" etc. means "that long ago".
  function matchField(def, record, key, op, raw, now) {
    if (!record) return false;
    const field = def && def.fields.find(f => f.key === key);
    const minutes = durationMinutes(raw);
    let v = record[key];
    if (field && field.type === 'timer') {
      const ms = fieldMs(field, record, now);
      v = Number.isFinite(ms) ? ms / 60000 : '';
    } else if (minutes !== null && field && field.type === 'date') {
      const when = parseWhen(v);
      v = Number.isFinite(when) ? ((now || Date.now()) - when) / 60000 : '';
    }
    if (v === true) v = 'Yes';
    if (v === false) v = 'No';
    return compare(v, op, minutes === null ? raw : minutes);
  }

  // A Timer field's time for a record, in ms (NaN while it isn't counting).
  function fieldMs(field, record, now) {
    if (!field || field.type !== 'timer' || !record) return NaN;
    const c = core();
    let at = now || Date.now();
    if (field.stopField) {
      const stop = record[field.stopField];
      // Filled in: the timer holds at the moment it was filled in.
      if (stop !== undefined && stop !== null && String(stop).trim() !== '') at = Math.min(at, c.sinceOf(record, field.stopField) || at);
    }
    if (field.from) {
      const v = record[field.from];
      // Nothing in the field yet: not counting.
      if (v === undefined || v === null || String(v).trim() === '') return NaN;
      if (field.whileValue && !compare(v, 'equals', field.whileValue)) return NaN;
      if (field.fromMode === 'value') {
        const when = parseWhen(v);
        return Number.isFinite(when) ? at - when : NaN; // negative: still to come
      }
      const start = c.sinceOf(record, field.from);
      return start ? Math.max(0, at - start) : NaN;
    }
    const start = Number(record._createdAt) || 0;
    return start ? Math.max(0, at - start) : NaN;
  }

  function fieldTimerText(field, record) {
    const ms = fieldMs(field, record);
    if (!Number.isFinite(ms)) return '';
    return ms < 0 ? `in ${core().formatDuration(-ms + 999)}` : core().formatDuration(ms);
  }

  // The record as steps and colour rules see it: Timer fields as whole minutes.
  function viewRecord(def, record) {
    if (!def || !record || !def.fields.some(f => f.type === 'timer')) return record;
    const out = { ...record };
    def.fields.forEach(f => {
      if (f.type !== 'timer') return;
      const ms = fieldMs(f, record);
      out[f.key] = Number.isFinite(ms) ? Math.trunc(ms / 60000) : '';
    });
    return out;
  }

  // "2026-12-24 17:00", "2026-12-24", "17:00" (today), or a timestamp -> ms (NaN if not a time).
  function parseWhen(text) {
    const v = String(text === undefined || text === null ? '' : text).trim();
    if (!v) return NaN;
    if (/^\d{12,}$/.test(v)) return Number(v);
    const time = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (time) {
      const d = new Date();
      d.setHours(Number(time[1]), Number(time[2]), Number(time[3] || 0), 0);
      return d.getTime();
    }
    const date = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (date) {
      return new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]),
        Number(date[4] || 0), Number(date[5] || 0), Number(date[6] || 0)).getTime();
    }
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : NaN;
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
      // stopwatch tile name -> { elapsed, startedAt (null when paused) }
      timers: {},
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
      if (block.type === 'stat' && block.props.source === 'timer' && block.props.timerFrom === 'open') {
        state.timers[block.name] = { elapsed: 0, startedAt: block.props.timerAuto === 'no' ? null : Date.now() };
      }
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
      const p = block.props;
      if (!p.filterField) return entry.rows.length;
      const want = tokens(p.filterValue);
      const def = tables[p.table];
      return entry.rows.filter(row => matchField(def, row, p.filterField, p.filterOp || 'equals', want)).length;
    }

    // ---------- element values ----------
    function value(name, ctx) {
      if (typeof name === 'string' && name.startsWith('record.')) {
        if (!ctx || !ctx.record) return '';
        const shown = ctx.table && tables[ctx.table] ? viewRecord(tables[ctx.table], ctx.record) : ctx.record;
        return fmtValue(shown[name.slice(7)]);
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
        case 'stat': return p.source === 'count' ? count(block)
          : p.source === 'timer' ? (Number.isFinite(timerMs(name)) ? Math.floor(timerMs(name) / 60000) : '') : p.value;
        case 'records': {
          const entry = table(p.table);
          return entry ? entry.rows.length : 0;
        }
        case 'table': return p.rows.length;
        case 'list': return c.listItems(p.items).length;
        default: return '';
      }
    }

    // Does a table's rows meet { table, match, howMany, field, op, value }?
    // { pass, hits }, or pass null while the table is still loading.
    function rowsMatch(cond, ctx) {
      const def = tables[cond.table];
      const entry = def ? table(cond.table) : null;
      if (!entry || !entry.loaded || entry.error) return { pass: null, hits: [] };
      const rows = entry.rows.filter(row => !row._preview || opts.dryRun);
      const where = (cond.where || (cond.field ? [{ field: cond.field, op: cond.op, value: cond.value }] : []))
        .filter(w => w.field).map(w => ({ ...w, want: tokens(w.value, ctx) }));
      const hits = rows.filter(row => where.every(w => matchField(def, row, w.field, w.op, w.want)));
      const pass = cond.match === 'none' ? hits.length === 0
        : cond.match === 'all' ? rows.length > 0 && hits.length === rows.length
          : cond.match === 'atLeast' ? hits.length >= cond.howMany : hits.length > 0;
      return { pass, hits };
    }

    // Elements with "Only show when..." follow their rule; others the Show / Hide steps.
    function isHidden(name) {
      const block = elements[name];
      if (block && block.showWhen) return !block.showWhen.rules.every(rule => rowsMatch(rule).pass === true);
      return state.hidden.has(name);
    }

    // ---------- timers ----------
    // Milliseconds shown by a timer tile (NaN when its date / time isn't a time yet).
    function timerMs(name) {
      const block = elements[name];
      if (!block || block.type !== 'stat' || block.props.source !== 'timer') return NaN;
      const p = block.props;
      const now = Date.now();
      if (p.timerFrom === 'open') {
        const t = state.timers[name] || { elapsed: 0, startedAt: null };
        return t.elapsed + (t.startedAt ? now - t.startedAt : 0);
      }
      if (p.timerFrom === 'record') {
        // Time since the newest matching record was added (or its field got the value).
        const entry = tables[p.table] ? table(p.table) : null;
        if (!entry || !entry.loaded) return NaN;
        const want = p.filterField ? tokens(p.filterValue) : '';
        let latest = 0;
        entry.rows.forEach(row => {
          if (row._preview && !opts.dryRun) return;
          if (p.filterField && !compare(row[p.filterField], 'equals', want)) return;
          const at = p.filterField && p.timerEvent === 'changed' ? c.sinceOf(row, p.filterField) : Number(row._createdAt) || 0;
          if (at > latest) latest = at;
        });
        return latest ? Math.max(0, now - latest) : NaN;
      }
      const at = parseWhen(tokens(p.timerAt));
      if (!Number.isFinite(at)) return NaN;
      return p.timerKind === 'until' ? Math.max(0, at - now) : Math.max(0, now - at);
    }

    function timerText(name) {
      const block = elements[name];
      const ms = timerMs(name);
      if (!Number.isFinite(ms)) return block.props.timerFrom === 'record' ? 'Not yet' : '-';
      if (block.props.timerFrom === 'date' && block.props.timerKind === 'until' && ms <= 0) return block.props.doneText || '0s';
      return c.formatDuration(block.props.timerFrom === 'date' && block.props.timerKind === 'until' ? ms + 999 : ms, block.props.timerFormat);
    }

    function timerStep(type, name) {
      const t = state.timers[name];
      if (!t) return;
      const now = Date.now();
      if (type === 'startTimer' && !t.startedAt) t.startedAt = now;
      if (type === 'pauseTimer' && t.startedAt) {
        t.elapsed += now - t.startedAt;
        t.startedAt = null;
      }
      if (type === 'resetTimer') {
        t.elapsed = 0;
        if (t.startedAt) t.startedAt = now;
      }
      refresh(name);
    }

    // Once a second while something on screen ticks (timers, "time since" columns).
    const tickers = new Set();
    let tickId = null;
    function onTick() {
      tickers.forEach(item => {
        if (item.node.isConnected) item.seen = true;
        else if (item.seen || Date.now() - item.added > 10000) {
          tickers.delete(item);
          return;
        }
        try { item.fn(); } catch (error) { tickers.delete(item); }
      });
      if (!tickers.size && tickId !== null) {
        root.clearInterval(tickId);
        tickId = null;
      }
    }
    function tick(node, fn) {
      fn();
      if (state.disposed) return;
      tickers.add({ node, fn, seen: false, added: Date.now() });
      if (tickId === null) tickId = root.setInterval(onTick, 1000);
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

    // Builder preview: changes show in lists straight away but only in memory (marked
    // _preview), never in Firestore. The builder drops them when preview ends.
    let previewCount = 0;
    function previewChange(tableId, fn) {
      const entry = table(tableId);
      if (!entry) return;
      entry.rows = fn(entry.rows.slice());
      entry.loaded = true;
      entry.listeners.forEach(listener => listener(entry));
    }

    async function save(tableId, mode) {
      const def = tables[tableId];
      if (!def) throw new Error('Pick a data table for the Save step.');
      const record = {};
      const missing = [];
      def.fields.forEach(field => {
        if (field.type === 'timer') return;
        const input = Object.values(elements).find(block => block.type === 'input' && block.props.bind === `${tableId}.${field.key}`);
        let v = input ? String(value(input.name)).trim() : '';
        if (field.required && !v) missing.push(input ? (input.props.label || field.label) : field.label);
        if (field.type === 'image' && v !== '' && !c.safeUrl(v)) {
          throw new Error(`${field.label} must be a web address starting with https://`);
        }
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
        const entry = state.data[tableId];
        const before = entry && entry.rows.find(row => row._id === editing.id);
        stampChanges(def, record, before);
        if (opts.dryRun) {
          previewChange(tableId, rows => rows.map(row => (row._id === editing.id ? { ...row, ...record, _preview: true } : row)));
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
      stampChanges(def, record, null);
      if (opts.dryRun) { // builder preview: shows in lists, nothing is written
        previewCount += 1;
        previewChange(tableId, rows => rows.concat({ ...record, _id: `preview-${previewCount}`, _preview: true }));
        return record;
      }
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      await api.addDoc(collectionRef(tableId), record);
      return record;
    }

    // Notes when each field got its value (_since_<field>) for timers and colour rules.
    function stampChanges(def, record, before) {
      const now = Date.now();
      def.fields.forEach(field => {
        if (!(field.key in record) || field.type === 'timer') return;
        if (!before || String(before[field.key] === undefined || before[field.key] === null ? '' : before[field.key]) !== String(record[field.key])) {
          record[`_since_${field.key}`] = now;
        }
      });
      return record;
    }

    // People adding a row straight into a list: values by field key.
    async function addValues(tableId, values) {
      const def = tables[tableId];
      if (!def) throw new Error('Unknown table.');
      const record = {};
      const missing = [];
      def.fields.forEach(field => {
        if (field.type === 'timer') return;
        const raw = values && values[field.key] !== undefined ? values[field.key] : (field.type === 'yesno' ? 'No' : '');
        const checked = coerce(field, raw);
        if (checked.error) throw new Error(checked.error);
        if (field.required && (checked.value === '' || checked.value === undefined)) missing.push(field.label);
        record[field.key] = checked.value;
      });
      if (missing.length) throw new Error(`Please fill in: ${missing.join(', ')}.`);
      record._createdAt = Date.now();
      record._createdBy = user;
      stampChanges(def, record, null);
      if (opts.dryRun) {
        previewCount += 1;
        previewChange(tableId, rows => rows.concat({ ...record, _id: `preview-${previewCount}`, _preview: true }));
        return record;
      }
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      await api.addDoc(collectionRef(tableId), record);
      return record;
    }

    // Checks one value for a field: { value } or { error }.
    function coerce(field, raw) {
      let v = raw === undefined || raw === null ? '' : String(raw).trim();
      if (field.type === 'image' && v !== '' && !c.safeUrl(v)) return { error: `${field.label} must be a web address starting with https://` };
      if (field.type === 'number' && v !== '') {
        const n = Number(v.replace(/,/g, ''));
        if (!Number.isFinite(n)) return { error: `${field.label} must be a number.` };
        return { value: n };
      }
      if (field.type === 'yesno' && v !== '') v = /^(yes|y|true|1)$/i.test(v) ? 'Yes' : 'No';
      return { value: v.slice(0, c.LIMITS.text) };
    }

    // Manage data: change one field of a record directly.
    async function updateRecord(tableId, id, key, raw) {
      const def = tables[tableId];
      const field = def && def.fields.find(f => f.key === key);
      if (!field) throw new Error('Unknown field.');
      if (field.type === 'timer') throw new Error(`${field.label} counts by itself.`);
      const checked = coerce(field, raw);
      if (checked.error) throw new Error(checked.error);
      const entry = state.data[tableId];
      const before = entry && entry.rows.find(row => row._id === id);
      const change = stampChanges(def, { [key]: checked.value }, before || {});
      if (opts.dryRun) {
        previewChange(tableId, rows => rows.map(row => (row._id === id ? { ...row, ...change, _preview: true } : row)));
        return checked.value;
      }
      if (typeof api.updateDoc !== 'function' || typeof api.doc !== 'function') throw new Error('The dashboard database is unavailable.');
      await api.updateDoc(api.doc(api.db, c.dataCollection(opts.toolId, tableId), id),
        { ...change, _updatedAt: Date.now(), _updatedBy: user });
      return checked.value;
    }

    // Manage data: a new, empty record (fields blank).
    async function addRecord(tableId) {
      const def = tables[tableId];
      if (!def) throw new Error('Unknown table.');
      const record = {};
      def.fields.forEach(f => { if (f.type !== 'timer') record[f.key] = f.type === 'yesno' ? 'No' : ''; });
      record._createdAt = Date.now();
      record._createdBy = user;
      stampChanges(def, record, null);
      if (opts.dryRun) {
        previewCount += 1;
        const id = `preview-${previewCount}`;
        previewChange(tableId, rows => rows.concat({ ...record, _id: id, _preview: true }));
        return id;
      }
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      const ref = await api.addDoc(collectionRef(tableId), record);
      return ref && ref.id;
    }

    async function remove(tableId, id) {
      if (opts.dryRun) {
        previewChange(tableId, rows => rows.filter(row => row._id !== id));
        return;
      }
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
      const rows = entry.rows.map(row => def.fields.map(f => (f.type === 'timer' ? fieldTimerText(f, row) : fmtValue(row[f.key])))
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
      const keys = c.matchColumns(header, def).map(key => (key && def.fields.find(f => f.key === key).type === 'timer' ? null : key));
      if (!keys.some(Boolean)) throw new Error(`None of the file's columns match ${def.name}'s fields (${def.fields.map(f => f.label).join(', ')}).`);
      const rows = [];
      const skipped = [];
      parsed.slice(1, 2001).forEach((cells, i) => {
        const record = {};
        def.fields.forEach(f => { if (f.type !== 'timer') record[f.key] = ''; });
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
      if (opts.dryRun) {
        const now = Date.now();
        previewChange(tableId, list => list.concat(rows.map((row, i) => ({ ...row, _createdAt: now + i, _createdBy: user, _id: `preview-import-${now}-${i}`, _preview: true }))));
        return { added: rows.length, skipped: skipped.length };
      }
      if (typeof api.addDoc !== 'function') throw new Error('The dashboard database is unavailable.');
      const now = Date.now();
      for (let i = 0; i < rows.length; i += 1) {
        await api.addDoc(collectionRef(tableId), stampChanges(def, { ...rows[i], _createdAt: now + i, _createdBy: user }, null));
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
        case 'ifRows': {
          const def = tables[step.table];
          if (!def) return runList(step.else, depth + 1, ctx);
          const entry = table(step.table);
          if (!entry.loaded) await Promise.race([entry.ready, new Promise(resolve => root.setTimeout(resolve, 8000))]);
          const { pass, hits } = rowsMatch(step, ctx);
          const next = pass && hits.length && step.match !== 'none' ? { ...(ctx || {}), record: hits[0], table: step.table, count: hits.length } : ctx;
          return runList(pass ? step.then : step.else, depth + 1, next);
        }
        case 'if': {
          const pass = compareTime(value(step.left, ctx), step.op, tokens(step.right, ctx));
          return runList(pass ? step.then : step.else, depth + 1, ctx);
        }
        case 'openTool':
          if (step.tool && ui.openTool) ui.openTool(step.tool);
          return null;
        case 'openUrl':
          if (step.url && ui.openUrl) ui.openUrl(step.url, step.newTab === 'yes');
          return null;
        case 'startTimer':
        case 'pauseTimer':
        case 'resetTimer':
          timerStep(step.type, step.target);
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

    // ---------- automations ----------
    const timers = [];
    const unwatchers = [];

    // Starts the page's automations (and its "When the page opens" steps). Called once
    // the page is on screen; dispose() stops them.
    function start() {
      if (opts.editing || state.started) return;
      state.started = true;
      run(page.onOpen);
      (page.automations || []).forEach(auto => {
        if (!auto.steps.length) return;
        if (auto.when === 'timerDone' && elements[auto.target]) {
          let left = timerMs(auto.target);
          timers.push(root.setInterval(() => {
            if (state.disposed) return;
            const now = timerMs(auto.target);
            if (left > 0 && now <= 0) run(auto.steps);
            left = now;
          }, 1000));
        } else if (auto.when === 'recordTimer' && tables[auto.table] && auto.field) {
          const entry = table(auto.table);
          let fired = null; // record id + when it got the value
          const check = () => {
            if (state.disposed || !entry.loaded || entry.error) return;
            const now = Date.now();
            const due = entry.rows.filter(row => (!row._preview || opts.dryRun)
              && compare(row[auto.field], auto.op, auto.value)
              && now - c.sinceOf(row, auto.field) >= auto.minutes * 60000);
            const keys = due.map(row => `${row._id}:${c.sinceOf(row, auto.field)}`);
            if (fired === null) { // already overdue when the page opened: don't run for those
              fired = new Set(keys);
              return;
            }
            due.forEach((row, i) => {
              if (fired.has(keys[i])) return;
              fired.add(keys[i]);
              run(auto.steps, { record: row, table: auto.table });
            });
          };
          const listener = () => check();
          entry.listeners.add(listener);
          unwatchers.push(() => entry.listeners.delete(listener));
          timers.push(root.setInterval(check, 5000));
          check();
        } else if (auto.when === 'interval') {
          run(auto.steps); // once straight away, then every N seconds
          timers.push(root.setInterval(() => {
            if (!state.disposed) run(auto.steps);
          }, Math.max(5, auto.seconds) * 1000));
        } else if (auto.when === 'tableChange' && tables[auto.table]) {
          const entry = table(auto.table);
          let known = null; // id -> JSON of the record, after the first load
          const listener = current => {
            if (state.disposed || !current.loaded || current.error) return;
            const now = new Map(current.rows.filter(row => !row._preview || opts.dryRun).map(row => [row._id, row]));
            if (known === null) {
              known = new Map([...now].map(([id, row]) => [id, JSON.stringify(row)]));
              return;
            }
            const events = [];
            now.forEach((row, id) => {
              if (!known.has(id)) events.push(['added', row]);
              else if (known.get(id) !== JSON.stringify(row)) events.push(['changed', row]);
            });
            known.forEach((json, id) => {
              if (!now.has(id)) events.push(['deleted', JSON.parse(json)]);
            });
            known = new Map([...now].map(([id, row]) => [id, JSON.stringify(row)]));
            events.slice(0, 20).forEach(([kind, record]) => {
              if (auto.change === 'any' || auto.change === kind) run(auto.steps, { record, table: auto.table, change: kind });
            });
          };
          entry.listeners.add(listener);
          listener(entry);
          unwatchers.push(() => entry.listeners.delete(listener));
        }
      });
    }

    // Called by the page when a popup opens or closes.
    function popupEvent(name, kind) {
      if (opts.editing || state.disposed) return;
      (page.automations || []).forEach(auto => {
        if (auto.popup === name && auto.when === (kind === 'open' ? 'popupOpen' : 'popupClose')) run(auto.steps);
      });
    }

    function dispose() {
      timers.forEach(id => root.clearInterval(id));
      if (tickId !== null) root.clearInterval(tickId);
      tickers.clear();
      unwatchers.forEach(fn => fn());
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
      isHidden,
      rowsMatch,
      text: name => (state.texts[name] !== undefined ? state.texts[name] : null),
      table,
      watch,
      count,
      save,
      remove,
      exportTable,
      importTable,
      start,
      popupEvent,
      updateRecord,
      addRecord,
      addValues,
      timerMs,
      timerText,
      tick,
      coerce,
      stopEditing,
      run,
      started: () => running,
      dispose
    };
  }

  // Removes preview-only rows (see previewChange) from a shared cache.
  function clearPreview(shared) {
    Object.values((shared && shared.data) || {}).forEach(entry => {
      const before = entry.rows.length;
      entry.rows = entry.rows.filter(row => !row._preview);
      if (entry.rows.length !== before) entry.listeners.forEach(listener => listener(entry));
    });
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

  root.MTW_PAGE_RUNTIME = { create, matchField, compare, compareTime, durationMinutes, colorFor, parseWhen, fieldMs, fieldTimerText, viewRecord, disposeShared, clearPreview, createShared: () => ({ data: {} }) };
})(typeof self !== 'undefined' ? self : this);
