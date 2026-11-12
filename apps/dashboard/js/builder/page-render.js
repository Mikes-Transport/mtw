// Renders builder pages (see page-core.js) with the dashboard's global CSS.
// window.MTW_PAGE_RENDER = { render, mount, COLLECTION }.
//
// Safety: text goes in with textContent (never innerHTML), URLs were checked by
// sanitizePage, style values are whitelisted, embeds are sandboxed iframes.
(function (root) {
  'use strict';

  const COLLECTION = 'dashboard-tool-pages';

  function core() {
    const api = root.MTW_PAGE_CORE;
    if (!api) throw new Error('Page builder core is not loaded.');
    return api;
  }

  function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
    return node;
  }

  function applyStyle(node, style) {
    const s = style || {};
    if (s.align) node.style.textAlign = s.align;
    if (s.color) node.style.color = s.color;
    if (s.background) node.style.background = s.background;
    if (s.fontSize) node.style.fontSize = `${s.fontSize}px`;
    if (s.fontWeight) node.style.fontWeight = s.fontWeight;
    if (s.padding !== undefined) node.style.padding = `${s.padding}px`;
    if (s.marginBottom !== undefined) node.style.marginBottom = `${s.marginBottom}px`;
    if (s.radius !== undefined) node.style.borderRadius = `${s.radius}px`;
    if (s.border) node.dataset.border = s.border;
    if (s.shadow) node.dataset.shadow = s.shadow;
    if (s.className) s.className.split(' ').forEach(name => node.classList.add(name));
  }

  // Multi-line text keeps its line breaks (CSS white-space: pre-line).
  function textBlock(doc, tag, className, text) {
    return el(doc, tag, className, text);
  }

  function toolName(id) {
    const tools = root.MTW_TOOL_REGISTRY || {};
    return (tools[id] && tools[id].name) || id;
  }

  function renderBlock(doc, block, options) {
    const p = block.props;
    let node;
    switch (block.type) {
      case 'heading':
        node = el(doc, p.level, `mtw-pb-heading mtw-pb-${p.level}`, p.text);
        break;
      case 'text':
        node = textBlock(doc, 'p', 'mtw-pb-text', p.text);
        break;
      case 'list': {
        node = el(doc, p.ordered === 'yes' ? 'ol' : 'ul', 'mtw-pb-list');
        core().listItems(p.items).forEach(item => node.appendChild(el(doc, 'li', '', item)));
        break;
      }
      case 'notice': {
        node = el(doc, 'div', `mtw-pb-notice mtw-pb-notice-${p.tone}`);
        node.setAttribute('role', p.tone === 'danger' || p.tone === 'warning' ? 'alert' : 'note');
        if (p.title) node.appendChild(el(doc, 'strong', 'mtw-pb-notice-title', p.title));
        if (p.text) node.appendChild(textBlock(doc, 'p', 'mtw-pb-notice-text', p.text));
        break;
      }
      case 'button': {
        const wrap = el(doc, 'div', 'mtw-pb-button-wrap');
        let button;
        if (p.action === 'tool') {
          button = el(doc, 'button', '', p.label || 'Open');
          button.type = 'button';
          button.dataset.tool = p.tool;
          if (!p.tool) button.disabled = true;
          button.title = p.tool ? `Opens ${toolName(p.tool)}` : 'Pick a tool for this button';
          button.addEventListener('click', event => {
            if (options.editing) return event.preventDefault();
            if (p.tool && typeof root.openDBTool === 'function') root.openDBTool(p.tool);
          });
        } else {
          button = el(doc, 'a', '', p.label || 'Open');
          if (p.url) button.href = p.url;
          else button.setAttribute('aria-disabled', 'true');
          if (p.newTab === 'yes') {
            button.target = '_blank';
            button.rel = 'noopener noreferrer';
          }
          button.addEventListener('click', event => {
            if (options.editing || !p.url) event.preventDefault();
          });
        }
        button.classList.add('mtw-pb-button', `mtw-pb-button-${p.variant}`);
        wrap.appendChild(button);
        node = wrap;
        break;
      }
      case 'card': {
        node = el(doc, 'div', 'mtw-pb-card');
        if (p.title) node.appendChild(el(doc, 'h3', 'mtw-pb-card-title', p.title));
        if (p.text) node.appendChild(textBlock(doc, 'p', 'mtw-pb-card-text', p.text));
        break;
      }
      case 'stat': {
        node = el(doc, 'div', 'mtw-pb-stat');
        node.appendChild(el(doc, 'span', 'mtw-pb-stat-label', p.label));
        node.appendChild(el(doc, 'strong', 'mtw-pb-stat-value', p.value));
        if (p.note) node.appendChild(el(doc, 'span', 'mtw-pb-stat-note', p.note));
        break;
      }
      case 'divider':
        node = el(doc, 'hr', 'mtw-pb-divider');
        break;
      case 'spacer':
        node = el(doc, 'div', 'mtw-pb-spacer');
        node.style.height = `${p.height}px`;
        node.setAttribute('aria-hidden', 'true');
        break;
      case 'table': {
        node = el(doc, 'div', 'mtw-pb-table-wrap');
        const table = el(doc, 'table', 'mtw-pb-table');
        const rows = core().tableRows(p.rows);
        const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
        rows.forEach((row, index) => {
          const header = index === 0 && p.header === 'yes';
          const parent = header
            ? (table.tHead || table.createTHead())
            : (table.tBodies[0] || table.appendChild(el(doc, 'tbody')));
          const tr = parent.appendChild(el(doc, 'tr'));
          for (let i = 0; i < width; i += 1) tr.appendChild(el(doc, header ? 'th' : 'td', '', row[i] || ''));
        });
        node.appendChild(table);
        break;
      }
      case 'image': {
        node = el(doc, 'figure', 'mtw-pb-image');
        if (p.src) {
          const img = el(doc, 'img');
          img.src = p.src;
          img.alt = p.alt || '';
          img.loading = 'lazy';
          img.style.objectFit = p.fit;
          if (p.height) img.style.height = `${p.height}px`;
          node.appendChild(img);
        } else {
          node.appendChild(el(doc, 'div', 'mtw-pb-placeholder', 'Add an image address'));
        }
        break;
      }
      case 'embed': {
        node = el(doc, 'div', 'mtw-pb-embed');
        if (p.url) {
          const frame = el(doc, 'iframe');
          frame.src = p.url;
          frame.title = p.title || 'Embedded page';
          frame.loading = 'lazy';
          // Never same-origin + scripts for a page on this site: it could reach the dashboard.
          let sameSite = false;
          try { sameSite = new URL(p.url).origin === root.location.origin; } catch (error) { sameSite = true; }
          frame.setAttribute('sandbox', sameSite
            ? 'allow-scripts allow-forms allow-popups'
            : 'allow-scripts allow-same-origin allow-forms allow-popups');
          frame.setAttribute('referrerpolicy', 'no-referrer');
          frame.style.height = `${p.height}px`;
          if (options.editing) frame.style.pointerEvents = 'none';
          node.appendChild(frame);
        } else {
          node.appendChild(el(doc, 'div', 'mtw-pb-placeholder', 'Add a page address (https://)'));
        }
        break;
      }
      default:
        node = el(doc, 'div');
    }
    node.classList.add('mtw-pb-block', `mtw-pb-block-${block.type}`);
    node.dataset.blockId = block.id;
    applyStyle(node, block.style);
    return node;
  }

  function renderSection(doc, section, options) {
    const node = el(doc, 'section', 'mtw-pb-section');
    node.dataset.sectionId = section.id;
    node.dataset.layout = section.layout;
    applyStyle(node, section.style);
    const row = el(doc, 'div', 'mtw-pb-row');
    row.style.gridTemplateColumns = core().LAYOUTS[section.layout].map(part => `minmax(0, ${part}fr)`).join(' ');
    if (section.style.gap !== undefined) row.style.gap = `${section.style.gap}px`;
    if (section.style.valign) row.style.alignItems = section.style.valign;
    section.columns.forEach(column => {
      const col = el(doc, 'div', 'mtw-pb-col');
      col.dataset.columnId = column.id;
      column.blocks.forEach(block => {
        const node = renderBlock(doc, block, options);
        if (!options.editing) {
          col.appendChild(node);
          return;
        }
        // Editing: a wrapper carries the selection outline and toolbar (some blocks,
        // like <hr>, can't hold children).
        const item = el(doc, 'div', 'mtw-pb-item');
        item.dataset.blockId = block.id;
        item.dataset.blockType = block.type;
        delete node.dataset.blockId;
        item.appendChild(node);
        col.appendChild(item);
      });
      if (options.editing && !column.blocks.length) {
        col.appendChild(el(doc, 'div', 'mtw-pb-col-empty', 'Drop blocks here'));
      }
      row.appendChild(col);
    });
    node.appendChild(row);
    return node;
  }

  // Returns a .mtw-pb-page element. options.editing: links/buttons don't navigate.
  function render(page, options) {
    const opts = options || {};
    const doc = opts.document || root.document;
    const safe = core().sanitizePage(page);
    const node = el(doc, 'div', 'mtw-pb-page');
    if (opts.editing) node.classList.add('is-editing');
    safe.sections.forEach(section => node.appendChild(renderSection(doc, section, opts)));
    return node;
  }

  // Shows a custom tool's published page in its panel, live-updating when a
  // manager publishes again. Returns an unsubscribe function.
  function mount(panel, toolId, fallback) {
    const api = root.MTW || {};
    const show = data => {
      const published = data && data.published;
      if (published && Array.isArray(published.sections) && published.sections.length) {
        panel.replaceChildren(render(published, { document: panel.ownerDocument }));
        panel.dataset.pageState = 'published';
      } else if (typeof fallback === 'function') {
        panel.replaceChildren(...fallback());
        panel.dataset.pageState = 'empty';
      }
    };
    // Works with real Firestore snapshots and simpler stand-ins.
    const read = snap => {
      if (!snap || typeof snap.data !== 'function') return null;
      const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists !== false;
      return exists ? snap.data() : null;
    };
    if (!api.db || typeof api.doc !== 'function') return () => {};
    const ref = api.doc(api.db, COLLECTION, toolId);
    if (typeof api.onSnapshot === 'function') {
      try {
        return api.onSnapshot(ref, snap => show(read(snap)),
          error => console.error('[dashboard] custom tool page:', error));
      } catch (error) {
        console.error('[dashboard] custom tool page:', error);
      }
    }
    if (typeof api.getDoc === 'function') {
      api.getDoc(ref).then(snap => show(read(snap)))
        .catch(error => console.error('[dashboard] custom tool page:', error));
    }
    return () => {};
  }

  root.MTW_PAGE_RENDER = { COLLECTION, render, renderBlock, mount };
})(typeof self !== 'undefined' ? self : this);
