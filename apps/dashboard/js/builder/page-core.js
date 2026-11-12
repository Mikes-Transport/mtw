// Page builder model: no DOM, no Firebase. Used by the builder and the renderer in the
// browser (window.MTW_PAGE_CORE) and by the Node tests (require()).
//
// A page is { version, sections: [ { id, layout, style, columns: [ { id, blocks: [
// { id, type, props, style } ] } ] } ] }. Everything read from Firestore goes through
// sanitizePage(), so the renderer can trust the shape: known block types only,
// bounded strings, whitelisted style values, http(s)/relative URLs only.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTW_PAGE_CORE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ sections: 60, blocks: 400, text: 4000, short: 200, tables: 20, fields: 40, columns: 20, rows: 200, cell: 500, steps: 60 });

  // Column layouts a section can use (fractions of the row).
  const LAYOUTS = Object.freeze({
    '1': [1],
    '1-1': [1, 1],
    '2-1': [2, 1],
    '1-2': [1, 2],
    '1-1-1': [1, 1, 1],
    '1-1-1-1': [1, 1, 1, 1]
  });
  const LAYOUT_LABELS = Object.freeze({
    '1': 'One column',
    '1-1': 'Two columns',
    '2-1': 'Wide + narrow',
    '1-2': 'Narrow + wide',
    '1-1-1': 'Three columns',
    '1-1-1-1': 'Four columns'
  });

  const ALIGN = ['left', 'center', 'right'];
  const TONES = ['info', 'success', 'warning', 'danger'];

  // Block types: what the palette offers and what the inspector edits.
  // Field types: text, textarea, select, number, url, tool, color, plus the structured
  // ones: grid (table columns + rows), actions (When -> Do steps), table (a data table),
  // bind (a data table field), field (a field of the block's table), fieldpick (several).
  const BLOCKS = Object.freeze({
    heading: {
      label: 'Heading', group: 'Text',
      defaults: { text: 'New heading', level: 'h2' },
      fields: [
        { key: 'text', label: 'Text', type: 'text' },
        { key: 'level', label: 'Size', type: 'select', options: [['h1', 'Large'], ['h2', 'Medium'], ['h3', 'Small']] }
      ]
    },
    text: {
      label: 'Text', group: 'Text',
      defaults: { text: 'Write something here.' },
      fields: [{ key: 'text', label: 'Text', type: 'textarea' }]
    },
    list: {
      label: 'List', group: 'Text',
      defaults: { items: 'First item\nSecond item\nThird item', ordered: 'no' },
      fields: [
        { key: 'items', label: 'Items (one per line)', type: 'textarea' },
        { key: 'ordered', label: 'Numbered', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] }
      ]
    },
    notice: {
      label: 'Notice', group: 'Text',
      defaults: { tone: 'info', title: 'Heads up', text: 'Something people should know.' },
      fields: [
        { key: 'tone', label: 'Type', type: 'select', options: [['info', 'Info'], ['success', 'Success'], ['warning', 'Warning'], ['danger', 'Danger']] },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' }
      ]
    },
    button: {
      label: 'Button', group: 'Interactive',
      defaults: { label: 'Open', variant: 'primary', actions: [] },
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'variant', label: 'Style', type: 'select', options: [['primary', 'Solid'], ['secondary', 'Outline']] },
        { key: 'actions', label: 'When clicked, do', type: 'actions' }
      ]
    },
    input: {
      label: 'Input', group: 'Interactive',
      defaults: { label: 'Your answer', bind: '', kind: 'text', placeholder: '', required: 'no', options: '', defaultValue: '', actions: [] },
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'bind', label: 'Save into (data table field)', type: 'bind' },
        { key: 'kind', label: 'Type', type: 'select', options: [['text', 'Short text'], ['longtext', 'Long text'], ['number', 'Number'], ['date', 'Date'], ['choice', 'Dropdown'], ['yesno', 'Yes / no']], when: { bind: '' } },
        { key: 'options', label: 'Choices (one per line)', type: 'textarea', when: { bind: '', kind: 'choice' } },
        { key: 'required', label: 'Required', type: 'select', options: [['no', 'No'], ['yes', 'Yes']], when: { bind: '' } },
        { key: 'placeholder', label: 'Hint inside the box', type: 'text' },
        { key: 'defaultValue', label: 'Starting value', type: 'text', tokens: true },
        { key: 'actions', label: 'When changed, do', type: 'actions' }
      ]
    },
    records: {
      label: 'Records list', group: 'Data',
      defaults: { table: '', columns: [], order: 'newest', limit: 50, search: 'yes', allowDelete: 'no', emptyText: 'Nothing here yet.' },
      fields: [
        { key: 'table', label: 'Data table', type: 'table' },
        { key: 'columns', label: 'Columns to show (none ticked = all)', type: 'fieldpick' },
        { key: 'order', label: 'Order', type: 'select', options: [['newest', 'Newest first'], ['oldest', 'Oldest first']] },
        { key: 'limit', label: 'Show at most', type: 'number', min: 1, max: 500 },
        { key: 'search', label: 'Search box', type: 'select', options: [['yes', 'Show'], ['no', 'Hide']] },
        { key: 'allowDelete', label: 'Delete button on rows', type: 'select', options: [['no', 'Nobody'], ['managers', 'Managers only'], ['everyone', 'Everyone who can see the tool']] },
        { key: 'emptyText', label: 'Text when empty', type: 'text' }
      ]
    },
    card: {
      label: 'Card', group: 'Layout',
      defaults: { title: 'Card title', text: 'Card text.' },
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' }
      ]
    },
    stat: {
      label: 'Number tile', group: 'Layout',
      defaults: { label: 'Orders today', source: 'static', value: '24', table: '', filterField: '', filterValue: '', note: '' },
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'source', label: 'Number comes from', type: 'select', options: [['static', 'What I type'], ['count', 'Count of records in a data table']] },
        { key: 'value', label: 'Number or value', type: 'text', when: { source: 'static' } },
        { key: 'table', label: 'Data table', type: 'table', when: { source: 'count' } },
        { key: 'filterField', label: 'Only count where', type: 'field', when: { source: 'count' } },
        { key: 'filterValue', label: 'equals', type: 'text', when: { source: 'count' } },
        { key: 'note', label: 'Small note', type: 'text' }
      ]
    },
    divider: { label: 'Divider', group: 'Layout', defaults: {}, fields: [] },
    spacer: {
      label: 'Spacer', group: 'Layout',
      defaults: { height: 32 },
      fields: [{ key: 'height', label: 'Height (px)', type: 'number', min: 4, max: 400 }]
    },
    table: {
      label: 'Table', group: 'Data',
      defaults: {
        header: 'yes',
        columns: [{ id: 'k-name', label: 'Name' }, { id: 'k-role', label: 'Role' }, { id: 'k-phone', label: 'Phone' }],
        rows: [{ id: 'r-1', cells: { 'k-name': 'Sam', 'k-role': 'Stores', 'k-phone': '021 000 000' } }]
      },
      fields: [
        { key: 'header', label: 'Show headings', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] },
        { key: 'columns', label: 'Columns and rows', type: 'grid' }
      ]
    },
    image: {
      label: 'Image', group: 'Media',
      defaults: { src: '', alt: '', fit: 'contain', height: 0 },
      fields: [
        { key: 'src', label: 'Image address', type: 'url' },
        { key: 'alt', label: 'Description (for screen readers)', type: 'text' },
        { key: 'fit', label: 'Fit', type: 'select', options: [['contain', 'Whole image'], ['cover', 'Fill and crop']] },
        { key: 'height', label: 'Height (px, 0 = automatic)', type: 'number', min: 0, max: 1200 }
      ]
    },
    embed: {
      label: 'Embed', group: 'Media',
      defaults: { url: '', height: 420, title: 'Embedded page' },
      fields: [
        { key: 'url', label: 'Page address (https://)', type: 'url' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'height', label: 'Height (px)', type: 'number', min: 80, max: 2000 }
      ]
    }
  });

  // Data table field types.
  const FIELD_TYPES = Object.freeze({
    text: 'Short text',
    longtext: 'Long text',
    number: 'Number',
    date: 'Date',
    choice: 'Dropdown',
    yesno: 'Yes / no'
  });

  // Comparisons for If steps.
  const OPS = [
    ['equals', 'equal to'], ['notEquals', 'not equal to'], ['contains', 'containing'],
    ['empty', 'empty'], ['notEmpty', 'not empty'], ['greater', 'more than'], ['less', 'less than']
  ];

  // "When -> Do" steps (button clicked, input changed, page opened), run in order.
  // Steps refer to elements by their element name; text can use {element_name}.
  const ACTIONS = Object.freeze({
    save: {
      group: 'Data', label: 'Save inputs to a table', description: 'Adds a record from the inputs saved into that table.',
      defaults: { table: '' },
      fields: [{ key: 'table', label: 'Data table', type: 'table' }]
    },
    message: {
      group: 'Messages', label: 'Show a message', description: 'A short message at the top of the page.',
      defaults: { text: 'Saved.', tone: 'success' },
      fields: [
        { key: 'text', label: 'Message', type: 'text', tokens: true },
        { key: 'tone', label: 'Type', type: 'select', options: [['success', 'Success'], ['info', 'Info'], ['warning', 'Warning'], ['danger', 'Danger']] }
      ]
    },
    confirm: {
      group: 'Messages', label: 'Ask to confirm', description: 'Stops here unless they press Yes.',
      defaults: { text: 'Are you sure?' },
      fields: [{ key: 'text', label: 'Question', type: 'text', tokens: true }]
    },
    clear: {
      group: 'Elements', label: 'Clear inputs', description: 'Empties every input on the page, e.g. after saving so the form is ready for the next one.',
      defaults: {},
      fields: []
    },
    setValue: {
      group: 'Elements', label: 'Set an input', description: 'Fills an input with a value.',
      defaults: { target: '', value: '{today}' },
      fields: [
        { key: 'target', label: 'Input', type: 'input' },
        { key: 'value', label: 'Value', type: 'text', tokens: true }
      ]
    },
    setText: {
      group: 'Elements', label: 'Set an element\'s text', description: 'Changes a heading, text, tile number, notice or button label.',
      defaults: { target: '', value: '' },
      fields: [
        { key: 'target', label: 'Element', type: 'element' },
        { key: 'value', label: 'New text', type: 'text', tokens: true }
      ]
    },
    show: {
      group: 'Elements', label: 'Show an element', description: 'Makes a hidden element visible.',
      defaults: { target: '' },
      fields: [{ key: 'target', label: 'Element', type: 'element' }]
    },
    hide: {
      group: 'Elements', label: 'Hide an element', description: 'Hides an element until it is shown again.',
      defaults: { target: '' },
      fields: [{ key: 'target', label: 'Element', type: 'element' }]
    },
    if: {
      group: 'Logic', label: 'If / then / else', description: 'Runs Then or Else depending on a value.',
      defaults: { left: '', op: 'equals', right: '', then: [], else: [] },
      fields: [
        { key: 'left', label: 'If', type: 'element' },
        { key: 'op', label: 'is', type: 'select', options: OPS },
        { key: 'right', label: 'Value', type: 'text', tokens: true, when: { op: ['equals', 'notEquals', 'contains', 'greater', 'less'] } },
        { key: 'then', label: 'Then', type: 'steps' },
        { key: 'else', label: 'Else', type: 'steps' }
      ]
    },
    stop: {
      group: 'Logic', label: 'Stop', description: 'Stops running the remaining steps.',
      defaults: {},
      fields: []
    },
    openTool: {
      group: 'Go to', label: 'Open a dashboard tool', description: 'Switches to another tool.',
      defaults: { tool: '' },
      fields: [{ key: 'tool', label: 'Tool', type: 'tool' }]
    },
    openUrl: {
      group: 'Go to', label: 'Open a web address', description: 'Goes to a page or opens it in a new tab.',
      defaults: { url: '', newTab: 'yes' },
      fields: [
        { key: 'url', label: 'Web address', type: 'url' },
        { key: 'newTab', label: 'Open in a new tab', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] }
      ]
    }
  });

  // Look controls every block (and section) gets. Values are validated on load.
  const STYLE_FIELDS = Object.freeze([
    { key: 'align', label: 'Align', type: 'select', options: [['', 'Default'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] },
    { key: 'color', label: 'Text colour', type: 'color' },
    { key: 'background', label: 'Background', type: 'color' },
    { key: 'fontSize', label: 'Text size (px)', type: 'number', min: 8, max: 96 },
    { key: 'fontWeight', label: 'Weight', type: 'select', options: [['', 'Default'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold']] },
    { key: 'padding', label: 'Inner spacing (px)', type: 'number', min: 0, max: 120 },
    { key: 'marginBottom', label: 'Space below (px)', type: 'number', min: 0, max: 200 },
    { key: 'radius', label: 'Rounded corners (px)', type: 'number', min: 0, max: 60 },
    { key: 'border', label: 'Border', type: 'select', options: [['', 'None'], ['line', 'Thin line'], ['strong', 'Strong line']] },
    { key: 'shadow', label: 'Shadow', type: 'select', options: [['', 'None'], ['soft', 'Soft'], ['strong', 'Strong']] },
    { key: 'className', label: 'CSS classes (global CSS)', type: 'text' }
  ]);

  const SECTION_FIELDS = Object.freeze([
    { key: 'layout', label: 'Columns', type: 'select', options: Object.keys(LAYOUTS).map(key => [key, LAYOUT_LABELS[key]]) },
    { key: 'gap', label: 'Gap between columns (px)', type: 'number', min: 0, max: 120 },
    { key: 'valign', label: 'Line up columns', type: 'select', options: [['stretch', 'Same height'], ['start', 'Top'], ['center', 'Middle'], ['end', 'Bottom']] }
  ]);

  // ---------- ids ----------

  let counter = 0;
  function newId(prefix) {
    counter = (counter + 1) % 1e6;
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${random}`.slice(0, 40);
  }

  const ID_RE = /^[a-z]{1,3}-[a-z0-9]{1,36}$/;
  const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
  const BIND_RE = /^[a-z]{1,3}-[a-z0-9]{1,36}\.[a-z][a-z0-9_]{0,39}$/;
  const TOOL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  // A field key from a label: "Rego number" -> "rego_number".
  function slug(label) {
    const base = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '');
    return (base || 'field').slice(0, 32);
  }

  function uniqueKey(label, taken) {
    const base = slug(label);
    let key = base;
    let n = 2;
    while (taken.includes(key)) key = `${base}_${n++}`.slice(0, 40);
    return key;
  }

  // The name an input's value goes by (its element name).
  function inputKey(block) {
    return block && block.type === 'input' ? block.name || '' : '';
  }

  // Firestore collection that holds a data table's records.
  function dataCollection(toolId, tableId) {
    return `dashboard-data-${toolId}-${tableId}`;
  }

  // ---------- value validation ----------

  function str(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' ? String(value).slice(0, max) : '';
  }

  function num(value, min, max, fallback) {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function pick(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  // Colours: #rgb / #rrggbb / #rrggbbaa, or a CSS variable from the global theme.
  function color(value) {
    const v = str(value, 60).trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
    if (/^var\(--[a-z0-9-]{1,40}\)$/i.test(v)) return v;
    return '';
  }

  // Only http(s), protocol-relative is refused, site-relative paths are fine.
  function safeUrl(value) {
    const v = str(value, 2000).trim();
    if (!v) return '';
    if (/^https?:\/\/[^\s<>"']+$/i.test(v)) return v;
    if (/^\/(?!\/)[^\s<>"']*$/.test(v)) return v;
    return '';
  }

  // Embeds need a full https address.
  function safeEmbedUrl(value) {
    const v = safeUrl(value);
    return /^https:\/\//i.test(v) ? v : '';
  }

  function classNames(value) {
    return str(value, 200).split(/\s+/).filter(name => /^[A-Za-z_-][A-Za-z0-9_-]{0,60}$/.test(name)).slice(0, 8).join(' ');
  }

  function sanitizeStyle(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    const align = pick(s.align, ALIGN, '');
    if (align) out.align = align;
    const c = color(s.color);
    if (c) out.color = c;
    const bg = color(s.background);
    if (bg) out.background = bg;
    const fontSize = num(s.fontSize, 8, 96, null);
    if (fontSize !== null) out.fontSize = fontSize;
    const fontWeight = pick(String(s.fontWeight || ''), ['400', '500', '600', '700', '800'], '');
    if (fontWeight) out.fontWeight = fontWeight;
    const padding = num(s.padding, 0, 120, null);
    if (padding !== null) out.padding = padding;
    const marginBottom = num(s.marginBottom, 0, 200, null);
    if (marginBottom !== null) out.marginBottom = marginBottom;
    const radius = num(s.radius, 0, 60, null);
    if (radius !== null) out.radius = radius;
    const border = pick(s.border, ['line', 'strong'], '');
    if (border) out.border = border;
    const shadow = pick(s.shadow, ['soft', 'strong'], '');
    if (shadow) out.shadow = shadow;
    const className = classNames(s.className);
    if (className) out.className = className;
    return out;
  }

  // Older pages: "a | b | c" text, first row as headings.
  function legacyGrid(p) {
    let columns;
    let rows;
    const parsed = tableRows(p.rows);
    const width = parsed.reduce((max, row) => Math.max(max, row.length), 0);
    const hasHeader = p.header !== 'no';
    columns = Array.from({ length: Math.min(width, LIMITS.columns) }, (_, i) => ({
      id: newId('k'), label: hasHeader && parsed[0] ? (parsed[0][i] || '') : `Column ${i + 1}`
    }));
    rows = parsed.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + LIMITS.rows).map(cellsList => {
      const cells = {};
      columns.forEach((col, i) => { cells[col.id] = str(cellsList[i], LIMITS.cell); });
      return { id: newId('r'), cells };
    });
    return { columns, rows };
  }

  function sanitizeGrid(p, defaults) {
    let columns;
    let rows;
    if (typeof p.rows === 'string') {
      return legacyGrid(p);
    }
    if (Array.isArray(p.columns)) {
      const seen = new Set();
      columns = p.columns.filter(col => col && typeof col === 'object').slice(0, LIMITS.columns).map(col => {
        let id = typeof col.id === 'string' && ID_RE.test(col.id) && !seen.has(col.id) ? col.id : newId('k');
        while (seen.has(id)) id = newId('k');
        seen.add(id);
        return { id, label: str(col.label, LIMITS.short) };
      });
      const seenRows = new Set();
      rows = (Array.isArray(p.rows) ? p.rows : []).filter(row => row && typeof row === 'object').slice(0, LIMITS.rows).map(row => {
        let id = typeof row.id === 'string' && ID_RE.test(row.id) && !seenRows.has(row.id) ? row.id : newId('r');
        while (seenRows.has(id)) id = newId('r');
        seenRows.add(id);
        const raw = row.cells && typeof row.cells === 'object' ? row.cells : {};
        const cells = {};
        columns.forEach(col => { cells[col.id] = str(raw[col.id], LIMITS.cell); });
        return { id, cells };
      });
    } else {
      return { columns: clone(defaults.columns), rows: clone(defaults.rows) };
    }
    return { columns, rows };
  }

  const MAX_DEPTH = 4;

  function sanitizeStep(raw, depth, budget) {
    if (!raw || typeof raw !== 'object' || !ACTIONS[raw.type]) return null;
    if (budget.left <= 0) return null;
    budget.left -= 1;
    const def = ACTIONS[raw.type];
    const step = { id: typeof raw.id === 'string' && ID_RE.test(raw.id) && !budget.ids.has(raw.id) ? raw.id : newId('a'), type: raw.type };
    budget.ids.add(step.id);
    def.fields.forEach(field => {
      const value = raw[field.key];
      const fallback = def.defaults[field.key];
      step[field.key] = field.type === 'steps'
        ? (depth < MAX_DEPTH ? sanitizeList(value, depth + 1, budget) : [])
        : sanitizeValue(field, value === undefined ? fallback : value, fallback, raw.type);
    });
    return step;
  }

  function sanitizeList(list, depth, budget) {
    return (Array.isArray(list) ? list : []).map(item => sanitizeStep(item, depth, budget)).filter(Boolean);
  }

  // A step list (with nested If branches): at most LIMITS.steps steps in all.
  function sanitizeActions(list) {
    return sanitizeList(list, 1, { left: LIMITS.steps, ids: new Set() });
  }

  function sanitizeValue(field, value, fallback, type) {
    switch (field.type) {
      case 'select':
        return pick(value, field.options.map(option => option[0]), fallback);
      case 'number':
        return num(value, field.min, field.max, fallback);
      case 'url':
        return type === 'embed' ? safeEmbedUrl(value) : safeUrl(value);
      case 'tool':
        return TOOL_RE.test(str(value, 80)) ? str(value, 80) : '';
      case 'table':
        return typeof value === 'string' && ID_RE.test(value) ? value : '';
      case 'bind':
        return typeof value === 'string' && BIND_RE.test(value) ? value : '';
      case 'field':
        return typeof value === 'string' && KEY_RE.test(value) ? value : '';
      case 'input':
      case 'element':
        return typeof value === 'string' && KEY_RE.test(value) ? value : '';
      case 'fieldpick':
        return (Array.isArray(value) ? value : []).filter(key => typeof key === 'string' && KEY_RE.test(key))
          .filter((key, i, all) => all.indexOf(key) === i).slice(0, LIMITS.fields);
      case 'actions':
        return sanitizeActions(value);
      case 'textarea':
        return value === undefined ? fallback : str(value, LIMITS.text);
      default:
        return value === undefined ? fallback : str(value, LIMITS.short);
    }
  }

  function sanitizeProps(type, raw) {
    const def = BLOCKS[type];
    const p = raw && typeof raw === 'object' ? { ...raw } : {};
    // Older buttons had one action (link or tool) instead of a step list.
    if (type === 'button' && !Array.isArray(p.actions) && (p.action || p.url || p.tool)) {
      p.actions = p.action === 'tool'
        ? [{ type: 'openTool', tool: p.tool }]
        : p.url ? [{ type: 'openUrl', url: p.url, newTab: p.newTab === 'yes' ? 'yes' : 'no' }] : [];
    }
    const out = {};
    def.fields.forEach(field => {
      if (field.type === 'grid') {
        Object.assign(out, sanitizeGrid(p, def.defaults));
        return;
      }
      const fallback = def.defaults[field.key];
      const value = p[field.key];
      out[field.key] = sanitizeValue(field, value === undefined ? (Array.isArray(fallback) ? clone(fallback) : fallback) : value, fallback, type);
    });
    return out;
  }

  // ---------- data tables ----------

  function sanitizeTables(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(t => t && typeof t === 'object').slice(0, LIMITS.tables).map(raw => {
      let id = typeof raw.id === 'string' && ID_RE.test(raw.id) && !seen.has(raw.id) ? raw.id : newId('t');
      while (seen.has(id)) id = newId('t');
      seen.add(id);
      const keys = [];
      const fields = (Array.isArray(raw.fields) ? raw.fields : []).filter(f => f && typeof f === 'object')
        .slice(0, LIMITS.fields).map(f => {
          const key = typeof f.key === 'string' && KEY_RE.test(f.key) && !keys.includes(f.key) ? f.key : uniqueKey(f.label, keys);
          keys.push(key);
          return {
            key,
            label: str(f.label, LIMITS.short) || key,
            type: FIELD_TYPES[f.type] ? f.type : 'text',
            required: f.required === true,
            options: str(f.options, LIMITS.text)
          };
        });
      return { id, name: str(raw.name, 80) || 'Untitled table', fields };
    });
  }

  function findTable(page, tableId) {
    return (page.tables || []).find(table => table.id === tableId) || null;
  }

  function addTable(page, name) {
    const next = clone(page);
    next.tables = next.tables || [];
    if (next.tables.length >= LIMITS.tables) throw new Error('This page has the maximum number of data tables.');
    const table = {
      id: newId('t'),
      name: str(name, 80) || `Table ${next.tables.length + 1}`,
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true, options: '' },
        { key: 'notes', label: 'Notes', type: 'longtext', required: false, options: '' }
      ]
    };
    next.tables.push(table);
    return { page: next, id: table.id };
  }

  function updateTable(page, tableId, changes) {
    const next = clone(page);
    const table = findTable(next, tableId);
    if (!table) return page;
    if (changes.name !== undefined) table.name = str(changes.name, 80);
    return next;
  }

  function removeTable(page, tableId) {
    const next = clone(page);
    next.tables = (next.tables || []).filter(table => table.id !== tableId);
    return next;
  }

  function addField(page, tableId, label, type) {
    const next = clone(page);
    const table = findTable(next, tableId);
    if (!table) return { page, key: null };
    if (table.fields.length >= LIMITS.fields) throw new Error('This table has the maximum number of fields.');
    const key = uniqueKey(label || 'Field', table.fields.map(f => f.key));
    table.fields.push({ key, label: str(label, LIMITS.short) || 'Field', type: FIELD_TYPES[type] ? type : 'text', required: false, options: '' });
    return { page: next, key };
  }

  // Keys never change (saved records use them); labels, types and choices can.
  function updateField(page, tableId, key, changes) {
    const next = clone(page);
    const table = findTable(next, tableId);
    const field = table && table.fields.find(f => f.key === key);
    if (!field) return page;
    if (changes.label !== undefined) field.label = str(changes.label, LIMITS.short);
    if (changes.type !== undefined && FIELD_TYPES[changes.type]) field.type = changes.type;
    if (changes.required !== undefined) field.required = changes.required === true;
    if (changes.options !== undefined) field.options = str(changes.options, LIMITS.text);
    return next;
  }

  function removeField(page, tableId, key) {
    const next = clone(page);
    const table = findTable(next, tableId);
    if (!table) return page;
    table.fields = table.fields.filter(f => f.key !== key);
    return next;
  }

  function moveField(page, tableId, key, index) {
    const next = clone(page);
    const table = findTable(next, tableId);
    if (!table) return page;
    table.fields = moveInList(table.fields, f => f.key === key, index);
    return next;
  }

  // ---------- list helpers (columns, rows, steps) ----------

  // Moves the matching item to `index` (as the list looks before the move).
  function moveInList(list, match, index) {
    const from = list.findIndex(match);
    if (from === -1) return list.slice();
    const next = list.slice();
    let at = clampIndex(index, next.length);
    if (from < at) at -= 1;
    const [item] = next.splice(from, 1);
    next.splice(at, 0, item);
    return next;
  }

  const grid = {
    addColumn(props, label) {
      if (props.columns.length >= LIMITS.columns) throw new Error('A table can have at most 20 columns.');
      const id = newId('k');
      return {
        ...props,
        columns: props.columns.concat({ id, label: str(label, LIMITS.short) }),
        rows: props.rows.map(row => ({ ...row, cells: { ...row.cells, [id]: '' } }))
      };
    },
    removeColumn(props, columnId) {
      return {
        ...props,
        columns: props.columns.filter(col => col.id !== columnId),
        rows: props.rows.map(row => {
          const cells = { ...row.cells };
          delete cells[columnId];
          return { ...row, cells };
        })
      };
    },
    moveColumn(props, columnId, index) {
      return { ...props, columns: moveInList(props.columns, col => col.id === columnId, index) };
    },
    setHeading(props, columnId, label) {
      return { ...props, columns: props.columns.map(col => (col.id === columnId ? { ...col, label: str(label, LIMITS.short) } : col)) };
    },
    addRow(props) {
      if (props.rows.length >= LIMITS.rows) throw new Error('A table can have at most 200 rows.');
      const cells = {};
      props.columns.forEach(col => { cells[col.id] = ''; });
      return { ...props, rows: props.rows.concat({ id: newId('r'), cells }) };
    },
    removeRow(props, rowId) {
      return { ...props, rows: props.rows.filter(row => row.id !== rowId) };
    },
    moveRow(props, rowId, index) {
      return { ...props, rows: moveInList(props.rows, row => row.id === rowId, index) };
    },
    setCell(props, rowId, columnId, value) {
      return {
        ...props,
        rows: props.rows.map(row => (row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: str(value, LIMITS.cell) } } : row))
      };
    }
  };

  // Step lists by path: [] is the top list; [stepId, 'then'] is that If's Then list, and
  // so on. Every helper returns a new top list.
  const steps = {
    get(root, path) {
      let list = root;
      for (let i = 0; i < path.length; i += 2) {
        const step = list.find(item => item.id === path[i]);
        if (!step || !Array.isArray(step[path[i + 1]])) return null;
        list = step[path[i + 1]];
      }
      return list;
    },
    set(root, path, list) {
      if (!path.length) return list;
      const [id, branch, ...rest] = path;
      return root.map(step => (step.id === id ? { ...step, [branch]: steps.set(step[branch], rest, list) } : step));
    },
    count(list) {
      return list.reduce((sum, step) => sum + 1 + (step.then ? steps.count(step.then) : 0) + (step.else ? steps.count(step.else) : 0), 0);
    },
    find(root, id, path) {
      const here = path || [];
      const list = steps.get(root, here) || [];
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].id === id) return { path: here, index: i, step: list[i] };
        for (const branch of ['then', 'else']) {
          if (Array.isArray(list[i][branch])) {
            const found = steps.find(root, id, here.concat(list[i].id, branch));
            if (found) return found;
          }
        }
      }
      return null;
    },
    add(root, path, type, index) {
      if (!ACTIONS[type]) throw new Error(`Unknown step: ${type}`);
      if (steps.count(root) >= LIMITS.steps) throw new Error('A list can run at most 60 steps.');
      if (type === 'if' && path.length / 2 >= MAX_DEPTH - 1) throw new Error('Ifs can be nested at most 3 deep.');
      const list = steps.get(root, path);
      if (!list) return { list: root, id: null };
      const step = sanitizeStep({ type, ...clone(ACTIONS[type].defaults) }, 1, { left: 1, ids: new Set() });
      step.id = newId('a');
      const next = list.slice();
      next.splice(clampIndex(index, next.length), 0, step);
      return { list: steps.set(root, path, next), id: step.id };
    },
    remove(root, id) {
      const found = steps.find(root, id);
      if (!found) return root;
      return steps.set(root, found.path, steps.get(root, found.path).filter(step => step.id !== id));
    },
    // Moves a step to `index` in the list at `path` (the same list or another one).
    move(root, id, path, index) {
      const found = steps.find(root, id);
      if (!found) return root;
      if (path.includes(id)) return root; // an If can't go inside itself
      const target = steps.get(root, path);
      if (!target) return root;
      if (found.path.join('/') === path.join('/')) {
        return steps.set(root, path, moveInList(target, step => step.id === id, index));
      }
      const removed = steps.set(root, found.path, steps.get(root, found.path).filter(step => step.id !== id));
      const dest = steps.get(removed, path).slice();
      dest.splice(clampIndex(index, dest.length), 0, found.step);
      return steps.set(removed, path, dest);
    },
    update(root, id, changes) {
      const found = steps.find(root, id);
      if (!found) return root;
      const list = steps.get(root, found.path).map(step => {
        if (step.id !== id) return step;
        const merged = sanitizeStep({ ...step, ...changes }, 1, { left: LIMITS.steps, ids: new Set() });
        merged.id = id;
        return merged;
      });
      return steps.set(root, found.path, list);
    }
  };

  // Every named element on a page: [{ name, type, label, block }].
  function pageElements(page) {
    const list = [];
    page.sections.forEach(section => section.columns.forEach(column => column.blocks.forEach(block => {
      if (block.name) list.push({ name: block.name, type: block.type, label: BLOCKS[block.type].label, block });
    })));
    return list;
  }

  function pageInputs(page) {
    return pageElements(page).filter(item => item.type === 'input');
  }

  // A free element name for a new block: "input_1", "button_2", ...
  function freeName(page, base, taken) {
    const used = taken || new Set(pageElements(page).map(item => item.name));
    const stem = slug(base);
    let n = 1;
    while (used.has(`${stem}_${n}`)) n += 1;
    return `${stem}_${n}`;
  }

  function renameBlock(page, blockId, name) {
    const next = clone(page);
    const found = findBlock(next, blockId);
    if (!found) return { page, name: null, error: 'Element not found.' };
    const wanted = String(name || '').trim().toLowerCase();
    if (!KEY_RE.test(wanted)) return { page, name: null, error: 'Start with a letter; use lowercase letters, numbers and _.' };
    if (pageElements(next).some(item => item.name === wanted && item.block.id !== blockId)) {
      return { page, name: null, error: `Another element is already called ${wanted}.` };
    }
    const previous = found.block.name;
    found.block.name = wanted;
    if (previous && previous !== wanted) renameReferences(next, previous, wanted);
    return { page: next, name: wanted, error: null };
  }

  // Keeps steps pointing at a renamed element: targets, If values and {name} in text.
  function renameReferences(page, from, to) {
    const token = new RegExp(`\\{${from}\\}`, 'g');
    const fixText = text => (typeof text === 'string' ? text.replace(token, `{${to}}`) : text);
    const fixList = list => (list || []).forEach(step => {
      ['target', 'left'].forEach(key => { if (step[key] === from) step[key] = to; });
      ['text', 'value', 'right'].forEach(key => { if (key in step) step[key] = fixText(step[key]); });
      fixList(step.then);
      fixList(step.else);
    });
    fixList(page.onOpen);
    page.sections.forEach(section => section.columns.forEach(column => column.blocks.forEach(block => {
      if (Array.isArray(block.props.actions)) fixList(block.props.actions);
      ['defaultValue', 'text', 'filterValue'].forEach(key => {
        if (typeof block.props[key] === 'string') block.props[key] = fixText(block.props[key]);
      });
    })));
  }

  // ---------- constructors ----------

  function createBlock(type, props, style) {
    if (!BLOCKS[type]) throw new Error(`Unknown block type: ${type}`);
    const merged = { ...clone(BLOCKS[type].defaults), ...(props || {}) };
    if (type === 'table' && props && typeof props.rows === 'string' && !props.columns) delete merged.columns;
    return {
      id: newId('b'),
      type,
      name: '',
      props: sanitizeProps(type, merged),
      style: sanitizeStyle(style)
    };
  }

  function createSection(layout, style) {
    const key = LAYOUTS[layout] ? layout : '1';
    return {
      id: newId('s'),
      layout: key,
      style: sanitizeSectionStyle(style),
      columns: LAYOUTS[key].map(() => ({ id: newId('c'), blocks: [] }))
    };
  }

  function sanitizeSectionStyle(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const out = sanitizeStyle(s);
    const gap = num(s.gap, 0, 120, null);
    if (gap !== null) out.gap = gap;
    const valign = pick(s.valign, ['stretch', 'start', 'center', 'end'], '');
    if (valign) out.valign = valign;
    return out;
  }

  function createPage() {
    return { version: VERSION, sections: [], tables: [], onOpen: [] };
  }

  // ---------- sanitize (everything read from storage) ----------

  function sanitizePage(raw) {
    const page = createPage();
    page.tables = sanitizeTables(raw && raw.tables);
    page.onOpen = sanitizeActions(raw && raw.onOpen);
    const names = new Set();
    const sections = raw && Array.isArray(raw.sections) ? raw.sections : [];
    const seen = new Set();
    const uniqueId = (value, prefix) => {
      let id = typeof value === 'string' && ID_RE.test(value) && !seen.has(value) ? value : newId(prefix);
      while (seen.has(id)) id = newId(prefix);
      seen.add(id);
      return id;
    };
    let blockCount = 0;
    sections.slice(0, LIMITS.sections).forEach(rawSection => {
      if (!rawSection || typeof rawSection !== 'object') return;
      const layout = LAYOUTS[rawSection.layout] ? rawSection.layout : '1';
      const rawColumns = Array.isArray(rawSection.columns) ? rawSection.columns : [];
      const section = {
        id: uniqueId(rawSection.id, 's'),
        layout,
        style: sanitizeSectionStyle(rawSection.style),
        columns: LAYOUTS[layout].map((_, index) => {
          const rawColumn = rawColumns[index] && typeof rawColumns[index] === 'object' ? rawColumns[index] : {};
          const blocks = [];
          (Array.isArray(rawColumn.blocks) ? rawColumn.blocks : []).forEach(rawBlock => {
            if (!rawBlock || !BLOCKS[rawBlock.type] || blockCount >= LIMITS.blocks) return;
            blockCount += 1;
            const legacyName = rawBlock.type === 'input' && rawBlock.props ? rawBlock.props.name : '';
            let name = typeof rawBlock.name === 'string' && KEY_RE.test(rawBlock.name) ? rawBlock.name
              : typeof legacyName === 'string' && KEY_RE.test(legacyName) ? legacyName : '';
            if (!name || names.has(name)) name = freeName(page, rawBlock.type, names);
            names.add(name);
            const block = {
              id: uniqueId(rawBlock.id, 'b'),
              type: rawBlock.type,
              name,
              props: sanitizeProps(rawBlock.type, rawBlock.props),
              style: sanitizeStyle(rawBlock.style)
            };
            if (rawBlock.hidden === true) block.hidden = true;
            blocks.push(block);
          });
          return { id: uniqueId(rawColumn.id, 'c'), blocks };
        })
      };
      page.sections.push(section);
    });
    return page;
  }

  // ---------- lookups ----------

  function clone(page) {
    return JSON.parse(JSON.stringify(page));
  }

  function findBlock(page, blockId) {
    for (const section of page.sections) {
      for (const column of section.columns) {
        const index = column.blocks.findIndex(block => block.id === blockId);
        if (index !== -1) return { section, column, index, block: column.blocks[index] };
      }
    }
    return null;
  }

  function findColumn(page, columnId) {
    for (const section of page.sections) {
      const column = section.columns.find(item => item.id === columnId);
      if (column) return { section, column };
    }
    return null;
  }

  function findSection(page, sectionId) {
    const index = page.sections.findIndex(section => section.id === sectionId);
    return index === -1 ? null : { section: page.sections[index], index };
  }

  function countBlocks(page) {
    return page.sections.reduce((total, section) =>
      total + section.columns.reduce((sum, column) => sum + column.blocks.length, 0), 0);
  }

  // ---------- edits (each returns a new page; the input is never changed) ----------

  function clampIndex(index, length) {
    return Number.isInteger(index) ? Math.max(0, Math.min(length, index)) : length;
  }

  // Adds a new block of `type` into a column at `index` (end if omitted). With no
  // columnId the block goes into a new one-column section at the end.
  function insertBlock(page, type, columnId, index, props) {
    const next = clone(page);
    if (countBlocks(next) >= LIMITS.blocks) throw new Error('This page has the maximum number of blocks.');
    const block = createBlock(type, props);
    block.name = freeName(next, type);
    let target = columnId ? findColumn(next, columnId) : null;
    if (!target) {
      if (next.sections.length >= LIMITS.sections) throw new Error('This page has the maximum number of sections.');
      const section = createSection('1');
      next.sections.push(section);
      target = { section, column: section.columns[0] };
      index = 0;
    }
    target.column.blocks.splice(clampIndex(index, target.column.blocks.length), 0, block);
    return { page: next, id: block.id };
  }

  // Moves a block to `index` in a column. The index is where it should land in the
  // column as it looks before the move (what a drop indicator shows).
  function moveBlock(page, blockId, columnId, index) {
    const next = clone(page);
    const from = findBlock(next, blockId);
    const to = findColumn(next, columnId);
    if (!from || !to) return page;
    let at = clampIndex(index, to.column.blocks.length);
    if (from.column.id === to.column.id && from.index < at) at -= 1;
    const [block] = from.column.blocks.splice(from.index, 1);
    to.column.blocks.splice(Math.min(at, to.column.blocks.length), 0, block);
    return next;
  }

  function stepBlock(page, blockId, delta) {
    const found = findBlock(page, blockId);
    if (!found) return page;
    const target = found.index + delta;
    if (target < 0 || target >= found.column.blocks.length) return page;
    return moveBlock(page, blockId, found.column.id, delta > 0 ? target + 1 : target);
  }

  function removeBlock(page, blockId) {
    const next = clone(page);
    const found = findBlock(next, blockId);
    if (!found) return page;
    found.column.blocks.splice(found.index, 1);
    return next;
  }

  function duplicateBlock(page, blockId) {
    const next = clone(page);
    const found = findBlock(next, blockId);
    if (!found) return { page, id: null };
    if (countBlocks(next) >= LIMITS.blocks) throw new Error('This page has the maximum number of blocks.');
    const copy = { ...clone(found.block), id: newId('b'), name: freeName(next, found.block.type) };
    found.column.blocks.splice(found.index + 1, 0, copy);
    return { page: next, id: copy.id };
  }

  function updatePageActions(page, list) {
    const next = clone(page);
    next.onOpen = sanitizeActions(list);
    return next;
  }

  function updateBlock(page, blockId, changes) {
    const next = clone(page);
    const found = findBlock(next, blockId);
    if (!found) return page;
    const block = found.block;
    if (changes.props) block.props = sanitizeProps(block.type, { ...block.props, ...changes.props });
    if (changes.style) block.style = sanitizeStyle({ ...block.style, ...changes.style });
    if (changes.hidden !== undefined) {
      if (changes.hidden === true) block.hidden = true;
      else delete block.hidden;
    }
    return next;
  }

  function addSection(page, layout, index) {
    const next = clone(page);
    if (next.sections.length >= LIMITS.sections) throw new Error('This page has the maximum number of sections.');
    const section = createSection(layout);
    next.sections.splice(clampIndex(index, next.sections.length), 0, section);
    return { page: next, id: section.id };
  }

  function moveSection(page, sectionId, index) {
    const next = clone(page);
    const found = findSection(next, sectionId);
    if (!found) return page;
    let at = clampIndex(index, next.sections.length);
    if (found.index < at) at -= 1;
    const [section] = next.sections.splice(found.index, 1);
    next.sections.splice(at, 0, section);
    return next;
  }

  function stepSection(page, sectionId, delta) {
    const found = findSection(page, sectionId);
    if (!found) return page;
    const target = found.index + delta;
    if (target < 0 || target >= page.sections.length) return page;
    return moveSection(page, sectionId, delta > 0 ? target + 1 : target);
  }

  function removeSection(page, sectionId) {
    const next = clone(page);
    const found = findSection(next, sectionId);
    if (!found) return page;
    next.sections.splice(found.index, 1);
    return next;
  }

  function duplicateSection(page, sectionId) {
    const next = clone(page);
    const found = findSection(next, sectionId);
    if (!found) return { page, id: null };
    if (next.sections.length >= LIMITS.sections) throw new Error('This page has the maximum number of sections.');
    const blocks = found.section.columns.reduce((sum, column) => sum + column.blocks.length, 0);
    if (countBlocks(next) + blocks > LIMITS.blocks) throw new Error('This page has the maximum number of blocks.');
    const copy = clone(found.section);
    copy.id = newId('s');
    const taken = new Set(pageElements(next).map(item => item.name));
    copy.columns.forEach(column => {
      column.id = newId('c');
      column.blocks.forEach(block => {
        block.id = newId('b');
        block.name = freeName(next, block.type, taken);
        taken.add(block.name);
      });
    });
    next.sections.splice(found.index + 1, 0, copy);
    return { page: next, id: copy.id };
  }

  // Changes a section's columns. Blocks from columns that go away move into the last
  // remaining column, so nothing is lost.
  function updateSection(page, sectionId, changes) {
    const next = clone(page);
    const found = findSection(next, sectionId);
    if (!found) return page;
    const section = found.section;
    if (changes.layout && LAYOUTS[changes.layout] && changes.layout !== section.layout) {
      const count = LAYOUTS[changes.layout].length;
      const columns = section.columns.slice(0, count);
      const extra = section.columns.slice(count).flatMap(column => column.blocks);
      while (columns.length < count) columns.push({ id: newId('c'), blocks: [] });
      columns[columns.length - 1].blocks.push(...extra);
      section.columns = columns;
      section.layout = changes.layout;
    }
    if (changes.style) section.style = sanitizeSectionStyle({ ...section.style, ...changes.style });
    return next;
  }

  // ---------- undo / redo ----------

  function createHistory(initial, limit) {
    const max = limit || 100;
    let past = [];
    let future = [];
    let present = initial;
    return {
      get page() { return present; },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },
      push(page) {
        if (page === present) return present;
        past.push(present);
        if (past.length > max) past = past.slice(-max);
        future = [];
        present = page;
        return present;
      },
      // Replace without a new undo step (e.g. typing into the same field).
      replace(page) {
        present = page;
        return present;
      },
      undo() {
        if (!past.length) return present;
        future.push(present);
        present = past.pop();
        return present;
      },
      redo() {
        if (!future.length) return present;
        past.push(present);
        present = future.pop();
        return present;
      },
      reset(page) {
        past = [];
        future = [];
        present = page;
        return present;
      }
    };
  }

  // Splits a table block's text into rows of cells.
  function tableRows(text) {
    return String(text || '').split('\n').map(line => line.trim()).filter(Boolean)
      .slice(0, 200).map(line => line.split('|').map(cell => cell.trim()).slice(0, 12));
  }

  function listItems(text) {
    return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 200);
  }

  function samePage(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return {
    VERSION, LIMITS, LAYOUTS, LAYOUT_LABELS, BLOCKS, STYLE_FIELDS, SECTION_FIELDS, TONES, FIELD_TYPES, ACTIONS,
    OPS, KEY_RE, slug, uniqueKey, inputKey, dataCollection, pageInputs, pageElements, freeName, renameBlock,
    updatePageActions, sanitizeActions, sanitizeTables,
    findTable, addTable, updateTable, removeTable, addField, updateField, removeField, moveField,
    moveInList, grid, steps,
    newId, createPage, createBlock, createSection, sanitizePage, sanitizeStyle, sanitizeProps,
    safeUrl, safeEmbedUrl, color, classNames,
    clone, findBlock, findColumn, findSection, countBlocks,
    insertBlock, moveBlock, stepBlock, removeBlock, duplicateBlock, updateBlock,
    addSection, moveSection, stepSection, removeSection, duplicateSection, updateSection,
    createHistory, tableRows, listItems, samePage
  };
});
