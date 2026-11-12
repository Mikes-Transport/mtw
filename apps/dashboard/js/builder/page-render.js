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

  function fmt(value, type) {
    if (value === undefined || value === null) return '';
    if (type === 'yesno') return value === true || value === 'Yes' ? 'Yes' : value === false || value === 'No' ? 'No' : String(value);
    return String(value);
  }

  function when(ms) {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (error) {
      return '';
    }
  }

  function renderInput(doc, block, options) {
    const rt = options.runtime;
    const spec = rt ? rt.inputSpec(block) : { kind: block.props.kind, required: false, options: [] };
    const wrap = el(doc, 'div', 'mtw-pb-input');
    const id = `mtw-pb-in-${block.id}`;
    const label = el(doc, 'label', 'mtw-pb-input-label', block.props.label);
    label.htmlFor = id;
    if (spec.required) label.appendChild(el(doc, 'span', 'mtw-pb-required', ' *'));
    let control;
    if (spec.kind === 'longtext') {
      control = el(doc, 'textarea');
      control.rows = 4;
    } else if (spec.kind === 'choice') {
      control = el(doc, 'select');
      const blank = el(doc, 'option', '', 'Choose...');
      blank.value = '';
      control.appendChild(blank);
      spec.options.forEach(optionText => {
        const option = el(doc, 'option', '', optionText);
        option.value = optionText;
        control.appendChild(option);
      });
    } else if (spec.kind === 'yesno') {
      control = el(doc, 'select');
      ['No', 'Yes'].forEach(optionText => {
        const option = el(doc, 'option', '', optionText);
        option.value = optionText;
        control.appendChild(option);
      });
    } else {
      control = el(doc, 'input');
      control.type = spec.kind === 'number' ? 'number' : spec.kind === 'date' ? 'date' : 'text';
    }
    control.id = id;
    control.className = 'mtw-pb-control';
    control.name = block.name;
    if (block.props.placeholder && control.tagName !== 'SELECT') control.placeholder = block.props.placeholder;
    if (spec.required) control.required = true;
    control.value = rt ? String(rt.value(block.name)) : '';
    if (options.editing) {
      control.tabIndex = -1;
      control.readOnly = true;
    } else if (rt) {
      control.addEventListener('input', () => rt.setValue(block.name, control.value, true));
      control.addEventListener('change', () => {
        rt.setValue(block.name, control.value, true);
        rt.run(block.props.actions);
      });
    }
    wrap.append(label, control);
    return wrap;
  }

  function renderRecords(doc, block, options) {
    const rt = options.runtime;
    const p = block.props;
    const node = el(doc, 'div', 'mtw-pb-records');
    const def = rt && rt.tables[p.table];
    if (!def) {
      node.appendChild(el(doc, 'div', 'mtw-pb-placeholder', 'Pick a data table for this list'));
      return node;
    }
    const fields = (p.columns.length ? p.columns.map(key => def.fields.find(f => f.key === key)).filter(Boolean) : def.fields);
    let search = null;
    if (p.search === 'yes') {
      search = el(doc, 'input', 'mtw-pb-control mtw-pb-records-search');
      search.type = 'search';
      search.placeholder = `Search ${def.name.toLowerCase()}...`;
      search.setAttribute('aria-label', `Search ${def.name}`);
      if (options.editing) search.readOnly = true;
      node.appendChild(search);
    }
    const wrap = el(doc, 'div', 'mtw-pb-table-wrap');
    const tableEl = el(doc, 'table', 'mtw-pb-table');
    const head = tableEl.createTHead().insertRow();
    fields.forEach(field => head.appendChild(el(doc, 'th', '', field.label)));
    head.appendChild(el(doc, 'th', 'mtw-pb-records-when', 'Added'));
    const canDelete = canDeleteRows(p, options);
    const clickable = !options.editing && p.actions && p.actions.length;
    if (clickable) node.classList.add('is-clickable');
    if (canDelete) head.appendChild(el(doc, 'th', 'mtw-pb-records-actions', ''));
    const body = tableEl.appendChild(el(doc, 'tbody'));
    wrap.appendChild(tableEl);
    node.appendChild(wrap);
    const status = el(doc, 'p', 'mtw-pb-records-status');
    node.appendChild(status);

    let entry = null;
    const draw = () => {
      body.replaceChildren();
      if (!entry || !entry.loaded) {
        status.textContent = 'Loading...';
        return;
      }
      if (entry.error) {
        status.textContent = `Could not load records: ${entry.error.message || entry.error.code || 'unknown error'}`;
        return;
      }
      const term = search ? search.value.trim().toLowerCase() : '';
      let rows = entry.rows.slice();
      if (p.order === 'newest') rows.reverse();
      if (term) rows = rows.filter(row => fields.some(field => fmt(row[field.key], field.type).toLowerCase().includes(term)));
      const total = rows.length;
      rows = rows.slice(0, p.limit);
      rows.forEach(row => {
        const tr = body.insertRow();
        if (clickable) {
          tr.tabIndex = 0;
          const go = () => rt.run(p.actions, { record: row, table: p.table });
          tr.addEventListener('click', event => {
            if (!event.target.closest('.mtw-pb-records-delete')) go();
          });
          tr.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.target.closest('.mtw-pb-records-delete')) go();
          });
        }
        fields.forEach(field => tr.appendChild(el(doc, 'td', '', fmt(row[field.key], field.type))));
        const added = el(doc, 'td', 'mtw-pb-records-when', when(row._createdAt));
        if (row._createdBy) added.title = `Added by ${row._createdBy}`;
        tr.appendChild(added);
        if (canDelete) {
          const cell = el(doc, 'td', 'mtw-pb-records-actions');
          const del = el(doc, 'button', 'mtw-pb-records-delete', 'Delete');
          del.type = 'button';
          del.addEventListener('click', event => {
            event.stopPropagation();
            deleteRow(p, row, options, del);
          });
          cell.appendChild(del);
          tr.appendChild(cell);
        }
      });
      status.textContent = !entry.rows.length ? p.emptyText
        : !total ? 'No records match.'
          : total > rows.length ? `Showing ${rows.length} of ${total}.` : '';
    };
    if (search) search.addEventListener('input', draw);
    rt.watch(p.table, node, current => {
      entry = current;
      draw();
    });
    return node;
  }

  function canDeleteRows(p, options) {
    const rt = options.runtime;
    return !options.editing && rt && (p.allowDelete === 'everyone' || (p.allowDelete === 'managers' && rt.isManager));
  }

  async function deleteRow(p, row, options, button) {
    const ok = options.ui && options.ui.confirm ? await options.ui.confirm('Delete this record? This cannot be undone.') : true;
    if (!ok) return;
    if (button) button.disabled = true;
    try {
      await options.runtime.remove(p.table, row._id);
    } catch (error) {
      if (button) button.disabled = false;
      if (options.ui && options.ui.toast) options.ui.toast(`Could not delete: ${error.message || 'unknown error'}`, 'danger');
    }
  }

  function renderCards(doc, block, options) {
    const rt = options.runtime;
    const p = block.props;
    const node = el(doc, 'div', 'mtw-pb-cards');
    const def = rt && rt.tables[p.table];
    if (!def) {
      node.appendChild(el(doc, 'div', 'mtw-pb-placeholder', 'Pick a data table for these cards'));
      return node;
    }
    const field = key => def.fields.find(f => f.key === key);
    const titleField = field(p.titleField) || def.fields[0] || null;
    const textField = field(p.textField);
    const extras = p.fields.map(field).filter(Boolean).filter(f => f !== titleField && f !== textField);
    let search = null;
    if (p.search === 'yes') {
      search = el(doc, 'input', 'mtw-pb-control mtw-pb-records-search');
      search.type = 'search';
      search.placeholder = `Search ${def.name.toLowerCase()}...`;
      search.setAttribute('aria-label', `Search ${def.name}`);
      if (options.editing) search.readOnly = true;
      node.appendChild(search);
    }
    const grid = el(doc, 'div', 'mtw-pb-card-grid');
    grid.style.gridTemplateColumns = `repeat(${p.perRow}, minmax(0, 1fr))`;
    grid.dataset.perRow = String(p.perRow);
    node.appendChild(grid);
    const status = el(doc, 'p', 'mtw-pb-records-status');
    node.appendChild(status);
    const clickable = !options.editing && p.actions && p.actions.length;
    const canDelete = canDeleteRows(p, options);
    let entry = null;
    const draw = () => {
      grid.replaceChildren();
      if (!entry || !entry.loaded) {
        status.textContent = 'Loading...';
        return;
      }
      if (entry.error) {
        status.textContent = `Could not load records: ${entry.error.message || entry.error.code || 'unknown error'}`;
        return;
      }
      const term = search ? search.value.trim().toLowerCase() : '';
      let rows = entry.rows.slice();
      if (p.order === 'newest') rows.reverse();
      if (term) rows = rows.filter(row => def.fields.some(f => fmt(row[f.key], f.type).toLowerCase().includes(term)));
      const total = rows.length;
      rows = rows.slice(0, p.limit);
      rows.forEach(row => {
        const card = el(doc, clickable ? 'button' : 'div', 'mtw-pb-record-card');
        if (clickable) {
          card.type = 'button';
          card.addEventListener('click', event => {
            if (event.target.closest('.mtw-pb-records-delete')) return;
            rt.run(p.actions, { record: row, table: p.table });
          });
        }
        if (titleField) card.appendChild(el(doc, 'strong', 'mtw-pb-record-card-title', fmt(row[titleField.key], titleField.type) || '(untitled)'));
        if (textField && row[textField.key] !== undefined && row[textField.key] !== '') {
          card.appendChild(el(doc, 'p', 'mtw-pb-record-card-text', fmt(row[textField.key], textField.type)));
        }
        if (extras.length) {
          const dl = el(doc, 'dl', 'mtw-pb-record-card-fields');
          extras.forEach(f => {
            dl.append(el(doc, 'dt', '', f.label), el(doc, 'dd', '', fmt(row[f.key], f.type) || '-'));
          });
          card.appendChild(dl);
        }
        const foot = el(doc, 'div', 'mtw-pb-record-card-foot');
        foot.appendChild(el(doc, 'span', 'mtw-pb-records-when', when(row._createdAt)));
        if (canDelete) {
          const del = el(doc, 'span', 'mtw-pb-records-delete', 'Delete');
          del.setAttribute('role', 'button');
          del.tabIndex = 0;
          del.addEventListener('click', event => {
            event.stopPropagation();
            deleteRow(p, row, options, null);
          });
          foot.appendChild(del);
        }
        card.appendChild(foot);
        grid.appendChild(card);
      });
      status.textContent = !entry.rows.length ? p.emptyText
        : !total ? 'No cards match.'
          : total > rows.length ? `Showing ${rows.length} of ${total}.` : '';
    };
    if (search) search.addEventListener('input', draw);
    rt.watch(p.table, node, current => {
      entry = current;
      draw();
    });
    return node;
  }

  function renderBlock(doc, block, options) {
    const p = block.props;
    const rt = options.runtime;
    const override = rt && block.name ? rt.text(block.name) : null;
    const text = value => (override !== null ? override : value);
    let node;
    switch (block.type) {
      case 'heading':
        node = el(doc, p.level, `mtw-pb-heading mtw-pb-${p.level}`, text(p.text));
        break;
      case 'text':
        node = textBlock(doc, 'p', 'mtw-pb-text', text(p.text));
        break;
      case 'input':
        node = renderInput(doc, block, options);
        break;
      case 'records':
        node = renderRecords(doc, block, options);
        break;
      case 'cards':
        node = renderCards(doc, block, options);
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
        if (text(p.text)) node.appendChild(textBlock(doc, 'p', 'mtw-pb-notice-text', text(p.text)));
        break;
      }
      case 'button': {
        const wrap = el(doc, 'div', 'mtw-pb-button-wrap');
        const button = el(doc, 'button', `mtw-pb-button mtw-pb-button-${p.variant}`, text(p.label) || 'Button');
        button.type = 'button';
        button.addEventListener('click', async event => {
          if (options.editing || !rt) return event.preventDefault();
          button.disabled = true;
          try {
            await rt.run(p.actions);
          } finally {
            button.disabled = false;
          }
        });
        wrap.appendChild(button);
        node = wrap;
        break;
      }
      case 'card': {
        node = el(doc, 'div', 'mtw-pb-card');
        if (text(p.title)) node.appendChild(el(doc, 'h3', 'mtw-pb-card-title', text(p.title)));
        if (p.text) node.appendChild(textBlock(doc, 'p', 'mtw-pb-card-text', p.text));
        break;
      }
      case 'stat': {
        node = el(doc, 'div', 'mtw-pb-stat');
        node.appendChild(el(doc, 'span', 'mtw-pb-stat-label', p.label));
        const valueNode = el(doc, 'strong', 'mtw-pb-stat-value', override !== null ? override : p.source === 'count' ? '' : p.value);
        node.appendChild(valueNode);
        if (p.source === 'count' && override === null) {
          if (rt && rt.tables[p.table]) {
            rt.watch(p.table, node, entry => {
              valueNode.textContent = entry.error ? '-' : entry.loaded ? String(rt.count(block)) : '...';
            });
          } else valueNode.textContent = '-';
        }
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
        const tableEl = el(doc, 'table', 'mtw-pb-table');
        if (p.header === 'yes' && p.columns.length) {
          const head = tableEl.createTHead().insertRow();
          p.columns.forEach(col => head.appendChild(el(doc, 'th', '', col.label)));
        }
        const body = tableEl.appendChild(el(doc, 'tbody'));
        p.rows.forEach(row => {
          const tr = body.insertRow();
          p.columns.forEach(col => tr.appendChild(el(doc, 'td', '', row.cells[col.id] || '')));
        });
        node.appendChild(tableEl);
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
    if (block.name) node.dataset.name = block.name;
    if (!options.editing && rt && block.name && rt.isHidden(block.name)) node.style.display = 'none';
    if (options.editing && block.hidden) node.classList.add('is-start-hidden');
    applyStyle(node, block.style);
    return node;
  }

  function renderSection(doc, section, options) {
    const node = el(doc, 'section', 'mtw-pb-section');
    node.dataset.sectionId = section.id;
    if (section.popup) {
      node.classList.add('is-popup');
      node.dataset.name = section.name;
    }
    node.dataset.layout = section.layout;
    applyStyle(node, section.style);
    const row = el(doc, 'div', 'mtw-pb-row');
    row.style.gridTemplateColumns = core().LAYOUTS[section.layout].map(part => `minmax(0, ${part}fr)`).join(' ');
    if (section.style.gap !== undefined) row.style.gap = `${section.style.gap}px`;
    if (section.style.valign) {
      row.style.alignItems = section.style.valign;
      row.dataset.valign = section.style.valign;
    }
    section.columns.forEach(column => {
      const col = el(doc, 'div', 'mtw-pb-col');
      col.dataset.columnId = column.id;
      // A column of only buttons lines them up side by side.
      if (column.blocks.length > 1 && column.blocks.every(block => block.type === 'button')) {
        col.classList.add('mtw-pb-col-buttons');
        col.dataset.align = column.blocks[0].style.align || 'left';
      }
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
        if (block.hidden) item.classList.add('is-start-hidden');
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

  function popupShell(doc, section, sectionNode, ui) {
    const shell = el(doc, 'div', 'mtw-pb-popup');
    shell.dataset.popup = section.name;
    shell.hidden = true;
    const dialog = el(doc, 'div', 'mtw-pb-popup-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', section.title || section.name);
    const head = el(doc, 'div', 'mtw-pb-popup-head');
    head.appendChild(el(doc, 'strong', '', section.title || ''));
    const close = el(doc, 'button', 'mtw-pb-popup-close', '\u00d7');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => ui.closePopup(section.name));
    head.appendChild(close);
    dialog.append(head, sectionNode);
    shell.appendChild(dialog);
    shell.addEventListener('mousedown', event => {
      if (event.target === shell) ui.closePopup(section.name);
    });
    return shell;
  }

  // The page's message area, confirm box, and redraw hook for the runtime.
  function pageUi(doc, node, page, options) {
    const toasts = el(doc, 'div', 'mtw-pb-toasts');
    toasts.setAttribute('aria-live', 'polite');
    node.prepend(toasts);
    const blocks = {};
    core().pageElements(page).forEach(item => { blocks[item.name] = item.block; });
    const openPopups = [];
    const view = doc.defaultView;
    if (view && !options.editing) {
      view.addEventListener('keydown', event => {
        if (event.key === 'Escape' && openPopups.length && node.isConnected) ui.closePopup('');
      });
    }
    const ui = {
      toast(message, tone) {
        const toast = el(doc, 'div', `mtw-pb-toast mtw-pb-toast-${tone || 'info'}`, message);
        toast.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
        toasts.appendChild(toast);
        const view = doc.defaultView;
        if (view) view.setTimeout(() => toast.remove(), tone === 'danger' ? 8000 : 4000);
      },
      confirm(question) {
        return new Promise(resolve => {
          const box = el(doc, 'div', 'mtw-pb-ask');
          box.setAttribute('role', 'alertdialog');
          box.appendChild(el(doc, 'p', '', question));
          const yes = el(doc, 'button', 'mtw-pb-button mtw-pb-button-primary', 'Yes');
          const no = el(doc, 'button', 'mtw-pb-button mtw-pb-button-secondary', 'No');
          yes.type = 'button';
          no.type = 'button';
          const done = answer => {
            box.remove();
            resolve(answer);
          };
          yes.addEventListener('click', () => done(true));
          no.addEventListener('click', () => done(false));
          box.append(yes, no);
          toasts.appendChild(box);
          yes.focus();
        });
      },
      update(name) {
        const block = blocks[name];
        const current = node.querySelector(`[data-name="${name}"]`);
        if (!block || !current) return;
        if (block.type === 'input') {
          const control = current.querySelector('.mtw-pb-control');
          const value = String(options.runtime.value(name));
          if (control && control.value !== value) control.value = value;
          current.style.display = options.runtime.isHidden(name) ? 'none' : '';
          return;
        }
        current.replaceWith(renderBlock(doc, block, options));
      },
      openPopup(name) {
        const shell = node.querySelector(`.mtw-pb-popup[data-popup="${name}"]`);
        if (!shell) return;
        shell.hidden = false;
        openPopups.push(name);
        const focusable = shell.querySelector('input, select, textarea, button:not(.mtw-pb-popup-close)') || shell.querySelector('button');
        if (focusable) focusable.focus();
      },
      closePopup(name) {
        const target = name || openPopups[openPopups.length - 1];
        if (!target) return;
        const shell = node.querySelector(`.mtw-pb-popup[data-popup="${target}"]`);
        if (shell) shell.hidden = true;
        const i = openPopups.lastIndexOf(target);
        if (i !== -1) openPopups.splice(i, 1);
      },
      download(filename, content, type) {
        const view = doc.defaultView || root;
        const blob = new view.Blob([content], { type: type || 'text/plain' });
        const url = view.URL.createObjectURL(blob);
        const a = el(doc, 'a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        doc.body.appendChild(a);
        a.click();
        a.remove();
        view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
      },
      // Resolves to the chosen file's text, or null if nothing was picked.
      pickFile(accept) {
        return new Promise(resolve => {
          const input = el(doc, 'input', 'mtw-pb-file-input');
          input.type = 'file';
          input.accept = accept || '';
          input.style.display = 'none';
          node.appendChild(input);
          let settled = false;
          const finish = value => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(value);
          };
          input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return finish(null);
            if (file.size > 5 * 1024 * 1024) {
              ui.toast('That file is bigger than 5 MB.', 'danger');
              return finish(null);
            }
            const reader = new (doc.defaultView || root).FileReader();
            reader.onload = () => finish(String(reader.result || ''));
            reader.onerror = () => finish(null);
            reader.readAsText(file);
          });
          input.addEventListener('cancel', () => finish(null));
          input.click();
        });
      },
      // Shows what an import will do; resolves true to go ahead.
      importPreview(info) {
        return new Promise(resolve => {
          const shell = el(doc, 'div', 'mtw-pb-popup mtw-pb-import');
          const dialog = el(doc, 'div', 'mtw-pb-popup-dialog');
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-modal', 'true');
          const head = el(doc, 'div', 'mtw-pb-popup-head');
          head.appendChild(el(doc, 'strong', '', `Import into ${info.table.name}`));
          dialog.appendChild(head);
          dialog.appendChild(el(doc, 'p', '', `${info.rows.length} of ${info.total} rows ready to add.${info.skipped.length ? ` ${info.skipped.length} will be skipped.` : ''}`));
          const map = el(doc, 'ul', 'mtw-pb-import-map');
          info.matched.forEach(m => map.appendChild(el(doc, 'li', m.field ? '' : 'is-unmatched',
            m.field ? `${m.column} \u2192 ${m.field}` : `${m.column}: not imported (no matching field)`)));
          dialog.appendChild(map);
          if (info.rows.length) {
            const wrap = el(doc, 'div', 'mtw-pb-table-wrap');
            const tableEl = el(doc, 'table', 'mtw-pb-table');
            const headRow = tableEl.createTHead().insertRow();
            info.table.fields.forEach(f => headRow.appendChild(el(doc, 'th', '', f.label)));
            const body = tableEl.appendChild(el(doc, 'tbody'));
            info.rows.slice(0, 5).forEach(row => {
              const tr = body.insertRow();
              info.table.fields.forEach(f => tr.appendChild(el(doc, 'td', '', fmt(row[f.key], f.type))));
            });
            wrap.appendChild(tableEl);
            dialog.appendChild(wrap);
          }
          if (info.skipped.length) {
            const list = el(doc, 'ul', 'mtw-pb-import-skipped');
            info.skipped.slice(0, 5).forEach(text => list.appendChild(el(doc, 'li', '', text)));
            if (info.skipped.length > 5) list.appendChild(el(doc, 'li', '', `...and ${info.skipped.length - 5} more`));
            dialog.appendChild(list);
          }
          const actions = el(doc, 'div', 'mtw-pb-import-actions');
          const go = el(doc, 'button', 'mtw-pb-button mtw-pb-button-primary', `Import ${info.rows.length}`);
          const cancel = el(doc, 'button', 'mtw-pb-button mtw-pb-button-secondary', 'Cancel');
          go.type = 'button';
          cancel.type = 'button';
          go.disabled = !info.rows.length;
          const done = answer => {
            shell.remove();
            resolve(answer);
          };
          go.addEventListener('click', () => done(true));
          cancel.addEventListener('click', () => done(false));
          actions.append(cancel, go);
          dialog.appendChild(actions);
          shell.appendChild(dialog);
          node.appendChild(shell);
          go.focus();
        });
      },
      openTool(id) {
        if (typeof root.openDBTool === 'function') root.openDBTool(id);
      },
      openUrl(url, newTab) {
        if (newTab) root.open(url, '_blank', 'noopener,noreferrer');
        else root.location.assign(url);
      }
    };
    return ui;
  }

  // Returns a .mtw-pb-page element. options: { editing, runtime, toolId, document }.
  // Without a runtime one is made (and returned as node.mtwRuntime).
  function render(page, options) {
    const opts = { ...(options || {}) };
    const doc = opts.document || root.document;
    const safe = core().sanitizePage(page);
    if (!opts.runtime && root.MTW_PAGE_RUNTIME) {
      opts.runtime = root.MTW_PAGE_RUNTIME.create({
        page: safe, toolId: opts.toolId, editing: opts.editing, user: opts.user, isManager: opts.isManager, shared: opts.shared,
        dryRun: opts.dryRun
      });
    }
    const node = el(doc, 'div', 'mtw-pb-page');
    if (opts.editing) node.classList.add('is-editing');
    const ui = pageUi(doc, node, safe, opts);
    opts.ui = ui;
    if (opts.runtime) opts.runtime.setUi(ui);
    safe.sections.forEach(section => {
      const sectionNode = renderSection(doc, section, opts);
      if (section.popup && !opts.editing) node.appendChild(popupShell(doc, section, sectionNode, ui));
      else {
        if (section.popup) {
          const tag = el(doc, 'div', 'mtw-pb-popup-tag', `Popup "${section.title || section.name}" (${section.name}): opens with an Open a popup step`);
          sectionNode.prepend(tag);
        }
        node.appendChild(sectionNode);
      }
    });
    node.mtwRuntime = opts.runtime || null;
    return node;
  }

  // Shows a custom tool's published page in its panel, live-updating when a
  // manager publishes again. Returns an unsubscribe function.
  function mount(panel, toolId, fallback) {
    const api = root.MTW || {};
    let runtime = null;
    const user = root.sessionStorage ? root.sessionStorage.getItem('mtw_admin_name') || '' : '';
    const manager = ['Managers', 'Manager', 'Developer'].includes(user);
    let lastPublished = null;
    const show = data => {
      const published = data && data.published;
      const key = published ? JSON.stringify(published) : '';
      if (key && key === lastPublished) return; // unchanged (e.g. only lastUsed fields moved)
      lastPublished = key;
      if (runtime) runtime.dispose();
      runtime = null;
      if (published && Array.isArray(published.sections) && published.sections.length) {
        const node = render(published, { document: panel.ownerDocument, toolId, user, isManager: manager });
        runtime = node.mtwRuntime;
        panel.replaceChildren(node);
        panel.dataset.pageState = 'published';
        if (runtime) runtime.run(runtime.page.onOpen);
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
        const unsubscribe = api.onSnapshot(ref, snap => show(read(snap)),
          error => console.error('[dashboard] custom tool page:', error));
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe();
          if (runtime) runtime.dispose();
        };
      } catch (error) {
        console.error('[dashboard] custom tool page:', error);
      }
    }
    if (typeof api.getDoc === 'function') {
      api.getDoc(ref).then(snap => show(read(snap)))
        .catch(error => console.error('[dashboard] custom tool page:', error));
    }
    return () => {
      if (runtime) runtime.dispose();
    };
  }

  root.MTW_PAGE_RENDER = { COLLECTION, render, renderBlock, mount };
})(typeof self !== 'undefined' ? self : this);
