// Drag-and-drop page builder for custom navigation tools (Managers only).
// window.MTW_PAGE_BUILDER.open(toolId, toolName) opens a full-screen editor:
//   left   palette of blocks and section layouts (drag, or click to add),
//   centre the page as it will look (global CSS), drag to move, click to select,
//   right  inspector for the selected block or section (content + look).
// Pages are stored in Firestore dashboard-tool-pages/{toolId} as { draft, published }.
// Publishing copies the draft to `published`, which is what people see in the tool.
(function (root) {
  'use strict';

  const DRAG_THRESHOLD = 5;
  const COALESCE_MS = 1500;

  const core = () => root.MTW_PAGE_CORE;
  const renderer = () => root.MTW_PAGE_RENDER;

  const TEMPLATES = {
    info: {
      label: 'Info page',
      description: 'Heading, intro, notice and links',
      build(c) {
        let page = c.createPage();
        let r = c.addSection(page, '1');
        page = r.page;
        const col = page.sections[0].columns[0].id;
        page = c.insertBlock(page, 'heading', col, 0, { text: 'Welcome', level: 'h1' }).page;
        page = c.insertBlock(page, 'text', col, 1, { text: 'Explain what this page is for and who should use it.' }).page;
        page = c.insertBlock(page, 'notice', col, 2, { tone: 'info', title: 'Good to know', text: 'Add anything people should read first.' }).page;
        r = c.addSection(page, '1-1');
        page = r.page;
        const [left, right] = page.sections[1].columns.map(column => column.id);
        page = c.insertBlock(page, 'card', left, 0, { title: 'How it works', text: 'Step one, step two.' }).page;
        page = c.insertBlock(page, 'card', right, 0, { title: 'Who to ask', text: 'Name and contact.' }).page;
        return page;
      }
    },
    tiles: {
      label: 'Number tiles',
      description: 'A row of numbers with a table below',
      build(c) {
        let page = c.createPage();
        page = c.addSection(page, '1').page;
        page = c.insertBlock(page, 'heading', page.sections[0].columns[0].id, 0, { text: 'Overview', level: 'h1' }).page;
        page = c.addSection(page, '1-1-1').page;
        const cols = page.sections[1].columns.map(column => column.id);
        [['Open jobs', '12'], ['Due today', '4'], ['Overdue', '1']].forEach(([label, value], i) => {
          page = c.insertBlock(page, 'stat', cols[i], 0, { label, value }).page;
        });
        page = c.addSection(page, '1').page;
        page = c.insertBlock(page, 'table', page.sections[2].columns[0].id, 0, {
          rows: 'Job | Customer | Due\n1001 | Smith Ltd | Today\n1002 | Jones | Friday'
        }).page;
        return page;
      }
    },
    links: {
      label: 'Quick links',
      description: 'Buttons to tools and websites',
      build(c) {
        let page = c.createPage();
        page = c.addSection(page, '1').page;
        page = c.insertBlock(page, 'heading', page.sections[0].columns[0].id, 0, { text: 'Quick links', level: 'h1' }).page;
        page = c.addSection(page, '1-1').page;
        const [left, right] = page.sections[1].columns.map(column => column.id);
        page = c.insertBlock(page, 'card', left, 0, { title: 'Barcodes', text: 'Print barcode labels.' }).page;
        page = c.insertBlock(page, 'button', left, 1, { label: 'Open Barcodes', action: 'tool', tool: 'barcodes' }).page;
        page = c.insertBlock(page, 'card', right, 0, { title: 'Website', text: 'Open our website.' }).page;
        page = c.insertBlock(page, 'button', right, 1, { label: 'Open website', action: 'link', url: 'https://', variant: 'secondary', newTab: 'yes' }).page;
        return page;
      }
    }
  };

  // Stroke icons (24x24). SVG instead of text symbols so they look the same everywhere.
  const ICON_PATHS = {
    heading: 'M6 4v16M18 4v16M6 12h12',
    text: 'M4 6h16M4 10h16M4 14h16M4 18h10',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    notice: 'M12 3l9.5 17h-19L12 3zM12 10v4M12 17h.01',
    button: 'M3 8h18v8H3zM8 12h8',
    card: 'M4 5h16v14H4zM4 10h16',
    stat: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    divider: 'M3 12h18',
    spacer: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
    table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
    embed: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-4',
    redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h4',
    close: 'M6 6l12 12M18 6L6 18',
    drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    duplicate: 'M9 9h11v11H9zM5 15H4V4h11v1',
    delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    input: 'M3 7h18v10H3zM7 11v2',
    records: 'M4 5h16M4 10h16M4 15h16M4 20h10',
    cards: 'M3 4h8v7H3zM13 4h8v7h-8zM3 13h8v7H3zM13 13h8v7h-8z',
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    plus: 'M12 5v14M5 12h14'
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'mtw-pb-svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.card);
    svg.appendChild(path);
    return svg;
  }

  function iconButton(className, name, title, onClick) {
    const node = button(className, null, title, onClick);
    node.appendChild(icon(name));
    return node;
  }

  function el(tag, className, text, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function button(className, text, title, onClick) {
    const node = el('button', className, text, { type: 'button' });
    if (title) {
      node.title = title;
      node.setAttribute('aria-label', title);
    }
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  function isTyping(target) {
    return target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]');
  }

  let current = null;

  function open(toolId, toolName) {
    if (!core() || !renderer()) throw new Error('Page builder is not loaded.');
    if (current) current.close(true);
    current = new Editor(toolId, toolName || toolId);
    return current;
  }

  function Editor(toolId, toolName) {
    const c = core();
    const api = root.MTW || {};
    const user = (root.sessionStorage && root.sessionStorage.getItem('mtw_admin_name')) || '';
    const state = {
      selected: null, // { kind: 'block' | 'section', id }
      device: 'desktop',
      preview: false,
      saved: c.createPage(),
      published: null,
      stored: {},
      lastEdit: null,
      drag: null,
      listDrag: null,
      paletteTab: 'blocks',
      logic: null, // { scope: 'page' | 'block:<id>' } while the steps editor is open
      inspectorKey: '',
      shared: root.MTW_PAGE_RUNTIME ? root.MTW_PAGE_RUNTIME.createShared() : null,
      confirmClose: false
    };
    const history = c.createHistory(c.createPage());
    const editor = this;

    // ---------- shell ----------
    const overlay = el('div', 'mtw-pb-editor', null, { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Page builder: ${toolName}` });
    const top = el('header', 'mtw-pb-top');
    const titleWrap = el('div', 'mtw-pb-top-title');
    titleWrap.append(el('span', 'mtw-pb-top-kicker', 'Page builder'), el('strong', '', toolName));
    const status = el('span', 'mtw-pb-status', 'Loading...', { role: 'status' });
    const undoBtn = iconButton('mtw-pb-icon-btn', 'undo', 'Undo (Ctrl+Z)', () => undo());
    const redoBtn = iconButton('mtw-pb-icon-btn', 'redo', 'Redo (Ctrl+Shift+Z)', () => redo());
    const devices = el('div', 'mtw-pb-seg', null, { role: 'group', 'aria-label': 'Screen size' });
    [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].forEach(([id, label]) => {
      const b = button('mtw-pb-seg-btn', label, `Show at ${label.toLowerCase()} width`, () => {
        state.device = id;
        renderCanvas();
      });
      b.dataset.device = id;
      devices.appendChild(b);
    });
    const previewBtn = button('mtw-pb-btn', 'Preview', 'Preview without editing handles', () => {
      state.preview = !state.preview;
      if (state.preview) {
        state.selected = null;
        state.logic = null;
      }
      renderAll();
    });
    const saveBtn = button('mtw-pb-btn', 'Save draft', 'Save without changing what people see', () => save(false));
    const publishBtn = button('mtw-pb-btn mtw-pb-btn-primary', 'Publish', 'Save and show this page in the tool', () => save(true));
    const closeBtn = iconButton('mtw-pb-icon-btn mtw-pb-close', 'close', 'Close the builder', () => editor.close());
    const actions = el('div', 'mtw-pb-top-actions');
    actions.append(status, undoBtn, redoBtn, devices, previewBtn, saveBtn, publishBtn, closeBtn);
    top.append(titleWrap, actions);

    const confirmBar = el('div', 'mtw-pb-confirm', null, { role: 'alertdialog' });
    confirmBar.hidden = true;

    const body = el('div', 'mtw-pb-body');
    const palette = el('aside', 'mtw-pb-palette', null, { 'aria-label': 'Blocks' });
    const stage = el('main', 'mtw-pb-stage');
    const frame = el('div', 'mtw-pb-frame');
    stage.appendChild(frame);
    const inspector = el('aside', 'mtw-pb-inspector', null, { 'aria-label': 'Settings' });
    // Steps editor: a wide panel over the page and settings while open.
    const logic = el('section', 'mtw-pb-logic', null, { 'aria-label': 'Steps editor' });
    logic.hidden = true;
    body.append(palette, stage, inspector, logic);
    overlay.append(top, confirmBar, body);

    const ghost = el('div', 'mtw-pb-ghost');
    ghost.hidden = true;
    const dropLine = el('div', 'mtw-pb-drop-line');
    overlay.append(ghost);

    // ---------- palette ----------
    function buildPalette() {
      palette.replaceChildren();
      const tabs = el('div', 'mtw-pb-tabs', null, { role: 'tablist' });
      [['blocks', 'Blocks'], ['data', 'Data']].forEach(([id, label]) => {
        const tab = button('mtw-pb-tab', label, null, () => {
          state.paletteTab = id;
          buildPalette();
        });
        tab.dataset.tab = id;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(state.paletteTab === id));
        tabs.appendChild(tab);
      });
      palette.appendChild(tabs);
      if (state.paletteTab === 'data') {
        buildDataTab();
        return;
      }
      palette.appendChild(el('p', 'mtw-pb-palette-hint', 'Drag onto the page, or click to add.'));
      palette.appendChild(el('h4', 'mtw-pb-group', 'Sections'));
      const layouts = el('div', 'mtw-pb-tiles');
      Object.keys(c.LAYOUTS).forEach(layout => {
        const tile = el('div', 'mtw-pb-tile mtw-pb-tile-layout', null, { role: 'button', tabindex: '0', title: `Add a section: ${c.LAYOUT_LABELS[layout]}` });
        tile.dataset.layout = layout;
        const bars = el('span', 'mtw-pb-layout-preview');
        c.LAYOUTS[layout].forEach(part => {
          const bar = el('i');
          bar.style.flex = String(part);
          bars.appendChild(bar);
        });
        tile.append(bars, el('span', 'mtw-pb-tile-label', c.LAYOUT_LABELS[layout]));
        tile.addEventListener('pointerdown', event => startDrag(event, { kind: 'newSection', layout, label: c.LAYOUT_LABELS[layout] }));
        tile.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            addSectionAt(layout, null);
          }
        });
        layouts.appendChild(tile);
      });
      palette.appendChild(layouts);

      const groups = {};
      Object.entries(c.BLOCKS).forEach(([type, def]) => {
        (groups[def.group] = groups[def.group] || []).push([type, def]);
      });
      Object.entries(groups).forEach(([group, items]) => {
        palette.appendChild(el('h4', 'mtw-pb-group', group));
        const tiles = el('div', 'mtw-pb-tiles');
        items.forEach(([type, def]) => {
          const tile = el('div', 'mtw-pb-tile', null, { role: 'button', tabindex: '0', title: `Add ${def.label.toLowerCase()}` });
          tile.dataset.blockType = type;
          const glyph = el('span', 'mtw-pb-tile-icon');
          glyph.appendChild(icon(type));
          tile.append(glyph, el('span', 'mtw-pb-tile-label', def.label));
          tile.addEventListener('pointerdown', event => startDrag(event, { kind: 'new', type, label: def.label }));
          tile.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              addBlockToSelection(type);
            }
          });
          tiles.appendChild(tile);
        });
        palette.appendChild(tiles);
      });
    }

    function buildDataTab() {
      palette.appendChild(el('p', 'mtw-pb-palette-hint', 'Data tables keep what people enter. Point inputs at a table\'s fields, then give a button a "Save inputs to a table" step.'));
      const list = el('div', 'mtw-pb-table-list');
      (history.page.tables || []).forEach(table => {
        const item = button('mtw-pb-table-item', null, `Edit ${table.name}`, () => select({ kind: 'table', id: table.id }));
        item.dataset.tableId = table.id;
        const glyph = el('span', 'mtw-pb-tile-icon');
        glyph.appendChild(icon('database'));
        const text = el('span');
        text.append(el('strong', '', table.name), el('span', '', `${table.fields.length} field${table.fields.length === 1 ? '' : 's'}`));
        item.append(glyph, text);
        if (state.selected && state.selected.kind === 'table' && state.selected.id === table.id) item.classList.add('is-selected');
        list.appendChild(item);
      });
      if (!(history.page.tables || []).length) list.appendChild(el('p', 'mtw-pb-muted', 'No data tables yet.'));
      palette.appendChild(list);
      const add = button('mtw-pb-btn mtw-pb-btn-light mtw-pb-add-table', '+ New data table', 'Add a data table', () => {
        const result = attempt(() => c.addTable(history.page, `Table ${(history.page.tables || []).length + 1}`));
        if (result) commit(result.page, { kind: 'table', id: result.id });
      });
      palette.appendChild(add);
    }

    // ---------- editing helpers ----------
    function commit(page, select, coalesceKey) {
      const now = Date.now();
      const last = state.lastEdit;
      if (coalesceKey && last && last.key === coalesceKey && now - last.at < COALESCE_MS) history.replace(page);
      else history.push(page);
      state.lastEdit = coalesceKey ? { key: coalesceKey, at: now } : null;
      if (select !== undefined) state.selected = select;
      renderAll(Boolean(coalesceKey));
    }

    function attempt(fn) {
      try {
        return fn();
      } catch (error) {
        flash(error.message || 'That change could not be made.', true);
        return null;
      }
    }

    function selectedColumnId() {
      const page = history.page;
      const sel = state.selected;
      if (sel && sel.kind === 'block') {
        const found = c.findBlock(page, sel.id);
        if (found) return { columnId: found.column.id, index: found.index + 1 };
      }
      if (sel && sel.kind === 'section') {
        const found = c.findSection(page, sel.id);
        if (found) {
          const column = found.section.columns[0];
          return { columnId: column.id, index: column.blocks.length };
        }
      }
      const last = page.sections[page.sections.length - 1];
      if (last) {
        const column = last.columns[last.columns.length - 1];
        return { columnId: column.id, index: column.blocks.length };
      }
      return { columnId: null, index: 0 };
    }

    function addBlockToSelection(type) {
      const target = selectedColumnId();
      const result = attempt(() => c.insertBlock(history.page, type, target.columnId, target.index));
      if (result) commit(result.page, { kind: 'block', id: result.id });
    }

    function addSectionAt(layout, index) {
      let at = index;
      if (at === null || at === undefined) {
        const sel = state.selected;
        const sectionId = sel && (sel.kind === 'section' ? sel.id : (c.findBlock(history.page, sel.id) || {}).section?.id);
        const found = sectionId ? c.findSection(history.page, sectionId) : null;
        at = found ? found.index + 1 : history.page.sections.length;
      }
      const result = attempt(() => c.addSection(history.page, layout, at));
      if (result) commit(result.page, { kind: 'section', id: result.id });
    }

    function blockAction(action, id) {
      const page = history.page;
      if (action === 'up' || action === 'down') commit(c.stepBlock(page, id, action === 'up' ? -1 : 1), { kind: 'block', id });
      else if (action === 'duplicate') {
        const result = attempt(() => c.duplicateBlock(page, id));
        if (result) commit(result.page, { kind: 'block', id: result.id });
      } else if (action === 'delete') commit(c.removeBlock(page, id), null);
    }

    function sectionAction(action, id) {
      const page = history.page;
      if (action === 'up' || action === 'down') commit(c.stepSection(page, id, action === 'up' ? -1 : 1), { kind: 'section', id });
      else if (action === 'duplicate') {
        const result = attempt(() => c.duplicateSection(page, id));
        if (result) commit(result.page, { kind: 'section', id: result.id });
      } else if (action === 'delete') commit(c.removeSection(page, id), null);
    }

    function undo() {
      history.undo();
      state.lastEdit = null;
      dropStaleSelection();
      renderAll();
    }

    function redo() {
      history.redo();
      state.lastEdit = null;
      dropStaleSelection();
      renderAll();
    }

    function dropStaleSelection() {
      const sel = state.selected;
      if (!sel) return;
      const exists = sel.kind === 'block' ? c.findBlock(history.page, sel.id)
        : sel.kind === 'table' ? c.findTable(history.page, sel.id) : c.findSection(history.page, sel.id);
      if (!exists) state.selected = null;
    }

    function dirty() {
      return !c.samePage(history.page, state.saved);
    }

    // ---------- canvas ----------
    function toolbar(kind, id, label) {
      const bar = el('div', `mtw-pb-toolbar mtw-pb-toolbar-${kind}`);
      const handle = el('span', 'mtw-pb-handle', null, { title: `Drag to move this ${kind}`, 'aria-hidden': 'true' });
      handle.appendChild(icon('drag'));
      handle.addEventListener('pointerdown', event => startDrag(event, { kind, id, label }, true));
      bar.append(handle, el('span', 'mtw-pb-toolbar-label', label));
      const act = kind === 'block' ? blockAction : sectionAction;
      [['up', 'Move up'], ['down', 'Move down'], ['duplicate', 'Duplicate'], ['delete', 'Delete']]
        .forEach(([action, title]) => {
          const b = iconButton(`mtw-pb-tool-btn mtw-pb-tool-${action}`, action, `${title} ${kind}`, event => {
            event.stopPropagation();
            act(action, id);
          });
          b.addEventListener('pointerdown', event => event.stopPropagation());
          bar.appendChild(b);
        });
      return bar;
    }

    function renderCanvas() {
      frame.dataset.device = state.device;
      devices.querySelectorAll('[data-device]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.device === state.device)));
      const page = history.page;
      const node = renderer().render(page, {
        editing: !state.preview, dryRun: state.preview, toolId, user, isManager: true, shared: state.shared
      });
      frame.replaceChildren(node);
      if (state.preview) return;

      node.querySelectorAll('.mtw-pb-section').forEach(sectionNode => {
        const id = sectionNode.dataset.sectionId;
        const found = c.findSection(page, id);
        sectionNode.prepend(toolbar('section', id, found.section.popup
          ? `Popup: ${found.section.title || found.section.name}`
          : `Section: ${c.LAYOUT_LABELS[found.section.layout]}`));
        sectionNode.addEventListener('click', event => {
          if (event.target.closest('.mtw-pb-item')) return;
          select({ kind: 'section', id });
        });
        if (state.selected && state.selected.kind === 'section' && state.selected.id === id) sectionNode.classList.add('is-selected');
      });
      node.querySelectorAll('.mtw-pb-item').forEach(blockNode => {
        const id = blockNode.dataset.blockId;
        const found = c.findBlock(page, id);
        blockNode.tabIndex = 0;
        blockNode.appendChild(toolbar('block', id, c.BLOCKS[found.block.type].label));
        blockNode.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          select({ kind: 'block', id });
        });
        blockNode.addEventListener('pointerdown', event => {
          if (event.pointerType === 'mouse' && !event.target.closest('.mtw-pb-toolbar')) {
            startDrag(event, { kind: 'block', id, label: c.BLOCKS[found.block.type].label });
          }
        });
        if (state.selected && state.selected.kind === 'block' && state.selected.id === id) blockNode.classList.add('is-selected');
      });

      if (!page.sections.length) {
        const empty = el('div', 'mtw-pb-empty');
        empty.append(
          el('h3', '', 'Start building'),
          el('p', '', 'Drag a block or a section from the left onto this page, or start from a template.')
        );
        const templates = el('div', 'mtw-pb-templates');
        Object.entries(TEMPLATES).forEach(([id, template]) => {
          const b = button('mtw-pb-template', null, `Use the ${template.label} template`, () => {
            commit(template.build(c), null);
          });
          b.dataset.template = id;
          b.append(el('strong', '', template.label), el('span', '', template.description));
          templates.appendChild(b);
        });
        empty.appendChild(templates);
        node.appendChild(empty);
      } else {
        const add = button('mtw-pb-add-section', '+ Add section', 'Add a one-column section at the end', () => addSectionAt('1', page.sections.length));
        node.appendChild(add);
      }
    }

    function select(selection) {
      state.selected = selection;
      state.lastEdit = null;
      renderAll();
    }

    // ---------- inspector ----------
    function recordFields(tableId) {
      const table = c.findTable(history.page, tableId);
      return table ? table.fields.map(f => [`record.${f.key}`, `${f.label} (this record)`])
        .concat([['record._createdBy', 'Added by (this record)']]) : [];
    }

    function tokenPicker(input, ctx) {
      const picker = el('select', 'mtw-pb-token', null, { 'aria-label': 'Insert a value', title: 'Insert a value' });
      const first = el('option', '', 'Insert value');
      first.value = '';
      picker.appendChild(first);
      const group = (label, items) => {
        if (!items.length) return;
        const g = el('optgroup');
        g.label = label;
        items.forEach(([value, text]) => {
          const option = el('option', '', text);
          option.value = value;
          g.appendChild(option);
        });
        picker.appendChild(g);
      };
      group('Page elements', c.pageElements(history.page).map(item => [`{${item.name}}`, `${item.name} (${item.label})`]));
      if (ctx && ctx.recordTable) group('Clicked record', recordFields(ctx.recordTable).map(([v, label]) => [`{${v}}`, label]));
      group('Other', [['{user}', 'Signed-in role'], ['{today}', 'Today\'s date'], ['{now}', 'Time now']]);
      picker.addEventListener('change', () => {
        if (!picker.value) return;
        const text = picker.value;
        const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
        const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
        input.value = input.value.slice(0, start) + text + input.value.slice(end);
        picker.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
      return picker;
    }

    function selectOf(id, options, value) {
      const input = el('select', '', null, { id });
      options.forEach(entry => {
        if (entry.group) {
          const g = el('optgroup');
          g.label = entry.group;
          entry.options.forEach(([v, label]) => {
            const option = el('option', '', label);
            option.value = v;
            g.appendChild(option);
          });
          input.appendChild(g);
          return;
        }
        const option = el('option', '', entry[1]);
        option.value = entry[0];
        input.appendChild(option);
      });
      input.value = value === undefined || value === null ? '' : String(value);
      return input;
    }

    function fieldControl(field, value, onChange, ctx) {
      const context = ctx || {};
      const id = `mtw-pb-f-${field.key}-${Math.random().toString(36).slice(2, 7)}`;
      const wrap = el('div', 'mtw-pb-field');
      wrap.dataset.field = field.key;
      wrap.appendChild(el('label', '', field.label, { for: id }));
      let input;
      const page = history.page;
      if (field.type === 'textarea') {
        input = el('textarea', '', null, { id, rows: '4' });
        input.value = value || '';
      } else if (field.type === 'select') {
        input = selectOf(id, field.options, value);
      } else if (field.type === 'tool') {
        input = selectOf(id, [['', 'Choose a tool']].concat(Object.entries(root.MTW_TOOL_REGISTRY || {})
          .filter(([toolKey]) => toolKey !== toolId)
          .map(([toolKey, tool]) => [toolKey, tool.name || toolKey])), value);
      } else if (field.type === 'table') {
        input = selectOf(id, [['', (page.tables || []).length ? 'Choose a data table' : 'No data tables yet (see the Data tab)']]
          .concat((page.tables || []).map(table => [table.id, table.name])), value);
      } else if (field.type === 'bind') {
        input = selectOf(id, [['', 'Not saved (only used by steps)']].concat((page.tables || []).map(table => ({
          group: table.name,
          options: table.fields.map(f => [`${table.id}.${f.key}`, `${table.name}: ${f.label}`])
        }))), value);
      } else if (field.type === 'field') {
        const table = c.findTable(page, context.tableId);
        input = selectOf(id, [['', field.any || 'Any record (count all)']].concat(table ? table.fields.map(f => [f.key, f.label]) : []), value);
      } else if (field.type === 'popup') {
        const popups = c.pagePopups(page);
        input = selectOf(id, [['', field.any || (popups.length ? 'Choose a popup' : 'No popups yet (set a section to Show as a popup)')]]
          .concat(popups.map(item => [item.name, `${item.title} (${item.name})`])), value);
      } else if (field.type === 'element' || field.type === 'input') {
        const items = c.pageElements(page).filter(item => field.type === 'element' || item.type === 'input');
        const options = [['', items.length ? 'Choose an element' : 'Nothing on the page yet']]
          .concat(items.map(item => [item.name, `${item.name} (${item.label})`]));
        if (field.type === 'element' && context.recordTable) options.push({ group: 'Clicked record', options: recordFields(context.recordTable) });
        input = selectOf(id, options, value);
      } else if (field.type === 'fieldpick') {
        const table = c.findTable(page, context.tableId);
        const box = el('div', 'mtw-pb-checks', null, { id });
        if (!table) box.appendChild(el('p', 'mtw-pb-muted', 'Pick a data table first.'));
        else {
          const chosen = Array.isArray(value) ? value.slice() : [];
          table.fields.forEach(f => {
            const label = el('label', 'mtw-pb-check');
            const check = el('input', '', null, { type: 'checkbox' });
            check.checked = chosen.includes(f.key);
            check.addEventListener('change', () => {
              const next = table.fields.map(item => item.key).filter(key =>
                (key === f.key ? check.checked : chosen.includes(key)));
              chosen.length = 0;
              chosen.push(...next);
              onChange(next);
            });
            label.append(check, document.createTextNode(` ${f.label}`));
            box.appendChild(label);
          });
        }
        wrap.appendChild(box);
        return wrap;
      } else if (field.type === 'color') {
        input = el('div', 'mtw-pb-color');
        const swatch = el('input', '', null, { type: 'color', 'aria-label': `${field.label} picker` });
        const text = el('input', '', null, { id, type: 'text', placeholder: 'Default' });
        text.value = value || '';
        const sync = () => {
          const v = text.value.trim();
          swatch.classList.toggle('is-empty', !/^#[0-9a-f]{6}$/i.test(v));
          if (/^#[0-9a-f]{6}$/i.test(v)) swatch.value = v;
        };
        swatch.value = '#ffffff';
        sync();
        const clear = button('mtw-pb-mini', 'Clear', `Clear ${field.label.toLowerCase()}`, () => {
          text.value = '';
          sync();
          onChange('');
        });
        swatch.addEventListener('input', () => {
          text.value = swatch.value;
          sync();
          onChange(swatch.value);
        });
        text.addEventListener('input', () => {
          sync();
          onChange(text.value.trim());
        });
        input.append(swatch, text, clear);
        wrap.appendChild(input);
        return wrap;
      } else {
        input = el('input', '', null, { id, type: field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text' });
        if (field.type === 'number') {
          if (field.min !== undefined) input.min = String(field.min);
          if (field.max !== undefined) input.max = String(field.max);
        }
        if (field.type === 'url') input.placeholder = 'https://';
        input.value = value === undefined || value === null ? '' : String(value);
      }
      const isSelect = input.tagName === 'SELECT';
      const read = () => (field.type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value);
      input.addEventListener(isSelect ? 'change' : 'input', () => onChange(read()));
      if (field.tokens && !isSelect) {
        const row = el('div', 'mtw-pb-token-row');
        row.append(input, tokenPicker(input, context));
        wrap.appendChild(row);
      } else {
        wrap.appendChild(input);
      }
      return wrap;
    }

    function visible(field, props) {
      return !field.when || Object.entries(field.when).every(([key, value]) =>
        (Array.isArray(value) ? value.includes(props[key]) : props[key] === value));
    }

    // Field types whose change can show or hide other fields, or change pickers.
    const RESHAPES = ['select', 'table', 'bind'];

    function sectionTitle(text) {
      return el('h4', 'mtw-pb-group', text);
    }

    function renderInspector() {
      const key = state.selected ? `${state.selected.kind}:${state.selected.id}` : state.preview ? 'preview' : 'page';
      const scroll = key === state.inspectorKey ? inspector.scrollTop : 0;
      state.inspectorKey = key;
      inspector.replaceChildren();
      const sel = state.selected;
      const page = history.page;
      if (state.preview) {
        inspector.append(el('h3', '', 'Preview'), el('p', 'mtw-pb-muted', 'This is how the page looks to people using the tool. Inputs, buttons, popups and steps work here, but Save, Import and Delete do not write anything. Press Edit to keep editing.'));
        return;
      }
      if (!sel) renderPageInspector(page);
      else if (sel.kind === 'block') renderBlockInspector(page, sel.id);
      else if (sel.kind === 'section') renderSectionInspector(page, sel.id);
      else if (sel.kind === 'table') renderTableInspector(page, sel.id);
      inspector.scrollTop = scroll;
    }

    function renderPageInspector(page) {
      inspector.append(
        el('h3', '', 'Page'),
        el('p', 'mtw-pb-muted', 'Click a block or a section on the page to change it. Every block has an element name that steps use to read or change it.'),
        el('p', 'mtw-pb-muted', 'Shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+D duplicate, Delete removes, Alt+Up/Down moves, Esc deselects, Ctrl+S saves a draft.'),
        el('p', 'mtw-pb-muted', `${c.countBlocks(page)} blocks in ${page.sections.length} sections, ${(page.tables || []).length} data tables.`)
      );
      inspector.appendChild(stepsSummary('When the page opens, do', 'page', history.page.onOpen || []));
    }

    function renderBlockInspector(page, blockId) {
      const found = c.findBlock(page, blockId);
      if (!found) return;
      const block = found.block;
      const def = c.BLOCKS[block.type];
      inspector.appendChild(el('h3', '', def.label));

      // Element name
      const nameWrap = el('div', 'mtw-pb-field mtw-pb-name-field');
      nameWrap.dataset.field = 'name';
      const nameId = `mtw-pb-name-${block.id}`;
      nameWrap.appendChild(el('label', '', 'Element name', { for: nameId }));
      const nameInput = el('input', '', null, { id: nameId, type: 'text', spellcheck: 'false' });
      nameInput.value = block.name || '';
      const nameError = el('p', 'mtw-pb-field-error');
      nameInput.addEventListener('change', () => {
        const result = c.renameBlock(history.page, blockId, nameInput.value);
        if (result.error) {
          nameError.textContent = result.error;
          nameInput.value = c.findBlock(history.page, blockId).block.name;
          return;
        }
        nameError.textContent = '';
        commit(result.page);
      });
      nameWrap.append(nameInput, el('p', 'mtw-pb-field-help', 'Steps use this name, and text can show its value as {name}.'), nameError);
      inspector.appendChild(nameWrap);
      const hiddenLabel = el('label', 'mtw-pb-check mtw-pb-hidden-start');
      const hiddenCheck = el('input', '', null, { type: 'checkbox' });
      hiddenCheck.checked = block.hidden === true;
      hiddenCheck.addEventListener('change', () => commit(c.updateBlock(history.page, blockId, { hidden: hiddenCheck.checked })));
      hiddenLabel.append(hiddenCheck, document.createTextNode(' Hidden at start (until a step shows it)'));
      inspector.appendChild(hiddenLabel);

      const props = block.props;
      const contentFields = def.fields.filter(field => visible(field, props));
      const plain = contentFields.filter(field => !['grid', 'actions'].includes(field.type));
      if (plain.length) {
        inspector.appendChild(sectionTitle('Content'));
        plain.forEach(field => {
          inspector.appendChild(fieldControl(field, props[field.key], value => {
            const next = c.updateBlock(history.page, blockId, { props: { [field.key]: value } });
            if (RESHAPES.includes(field.type) || field.type === 'fieldpick') commit(next);
            else commit(next, undefined, `${blockId}:p:${field.key}`);
          }, { tableId: props.table }));
        });
      }
      if (contentFields.some(field => field.type === 'grid')) renderGridEditor(blockId);
      const actionsField = contentFields.find(field => field.type === 'actions');
      if (actionsField) inspector.appendChild(stepsSummary(actionsField.label, `block:${blockId}`, props.actions || []));

      inspector.appendChild(sectionTitle('Look'));
      c.STYLE_FIELDS.forEach(field => {
        inspector.appendChild(fieldControl(field, block.style[field.key], value => {
          const next = c.updateBlock(history.page, blockId, { style: { [field.key]: value === undefined ? '' : value } });
          commit(next, undefined, `${blockId}:s:${field.key}`);
        }));
      });
      inspector.appendChild(itemActions('block', blockId));
    }

    function renderSectionInspector(page, sectionId) {
      const found = c.findSection(page, sectionId);
      if (!found) return;
      const section = found.section;
      inspector.appendChild(el('h3', '', section.popup ? 'Popup' : 'Section'));
      const popupLabel = el('label', 'mtw-pb-check mtw-pb-popup-toggle');
      const popupCheck = el('input', '', null, { type: 'checkbox' });
      popupCheck.checked = section.popup === true;
      popupCheck.addEventListener('change', () => commit(c.updateSection(history.page, sectionId, { popup: popupCheck.checked })));
      popupLabel.append(popupCheck, document.createTextNode(' Show as a popup (opens with an Open a popup step)'));
      inspector.appendChild(popupLabel);
      if (section.popup) {
        const nameWrap = el('div', 'mtw-pb-field mtw-pb-name-field');
        nameWrap.dataset.field = 'name';
        const nameId = `mtw-pb-name-${sectionId}`;
        nameWrap.appendChild(el('label', '', 'Popup name', { for: nameId }));
        const nameInput = el('input', '', null, { id: nameId, type: 'text', spellcheck: 'false' });
        nameInput.value = section.name;
        const nameError = el('p', 'mtw-pb-field-error');
        nameInput.addEventListener('change', () => {
          const result = c.renameBlock(history.page, sectionId, nameInput.value);
          if (result.error) {
            nameError.textContent = result.error;
            nameInput.value = section.name;
            return;
          }
          commit(result.page);
        });
        nameWrap.append(nameInput, nameError);
        inspector.appendChild(nameWrap);
        inspector.appendChild(fieldControl({ key: 'title', label: 'Popup title', type: 'text' }, section.title,
          value => commit(c.updateSection(history.page, sectionId, { title: value }), undefined, `${sectionId}:title`)));
      }
      c.SECTION_FIELDS.forEach(field => {
        const value = field.key === 'layout' ? found.section.layout : found.section.style[field.key];
        inspector.appendChild(fieldControl(field, value, next => {
          const changes = field.key === 'layout' ? { layout: next } : { style: { [field.key]: next === undefined ? '' : next } };
          commit(c.updateSection(history.page, sectionId, changes), undefined, `${sectionId}:x:${field.key}`);
        }));
      });
      inspector.appendChild(sectionTitle('Look'));
      c.STYLE_FIELDS.filter(field => !['fontSize', 'fontWeight'].includes(field.key)).forEach(field => {
        inspector.appendChild(fieldControl(field, found.section.style[field.key], value => {
          commit(c.updateSection(history.page, sectionId, { style: { [field.key]: value === undefined ? '' : value } }),
            undefined, `${sectionId}:s:${field.key}`);
        }));
      });
      inspector.appendChild(itemActions('section', sectionId));
    }

    // ---------- table block: column and row cards ----------
    function cardHeader(title, dragInfo, onDelete, deleteTitle) {
      const head = el('div', 'mtw-pb-card-head');
      const handle = el('span', 'mtw-pb-handle mtw-pb-card-handle', null, { title: 'Drag to reorder' });
      handle.appendChild(icon('drag'));
      handle.addEventListener('pointerdown', event => startListDrag(event, dragInfo()));
      head.append(handle, el('strong', '', title));
      const del = iconButton('mtw-pb-tool-btn mtw-pb-card-delete', 'delete', deleteTitle, onDelete);
      head.appendChild(del);
      return head;
    }

    function renderGridEditor(blockId) {
      const props = () => c.findBlock(history.page, blockId).block.props;
      const apply = (fn, coalesce) => {
        const next = attempt(() => fn(props()));
        if (next) commit(c.updateBlock(history.page, blockId, { props: next }), undefined, coalesce);
      };
      const current = props();

      inspector.appendChild(sectionTitle('Columns'));
      const cols = el('div', 'mtw-pb-cards', null, { 'data-drop-group': `cols:${blockId}` });
      current.columns.forEach((col, i) => {
        const card = el('div', 'mtw-pb-card-item', null, { 'data-drag-item': col.id });
        card.appendChild(cardHeader(`Column ${i + 1}`,
          () => ({ group: `cols:${blockId}`, id: col.id, label: col.label || `Column ${i + 1}`, onDrop: (container, index) => apply(p => c.grid.moveColumn(p, col.id, index)) }),
          () => apply(p => c.grid.removeColumn(p, col.id)), `Delete column ${col.label || i + 1}`));
        card.appendChild(fieldControl({ key: `heading-${col.id}`, label: 'Heading', type: 'text' }, col.label,
          value => apply(p => c.grid.setHeading(p, col.id, value), `${blockId}:col:${col.id}`)));
        cols.appendChild(card);
      });
      inspector.appendChild(cols);
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-add-col', '+ Add column', 'Add a column', () =>
        apply(p => c.grid.addColumn(p, `Column ${p.columns.length + 1}`))));

      inspector.appendChild(sectionTitle('Rows'));
      const rows = el('div', 'mtw-pb-cards', null, { 'data-drop-group': `rows:${blockId}` });
      current.rows.forEach((row, i) => {
        const card = el('div', 'mtw-pb-card-item', null, { 'data-drag-item': row.id });
        card.appendChild(cardHeader(`Row ${i + 1}`,
          () => ({ group: `rows:${blockId}`, id: row.id, label: `Row ${i + 1}`, onDrop: (container, index) => apply(p => c.grid.moveRow(p, row.id, index)) }),
          () => apply(p => c.grid.removeRow(p, row.id)), `Delete row ${i + 1}`));
        if (!current.columns.length) card.appendChild(el('p', 'mtw-pb-muted', 'Add a column first.'));
        current.columns.forEach((col, j) => {
          card.appendChild(fieldControl({ key: `cell-${row.id}-${col.id}`, label: col.label || `Column ${j + 1}`, type: 'text' },
            row.cells[col.id], value => apply(p => c.grid.setCell(p, row.id, col.id, value), `${blockId}:cell:${row.id}:${col.id}`)));
        });
        rows.appendChild(card);
      });
      inspector.appendChild(rows);
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-add-row', '+ Add row', 'Add a row', () =>
        apply(p => c.grid.addRow(p))));
    }

    // ---------- data table editor ----------
    function renderTableInspector(page, tableId) {
      const table = c.findTable(page, tableId);
      if (!table) return;
      inspector.appendChild(el('h3', '', 'Data table'));
      inspector.appendChild(fieldControl({ key: 'tableName', label: 'Table name', type: 'text' }, table.name,
        value => commit(c.updateTable(history.page, tableId, { name: value }), undefined, `${tableId}:name`)));

      inspector.appendChild(sectionTitle('Fields'));
      const list = el('div', 'mtw-pb-cards', null, { 'data-drop-group': `fields:${tableId}` });
      table.fields.forEach(field => {
        const card = el('div', 'mtw-pb-card-item', null, { 'data-drag-item': field.key });
        card.appendChild(cardHeader(field.label || field.key,
          () => ({ group: `fields:${tableId}`, id: field.key, label: field.label, onDrop: (container, index) => commit(c.moveField(history.page, tableId, field.key, index)) }),
          () => commit(c.removeField(history.page, tableId, field.key)), `Delete field ${field.label}`));
        card.appendChild(fieldControl({ key: `label-${field.key}`, label: 'Name', type: 'text' }, field.label,
          value => commit(c.updateField(history.page, tableId, field.key, { label: value }), undefined, `${tableId}:f:${field.key}:label`)));
        card.appendChild(fieldControl({ key: `type-${field.key}`, label: 'Type', type: 'select', options: Object.entries(c.FIELD_TYPES) }, field.type,
          value => commit(c.updateField(history.page, tableId, field.key, { type: value }))));
        if (field.type === 'choice') {
          card.appendChild(fieldControl({ key: `options-${field.key}`, label: 'Choices (one per line)', type: 'textarea' }, field.options,
            value => commit(c.updateField(history.page, tableId, field.key, { options: value }), undefined, `${tableId}:f:${field.key}:options`)));
        }
        const req = el('label', 'mtw-pb-check');
        const check = el('input', '', null, { type: 'checkbox' });
        check.checked = field.required;
        check.addEventListener('change', () => commit(c.updateField(history.page, tableId, field.key, { required: check.checked })));
        req.append(check, document.createTextNode(' Required'));
        card.append(req, el('p', 'mtw-pb-field-help', `Saved as "${field.key}".`));
        list.appendChild(card);
      });
      inspector.appendChild(list);
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-add-field', '+ Add field', 'Add a field', () => {
        const result = attempt(() => c.addField(history.page, tableId, `Field ${table.fields.length + 1}`, 'text'));
        if (result && result.key) commit(result.page);
      }));

      inspector.appendChild(sectionTitle('Shortcuts'));
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-make-form', 'Add a form and list for this table',
        'Adds inputs for every field, a Save button and a records list', () => addFormFor(tableId)));
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-make-board', 'Add a card board for this table',
        'Cards for every record, an Add button that opens a popup form, and Export/Import buttons', () => addBoardFor(tableId)));
      inspector.appendChild(el('p', 'mtw-pb-field-help', `Records are kept in Firestore "${c.dataCollection(toolId, tableId)}". Deleting the table here doesn't delete them.`));

      const remove = button('mtw-pb-btn mtw-pb-btn-light mtw-pb-delete-table', 'Delete table', `Delete ${table.name}`, () => {
        if (remove.dataset.armed === 'true') commit(c.removeTable(history.page, tableId), null);
        else {
          remove.dataset.armed = 'true';
          remove.textContent = 'Press again to delete';
        }
      });
      inspector.appendChild(remove);
    }

    // Inputs for every field + a Save button (save, message, clear) + a records list.
    function addFormFor(tableId) {
      const table = c.findTable(history.page, tableId);
      if (!table) return;
      const result = attempt(() => {
        let page = history.page;
        const added = c.addSection(page, '1-1', page.sections.length);
        page = added.page;
        const [left, right] = c.findSection(page, added.id).section.columns.map(col => col.id);
        page = c.insertBlock(page, 'heading', left, 0, { text: `Add to ${table.name}`, level: 'h3' }).page;
        table.fields.forEach((field, i) => {
          page = c.insertBlock(page, 'input', left, i + 1, { label: field.label, bind: `${tableId}.${field.key}` }).page;
        });
        const saveButton = c.insertBlock(page, 'button', left, table.fields.length + 1, { label: 'Save' });
        page = saveButton.page;
        let list = c.steps.add([], [], 'save').list;
        list = c.steps.update(list, list[0].id, { table: tableId });
        list = c.steps.add(list, [], 'message').list;
        list = c.steps.add(list, [], 'clear').list;
        page = c.updateBlock(page, saveButton.id, { props: { actions: list } });
        page = c.insertBlock(page, 'heading', right, 0, { text: table.name, level: 'h3' }).page;
        page = c.insertBlock(page, 'records', right, 1, { table: tableId }).page;
        return { page, id: saveButton.id };
      });
      if (result) commit(result.page, { kind: 'block', id: result.id });
    }

    // Card list + Add (opens a popup form that saves and closes) + Export/Import buttons.
    function addBoardFor(tableId) {
      const table = c.findTable(history.page, tableId);
      if (!table) return;
      const stepList = types => types.reduce((list, [type, values]) => {
        const added = c.steps.add(list, [], type);
        return values ? c.steps.update(added.list, added.id, values) : added.list;
      }, []);
      const result = attempt(() => {
        let page = history.page;
        // The popup form
        const popupAdded = c.addSection(page, '1', page.sections.length);
        page = c.updateSection(popupAdded.page, popupAdded.id, { popup: true, title: `Add to ${table.name}` });
        const popupSection = c.findSection(page, popupAdded.id).section;
        const popupName = popupSection.name;
        const formCol = popupSection.columns[0].id;
        table.fields.forEach((field, i) => {
          page = c.insertBlock(page, 'input', formCol, i, { label: field.label, bind: `${tableId}.${field.key}` }).page;
        });
        const save = c.insertBlock(page, 'button', formCol, table.fields.length, { label: 'Save' });
        page = c.updateBlock(save.page, save.id, { props: { actions: stepList([
          ['save', { table: tableId }], ['message', { text: 'Added.' }], ['clear'], ['closePopup', { target: popupName }]
        ]) } });
        // The board, placed before the popup section
        const board = c.addSection(page, '1-1', page.sections.length - 1);
        page = c.updateSection(board.page, board.id, { style: { valign: 'center' } });
        const [left, right] = c.findSection(page, board.id).section.columns.map(col => col.id);
        page = c.insertBlock(page, 'heading', left, 0, { text: table.name, level: 'h2' }).page;
        const add = c.insertBlock(page, 'button', right, 0, { label: `+ Add` });
        page = c.updateBlock(add.page, add.id, { props: { actions: stepList([['openPopup', { target: popupName }]]) }, style: { align: 'right' } });
        const exp = c.insertBlock(page, 'button', right, 1, { label: 'Export', variant: 'secondary' });
        page = c.updateBlock(exp.page, exp.id, { props: { actions: stepList([['exportCsv', { table: tableId }]]) }, style: { align: 'right' } });
        const imp = c.insertBlock(page, 'button', right, 2, { label: 'Import', variant: 'secondary' });
        page = c.updateBlock(imp.page, imp.id, { props: { actions: stepList([['importCsv', { table: tableId }]]) }, style: { align: 'right' } });
        const list = c.addSection(page, '1', page.sections.length - 1);
        page = list.page;
        const cards = c.insertBlock(page, 'cards', c.findSection(page, list.id).section.columns[0].id, 0, {
          table: tableId, titleField: table.fields[0] ? table.fields[0].key : '', textField: table.fields[1] ? table.fields[1].key : '', allowDelete: 'managers'
        });
        return { page: cards.page, id: cards.id };
      });
      if (result) commit(result.page, { kind: 'block', id: result.id });
    }

    // ---------- When -> Do steps ----------
    // A step list owner: 'page' (When the page opens) or 'block:<id>'.
    function scopeFor(key) {
      if (key === 'page') {
        return {
          key,
          get: () => history.page.onOpen || [],
          set: (list, coalesce) => commit(c.updatePageActions(history.page, list), undefined, coalesce)
        };
      }
      const blockId = key.slice('block:'.length);
      const owner = c.findBlock(history.page, blockId);
      const recordTable = owner && ['records', 'cards'].includes(owner.block.type) ? owner.block.props.table : '';
      return {
        key,
        recordTable,
        get: () => {
          const found = c.findBlock(history.page, blockId);
          return found && Array.isArray(found.block.props.actions) ? found.block.props.actions : [];
        },
        set: (list, coalesce) => commit(c.updateBlock(history.page, blockId, { props: { actions: list } }), undefined, coalesce)
      };
    }

    function stepLine(step) {
      const def = c.ACTIONS[step.type];
      const target = step.target || step.left || '';
      const table = step.table ? (c.findTable(history.page, step.table) || {}).name : '';
      return `${def.label}${target ? `: ${target}` : table ? `: ${table}` : ''}`;
    }

    // Nested outline of a step list: If steps show their Then / Else underneath.
    function outline(list, budget) {
      const ol = el('ol', 'mtw-pb-steps-outline');
      list.forEach(step => {
        if (budget.left <= 0) return;
        budget.left -= 1;
        const li = el('li', '', stepLine(step));
        ['then', 'else'].forEach(branch => {
          if (step[branch] && step[branch].length && budget.left > 0) {
            const sub = el('div', 'mtw-pb-outline-branch');
            sub.appendChild(el('span', 'mtw-pb-outline-label', branch === 'then' ? 'Then' : 'Else'));
            sub.appendChild(outline(step[branch], budget));
            li.appendChild(sub);
          }
        });
        ol.appendChild(li);
      });
      return ol;
    }

    function stepsSummary(title, scopeKey, list) {
      const box = el('div', 'mtw-pb-steps-summary');
      box.appendChild(sectionTitle(title));
      const count = c.steps.count(list);
      if (!count) box.appendChild(el('p', 'mtw-pb-muted', 'No steps yet.'));
      else {
        const budget = { left: 10 };
        const tree = outline(list, budget);
        tree.classList.add('mtw-pb-outline-root');
        box.appendChild(tree);
        if (count > 10) box.appendChild(el('p', 'mtw-pb-muted', `...and ${count - 10} more`));
      }
      box.appendChild(button('mtw-pb-btn mtw-pb-btn-primary-dark mtw-pb-edit-steps', count ? `Edit steps (${count})` : 'Add steps',
        'Open the steps editor', () => openLogic(scopeKey)));
      return box;
    }

    function openLogic(scopeKey) {
      state.logic = { scope: scopeKey };
      renderLogic();
      const first = logic.querySelector('.mtw-pb-logic-done');
      if (first) first.focus();
    }

    function closeLogic() {
      state.logic = null;
      renderLogic();
      renderInspector();
    }

    function renderLogic() {
      const open = Boolean(state.logic) && !state.preview;
      logic.hidden = !open;
      overlay.classList.toggle('has-logic', open);
      if (!open) {
        logic.replaceChildren();
        return;
      }
      const key = state.logic.scope;
      let title;
      let trigger;
      if (key === 'page') {
        title = 'This page';
        trigger = 'When the page opens';
      } else {
        const found = c.findBlock(history.page, key.slice('block:'.length));
        if (!found) {
          state.logic = null;
          logic.hidden = true;
          overlay.classList.remove('has-logic');
          return;
        }
        const def = c.BLOCKS[found.block.type];
        title = `${def.label}: ${found.block.props.label || found.block.name}`;
        trigger = found.block.type === 'input' ? 'When it changes'
          : found.block.type === 'records' ? 'When a row is clicked'
            : found.block.type === 'cards' ? 'When a card is clicked' : 'When it is clicked';
      }
      const scroll = logic.querySelector('.mtw-pb-logic-list') ? logic.querySelector('.mtw-pb-logic-list').scrollTop : 0;
      const head = el('header', 'mtw-pb-logic-head');
      const titles = el('div');
      titles.append(el('span', 'mtw-pb-top-kicker', 'Steps'), el('strong', '', `${title}`), el('span', 'mtw-pb-logic-trigger', `${trigger}, do these in order:`));
      head.append(titles, button('mtw-pb-btn mtw-pb-btn-primary-dark mtw-pb-logic-done', 'Done', 'Back to the page', () => closeLogic()));
      const content = el('div', 'mtw-pb-logic-body');
      const editor = stepsEditor(key);
      content.append(editor.palette, editor.list);
      logic.replaceChildren(head, content);
      editor.list.scrollTop = scroll;
    }

    function stepsEditor(scopeKey) {
      const scope = scopeFor(scopeKey);
      const tiles = el('aside', 'mtw-pb-logic-palette');
      tiles.appendChild(el('p', 'mtw-pb-field-help', 'Drag a step into the list (or into an If\'s Then / Else), or click to add it at the end.'));
      const groups = {};
      Object.entries(c.ACTIONS).forEach(([type, def]) => { (groups[def.group] = groups[def.group] || []).push([type, def]); });
      Object.entries(groups).forEach(([group, items]) => {
        tiles.appendChild(sectionTitle(group));
        const wrap = el('div', 'mtw-pb-step-tiles');
        items.filter(([, def]) => !def.needsRecord || scope.recordTable)
          .forEach(([type, def]) => wrap.appendChild(stepTile(scopeKey, type, def)));
        tiles.appendChild(wrap);
      });
      const list = el('div', 'mtw-pb-logic-list');
      list.appendChild(stepList(scope, scope.get(), [], 0));
      return { palette: tiles, list };
    }

    function stepTile(scopeKey, type, def) {
      const tile = el('div', 'mtw-pb-step-tile', null, { role: 'button', tabindex: '0', title: def.description });
      tile.dataset.stepType = type;
      tile.append(el('strong', '', def.label), el('span', '', def.description));
      tile.addEventListener('pointerdown', event => startListDrag(event, {
        group: `steps:${scopeKey}`, label: def.label, newStep: true, tap: () => dropStep({ kind: 'newStep', type, scope: scopeKey }, [], null),
        onDrop: (container, index) => dropStep({ kind: 'newStep', type, scope: scopeKey }, JSON.parse(container.dataset.path), index)
      }));
      tile.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          dropStep({ kind: 'newStep', type, scope: scopeKey }, [], null);
        }
      });
      return tile;
    }

    function stepList(scope, list, path, depth) {
      const container = el('div', 'mtw-pb-steps', null, { 'data-drop-group': `steps:${scope.key}` });
      container.dataset.path = JSON.stringify(path);
      list.forEach((step, i) => container.appendChild(stepCard(scope, step, i, depth)));
      if (!list.length) container.appendChild(el('div', 'mtw-pb-steps-empty', path.length ? 'Drop steps here' : 'No steps yet. Drag one in.'));
      const add = selectOf('', [['', '+ Add a step...']].concat(Object.entries(c.ACTIONS).map(([type, def]) => [type, def.label])), '');
      add.className = 'mtw-pb-add-step';
      add.setAttribute('aria-label', 'Add a step');
      add.addEventListener('change', () => {
        if (add.value) dropStep({ kind: 'newStep', type: add.value, scope: scope.key }, path, null);
      });
      const holder = el('div', 'mtw-pb-steps-wrap');
      holder.append(container, add);
      return holder;
    }

    function stepCard(scope, step, index, depth) {
      const def = c.ACTIONS[step.type];
      const card = el('div', `mtw-pb-step mtw-pb-step-${step.type}`, null, { 'data-drag-item': step.id });
      card.dataset.stepId = step.id;
      card.appendChild(cardHeader(`${index + 1}. ${def.label}`,
        () => ({
          group: `steps:${scope.key}`, id: step.id, label: def.label,
          onDrop: (container, at) => dropStep({ kind: 'step', id: step.id, scope: scope.key }, JSON.parse(container.dataset.path), at)
        }),
        () => scope.set(c.steps.remove(scope.get(), step.id)), `Delete step ${def.label}`));
      const body = el('div', 'mtw-pb-step-body');
      body.appendChild(el('p', 'mtw-pb-step-desc', def.description));
      def.fields.filter(field => field.type !== 'steps' && visible(field, step)).forEach(field => {
        body.appendChild(fieldControl(field, step[field.key], value => {
          const next = c.steps.update(scope.get(), step.id, { [field.key]: value });
          if (RESHAPES.includes(field.type)) scope.set(next);
          else scope.set(next, `${scope.key}:${step.id}:${field.key}`);
        }, { tableId: step.table, recordTable: scope.recordTable }));
      });
      card.appendChild(body);
      def.fields.filter(field => field.type === 'steps').forEach(field => {
        const branch = el('div', `mtw-pb-branch mtw-pb-branch-${field.key}`);
        branch.appendChild(el('span', 'mtw-pb-branch-label', field.label));
        const path = (c.steps.find(scope.get(), step.id) || { path: [] }).path.concat(step.id, field.key);
        branch.appendChild(stepList(scope, step[field.key] || [], path, depth + 1));
        card.appendChild(branch);
      });
      return card;
    }

    // Adds a new step or moves one. path: the list ([] = top, [ifId, 'then'], ...).
    function dropStep(item, path, index) {
      const scope = scopeFor(item.scope);
      const root = scope.get();
      if (item.kind === 'newStep') {
        const result = attempt(() => c.steps.add(root, path, item.type, index === null ? undefined : index));
        if (result && result.id) scope.set(result.list);
      } else {
        const next = c.steps.move(root, item.id, path, index);
        if (next !== root) scope.set(next);
      }
    }

    // ---------- drag to reorder inside the inspector (cards and steps) ----------
    function startListDrag(event, info) {
      if (event.button > 0) return;
      event.stopPropagation();
      event.preventDefault();
      state.listDrag = { info, x: event.clientX, y: event.clientY, active: false, target: null };
      document.addEventListener('pointermove', onListMove);
      document.addEventListener('pointerup', onListUp);
      document.addEventListener('pointercancel', cleanupListDrag);
    }

    function listTarget(x, y, group) {
      ghost.hidden = true;
      const under = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      ghost.hidden = false;
      if (!under || !(inspector.contains(under) || logic.contains(under))) return null;
      let container = under.closest(`[data-drop-group="${group}"]`);
      if (!container) {
        // Over a list's "Add a step" box or padding: use the list it belongs to.
        const holder = under.closest('.mtw-pb-steps-wrap');
        container = holder ? holder.querySelector(`:scope > [data-drop-group="${group}"]`) : null;
      }
      if (!container) return null;
      const items = [...container.querySelectorAll(':scope > [data-drag-item]')];
      let index = items.length;
      for (let i = 0; i < items.length; i += 1) {
        const box = items[i].getBoundingClientRect();
        if (y < box.top + box.height / 2) {
          index = i;
          break;
        }
      }
      return { container, index, items };
    }

    function onListMove(event) {
      const drag = state.listDrag;
      if (!drag) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
        drag.active = true;
        overlay.classList.add('is-dragging');
        ghost.textContent = drag.info.label || 'Move';
        ghost.hidden = false;
      }
      event.preventDefault();
      ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
      const scroller = state.logic ? logic.querySelector('.mtw-pb-logic-list') || inspector : inspector;
      const box = scroller.getBoundingClientRect();
      if (event.clientY < box.top + 40) scroller.scrollTop -= 12;
      else if (event.clientY > box.bottom - 40) scroller.scrollTop += 12;
      drag.target = listTarget(event.clientX, event.clientY, drag.info.group);
      if (!drag.target) {
        dropLine.remove();
        return;
      }
      const cBox = drag.target.container.getBoundingClientRect();
      const before = drag.target.items[drag.target.index];
      const after = drag.target.items[drag.target.index - 1];
      const top = before ? before.getBoundingClientRect().top - 5 : after ? after.getBoundingClientRect().bottom + 3 : cBox.top + 4;
      dropLine.className = 'mtw-pb-drop-line';
      dropLine.style.top = `${Math.round(top)}px`;
      dropLine.style.left = `${Math.round(cBox.left)}px`;
      dropLine.style.width = `${Math.round(cBox.width)}px`;
      if (!dropLine.isConnected) overlay.appendChild(dropLine);
    }

    function onListUp() {
      const drag = state.listDrag;
      cleanupListDrag();
      if (!drag) return;
      if (!drag.active) {
        if (drag.info.tap) drag.info.tap();
        return;
      }
      if (drag.target && drag.info.onDrop) drag.info.onDrop(drag.target.container, drag.target.index);
    }

    function cleanupListDrag() {
      state.listDrag = null;
      overlay.classList.remove('is-dragging');
      ghost.hidden = true;
      dropLine.remove();
      document.removeEventListener('pointermove', onListMove);
      document.removeEventListener('pointerup', onListUp);
      document.removeEventListener('pointercancel', cleanupListDrag);
    }

    function itemActions(kind, id) {
      const row = el('div', 'mtw-pb-item-actions');
      const act = kind === 'block' ? blockAction : sectionAction;
      [['up', 'Move up'], ['down', 'Move down'], ['duplicate', 'Duplicate'], ['delete', 'Delete']].forEach(([action, label]) => {
        row.appendChild(button(`mtw-pb-btn mtw-pb-inspector-${action}`, label, `${label} ${kind}`, () => act(action, id)));
      });
      return row;
    }

    function renderTop() {
      undoBtn.disabled = !history.canUndo;
      redoBtn.disabled = !history.canRedo;
      previewBtn.setAttribute('aria-pressed', String(state.preview));
      previewBtn.textContent = state.preview ? 'Edit' : 'Preview';
      overlay.classList.toggle('is-preview', state.preview);
      const isDirty = dirty();
      const isPublished = state.published && c.samePage(state.saved, state.published);
      saveBtn.disabled = !isDirty;
      if (!state.loading) {
        status.textContent = isDirty ? 'Unsaved changes' : isPublished ? 'Published' : state.published ? 'Draft saved, not published' : 'Draft saved';
        status.dataset.state = isDirty ? 'dirty' : isPublished ? 'published' : 'draft';
      }
    }

    // keepInspector: true while typing in the inspector, so the field keeps focus.
    function renderAll(keepInspector) {
      renderTop();
      renderCanvas();
      if (!keepInspector) renderInspector();
      if (!keepInspector) renderLogic();
      if (state.paletteTab === 'data') buildPalette();
    }

    function flash(message, isError) {
      status.textContent = message;
      status.dataset.state = isError ? 'error' : 'ok';
    }

    // ---------- drag and drop (pointer events: mouse, pen and touch) ----------
    function startDrag(event, item, fromHandle) {
      if (state.preview || event.button > 0 || isTyping(event.target)) return;
      if (fromHandle) event.stopPropagation();
      state.drag = { item, x: event.clientX, y: event.clientY, active: false, target: null, pointerId: event.pointerId };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', cancelDrag);
    }

    function onDragMove(event) {
      const drag = state.drag;
      if (!drag) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
        drag.active = true;
        overlay.classList.add('is-dragging');
        ghost.textContent = drag.item.label;
        ghost.hidden = false;
        if (drag.item.kind === 'block') frame.querySelector(`[data-block-id="${drag.item.id}"]`)?.classList.add('is-drag-source');
        if (drag.item.kind === 'section') frame.querySelector(`[data-section-id="${drag.item.id}"]`)?.classList.add('is-drag-source');
      }
      event.preventDefault();
      ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
      autoScroll(event.clientY);
      drag.target = findTarget(event.clientX, event.clientY, drag.item);
      showDropLine(drag.target);
    }

    function autoScroll(y) {
      const box = stage.getBoundingClientRect();
      if (y < box.top + 48) stage.scrollTop -= 14;
      else if (y > box.bottom - 48) stage.scrollTop += 14;
    }

    function hit(x, y) {
      ghost.hidden = true;
      const target = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      ghost.hidden = !state.drag || !state.drag.active;
      return target && frame.contains(target) ? target : null;
    }

    function sectionIndexAt(sections, y) {
      for (let i = 0; i < sections.length; i += 1) {
        const box = sections[i].getBoundingClientRect();
        if (y < box.top + box.height / 2) return i;
      }
      return sections.length;
    }

    function blockTargetIn(col, y) {
      const blocks = [...col.querySelectorAll(':scope > .mtw-pb-item')];
      let index = blocks.length;
      for (let i = 0; i < blocks.length; i += 1) {
        const box = blocks[i].getBoundingClientRect();
        if (y < box.top + box.height / 2) {
          index = i;
          break;
        }
      }
      return { type: 'block', columnId: col.dataset.columnId, index, col, blocks };
    }

    // The column of a section nearest to x (for drops on a section's padding or gaps).
    function nearestColumn(sectionNode, x) {
      let best = null;
      let bestDistance = Infinity;
      sectionNode.querySelectorAll(':scope > .mtw-pb-row > .mtw-pb-col').forEach(col => {
        const box = col.getBoundingClientRect();
        const distance = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
        if (distance < bestDistance) {
          best = col;
          bestDistance = distance;
        }
      });
      return best;
    }

    function findTarget(x, y, item) {
      const node = hit(x, y);
      const page = frame.querySelector('.mtw-pb-page');
      if (!page) return null;
      const sections = [...page.querySelectorAll(':scope > .mtw-pb-section')];
      if (item.kind === 'section' || item.kind === 'newSection') {
        if (!node && !sections.length) return null;
        return { type: 'section', index: sectionIndexAt(sections, y), sections, page };
      }
      if (!node) return null;
      const col = node.closest('.mtw-pb-col');
      if (col) return blockTargetIn(col, y);
      const sectionNode = node.closest('.mtw-pb-section');
      if (sectionNode) {
        const nearest = nearestColumn(sectionNode, x);
        if (nearest) return blockTargetIn(nearest, y);
      }
      // On the page between or below sections: a new section there.
      return { type: 'newSection', index: sectionIndexAt(sections, y), sections, page };
    }

    // The drop line floats over the page (position: fixed) so showing it never moves
    // anything under the pointer.
    function showDropLine(target) {
      if (!target) {
        dropLine.remove();
        return;
      }
      let top;
      let left;
      let width;
      if (target.type === 'block') {
        const colBox = target.col.getBoundingClientRect();
        left = colBox.left;
        width = colBox.width;
        const before = target.blocks[target.index];
        const after = target.blocks[target.index - 1];
        if (before) top = before.getBoundingClientRect().top - 7;
        else if (after) top = after.getBoundingClientRect().bottom + 5;
        else top = colBox.top + 4;
        dropLine.className = 'mtw-pb-drop-line';
      } else {
        const pageBox = target.page.getBoundingClientRect();
        left = pageBox.left;
        width = pageBox.width;
        const before = target.sections[target.index];
        const after = target.sections[target.index - 1];
        if (before) top = before.getBoundingClientRect().top - 9;
        else if (after) top = after.getBoundingClientRect().bottom + 6;
        else top = pageBox.top + 8;
        dropLine.className = 'mtw-pb-drop-line mtw-pb-drop-line-section';
      }
      dropLine.style.top = `${Math.round(top)}px`;
      dropLine.style.left = `${Math.round(left)}px`;
      dropLine.style.width = `${Math.round(width)}px`;
      if (!dropLine.isConnected) overlay.appendChild(dropLine);
    }

    function onDragEnd(event) {
      const drag = state.drag;
      cleanupDrag();
      if (!drag) return;
      if (!drag.active) {
        // A tap/click on a palette tile adds it.
        if (drag.item.kind === 'new') addBlockToSelection(drag.item.type);
        else if (drag.item.kind === 'newSection') addSectionAt(drag.item.layout, null);
        return;
      }
      const target = drag.target || findTarget(event.clientX, event.clientY, drag.item);
      if (target) drop(drag.item, target);
    }

    // Applies a drop. Exposed (editor.drop) so it can be driven without a pointer.
    function drop(item, target) {
      const page = history.page;
      if (item.kind === 'section' && target.type !== 'block') {
        commit(c.moveSection(page, item.id, target.index), { kind: 'section', id: item.id });
      } else if (item.kind === 'newSection') {
        addSectionAt(item.layout, target.index);
      } else if (item.kind === 'block' || item.kind === 'new') {
        let next = page;
        let columnId = target.columnId;
        let index = target.index;
        if (target.type !== 'block') {
          const added = attempt(() => c.addSection(page, '1', target.index));
          if (!added) return;
          next = added.page;
          columnId = c.findSection(next, added.id).section.columns[0].id;
          index = 0;
        }
        if (item.kind === 'new') {
          const result = attempt(() => c.insertBlock(next, item.type, columnId, index));
          if (result) commit(result.page, { kind: 'block', id: result.id });
        } else {
          commit(c.moveBlock(next, item.id, columnId, index), { kind: 'block', id: item.id });
        }
      }
    }

    function cancelDrag() {
      cleanupDrag();
    }

    function cleanupDrag() {
      state.drag = null;
      overlay.classList.remove('is-dragging');
      ghost.hidden = true;
      dropLine.remove();
      frame.querySelectorAll('.is-drag-source').forEach(node => node.classList.remove('is-drag-source'));
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragEnd);
      document.removeEventListener('pointercancel', cancelDrag);
    }

    // ---------- keyboard ----------
    function onKey(event) {
      if (!overlay.isConnected) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z' && !isTyping(event.target)) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y' && !isTyping(event.target)) {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save(false);
        return;
      }
      if (isTyping(event.target)) return;
      const sel = state.selected;
      if (event.key === 'Escape') {
        if (state.drag) cancelDrag();
        else if (state.logic) closeLogic();
        else if (sel) select(null);
        else editor.close();
        return;
      }
      if (!sel) return;
      if (sel.kind === 'table') return;
      const act = sel.kind === 'block' ? blockAction : sectionAction;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        act('delete', sel.id);
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        act('duplicate', sel.id);
      } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        act(event.key === 'ArrowUp' ? 'up' : 'down', sel.id);
      }
    }

    // ---------- storage ----------
    function ref() {
      return api.doc(api.db, renderer().COLLECTION, toolId);
    }

    async function load() {
      state.loading = true;
      renderAll();
      status.textContent = 'Loading...';
      try {
        if (!api.db || typeof api.getDoc !== 'function') throw new Error('The dashboard database is unavailable.');
        const snap = await api.getDoc(ref());
        const data = snap && snap.exists() ? snap.data() : {};
        state.stored = data || {};
        state.published = data && data.published ? c.sanitizePage(data.published) : null;
        const start = data && data.draft ? c.sanitizePage(data.draft) : state.published || c.createPage();
        state.saved = start;
        history.reset(start);
        state.loading = false;
        renderAll();
      } catch (error) {
        state.loading = false;
        renderAll();
        flash(`Could not load the page: ${error.message || 'unknown error'}`, true);
      }
    }

    async function save(publish) {
      if (state.saving) return;
      if (!api.db || typeof api.setDoc !== 'function') {
        flash('The dashboard database is unavailable.', true);
        return;
      }
      const page = c.sanitizePage(history.page);
      const now = Date.now();
      const record = {
        ...state.stored,
        toolId,
        draft: page,
        updatedAt: now,
        updatedBy: user
      };
      if (publish) {
        record.published = page;
        record.publishedAt = now;
        record.publishedBy = user;
      }
      state.saving = true;
      saveBtn.disabled = true;
      publishBtn.disabled = true;
      flash(publish ? 'Publishing...' : 'Saving...');
      try {
        await api.setDoc(ref(), record);
        state.stored = record;
        state.saved = page;
        history.replace(page);
        if (publish) state.published = page;
        state.saving = false;
        publishBtn.disabled = false;
        renderTop();
        flash(publish ? 'Published. People see this page in the tool now.' : 'Draft saved. Publish to show it in the tool.');
      } catch (error) {
        state.saving = false;
        publishBtn.disabled = false;
        renderTop();
        flash(`Could not save: ${error.message || 'unknown error'}`, true);
      }
    }

    // ---------- open / close ----------
    function askToClose() {
      confirmBar.replaceChildren(
        el('span', '', 'You have unsaved changes.'),
        button('mtw-pb-btn mtw-pb-btn-primary', 'Save draft and close', null, async () => {
          await save(false);
          if (!dirty()) editor.close(true);
        }),
        button('mtw-pb-btn mtw-pb-btn-danger', 'Discard changes', null, () => editor.close(true)),
        button('mtw-pb-btn', 'Keep editing', null, () => {
          confirmBar.hidden = true;
        })
      );
      confirmBar.hidden = false;
      confirmBar.querySelector('button').focus();
    }

    this.close = force => {
      if (!force && dirty()) {
        askToClose();
        return false;
      }
      cleanupDrag();
      cleanupListDrag();
      if (state.shared && root.MTW_PAGE_RUNTIME) root.MTW_PAGE_RUNTIME.disposeShared(state.shared);
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.documentElement.classList.remove('mtw-pb-open');
      if (current === editor) current = null;
      return true;
    };

    // For tests and scripted use.
    Object.defineProperties(this, {
      page: { get: () => history.page },
      selected: { get: () => state.selected },
      element: { get: () => overlay },
      dirty: { get: () => dirty() }
    });
    this.drop = drop;
    this.dropStep = (item, path, index) => dropStep(item, path, index);
    this.openSteps = scopeKey => openLogic(scopeKey);
    this.closeSteps = () => closeLogic();
    this.select = select;
    this.save = save;
    this.loaded = null;

    buildPalette();
    document.body.appendChild(overlay);
    document.documentElement.classList.add('mtw-pb-open');
    document.addEventListener('keydown', onKey, true);
    this.loaded = load();
    closeBtn.focus();
  }

  root.MTW_PAGE_BUILDER = { open, TEMPLATES, get current() { return current; } };
})(typeof self !== 'undefined' ? self : this);
