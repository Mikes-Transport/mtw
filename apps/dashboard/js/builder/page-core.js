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
  const LIMITS = Object.freeze({ sections: 60, blocks: 400, text: 4000, short: 200 });

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
  // Field types: text, textarea, select, number, url, tool, color.
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
      defaults: { label: 'Open', action: 'link', url: '', tool: '', variant: 'primary', newTab: 'no' },
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'variant', label: 'Style', type: 'select', options: [['primary', 'Solid'], ['secondary', 'Outline']] },
        { key: 'action', label: 'When clicked', type: 'select', options: [['link', 'Open a web address'], ['tool', 'Open a dashboard tool']] },
        { key: 'url', label: 'Web address', type: 'url', when: { action: 'link' } },
        { key: 'newTab', label: 'Open in a new tab', type: 'select', options: [['no', 'No'], ['yes', 'Yes']], when: { action: 'link' } },
        { key: 'tool', label: 'Tool', type: 'tool', when: { action: 'tool' } }
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
      defaults: { label: 'Orders today', value: '24', note: '' },
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'value', label: 'Number or value', type: 'text' },
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
      defaults: { rows: 'Name | Role | Phone\nSam | Stores | 021 000 000' , header: 'yes' },
      fields: [
        { key: 'rows', label: 'Rows (one per line, cells split with |)', type: 'textarea' },
        { key: 'header', label: 'First row is the header', type: 'select', options: [['yes', 'Yes'], ['no', 'No']] }
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

  function sanitizeProps(type, raw) {
    const def = BLOCKS[type];
    const p = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    def.fields.forEach(field => {
      const fallback = def.defaults[field.key];
      const value = p[field.key];
      switch (field.type) {
        case 'select':
          out[field.key] = pick(value, field.options.map(option => option[0]), fallback);
          break;
        case 'number':
          out[field.key] = num(value, field.min, field.max, fallback);
          break;
        case 'url':
          out[field.key] = type === 'embed' ? safeEmbedUrl(value) : safeUrl(value);
          break;
        case 'tool':
          out[field.key] = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(str(value, 80)) ? str(value, 80) : '';
          break;
        case 'textarea':
          out[field.key] = value === undefined ? fallback : str(value, LIMITS.text);
          break;
        default:
          out[field.key] = value === undefined ? fallback : str(value, LIMITS.short);
      }
    });
    return out;
  }

  // ---------- constructors ----------

  function createBlock(type, props, style) {
    if (!BLOCKS[type]) throw new Error(`Unknown block type: ${type}`);
    return {
      id: newId('b'),
      type,
      props: sanitizeProps(type, { ...BLOCKS[type].defaults, ...(props || {}) }),
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
    return { version: VERSION, sections: [] };
  }

  // ---------- sanitize (everything read from storage) ----------

  function sanitizePage(raw) {
    const page = createPage();
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
            blocks.push({
              id: uniqueId(rawBlock.id, 'b'),
              type: rawBlock.type,
              props: sanitizeProps(rawBlock.type, rawBlock.props),
              style: sanitizeStyle(rawBlock.style)
            });
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
    const copy = { ...clone(found.block), id: newId('b') };
    found.column.blocks.splice(found.index + 1, 0, copy);
    return { page: next, id: copy.id };
  }

  function updateBlock(page, blockId, changes) {
    const next = clone(page);
    const found = findBlock(next, blockId);
    if (!found) return page;
    const block = found.block;
    if (changes.props) block.props = sanitizeProps(block.type, { ...block.props, ...changes.props });
    if (changes.style) block.style = sanitizeStyle({ ...block.style, ...changes.style });
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
    copy.columns.forEach(column => {
      column.id = newId('c');
      column.blocks.forEach(block => { block.id = newId('b'); });
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
    VERSION, LIMITS, LAYOUTS, LAYOUT_LABELS, BLOCKS, STYLE_FIELDS, SECTION_FIELDS, TONES,
    newId, createPage, createBlock, createSection, sanitizePage, sanitizeStyle, sanitizeProps,
    safeUrl, safeEmbedUrl, color, classNames,
    clone, findBlock, findColumn, findSection, countBlocks,
    insertBlock, moveBlock, stepBlock, removeBlock, duplicateBlock, updateBlock,
    addSection, moveSection, stepSection, removeSection, duplicateSection, updateSection,
    createHistory, tableRows, listItems, samePage
  };
});
