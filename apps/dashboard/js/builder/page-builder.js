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
    delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'
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
      if (state.preview) state.selected = null;
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
    body.append(palette, stage, inspector);
    overlay.append(top, confirmBar, body);

    const ghost = el('div', 'mtw-pb-ghost');
    ghost.hidden = true;
    const dropLine = el('div', 'mtw-pb-drop-line');
    overlay.append(ghost);

    // ---------- palette ----------
    function buildPalette() {
      palette.replaceChildren();
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
      const exists = sel.kind === 'block' ? c.findBlock(history.page, sel.id) : c.findSection(history.page, sel.id);
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
      const node = renderer().render(page, { editing: !state.preview });
      frame.replaceChildren(node);
      if (state.preview) return;

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
    function fieldControl(field, value, onChange) {
      const id = `mtw-pb-f-${field.key}-${Math.random().toString(36).slice(2, 7)}`;
      const wrap = el('div', 'mtw-pb-field');
      wrap.dataset.field = field.key;
      wrap.appendChild(el('label', '', field.label, { for: id }));
      let input;
      if (field.type === 'textarea') {
        input = el('textarea', '', null, { id, rows: '4' });
        input.value = value || '';
      } else if (field.type === 'select' || field.type === 'tool') {
        input = el('select', '', null, { id });
        const options = field.type === 'tool'
          ? [['', 'Choose a tool']].concat(Object.entries(root.MTW_TOOL_REGISTRY || {})
            .filter(([toolKey]) => toolKey !== toolId)
            .map(([toolKey, tool]) => [toolKey, tool.name || toolKey]))
          : field.options;
        options.forEach(([optionValue, label]) => {
          const option = el('option', '', label);
          option.value = optionValue;
          input.appendChild(option);
        });
        input.value = value === undefined || value === null ? '' : String(value);
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
      const read = () => (field.type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value);
      input.addEventListener(field.type === 'select' || field.type === 'tool' ? 'change' : 'input', () => onChange(read()));
      wrap.appendChild(input);
      return wrap;
    }

    function visible(field, props) {
      return !field.when || Object.entries(field.when).every(([key, value]) => props[key] === value);
    }

    function renderInspector() {
      inspector.replaceChildren();
      const sel = state.selected;
      const page = history.page;
      if (state.preview) {
        inspector.append(el('h3', '', 'Preview'), el('p', 'mtw-pb-muted', 'This is how the page looks to people using the tool. Press Edit to keep editing.'));
        return;
      }
      if (!sel) {
        inspector.append(
          el('h3', '', 'Page'),
          el('p', 'mtw-pb-muted', 'Click a block or a section on the page to change it.'),
          el('p', 'mtw-pb-muted', 'Blocks use the dashboard\'s global CSS. Add your own class names under Look to use other global styles.'),
          el('p', 'mtw-pb-muted', 'Shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+D duplicate, Delete removes, Alt+Up/Down moves, Esc deselects, Ctrl+S saves a draft.')
        );
        inspector.appendChild(el('p', 'mtw-pb-muted', `${c.countBlocks(page)} blocks in ${page.sections.length} sections.`));
        return;
      }
      if (sel.kind === 'block') {
        const found = c.findBlock(page, sel.id);
        if (!found) return;
        const def = c.BLOCKS[found.block.type];
        inspector.appendChild(el('h3', '', def.label));
        if (def.fields.length) {
          inspector.appendChild(el('h4', 'mtw-pb-group', 'Content'));
          def.fields.filter(field => visible(field, found.block.props)).forEach(field => {
            inspector.appendChild(fieldControl(field, found.block.props[field.key], value => {
              const next = c.updateBlock(history.page, sel.id, { props: { [field.key]: value } });
              commit(next, undefined, `${sel.id}:p:${field.key}`);
              if (field.type === 'select' && def.fields.some(other => other.when && other.when[field.key] !== undefined)) renderInspector();
            }));
          });
        }
        inspector.appendChild(el('h4', 'mtw-pb-group', 'Look'));
        c.STYLE_FIELDS.forEach(field => {
          inspector.appendChild(fieldControl(field, found.block.style[field.key], value => {
            const next = c.updateBlock(history.page, sel.id, { style: { [field.key]: value === undefined ? '' : value } });
            commit(next, undefined, `${sel.id}:s:${field.key}`);
          }));
        });
        inspector.appendChild(itemActions('block', sel.id));
      } else {
        const found = c.findSection(page, sel.id);
        if (!found) return;
        inspector.appendChild(el('h3', '', 'Section'));
        c.SECTION_FIELDS.forEach(field => {
          const value = field.key === 'layout' ? found.section.layout : found.section.style[field.key];
          inspector.appendChild(fieldControl(field, value, next => {
            const changes = field.key === 'layout' ? { layout: next } : { style: { [field.key]: next === undefined ? '' : next } };
            commit(c.updateSection(history.page, sel.id, changes), undefined, `${sel.id}:x:${field.key}`);
          }));
        });
        inspector.appendChild(el('h4', 'mtw-pb-group', 'Look'));
        c.STYLE_FIELDS.filter(field => !['fontSize', 'fontWeight'].includes(field.key)).forEach(field => {
          inspector.appendChild(fieldControl(field, found.section.style[field.key], value => {
            commit(c.updateSection(history.page, sel.id, { style: { [field.key]: value === undefined ? '' : value } }),
              undefined, `${sel.id}:s:${field.key}`);
          }));
        });
        inspector.appendChild(itemActions('section', sel.id));
      }
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
        else if (sel) select(null);
        else editor.close();
        return;
      }
      if (!sel) return;
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
