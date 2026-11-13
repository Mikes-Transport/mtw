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
      canvas: null, // a popup id while editing that popup, else null (the page)
      logic: null, // { scope: 'page' | 'block:<id>' } while the steps editor is open
      inspectorKey: '',
      openGroups: {}, // inspector group open / closed, by block type and group
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
      } else if (state.shared && root.MTW_PAGE_RUNTIME.clearPreview) {
        root.MTW_PAGE_RUNTIME.clearPreview(state.shared); // drop pretend records from the preview
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
    const canvasBar = el('div', 'mtw-pb-canvas-bar');
    canvasBar.hidden = true;
    stage.append(canvasBar, frame);
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
      [['blocks', 'Blocks'], ['popups', 'Popups'], ['data', 'Data']].forEach(([id, label]) => {
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
      if (state.paletteTab === 'popups') {
        buildPopupsTab();
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

    // A new popup (one empty section): { page, id, name }.
    function newPopup(page, title) {
      return c.addPopup(page, title || 'New popup');
    }

    // The sections being edited: the open popup's, or the page's.
    function canvasPopup() {
      return state.canvas ? c.findPopup(history.page, state.canvas) : null;
    }

    function canvasSections() {
      const popup = canvasPopup();
      return popup ? popup.sections : history.page.sections;
    }

    // Shows a popup on the canvas to build it (null = back to the page).
    function openCanvas(popupId) {
      state.canvas = popupId || null;
      state.selected = null;
      state.logic = null;
      stage.scrollTop = 0;
      renderAll();
      if (state.paletteTab === 'popups') buildPalette();
    }

    function buildPopupsTab() {
      palette.appendChild(el('p', 'mtw-pb-palette-hint', 'Popups open over the page. Click one to build it here like a page (sections, columns, blocks), then pick it in a button\'s "Opens a popup".'));
      const list = el('div', 'mtw-pb-table-list');
      c.pagePopups(history.page).forEach(item => {
        const row = button('mtw-pb-table-item mtw-pb-popup-item', null, `Edit popup ${item.title}`, () => openCanvas(item.id));
        row.dataset.popup = item.name;
        const glyph = el('span', 'mtw-pb-tile-icon');
        glyph.appendChild(icon('card'));
        const text = el('span');
        const count = item.popup.sections.reduce((sum, sec) => sum + sec.columns.reduce((n, col) => n + col.blocks.length, 0), 0);
        text.append(el('strong', '', item.title || item.name), el('span', '', `${item.name} \u00b7 ${count} block${count === 1 ? '' : 's'}`));
        row.append(glyph, text);
        if (state.canvas === item.id) row.classList.add('is-selected');
        list.appendChild(row);
      });
      if (!c.pagePopups(history.page).length) list.appendChild(el('p', 'mtw-pb-muted', 'No popups yet.'));
      palette.appendChild(list);
      palette.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-new-popup', '+ New popup', 'Add a popup', () => {
        const made = attempt(() => newPopup(history.page));
        if (!made) return;
        commit(made.page, null);
        openCanvas(made.id);
      }));
      if (state.canvas) {
        palette.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-back-to-page', '\u2190 Back to the page', 'Edit the page', () => openCanvas(null)));
      }
      palette.appendChild(el('p', 'mtw-pb-palette-hint', 'While a popup is open here, the Blocks tab adds to it.'));
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
      const list = canvasSections();
      const last = list[list.length - 1];
      if (last) {
        const column = last.columns[last.columns.length - 1];
        return { columnId: column.id, index: column.blocks.length };
      }
      return { columnId: null, index: 0 };
    }

    function addBlockToSelection(type) {
      const target = selectedColumnId();
      if (!target.columnId && state.canvas) {
        // An empty popup: give it a section first.
        const added = attempt(() => c.addSection(history.page, '1', 0, state.canvas));
        if (!added) return;
        const result = attempt(() => c.insertBlock(added.page, type, c.findSection(added.page, added.id).section.columns[0].id, 0));
        if (result) commit(result.page, { kind: 'block', id: result.id });
        return;
      }
      const result = attempt(() => c.insertBlock(history.page, type, target.columnId, target.index));
      if (result) commit(result.page, { kind: 'block', id: result.id });
    }

    function addSectionAt(layout, index) {
      let at = index;
      if (at === null || at === undefined) {
        const sel = state.selected;
        const sectionId = sel && (sel.kind === 'section' ? sel.id : (c.findBlock(history.page, sel.id) || {}).section?.id);
        const found = sectionId ? c.findSection(history.page, sectionId) : null;
        at = found && found.list === canvasSections() ? found.index + 1 : canvasSections().length;
      }
      const result = attempt(() => c.addSection(history.page, layout, at, state.canvas));
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
      if (state.canvas && !canvasPopup()) state.canvas = null; // popup was deleted or undone
      const popup = state.preview ? null : canvasPopup();
      const node = renderer().render(page, {
        editing: !state.preview, dryRun: state.preview, toolId, user, isManager: true, shared: state.shared,
        canvas: popup ? popup.id : null
      });
      if (state.previewRuntime) {
        state.previewRuntime.dispose();
        state.previewRuntime = null;
      }
      frame.replaceChildren(node);
      if (state.preview && node.mtwRuntime) {
        state.previewRuntime = node.mtwRuntime; // automations and page-open steps run in preview
        node.mtwRuntime.start();
      }
      frame.classList.toggle('is-popup-frame', Boolean(popup));
      canvasBar.hidden = !popup;
      if (popup) {
        canvasBar.replaceChildren(
          el('span', '', 'Editing popup'),
          el('strong', '', `${popup.title || popup.name} (${popup.name})`),
          button('mtw-pb-btn mtw-pb-btn-light mtw-pb-canvas-back', '\u2190 Back to the page', 'Edit the page', () => openCanvas(null))
        );
      }
      if (state.preview) return;
      const sectionHolder = node.querySelector('.mtw-pb-popup-body') || node;

      node.querySelectorAll('.mtw-pb-section').forEach(sectionNode => {
        const id = sectionNode.dataset.sectionId;
        const found = c.findSection(page, id);
        sectionNode.prepend(toolbar('section', id, `Section: ${c.LAYOUT_LABELS[found.section.layout]}`));
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

      if (popup) {
        const add = button('mtw-pb-add-section', '+ Add section', 'Add a one-column section at the end of the popup',
          () => addSectionAt('1', popup.sections.length));
        sectionHolder.appendChild(add);
      } else if (!page.sections.length) {
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
    // Fields of the clicked row/card that steps can use: a data table's fields, or a
    // typed card's title / text / note.
    function recordFields(tableId) {
      if (tableId === 'manual-cards') {
        return [['record.title', 'Title (this card)'], ['record.text', 'Text (this card)'], ['record.note', 'Small note (this card)']];
      }
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
          options: table.fields.filter(f => f.type !== 'timer').map(f => [`${table.id}.${f.key}`, `${table.name}: ${f.label}`])
        }))), value);
      } else if (field.type === 'field') {
        const table = c.findTable(page, context.tableId);
        input = selectOf(id, [['', field.any || 'Any record (count all)']].concat(table ? table.fields.map(f => [f.key, f.label]) : []), value);
      } else if (field.type === 'cardfield') {
        input = selectOf(id, [['', field.any || 'Choose a field']].concat(context.cardFields || []), value);
      } else if (field.type === 'popup') {
        const popups = c.pagePopups(page);
        input = selectOf(id, [['', field.any || (popups.length ? 'Choose a popup' : 'No popups yet')]]
          .concat(popups.map(item => [item.name, `${item.title} (${item.name})`]))
          .concat([['__new__', '+ Create a new popup']]), value);
        // "+ Create a new popup": make it, then pick it here.
        input.addEventListener('change', event => {
          if (input.value !== '__new__') return;
          event.stopImmediatePropagation();
          const made = attempt(() => newPopup(history.page));
          if (!made) {
            input.value = value || '';
            return;
          }
          commit(made.page);
          onChange(made.name);
        });
      } else if (field.type === 'timer') {
        const items = c.pageElements(page).filter(item => item.type === 'stat' && item.block.props.source === 'timer'
          && (field.kind ? item.block.props.timerFrom === 'date' && item.block.props.timerKind === field.kind : item.block.props.timerFrom === 'open'));
        input = selectOf(id, [['', items.length ? 'Choose a timer' : field.kind ? 'No countdown tiles yet' : 'No stopwatch tiles yet (Number tile > A timer)']]
          .concat(items.map(item => [item.name, `${item.name} (${item.block.props.label || 'Timer'})`])), value);
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
        (Array.isArray(value) ? value.includes(props[key]) : value === '*' ? Boolean(props[key]) : props[key] === value));
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
        inspector.append(el('h3', '', 'Preview'), el('p', 'mtw-pb-muted', 'This is how the page looks to people using the tool. Everything works here. Saved, edited, imported and deleted records show straight away but only in this preview: nothing is written to Firebase. Press Edit to keep editing.'));
        return;
      }
      if (!sel) renderPageInspector(page);
      else if (sel.kind === 'block') renderBlockInspector(page, sel.id);
      else if (sel.kind === 'section') renderSectionInspector(page, sel.id);
      else if (sel.kind === 'table') renderTableInspector(page, sel.id);
      inspector.scrollTop = scroll;
    }

    // ---------- automations ----------
    function automationLabel(auto) {
      if (auto.when === 'interval') return `Every ${auto.seconds} seconds`;
      if (auto.when === 'tableChange') {
        const table = c.findTable(history.page, auto.table);
        const what = { any: 'changes', added: 'gets a new record', changed: 'has a record changed', deleted: 'has a record deleted' }[auto.change];
        return `When ${table ? table.name : 'a data table'} ${what}`;
      }
      if (auto.when === 'recordTimer') {
        const table = c.findTable(history.page, auto.table);
        const field = table && table.fields.find(f => f.key === auto.field);
        return `When ${field ? field.label : 'a field'} has been ${auto.value || '...'} for ${auto.minutes} min`;
      }
      if (auto.when === 'timerDone') return `When ${auto.target || 'a countdown'} ends`;
      const popup = c.findPopup(history.page, auto.popup);
      return `When ${popup ? popup.title || popup.name : 'a popup'} ${auto.when === 'popupOpen' ? 'opens' : 'closes'}`;
    }

    function renderAutomations() {
      inspector.appendChild(sectionTitle('Automations'));
      inspector.appendChild(el('p', 'mtw-pb-field-help', 'Steps that start on their own, without a click.'));
      inspector.appendChild(stepsSummary('When the page opens, do', 'page', history.page.onOpen || []));
      (history.page.automations || []).forEach(auto => {
        const card = el('div', 'mtw-pb-card-item mtw-pb-automation');
        card.dataset.automationId = auto.id;
        const head = el('div', 'mtw-pb-card-head');
        head.append(el('strong', '', automationLabel(auto)),
          iconButton('mtw-pb-tool-btn mtw-pb-card-delete', 'delete', 'Delete this automation', () => commit(c.removeAutomation(history.page, auto.id))));
        card.appendChild(head);
        const fields = [];
        if (auto.when === 'interval') fields.push({ key: 'seconds', label: 'Every (seconds, 5 or more)', type: 'number', min: 5, max: 3600 });
        if (auto.when === 'tableChange') {
          fields.push({ key: 'table', label: 'Data table', type: 'table' });
          fields.push({ key: 'change', label: 'When', type: 'select', options: [['added', 'A record is added'], ['changed', 'A record is changed'], ['deleted', 'A record is deleted'], ['any', 'Any of those']] });
        }
        if (auto.when === 'popupOpen' || auto.when === 'popupClose') fields.push({ key: 'popup', label: 'Popup', type: 'popup' });
        if (auto.when === 'recordTimer') {
          fields.push({ key: 'table', label: 'Data table', type: 'table' });
          fields.push({ key: 'field', label: 'Field', type: 'field', any: 'Choose a field' });
          fields.push({ key: 'op', label: 'is', type: 'select', options: c.OPS });
          if (!['empty', 'notEmpty'].includes(auto.op)) fields.push({ key: 'value', label: 'Value', type: 'text' });
          fields.push({ key: 'minutes', label: 'For at least (minutes)', type: 'number', min: 1, max: 525600 });
        }
        if (auto.when === 'timerDone') fields.push({ key: 'target', label: 'Countdown tile', type: 'timer', kind: 'until' });
        if (c.AUTOMATIONS[auto.when].description && ['recordTimer', 'timerDone'].includes(auto.when)) {
          card.appendChild(el('p', 'mtw-pb-field-help', c.AUTOMATIONS[auto.when].description));
        }
        fields.forEach(field => {
          card.appendChild(fieldControl(field, auto[field.key], value => {
            const next = c.updateAutomation(history.page, auto.id, { [field.key]: value });
            if (field.type === 'number' || field.type === 'text') commit(next, undefined, `${auto.id}:${field.key}`);
            else commit(next);
          }, { tableId: auto.table }));
        });
        card.appendChild(stepsSummary('Then do', `auto:${auto.id}`, auto.steps));
        inspector.appendChild(card);
      });
      const add = selectOf('', [['', '+ Add an automation...']].concat(Object.entries(c.AUTOMATIONS).map(([key, def]) => [key, def.label])), '');
      add.className = 'mtw-pb-add-step mtw-pb-add-automation';
      add.setAttribute('aria-label', 'Add an automation');
      add.addEventListener('change', () => {
        if (!add.value) return;
        const timers = c.pageElements(history.page).filter(item => item.type === 'stat' && item.block.props.source === 'timer' && item.block.props.timerFrom === 'date' && item.block.props.timerKind === 'until');
        const options = add.value === 'tableChange' || add.value === 'recordTimer' ? { table: ((history.page.tables || [])[0] || {}).id || '' }
          : add.value === 'timerDone' ? { target: (timers[0] || {}).name || '' }
          : add.value.startsWith('popup') ? { popup: (c.pagePopups(history.page)[0] || {}).name || '' } : {};
        const result = attempt(() => c.addAutomation(history.page, add.value, options));
        if (result) commit(result.page);
      });
      inspector.appendChild(add);
    }

    // Opens (making if needed) a popup's "when it opens/closes" automation.
    function popupAutomation(popup, kind) {
      const when = kind === 'open' ? 'popupOpen' : 'popupClose';
      let auto = (history.page.automations || []).find(a => a.when === when && a.popup === popup.name);
      if (!auto) {
        const result = attempt(() => c.addAutomation(history.page, when, { popup: popup.name }));
        if (!result) return;
        commit(result.page);
        auto = { id: result.id };
      }
      openLogic(`auto:${auto.id}`);
    }

    function renderPopupInspector(popup) {
      inspector.appendChild(el('h3', '', 'Popup'));
      inspector.appendChild(el('p', 'mtw-pb-muted', 'Build it like a page: drag sections and blocks in. Buttons open it with "Opens a popup"; it closes with its X, Esc, a click outside, or a Close a popup step.'));
      const nameWrap = el('div', 'mtw-pb-field mtw-pb-name-field');
      nameWrap.dataset.field = 'name';
      const nameId = `mtw-pb-name-${popup.id}`;
      nameWrap.appendChild(el('label', '', 'Popup name', { for: nameId }));
      const nameInput = el('input', '', null, { id: nameId, type: 'text', spellcheck: 'false' });
      nameInput.value = popup.name;
      const nameError = el('p', 'mtw-pb-field-error');
      nameInput.addEventListener('change', () => {
        const result = c.renameBlock(history.page, popup.id, nameInput.value);
        if (result.error) {
          nameError.textContent = result.error;
          nameInput.value = popup.name;
          return;
        }
        commit(result.page);
      });
      nameWrap.append(nameInput, nameError);
      inspector.appendChild(nameWrap);
      inspector.appendChild(fieldControl({ key: 'title', label: 'Title', type: 'text' }, popup.title,
        value => commit(c.updatePopup(history.page, popup.id, { title: value }), undefined, `${popup.id}:title`)));
      inspector.appendChild(fieldControl({ key: 'width', label: 'Width', type: 'select', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['full', 'Full width']] },
        popup.width, value => commit(c.updatePopup(history.page, popup.id, { width: value }))));
      const used = c.pageElements(history.page).filter(item => item.block.props.popup === popup.name || item.block.props.formPopup === popup.name)
        .map(item => item.name);
      inspector.appendChild(el('p', 'mtw-pb-field-help', used.length ? `Opened by: ${used.join(', ')}.` : 'No button opens it yet.'));
      inspector.appendChild(sectionTitle('Automations'));
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-popup-open-steps', 'Steps when it opens', 'Runs each time this popup opens', () => popupAutomation(popup, 'open')));
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-popup-close-steps', 'Steps when it closes', 'Runs each time this popup closes', () => popupAutomation(popup, 'close')));
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-canvas-back', '\u2190 Back to the page', 'Edit the page', () => openCanvas(null)));
      const remove = button('mtw-pb-btn mtw-pb-btn-light mtw-pb-delete-table mtw-pb-delete-popup', 'Delete popup', `Delete ${popup.title || popup.name}`, () => {
        if (remove.dataset.armed === 'true') {
          state.canvas = null;
          commit(c.removePopup(history.page, popup.id), null);
        } else {
          remove.dataset.armed = 'true';
          remove.textContent = 'Press again to delete';
        }
      });
      inspector.appendChild(remove);
    }

    function renderPageInspector(page) {
      const popup = canvasPopup();
      if (popup) {
        renderPopupInspector(popup);
        return;
      }
      inspector.append(
        el('h3', '', 'Page'),
        el('p', 'mtw-pb-muted', 'Click a block or a section on the page to change it. Every block has an element name that steps use to read or change it.'),
        el('p', 'mtw-pb-muted', 'Shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+D duplicate, Delete removes, Alt+Up/Down moves, Esc deselects, Ctrl+S saves a draft.'),
        el('p', 'mtw-pb-muted', `${c.countBlocks(page)} blocks in ${page.sections.length} sections, ${(page.tables || []).length} data tables.`)
      );
      renderAutomations();
    }

    // A fold-away group in the inspector. fill() appends to the inspector; what it adds
    // is moved into the group. Open / closed is remembered per block type.
    function groupBox(key, title, openByDefault, fill) {
      const box = el('details', 'mtw-pb-group-box');
      box.dataset.group = title;
      box.open = state.openGroups[key] === undefined ? openByDefault : state.openGroups[key];
      box.appendChild(el('summary', '', title));
      box.addEventListener('toggle', () => { state.openGroups[key] = box.open; });
      const body = el('div', 'mtw-pb-group-body');
      const before = inspector.children.length;
      fill();
      [...inspector.children].slice(before).forEach(node => body.appendChild(node));
      box.appendChild(body);
      return box;
    }

    // Colour rules: "When [field] is [value] (for N minutes), colour the row / cell".
    function renderColourRules(blockId) {
      const block = c.findBlock(history.page, blockId).block;
      const props = block.props;
      const box = el('div', 'mtw-pb-colour-rules');
      if (!c.BLOCKS[block.type].fields.some(field => field.group)) box.appendChild(sectionTitle('Colours'));
      const dataBacked = block.type !== 'stat' && !(block.type === 'table' && props.source !== 'table');
      const table = dataBacked ? c.findTable(history.page, props.table) : null;
      const columns = block.type === 'stat' ? []
        : table ? table.fields.map(f => [f.key, f.type === 'timer' ? `${f.label} (minutes)` : f.label])
          : block.type === 'table' ? props.columns.map(col => [col.id, col.label || 'Untitled']) : [];
      const thing = block.type === 'stat' ? 'this tile' : block.type === 'cards' ? 'a card' : 'a row';
      box.appendChild(el('p', 'mtw-pb-field-help', block.type === 'stat'
        ? 'Each rule says: if the number is X, colour this tile. Timers count in minutes, e.g. "more than 30". The top rule that matches wins.'
        : `Each rule says: if a column has a value, colour ${thing}. E.g. "If Status is equal to Waiting, colour it Red". The top rule that matches wins.`));
      if (table && block.type !== 'stat') {
        box.appendChild(el('p', 'mtw-pb-field-help', 'To colour by time, add a Timer field to the data table (e.g. "Waiting time", counting while Status is Waiting), then: If Waiting time is more than 30.'));
      }
      if (dataBacked && !table) {
        box.appendChild(el('p', 'mtw-pb-muted', 'Pick a data table first.'));
        inspector.appendChild(box);
        return;
      }
      const rules = props.colorRules || [];
      const save = (list, coalesce) => {
        const next = c.updateBlock(history.page, blockId, { props: { colorRules: list } });
        if (coalesce) commit(next, undefined, coalesce);
        else commit(next);
      };
      const latest = () => (c.findBlock(history.page, blockId) || { block: { props: {} } }).block.props.colorRules || [];
      const change = (ruleId, changes, coalesce) => save(latest().map(rule => (rule.id === ruleId ? { ...rule, ...changes } : rule)), coalesce);
      const PRESETS = [['Red', '#fdecea', '#9b1c1c'], ['Amber', '#fff4e5', '#8a4b00'], ['Green', '#e7f6ec', '#0a7a3d'],
        ['Blue', '#e8f0fe', '#1d4ed8'], ['Grey', '#f0f0ee', '#444441']];
      rules.forEach((rule, index) => {
        const card = el('div', 'mtw-pb-card-item mtw-pb-colour-rule');
        card.dataset.ruleId = rule.id;
        const columnName = (columns.find(([key]) => key === rule.field) || [null, block.type === 'stat' ? 'the number' : 'a column'])[1];
        const opName = (c.OPS.find(([key]) => key === rule.op) || [null, ''])[1];
        const head = el('div', 'mtw-pb-card-head');
        const chip = el('span', 'mtw-pb-colour-swatch', `Rule ${index + 1}`);
        chip.style.background = rule.background || 'transparent';
        chip.style.color = rule.color || '';
        head.append(chip, el('span', 'mtw-pb-colour-says',
          `If ${columnName} is ${opName}${['empty', 'notEmpty'].includes(rule.op) ? '' : ` ${rule.value || '...'}`}`),
        iconButton('mtw-pb-tool-btn mtw-pb-card-delete', 'delete', 'Delete this colour rule', () => save(latest().filter(item => item.id !== rule.id))));
        card.appendChild(head);
        const line = el('div', 'mtw-pb-colour-when');
        if (block.type !== 'stat') {
          line.appendChild(fieldControl({ key: 'field', label: 'If', type: 'select', options: [['', 'Choose a column']].concat(columns) }, rule.field,
            value => change(rule.id, { field: value })));
        }
        line.appendChild(fieldControl({ key: 'op', label: block.type === 'stat' ? 'If the number is' : 'is', type: 'select', options: c.OPS }, rule.op,
          value => change(rule.id, { op: value })));
        if (!['empty', 'notEmpty'].includes(rule.op)) {
          line.appendChild(fieldControl({ key: 'value', label: 'Value', type: 'text' }, rule.value,
            value => change(rule.id, { value }, `${blockId}:rule:${rule.id}:value`)));
        }
        card.appendChild(line);
        const paint = el('div', 'mtw-pb-field mtw-pb-colour-pick');
        paint.appendChild(el('label', '', 'Colour it'));
        const swatches = el('div', 'mtw-pb-colour-presets');
        PRESETS.forEach(([name, background, color]) => {
          const pick = button('mtw-pb-colour-preset', name, `Colour it ${name.toLowerCase()}`, () => change(rule.id, { background, color }));
          pick.style.background = background;
          pick.style.color = color;
          pick.dataset.preset = name.toLowerCase();
          if (rule.background === background && rule.color === color) pick.classList.add('is-on');
          swatches.appendChild(pick);
        });
        paint.appendChild(swatches);
        card.appendChild(paint);
        const custom = el('details', 'mtw-pb-colour-custom');
        custom.appendChild(el('summary', '', 'Pick my own colours'));
        custom.appendChild(fieldControl({ key: 'background', label: 'Background', type: 'color' }, rule.background,
          value => change(rule.id, { background: value }, `${blockId}:rule:${rule.id}:background`)));
        custom.appendChild(fieldControl({ key: 'color', label: 'Text colour', type: 'color' }, rule.color,
          value => change(rule.id, { color: value }, `${blockId}:rule:${rule.id}:color`)));
        card.appendChild(custom);
        if (block.type !== 'stat' && block.type !== 'cards') {
          card.appendChild(fieldControl({ key: 'target', label: 'What gets coloured', type: 'select', options: [['row', 'The whole row'], ['cell', `Just the ${columnName} cell`]] }, rule.target,
            value => change(rule.id, { target: value })));
        }
        if (rule.minutes) {
          card.appendChild(fieldControl({ key: 'minutes', label: 'And has been that for at least (minutes)', type: 'number', min: 0, max: 525600 }, rule.minutes,
            value => change(rule.id, { minutes: value === undefined ? 0 : value }, `${blockId}:rule:${rule.id}:minutes`)));
        }
        box.appendChild(card);
      });
      if (rules.length < 12) {
        box.appendChild(button('mtw-pb-btn mtw-pb-add-colour-rule', '+ Add a colour rule', 'Add a colour rule', () => save(latest().concat({
          field: (columns[0] || [''])[0], op: 'equals', value: '', background: '#fdecea', color: '#9b1c1c', target: 'row'
        }))));
      }
      inspector.appendChild(box);
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
      const SPECIAL = ['grid', 'actions', 'cardlist', 'cardfields', 'carddesign', 'colorrules'];
      const renderPlain = field => {
        inspector.appendChild(fieldControl(field, props[field.key], value => {
          if (block.type === 'cards' && field.key === 'formPopup' && props.source === 'added') {
            const before = c.findBlock(history.page, blockId).block.props.formPopup;
            let page = c.updateBlock(history.page, blockId, { props: { formPopup: value } });
            // Buttons that opened the old form popup now open the new one.
            c.pageElements(page).filter(item => item.type === 'button' && before && item.block.props.popup === before)
              .forEach(item => { page = c.updateBlock(page, item.block.id, { props: { popup: value } }); });
            if (value) page = syncForm(page, props.table, value);
            commit(page);
            return;
          }
          if (block.type === 'cards' && field.key === 'source' && value === 'added' &&
              !c.findTable(history.page, c.findBlock(history.page, blockId).block.props.table)) {
            setupAddedCards(blockId);
            return;
          }
          const next = c.updateBlock(history.page, blockId, { props: { [field.key]: value } });
          if (RESHAPES.includes(field.type) || field.type === 'fieldpick') commit(next);
          else commit(next, undefined, `${blockId}:p:${field.key}`);
        }, { tableId: props.table }));
      };
      const renderSpecial = field => {
        if (field.type === 'grid') renderGridEditor(blockId);
        if (field.type === 'cardlist') renderCardItemsEditor(blockId);
        if (field.type === 'cardfields') renderCardFieldsEditor(blockId);
        if (field.type === 'colorrules') renderColourRules(blockId);
        if (field.type === 'carddesign') {
          const design = props.design || { parts: [] };
          const box = el('div', 'mtw-pb-steps-summary');
          box.appendChild(sectionTitle('Card design'));
          box.appendChild(el('p', 'mtw-pb-muted', design.parts.length
            ? `${design.parts.length} part${design.parts.length === 1 ? '' : 's'}: ${design.parts.map(part => c.CARD_PARTS[part.type].label).join(', ')}.`
            : 'Using the standard card look.'));
          box.appendChild(button('mtw-pb-btn mtw-pb-btn-primary-dark mtw-pb-design-cards', 'Design cards', 'Open the card designer',
            () => openDesigner(blockId)));
          inspector.appendChild(box);
        }
      };
      const render = field => (SPECIAL.includes(field.type) ? renderSpecial(field) : renderPlain(field));
      const groupOf = field => (field.type === 'actions' ? '' : field.group || (field.type === 'colorrules' ? 'Colours' : ''));
      const grouped = contentFields.some(field => field.group);
      const loose = contentFields.filter(field => field.type !== 'actions' && (!grouped || !groupOf(field)));
      if (loose.some(field => !SPECIAL.includes(field.type))) inspector.appendChild(sectionTitle('Content'));
      loose.forEach(render);
      if (grouped) {
        const order = [];
        contentFields.forEach(field => { if (groupOf(field) && !order.includes(groupOf(field))) order.push(groupOf(field)); });
        order.forEach(name => inspector.appendChild(groupBox(`${block.type}:${name}`, name, name === 'Data', () => {
          contentFields.filter(field => groupOf(field) === name).forEach(render);
        })));
      }
      const actionsField = contentFields.find(field => field.type === 'actions');
      if (actionsField) inspector.appendChild(stepsSummary(actionsField.label, `block:${blockId}`, props.actions || []));

      inspector.appendChild(groupBox(`${block.type}:look`, 'Box style (spacing, colours, border)', false, () => {
        c.STYLE_FIELDS.forEach(field => {
          inspector.appendChild(fieldControl(field, block.style[field.key], value => {
            const next = c.updateBlock(history.page, blockId, { style: { [field.key]: value === undefined ? '' : value } });
            commit(next, undefined, `${blockId}:s:${field.key}`);
          }));
        });
      }));
      inspector.appendChild(itemActions('block', blockId));
    }

    function renderSectionInspector(page, sectionId) {
      const found = c.findSection(page, sectionId);
      if (!found) return;
      inspector.appendChild(el('h3', '', found.popup ? `Section in popup "${found.popup.title || found.popup.name}"` : 'Section'));
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

    // ---------- card list block: one card per card ----------
    function renderCardItemsEditor(blockId) {
      const props = () => c.findBlock(history.page, blockId).block.props;
      const apply = (fn, coalesce) => {
        const next = attempt(() => fn(props()));
        if (next) commit(c.updateBlock(history.page, blockId, { props: next }), undefined, coalesce);
      };
      inspector.appendChild(sectionTitle('Cards'));
      const list = el('div', 'mtw-pb-cards', null, { 'data-drop-group': `items:${blockId}` });
      props().items.forEach((item, i) => {
        const card = el('div', 'mtw-pb-card-item', null, { 'data-drag-item': item.id });
        card.appendChild(cardHeader(item.title || `Card ${i + 1}`,
          () => ({ group: `items:${blockId}`, id: item.id, label: item.title || `Card ${i + 1}`, onDrop: (container, index) => apply(p => c.cardItems.move(p, item.id, index)) }),
          () => apply(p => c.cardItems.remove(p, item.id)), `Delete card ${item.title || i + 1}`));
        [['title', 'Title', 'text'], ['text', 'Text', 'textarea'], ['note', 'Small note', 'text'], ['image', 'Image address', 'url']].forEach(([key, label, type]) => {
          card.appendChild(fieldControl({ key: `${key}-${item.id}`, label, type }, item[key],
            value => apply(p => c.cardItems.update(p, item.id, { [key]: value }), `${blockId}:item:${item.id}:${key}`)));
        });
        list.appendChild(card);
      });
      inspector.appendChild(list);
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-add-card', '+ Add card', 'Add a card', () =>
        apply(p => c.cardItems.add(p))));
    }

    // ---------- "Cards people add": the card list's own table + Add card popup ----------
    function stepsOf(types) {
      return types.reduce((list, [type, values]) => {
        const added = c.steps.add(list, [], type);
        return values ? c.steps.update(added.list, added.id, values) : added.list;
      }, []);
    }

    // Keeps the Add card popup's inputs matching the table's fields: one input per field,
    // in field order, labelled like the field; removed fields lose their input.
    function syncForm(page, tableId, popupName) {
      const full = c.findTable(page, tableId);
      const table = full && { ...full, fields: full.fields.filter(f => f.type !== 'timer') };
      let next = page;
      const found = c.findPopup(next, popupName);
      if (!table || !found) return page;
      if (!found.sections.length) next = c.addSection(next, '1', 0, found.id).page;
      const popupId = found.id;
      const sectionId = c.findPopup(next, popupId).sections[0].id;
      const blocksIn = () => c.findPopup(next, popupId).sections.flatMap(sec => sec.columns.flatMap(col => col.blocks));
      const bound = block => block.type === 'input' && block.props.bind.startsWith(`${tableId}.`);
      blocksIn().filter(block => bound(block) && !table.fields.some(f => `${tableId}.${f.key}` === block.props.bind))
        .forEach(block => { next = c.removeBlock(next, block.id); });
      table.fields.forEach(field => {
        if (!blocksIn().some(block => block.type === 'input' && block.props.bind === `${tableId}.${field.key}`)) {
          next = c.insertBlock(next, 'input', c.findSection(next, sectionId).section.columns[0].id, 0,
            { label: field.label, bind: `${tableId}.${field.key}` }).page;
        }
      });
      next = c.clone(next);
      const popupNow = c.findPopup(next, popupId);
      const first = c.findSection(next, sectionId).section.columns[0];
      const all = popupNow.sections.flatMap(sec => sec.columns.flatMap(col => col.blocks));
      const inputs = table.fields.map(f => all.find(block => bound(block) && block.props.bind === `${tableId}.${f.key}`)).filter(Boolean);
      inputs.forEach(input => { input.props.label = table.fields.find(f => `${tableId}.${f.key}` === input.props.bind).label; });
      // New inputs go into the first section; ones already placed elsewhere stay there.
      const placed = new Set();
      popupNow.sections.forEach((sec, si) => sec.columns.forEach((col, ci) => {
        if (si === 0 && ci === 0) return;
        col.blocks.forEach(block => { if (inputs.includes(block)) placed.add(block); });
      }));
      const firstInputs = inputs.filter(input => !placed.has(input));
      first.blocks = firstInputs.concat(first.blocks.filter(block => !firstInputs.includes(block)));
      // A popup chosen for this card list gets a Save button if it has none for the table.
      const hasSave = all.some(block => block.type === 'button' &&
        JSON.stringify(block.props.actions || []).includes(`"table":"${tableId}"`));
      if (!hasSave) {
        const save = c.insertBlock(next, 'button', first.id, first.blocks.length, { label: 'Save card' });
        next = c.updateBlock(save.page, save.id, { props: { actions: stepsOf([
          ['save', { table: tableId }], ['message', { text: 'Card added.' }], ['clear'], ['closePopup', { target: popupName }]
        ]) } });
      }
      return next;
    }

    // Turns a card list into "Cards people add": a data table, an Add card popup with an
    // input per field and a Save button, and a + Add card button above the list.
    function setupAddedCards(blockId) {
      const result = attempt(() => {
        let page = history.page;
        const found = c.findBlock(page, blockId);
        const number = (found.block.name.match(/(\d+)$/) || [])[1];
        const tableAdded = c.addTable(page, number ? `Card list ${number}` : found.block.name.replace(/_/g, ' '));
        page = tableAdded.page;
        const tableId = tableAdded.id;
        page = c.updateField(page, tableId, 'name', { label: 'Title' });
        page = c.updateField(page, tableId, 'notes', { label: 'Details' });
        const popupAdded = c.addPopup(page, 'Add a card');
        page = popupAdded.page;
        const popupName = popupAdded.name;
        const save = c.insertBlock(page, 'button', c.findPopup(page, popupAdded.id).sections[0].columns[0].id, 0, { label: 'Save card' });
        page = c.updateBlock(save.page, save.id, { props: { actions: stepsOf([
          ['save', { table: tableId }], ['message', { text: 'Card added.' }], ['clear'], ['closePopup', { target: popupName }]
        ]) } });
        page = syncForm(page, tableId, popupName);
        const where = c.findBlock(page, blockId);
        page = c.insertBlock(page, 'button', where.column.id, where.index, { label: '+ Add card', popup: popupName }).page;
        page = c.updateBlock(page, blockId, { props: {
          source: 'added', table: tableId, formPopup: popupName, titleField: 'name', textField: 'notes', search: 'yes'
        } });
        return page;
      });
      if (result) commit(result, { kind: 'block', id: blockId });
    }

    function renderCardFieldsEditor(blockId) {
      const props = c.findBlock(history.page, blockId).block.props;
      const table = c.findTable(history.page, props.table);
      inspector.appendChild(sectionTitle('Card fields'));
      if (!table) {
        inspector.appendChild(el('p', 'mtw-pb-muted', 'This card list has no storage yet.'));
        inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light', 'Set it up', 'Create the table, Add card popup and button',
          () => setupAddedCards(blockId)));
        return;
      }
      inspector.appendChild(el('p', 'mtw-pb-field-help', 'What people fill in when they add a card. The Add card popup updates to match.'));
      const tableId = table.id;
      const withSync = page => syncForm(page, tableId, c.findBlock(page, blockId).block.props.formPopup);
      const list = el('div', 'mtw-pb-cards', null, { 'data-drop-group': `cardfields:${blockId}` });
      table.fields.forEach(field => {
        const card = el('div', 'mtw-pb-card-item', null, { 'data-drag-item': field.key });
        card.appendChild(cardHeader(field.label || field.key,
          () => ({ group: `cardfields:${blockId}`, id: field.key, label: field.label, onDrop: (container, index) => commit(withSync(c.moveField(history.page, tableId, field.key, index))) }),
          () => commit(withSync(c.removeField(history.page, tableId, field.key))), `Delete field ${field.label}`));
        card.appendChild(fieldControl({ key: `label-${field.key}`, label: 'Name', type: 'text' }, field.label,
          value => commit(withSync(c.updateField(history.page, tableId, field.key, { label: value })), undefined, `${tableId}:f:${field.key}:label`)));
        card.appendChild(fieldControl({ key: `type-${field.key}`, label: 'Type', type: 'select', options: Object.entries(c.FIELD_TYPES) }, field.type,
          value => commit(withSync(c.updateField(history.page, tableId, field.key, { type: value })))));
        if (field.type === 'choice') {
          card.appendChild(fieldControl({ key: `options-${field.key}`, label: 'Choices (one per line)', type: 'textarea' }, field.options,
            value => commit(c.updateField(history.page, tableId, field.key, { options: value }), undefined, `${tableId}:f:${field.key}:options`)));
        }
        if (field.type === 'timer') {
          timerFieldSettings(card, table, field);
          list.appendChild(card);
          return;
        }
        const req = el('label', 'mtw-pb-check');
        const check = el('input', '', null, { type: 'checkbox' });
        check.checked = field.required;
        check.addEventListener('change', () => commit(c.updateField(history.page, tableId, field.key, { required: check.checked })));
        req.append(check, document.createTextNode(' Required'));
        card.appendChild(req);
        list.appendChild(card);
      });
      inspector.appendChild(list);
      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-add-card-field', '+ Add field', 'Add a card field', () => {
        const result = attempt(() => c.addField(history.page, tableId, `Field ${table.fields.length + 1}`, 'text'));
        if (result && result.key) commit(withSync(result.page));
      }));
      const popup = c.findPopup(history.page, props.formPopup);
      if (popup) {
        inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-light mtw-pb-edit-popup', 'Edit the Add card popup', 'Open the popup to build it',
          () => openCanvas(popup.id)));
      }
    }

    // ---------- data table editor ----------
    // A Timer field: what it counts from, and (optionally) only while a field has a value.
    function timerFieldSettings(card, table, field) {
      const tableId = table.id;
      const others = table.fields.filter(f => f.key !== field.key && f.type !== 'timer');
      card.appendChild(fieldControl({ key: `from-${field.key}`, label: 'Counts from', type: 'select',
        options: [['', 'When the row was added']].concat(others.map(f => [f.key, `When ${f.label} is filled in / changed`])) }, field.from,
      value => {
        const picked = others.find(f => f.key === value);
        commit(c.updateField(history.page, tableId, field.key, { from: value, fromMode: 'changed' }));
      }));
      if (field.from) {
        const from = others.find(f => f.key === field.from);
        if (from && (from.type === 'date' || from.type === 'text')) {
          card.appendChild(fieldControl({ key: `mode-${field.key}`, label: `Count from`, type: 'select',
            options: [['changed', `When someone picks / changes ${from.label}`], ['value', `The date / time written in ${from.label}`]] }, field.fromMode,
          value => commit(c.updateField(history.page, tableId, field.key, { fromMode: value }))));
        }
        card.appendChild(fieldControl({ key: `while-${field.key}`, label: `Only counts while ${from ? from.label : 'it'} is (blank = always)`, type: 'text' }, field.whileValue,
          value => commit(c.updateField(history.page, tableId, field.key, { whileValue: value }), undefined, `${tableId}:f:${field.key}:while`)));
      }
      card.appendChild(el('p', 'mtw-pb-field-help', field.from
        ? 'It stays blank until that field has something in it. Nobody fills this in: it ticks by itself in lists, cards and Manage data. Steps and colour rules see it as minutes.'
        : 'Nobody fills this in: it ticks by itself in lists, cards and Manage data. Steps and colour rules see it as minutes.'));
    }

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
        if (field.type === 'timer') {
          timerFieldSettings(card, table, field);
          list.appendChild(card);
          return;
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

      inspector.appendChild(button('mtw-pb-btn mtw-pb-btn-primary-dark mtw-pb-open-records', 'Open records',
        'Add, edit and delete this table\'s records like a spreadsheet', async () => {
          try {
            if (typeof root.MTW_OPEN_DATA_MANAGER !== 'function') throw new Error('Manage data is not available.');
            const manager = await root.MTW_OPEN_DATA_MANAGER(toolId, history.page);
            if (manager && manager.showTable) manager.showTable(tableId);
          } catch (error) {
            flash(error.message || 'Could not open the records.', true);
          }
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
        const inputs = table.fields.filter(field => field.type !== 'timer');
        inputs.forEach((field, i) => {
          page = c.insertBlock(page, 'input', left, i + 1, { label: field.label, bind: `${tableId}.${field.key}` }).page;
        });
        const saveButton = c.insertBlock(page, 'button', left, inputs.length + 1, { label: 'Save' });
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
        const popupAdded = c.addPopup(page, `Add to ${table.name}`);
        page = popupAdded.page;
        const popupName = popupAdded.name;
        const formCol = c.findPopup(page, popupAdded.id).sections[0].columns[0].id;
        table.fields.forEach((field, i) => {
          page = c.insertBlock(page, 'input', formCol, i, { label: field.label, bind: `${tableId}.${field.key}` }).page;
        });
        const save = c.insertBlock(page, 'button', formCol, table.fields.length, { label: 'Save' });
        page = c.updateBlock(save.page, save.id, { props: { actions: stepList([
          ['save', { table: tableId }], ['message', { text: 'Added.' }], ['clear'], ['closePopup', { target: popupName }]
        ]) } });
        // The board, placed before the popup section
        const board = c.addSection(page, '1-1', page.sections.length);
        page = c.updateSection(board.page, board.id, { style: { valign: 'center' } });
        const [left, right] = c.findSection(page, board.id).section.columns.map(col => col.id);
        page = c.insertBlock(page, 'heading', left, 0, { text: table.name, level: 'h2' }).page;
        const add = c.insertBlock(page, 'button', right, 0, { label: `+ Add`, popup: popupName });
        page = c.updateBlock(add.page, add.id, { style: { align: 'right' } });
        const exp = c.insertBlock(page, 'button', right, 1, { label: 'Export', variant: 'secondary' });
        page = c.updateBlock(exp.page, exp.id, { props: { actions: stepList([['exportCsv', { table: tableId }]]) }, style: { align: 'right' } });
        const imp = c.insertBlock(page, 'button', right, 2, { label: 'Import', variant: 'secondary' });
        page = c.updateBlock(imp.page, imp.id, { props: { actions: stepList([['importCsv', { table: tableId }]]) }, style: { align: 'right' } });
        const list = c.addSection(page, '1', page.sections.length);
        page = list.page;
        const cards = c.insertBlock(page, 'cards', c.findSection(page, list.id).section.columns[0].id, 0, {
          source: 'table', search: 'yes', table: tableId, titleField: table.fields[0] ? table.fields[0].key : '', textField: table.fields[1] ? table.fields[1].key : '', allowDelete: 'managers'
        });
        return { page: cards.page, id: cards.id };
      });
      if (result) commit(result.page, { kind: 'block', id: result.id });
    }

    // ---------- When -> Do steps ----------
    // A step list owner: 'page' (When the page opens) or 'block:<id>'.
    function scopeFor(key) {
      if (key.startsWith('auto:')) {
        const autoId = key.slice('auto:'.length);
        const auto = (history.page.automations || []).find(a => a.id === autoId);
        return {
          key,
          recordTable: auto && (auto.when === 'tableChange' || auto.when === 'recordTimer') ? auto.table : '',
          get: () => ((history.page.automations || []).find(a => a.id === autoId) || { steps: [] }).steps,
          set: (list, coalesce) => commit(c.updateAutomation(history.page, autoId, { steps: list }), undefined, coalesce)
        };
      }
      if (key.startsWith('part:')) {
        const [, blockId, partId] = key.split(':');
        const owner = c.findBlock(history.page, blockId);
        const props = owner ? owner.block.props : {};
        const getDesign = () => (c.findBlock(history.page, blockId) || { block: { props: { design: { parts: [], style: {} } } } }).block.props.design;
        return {
          key,
          recordTable: props.source === 'manual' ? 'manual-cards' : props.table || '',
          get: () => {
            const part = getDesign().parts.find(item => item.id === partId);
            return part && Array.isArray(part.actions) ? part.actions : [];
          },
          set: (list, coalesce) => commit(c.updateBlock(history.page, blockId, {
            props: { design: c.cardDesign.update(getDesign(), partId, { actions: list }) }
          }), undefined, coalesce)
        };
      }
      if (key === 'page') {
        return {
          key,
          get: () => history.page.onOpen || [],
          set: (list, coalesce) => commit(c.updatePageActions(history.page, list), undefined, coalesce)
        };
      }
      const blockId = key.slice('block:'.length);
      const owner = c.findBlock(history.page, blockId);
      const block = owner && owner.block;
      const recordTable = !block ? ''
        : block.type === 'records' || (block.type === 'cards' && block.props.source !== 'manual')
          || (block.type === 'table' && block.props.source === 'table') ? block.props.table
          : block.type === 'cards' ? 'manual-cards' : '';
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

    // ---------- card designer ----------
    function cardFieldOptions(props) {
      if (props.source === 'manual') return [['title', 'Title'], ['text', 'Text'], ['note', 'Small note'], ['image', 'Image address']];
      const table = c.findTable(history.page, props.table);
      return (table ? table.fields.map(f => [f.key, f.label]) : []).concat([['_createdAt', 'Added (date)'], ['_createdBy', 'Added by']]);
    }

    function sampleRecord(props) {
      if (props.source === 'manual') {
        const item = props.items[0] || { title: 'Card title', text: 'Card text', note: 'Note' };
        return { _id: 'sample', title: item.title, text: item.text, note: item.note };
      }
      const entry = state.shared && state.shared.data[props.table];
      if (entry && entry.rows && entry.rows.length) return entry.rows[entry.rows.length - 1];
      const table = c.findTable(history.page, props.table);
      const record = { _createdAt: Date.now(), _createdBy: user || 'Managers' };
      (table ? table.fields : []).forEach(f => { record[f.key] = f.type === 'number' ? 12 : f.type === 'yesno' ? 'Yes' : f.label; });
      return record;
    }

    function openDesigner(blockId) {
      const found = c.findBlock(history.page, blockId);
      if (!found) return;
      const props = found.block.props;
      if (!props.design || !props.design.parts.length) {
        const starter = props.source === 'manual'
          ? c.cardDesign.add(c.cardDesign.add({ parts: [], style: {} }, 'field', null, { field: 'title', weight: '700', size: 'large' }).design,
            'field', null, { field: 'text', color: '#777774' }).design
          : c.cardDesign.starter(props.titleField || ((c.findTable(history.page, props.table) || { fields: [] }).fields[0] || {}).key, props.textField);
        commit(c.updateBlock(history.page, blockId, { props: { design: starter } }));
      }
      state.logic = { designer: blockId };
      renderLogic();
    }

    function renderDesigner(blockId) {
      const found = c.findBlock(history.page, blockId);
      if (!found) {
        state.logic = null;
        logic.hidden = true;
        overlay.classList.remove('has-logic');
        return;
      }
      const props = found.block.props;
      const design = props.design;
      const setDesign = (next, coalesce) => commit(c.updateBlock(history.page, blockId, { props: { design: next } }), undefined, coalesce);
      const current = () => c.findBlock(history.page, blockId).block.props.design;
      const listScroll = logic.querySelector('.mtw-pb-design-list') ? logic.querySelector('.mtw-pb-design-list').scrollTop : 0;

      const head = el('header', 'mtw-pb-logic-head');
      const titles = el('div');
      titles.append(el('span', 'mtw-pb-top-kicker', 'Card design'), el('strong', '', found.block.name),
        el('span', 'mtw-pb-logic-trigger', 'Every card in this list uses this design.'));
      const actionsWrap = el('div', 'mtw-pb-design-head-actions');
      actionsWrap.append(
        button('mtw-pb-btn mtw-pb-btn-light mtw-pb-design-reset', 'Use the standard look', 'Remove the design', () => {
          setDesign({ parts: [], style: {} });
          closeLogic();
        }),
        button('mtw-pb-btn mtw-pb-btn-primary-dark mtw-pb-logic-done', 'Done', 'Back to the page', () => closeLogic())
      );
      head.append(titles, actionsWrap);

      const body = el('div', 'mtw-pb-designer');
      // Parts palette
      const palettePane = el('aside', 'mtw-pb-logic-palette');
      palettePane.appendChild(el('p', 'mtw-pb-field-help', 'Drag a part into the card, or click to add it at the bottom.'));
      const tiles = el('div', 'mtw-pb-step-tiles');
      Object.entries(c.CARD_PARTS).forEach(([type, def]) => {
        const tile = el('div', 'mtw-pb-step-tile', null, { role: 'button', tabindex: '0', title: def.description });
        tile.dataset.partType = type;
        tile.append(el('strong', '', def.label), el('span', '', def.description));
        const add = index => {
          // An image on "Cards people add": use (or make) an Image field, so the Add card
          // popup gets a web address box for it.
          if (type === 'image' && props.source === 'added' && c.findTable(history.page, props.table)) {
            const table = c.findTable(history.page, props.table);
            let page = history.page;
            let field = table.fields.find(f => f.type === 'image');
            if (!field) {
              const made = attempt(() => c.addField(page, table.id, 'Image', 'image'));
              if (!made || !made.key) return;
              page = syncForm(made.page, table.id, props.formPopup);
              field = { key: made.key };
            }
            const result = attempt(() => c.cardDesign.add(c.findBlock(page, blockId).block.props.design, 'image',
              index === null ? 0 : index, { source: 'field', field: field.key }));
            if (result) commit(c.updateBlock(page, blockId, { props: { design: result.design } }));
            return;
          }
          const result = attempt(() => c.cardDesign.add(current(), type, index === null ? undefined : index,
            type === 'field' || type === 'badge' ? { field: (cardFieldOptions(props)[0] || [''])[0] } : null));
          if (result) setDesign(result.design);
        };
        tile.addEventListener('pointerdown', event => startListDrag(event, {
          group: `parts:${blockId}`, label: def.label, tap: () => add(null), onDrop: (container, index) => add(index)
        }));
        tile.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            add(null);
          }
        });
        tiles.appendChild(tile);
      });
      palettePane.appendChild(tiles);

      // Parts list
      const listPane = el('div', 'mtw-pb-logic-list mtw-pb-design-list');
      const list = el('div', 'mtw-pb-cards', null, { 'data-drop-group': `parts:${blockId}` });
      design.parts.forEach((part, i) => {
        const def = c.CARD_PARTS[part.type];
        const card = el('div', `mtw-pb-card-item mtw-pb-part mtw-pb-part-${part.type}`, null, { 'data-drag-item': part.id });
        card.dataset.partId = part.id;
        const label = part.field ? `${def.label}: ${(cardFieldOptions(props).find(([k]) => k === part.field) || ['', part.field])[1]}` : def.label;
        card.appendChild(cardHeader(`${i + 1}. ${label}`,
          () => ({ group: `parts:${blockId}`, id: part.id, label: def.label, onDrop: (container, index) => setDesign(c.cardDesign.move(current(), part.id, index)) }),
          () => setDesign(c.cardDesign.remove(current(), part.id)), `Delete ${def.label}`));
        const fieldsBox = el('div', 'mtw-pb-step-body');
        def.fields.filter(field => visible(field, part)).forEach(field => {
          if (field.type === 'actions') {
            const count = c.steps.count(part.actions || []);
            const wrap = el('div', 'mtw-pb-field mtw-pb-part-steps');
            wrap.appendChild(el('label', '', 'Steps'));
            wrap.appendChild(button('mtw-pb-btn mtw-pb-btn-primary-dark mtw-pb-part-edit-steps', count ? `Edit steps (${count})` : 'Add steps',
              'Open the steps editor for this button', () => openLogic(`part:${blockId}:${part.id}`, { designer: blockId })));
            fieldsBox.appendChild(wrap);
            return;
          }
          fieldsBox.appendChild(fieldControl(field, part[field.key], value => {
            const next = c.cardDesign.update(current(), part.id, { [field.key]: value });
            if (['select', 'cardfield', 'popup'].includes(field.type)) setDesign(next);
            else setDesign(next, `${blockId}:part:${part.id}:${field.key}`);
          }, { cardFields: cardFieldOptions(props), recordTable: props.source === 'manual' ? 'manual-cards' : props.table }));
        });
        card.appendChild(fieldsBox);
        list.appendChild(card);
      });
      if (!design.parts.length) list.appendChild(el('div', 'mtw-pb-steps-empty', 'Drag parts in to build the card.'));
      listPane.appendChild(list);

      // Preview + card look
      const side = el('aside', 'mtw-pb-design-side');
      side.appendChild(sectionTitle('Preview'));
      const previewWrap = el('div', 'mtw-pb-page mtw-pb-design-preview');
      const card = el('div', 'mtw-pb-record-card');
      renderer().applyCardStyle(card, design.style);
      const fieldMap = {};
      cardFieldOptions(props).forEach(([key, label]) => { fieldMap[key] = { label, type: 'text' }; });
      const table = c.findTable(history.page, props.table);
      if (table && props.source !== 'manual') table.fields.forEach(f => { fieldMap[f.key] = f; });
      renderer().fillDesignedCard(document, card, design, sampleRecord(props), fieldMap, null, { preview: true, editing: true, isManager: true, table: props.source === 'manual' ? '' : props.table });
      previewWrap.appendChild(card);
      side.appendChild(previewWrap);
      side.appendChild(sectionTitle('Card look'));
      c.CARD_STYLE_FIELDS.forEach(field => {
        side.appendChild(fieldControl(field, design.style[field.key], value => {
          setDesign(c.cardDesign.setStyle(current(), { [field.key]: value === undefined ? '' : value }), `${blockId}:cardstyle:${field.key}`);
        }));
      });

      body.append(palettePane, listPane, side);
      logic.replaceChildren(head, body);
      listPane.scrollTop = listScroll;
    }

    // While typing in the designer: redraw only the preview card (fields keep focus).
    function refreshDesignPreview() {
      const blockId = state.logic.designer;
      const found = c.findBlock(history.page, blockId);
      const wrap = logic.querySelector('.mtw-pb-design-preview');
      if (!found || !wrap) return;
      const props = found.block.props;
      const card = el('div', 'mtw-pb-record-card');
      renderer().applyCardStyle(card, props.design.style);
      const fieldMap = {};
      cardFieldOptions(props).forEach(([key, label]) => { fieldMap[key] = { label, type: 'text' }; });
      const table = c.findTable(history.page, props.table);
      if (table && props.source !== 'manual') table.fields.forEach(f => { fieldMap[f.key] = f; });
      renderer().fillDesignedCard(document, card, props.design, sampleRecord(props), fieldMap, null, { preview: true, editing: true, isManager: true, table: props.source === 'manual' ? '' : props.table });
      wrap.replaceChildren(card);
    }

    function openLogic(scopeKey, returnTo) {
      state.logic = { scope: scopeKey, returnTo: returnTo || null };
      renderLogic();
      const first = logic.querySelector('.mtw-pb-logic-done');
      if (first) first.focus();
    }

    function closeLogic() {
      state.logic = state.logic && state.logic.returnTo ? state.logic.returnTo : null;
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
      if (state.logic.designer) {
        renderDesigner(state.logic.designer);
        return;
      }
      const key = state.logic.scope;
      let title;
      let trigger;
      if (key === 'page') {
        title = 'This page';
        trigger = 'When the page opens';
      } else if (key.startsWith('auto:')) {
        const auto = (history.page.automations || []).find(a => a.id === key.slice(5));
        if (!auto) {
          state.logic = null;
          logic.hidden = true;
          overlay.classList.remove('has-logic');
          return;
        }
        title = 'Automation';
        trigger = automationLabel(auto);
      } else if (key.startsWith('part:')) {
        const [, blockId, partId] = key.split(':');
        const owner = c.findBlock(history.page, blockId);
        const part = owner && owner.block.props.design.parts.find(item => item.id === partId);
        title = `Card button: ${part ? part.label : ''}`;
        trigger = 'When it is clicked (on a card)';
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
          : found.block.type === 'records' || (found.block.type === 'table' && found.block.props.source === 'table') ? 'When a row is clicked'
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
        items.filter(([, def]) => !def.needsRecord || (scope.recordTable && scope.recordTable !== 'manual-cards'))
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
      else if (state.logic && state.logic.designer) refreshDesignPreview();
      if (state.paletteTab === 'data' || state.paletteTab === 'popups') buildPalette();
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
      const root0 = frame.querySelector('.mtw-pb-page');
      if (!root0) return null;
      const page = root0.querySelector('.mtw-pb-popup-body') || root0; // a popup's sections, or the page's
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
          const added = attempt(() => c.addSection(page, '1', target.index, state.canvas));
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
        else if (state.canvas && !sel) openCanvas(null);
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
      if (state.previewRuntime) state.previewRuntime.dispose();
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
