console.log("promo-cards np-v2");

'use strict';

const { $, $$ } = window.MTW;

(function () {


  const HEAD = {
    ep: 'EVERYDAY LOW PRICES!',
    cp: 'MASSIVE CLEARANCE!',
    pp: 'HOT PROMO PRICES!'
  };

  const CAPS = {
    nineup: 9,
    sixup: 6,
    fourup: 4,
    twoup: 2,
    oneup: 1
  };

  const GRID = {
    nineup: [3, 3],
    sixup: [3, 2],
    fourup: [2, 2],
    twoup: [1, 2],
    oneup: [1, 1]
  };

  /* ============================================================
     DEFAULTS — edit these tables to change what new cards start with.
     frame = card colour, head = banner text, title/desc/price/foot = text.
     Per-card tweaks in the edit panel override these (stored on the card).
     ============================================================ */
  const FEEL_COLORS = {
    ep: { frame: '#00a800', head: '#ffffff', title: '#111111', desc: '#333333', price: '#00a800', foot: '#333333' },
    cp: { frame: '#f0e800', head: '#000000', title: '#111111', desc: '#333333', price: '#000000', foot: '#333333' },
    pp: { frame: '#f00', head: '#ffffff', title: '#111111', desc: '#333333', price: '#f00', foot: '#333333' }
  };

  const COLOR_FIELDS = [
    ['frame', 'Card colour'],
    ['head', 'Banner text'],
    ['title', 'Product name'],
    ['desc', 'Description'],
    ['price', 'Price'],
    ['foot', 'Bottom text']
  ];

  const SIZE_DEFAULTS = {
    nineup: { head: 25, title: 15, desc: 11, price: 40, old: 11},
    sixup: { head: 25, title: 18, desc: 12, price: 48, old: 12 },
    fourup: { head: 25, title: 22, desc: 14, price: 64, old: 12 },
    twoup: { head: 56, title: 24, desc: 14, price: 70, old: 15 },
    oneup: { head: 56, title: 25, desc: 15, price: 84, old: 15 }
  };

  const SIZE_FIELDS = [
    ['head', 'Banner text', 12, 72],
    ['title', 'Product name', 10, 40],
    ['desc', 'Description', 8, 24],
    ['price', 'Main price', 14, 150],
    ['old', 'Old price', 8, 24]
  ];

  const ORDER_DEFAULT = ['header', 'title', 'desc', 'price', 'foot'];

  const BLOCK_LABELS = {
    header: 'Top banner',
    title: 'Product name',
    desc: 'Description',
    price: 'Price + old price',
    foot: 'Part no. + note'
  };

  const state = {
    type: 'ep',
    layout: 'nineup',
    cards: []
  };

  const els = {};
  let id = 0;
  let editing = null;
  let initialized = false;

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function cardData(x = {}) {
    x = x || {};
    const type = x.type || state.type || 'ep';
    return {
      id: x.id || 'card-' + (++id),
      type: HEAD[type] ? type : 'ep',
      title: x.title != null ? x.title : 'PRODUCT TITLE',
      descLines: Array.isArray(x.descLines) && x.descLines.length ? x.descLines.slice(0, 4) : ['Product description goes here.'],
      price: x.price != null ? x.price : '999.99',
      oldPrice: x.oldPrice != null ? x.oldPrice : '999.99',
      partNumber: x.partNumber != null ? x.partNumber : '#00000',
      gstNote: x.gstNote != null ? x.gstNote : 'EXCLUSIVE OF GST',
      showOldPrice: x.showOldPrice !== false,
      showPart: x.showPart !== false,
      showGst: x.showGst !== false,
      descCols: Math.min(3, Math.max(1, x.descCols || 1)),
      order: Array.isArray(x.order) && x.order.length ? x.order.slice() : ORDER_DEFAULT.slice(),
      tab: x.tab !== false,
      colors: Object.assign({}, FEEL_COLORS[type] || FEEL_COLORS.ep, x.colors || {}),
      sizes: Object.assign({}, x.sizes || {})
    };
  }

  function get(i) {
    return state.cards.find(
      c => c.id === i
    );
  }

  function add(x) {

    const c =
      cardData(x);

    state.cards.push(c);

    render();

    return c;
  }

  function del(i) {

    state.cards =
      state.cards.filter(
        c => c.id !== i
      );

    if (editing === i) {
      hideEdit();
    }

    render();
  }

  function cache() {

    els.header =
      $('.et-header-wrapper');

    els.type =
      $('.et-tool-type-selector');

    els.layout =
      $('.et-card-type-selector');

    els.list =
      $('.et-current-card-wrapper');

    els.cardView =
      $('.card-view-container');

   els.scrollBtnLeft = 
     $('.card-click-scroll-left');

   els.scrollBtnRight = 
     $('.card-click-scroll-right');

    els.left =
      $('.db-left-content');

    els.menu =
      $('.db-menu-list');

    els.add =
      $('.et-add-card-wrapper [btn="add"]');

    els.print =
      $('.et-print-card-wrapper [btn="print"]');

    els.pages =
      $('.et-card-body-wrapper');
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function money(v) {
    const t = String(v == null ? '' : v).trim().replace(/^\$/, '');
    return t ? '$' + t : '';
  }

  function effSize(c, k) {
    if (c.sizes && c.sizes[k] != null) return c.sizes[k];
    const d = SIZE_DEFAULTS[state.layout] || SIZE_DEFAULTS.nineup;
    return d[k];
  }

  function blockHtml(c, key) {
    const col = c.colors || {};
    if (key === 'header') {
      return '<div class="np-head" style="' + (col.head ? 'color:' + esc(col.head) + ';' : '') + 'font-size:' + effSize(c, 'head') + 'px;">' + esc(HEAD[c.type] || '') + '</div>';
    }
    if (key === 'title') {
      return '<h3 class="np-title" style="' + (col.title ? 'color:' + esc(col.title) + ';' : '') + 'font-size:' + effSize(c, 'title') + 'px;">' + esc(c.title || '') + '</h3>';
    }
    if (key === 'desc') {
      const lines = c.descLines.filter(function(t) { return String(t || '').trim() !== ''; });
      const cls = c.descCols > 1 ? 'np-descboxes cols-' + c.descCols : 'np-descboxes';
      const boxes = lines.length ? lines : ['&nbsp;'];
      return '<div class="' + cls + '">' + boxes.map(function(t) {
        return '<div class="np-descbox" style="' + (col.desc ? 'color:' + esc(col.desc) + ';' : '') + 'font-size:' + effSize(c, 'desc') + 'px;"><p>' + esc(t) + '</p></div>';
      }).join('') + '</div>';
    }
    if (key === 'price') {
      return '<div class="np-price-row"><span class="np-price" style="' + (col.price ? 'color:' + esc(col.price) + ';' : '') + 'font-size:' + effSize(c, 'price') + 'px;">' + esc(money(c.price)) + '</span></div>';
    }
    if (key === 'foot') {
      const st = col.foot ? 'color:' + esc(col.foot) + ';' : '';
      const part = c.showPart ? '<div class="np-part" style="' + st + '">' + esc(c.partNumber || '') + '</div>' : '';
      const hasOld = c.showOldPrice && String(c.oldPrice || '').trim() !== '';
      const gst = (c.showGst || hasOld)
        ? '<div class="np-botrow">' + (c.showGst ? '<span class="np-gst" style="' + st + '">' + esc(c.gstNote || '') + '</span>' : '<span></span>') + (hasOld ? '<span class="np-old" style="' + st + 'font-size:' + effSize(c, 'old') + 'px;">was ' + esc(money(c.oldPrice)) + '</span>' : '<span></span>') + '</div>'
        : '';
      return '<div class="np-foot">' + part + gst + '</div>';
    }
    return '';
  }

  function build(c) {
    const wrap = document.createElement('div');
    wrap.className = 'np-card';
    wrap.dataset.cardId = c.id;
    wrap.dataset.type = c.type;
    wrap.tabIndex = 0;
    const cut = document.createElement('div');
    cut.className = 'np-cut';
    if (c.colors && c.colors.frame) cut.style.background = c.colors.frame;
    if (c.tab !== false) {
      const tab = document.createElement('div');
      tab.className = 'np-tab';
      tab.title = 'Fold here for the shelf rail';
      cut.appendChild(tab);
    }
    c.order.forEach(function(k) {
      const html = (blockHtml(c, k) || '').trim();
      if (!html) return;
      const t = document.createElement('template');
      t.innerHTML = html;
      if (!t.content.firstChild) return;
      if (k === 'header') {
        cut.appendChild(t.content.firstChild);
        return;
      }
      let body = cut.lastElementChild;
      if (!body || !body.classList || !body.classList.contains('np-body')) {
        body = document.createElement('div');
        body.className = 'np-body';
        cut.appendChild(body);
      }
      body.appendChild(t.content.firstChild);
    });
    const overlay = document.createElement('div');
    overlay.className = 'np-overlay';
    overlay.setAttribute('role', 'button');
    overlay.setAttribute('aria-label', 'Edit card');
    const btn = document.createElement('span');
    btn.className = 'np-overlay-btn';
    btn.textContent = 'Edit';
    overlay.appendChild(btn);
    overlay.addEventListener('click', function(e) {
      e.stopPropagation();
      openEdit(c);
    });
    wrap.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') openEdit(c);
    });
    wrap.appendChild(cut);
    wrap.appendChild(overlay);
    return wrap;
  }

  function live(c) {
    if (!c || !els.pages) return;
    els.pages.querySelectorAll('[data-card-id="' + c.id + '"]').forEach(function(el) {
      el.replaceWith(build(c));
    });
    renderList();
  }

  function refreshCard(i) {
    const c = get(i);
    if (!c || !els.pages) return;
    els.pages.querySelectorAll('[data-card-id="' + i + '"]').forEach(function(el) {
      el.replaceWith(build(c));
    });
    renderList();
  }

  function row(c) {

    const r =
      document.createElement(
        'div'
      );

    r.className =
      'et-current-card';

    r.dataset.cardId =
      c.id;

    const title =
      document.createElement(
        'div'
      );

    title.className =
      'et-small-txt';

    title.textContent =
      c.title;

    const part =
      document.createElement(
        'div'
      );

    part.className =
      'et-small-txt';

    part.textContent =
      c.partNumber;

    const actions =
      document.createElement(
        'div'
      );

    actions.className =
      'et-current-card-action-wrapper';

    const edit =
      document.createElement(
        'div'
      );

    edit.className =
      'et-action-button';

    edit.setAttribute(
      'btn',
      'edit'
    );

    const et =
      document.createElement(
        'div'
      );

    et.className =
      'et-xsmall-txt';

    et.textContent =
      'Edit';

    edit.appendChild(
      et
    );

    const remove =
      document.createElement(
        'div'
      );

    remove.className =
      'et-action-button';

    remove.setAttribute(
      'btn',
      'delete'
    );

    const rt =
      document.createElement(
        'div'
      );

    rt.className =
      'et-xsmall-txt';

    rt.textContent =
      'X';

    remove.appendChild(
      rt
    );

    actions.append(
      edit,
      remove
    );

    r.append(
      title,
      part,
      actions
    );

    return r;
  }

  function scrollCurrentCards(
  container,
  direction
) {

  if (!container) return;

  const amount =
    Math.max(
      1,
      container.clientWidth - 40
    );

  container.scrollBy({
    left:
      amount * direction,
    behavior:
      'smooth'
  });
}

  function renderList() {

  if (!els.cardView) return;

  els.cardView.innerHTML = '';

  state.cards.forEach(
    c => {
      els.cardView.appendChild(
        row(c)
      );
    }
  );
}

  function isPromoToolOpen() {
    const panel =
      document.querySelector(
        '.et-body-wrapper'
      );
    const host = panel || els.pages;
    if (!host || !host.isConnected) return false;
    return !!host.getClientRects().length;
  }

  function preparePrint() {
    const old =
      document.getElementById(
        'np-print-root'
      );
    if (old) old.remove();
    const stray =
      document.getElementById(
        'barcode-print-root'
      );
    if (stray) stray.remove();
    if (!els.pages) return null;
    const pages =
      els.pages.querySelectorAll(
        '.et-page'
      );
    if (!pages.length) return null;
    const root =
      document.createElement(
        'div'
      );
    root.id = 'np-print-root';
    root.style.setProperty('display', 'block', 'important');
    root.style.setProperty('visibility', 'visible', 'important');
    root.style.setProperty('opacity', '1', 'important');
    pages.forEach(function(page) {
      const clone = page.cloneNode(true);
      clone.style.setProperty('display', 'block', 'important');
      clone.style.setProperty('visibility', 'visible', 'important');
      clone.style.setProperty('opacity', '1', 'important');
      clone.querySelectorAll(
        '.np-overlay'
      ).forEach(function(el) {
        el.remove();
      });
      clone.querySelectorAll(
        '[id]'
      ).forEach(function(el) {
        el.removeAttribute('id');
      });
      root.appendChild(clone);
    });
    document.body.appendChild(root);
    return root;
  }

  function chunk(a, n) {

    const out = [];

    for (
      let i = 0;
      i < a.length;
      i += n
    ) {
      out.push(
        a.slice(i, i + n)
      );
    }

    return out;
  }

  function render() {

    if (!els.pages) return;

    els.pages.innerHTML = '';

    els.pages.style.display =
      'flex';

    els.pages.style.flexDirection =
      'column';

    els.pages.style.justifyContent =
      'flex-start';

    els.pages.style.alignItems =
      'center';

    const pages =
      state.cards.length
        ? chunk(
            state.cards,
            CAPS[state.layout]
          )
        : [[]];

    pages.forEach(
      cards => {

        const page =
          document.createElement(
            'div'
          );

        page.className =
          'et-page';

        page.style.width =
          '210mm';

        page.style.height =
          '297mm';

        page.style.boxSizing =
          'border-box';

        page.style.overflow =
          'hidden';

        const grid =
          document.createElement(
            'div'
          );

        grid.className =
          'np-grid-cards ' +
          state.layout;

        const g =
          GRID[state.layout];

        grid.style.display =
          'grid';

        grid.style.gridTemplateColumns =
          'repeat(' +
          g[0] +
          ',1fr)';

        grid.style.gridTemplateRows =
          'repeat(' +
          g[1] +
          ',1fr)';

        grid.style.gridAutoFlow =
          'row';

        grid.style.gap =
          '6px';

        grid.style.width =
          '100%';

        grid.style.height =
          '100%';

        grid.style.boxSizing =
          'border-box';

        cards.forEach(
          c => {
            grid.appendChild(
              build(c)
            );
          }
        );

        page.appendChild(
          grid
        );

        els.pages.appendChild(
          page
        );
      }
    );

    renderList();
  }

  function openEdit(c) {

    if (
      !c ||
      !els.left
    ) {
      return;
    }

    const old =
      els.left.querySelector(
        '.et-edit-panel'
      );

    if (old) {
      old.remove();
    }

    editing =
      c.id;

    if (els.menu) {
      els.menu.style.display =
        'none';
    }

    els.left.classList.add(
      'editing'
    );

    const panel =
      buildPanel(c);

    els.left.appendChild(
      panel
    );

    requestAnimationFrame(
      () => {
        panel.scrollTop = 0;
      }
    );
  }

  function hideEdit() {

    editing = null;

    if (els.left) {

      const panel =
        els.left.querySelector(
          '.et-edit-panel'
        );

      if (panel) {
        panel.remove();
      }

      els.left.classList.remove(
        'editing'
      );
    }

    if (els.menu) {
      els.menu.style.display =
        '';
    }
  }

  function npSecLabel(t) {
    const d = document.createElement('div');
    d.className = 'np-sec-label';
    d.textContent = t;
    return d;
  }

  function npField(labelText, inputEl) {
    const w = document.createElement('div');
    w.className = 'np-f';
    const l = document.createElement('label');
    l.textContent = labelText;
    w.appendChild(l);
    w.appendChild(inputEl);
    return w;
  }

  function npTextInput(value, multiline, onInput) {
    const el = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) el.type = 'text';
    el.value = value == null ? '' : value;
    el.addEventListener('input', function() { onInput(el.value); });
    return el;
  }

  function npStepper(label, get, set, min, max, after) {
    const row = document.createElement('div');
    row.className = 'np-stepper';
    const nm = document.createElement('span');
    nm.className = 'np-stepper-name';
    nm.textContent = label;
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.textContent = '−';
    const val = document.createElement('span');
    val.className = 'np-stepper-val';
    const paint = function() { val.textContent = get() + 'px'; };
    paint();
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.textContent = '+';
    const bump = function(d) { set(Math.min(max, Math.max(min, get() + d))); paint(); after(); };
    minus.addEventListener('click', function() { bump(-1); });
    plus.addEventListener('click', function() { bump(1); });
    row.appendChild(nm);
    row.appendChild(minus);
    row.appendChild(val);
    row.appendChild(plus);
    return row;
  }

  function npCheck(labelText, checked, onChange) {
    const w = document.createElement('label');
    w.className = 'np-check';
    const s = document.createElement('span');
    s.textContent = labelText;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.addEventListener('change', function() { onChange(box.checked); });
    w.appendChild(s);
    w.appendChild(box);
    return w;
  }

  function npSelect(options, value, onChange) {
    const s = document.createElement('select');
    options.forEach(function(o) {
      const op = document.createElement('option');
      op.value = o[0];
      op.textContent = o[1];
      if (o[0] === value) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener('change', function() { onChange(s.value); });
    return s;
  }

  function npColorRow(labelText, value, onInput) {
    const row = document.createElement('div');
    row.className = 'np-color-row';
    const nm = document.createElement('span');
    nm.textContent = labelText;
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.value = value || '#000000';
    pick.addEventListener('input', function() { onInput(pick.value); });
    row.appendChild(nm);
    row.appendChild(pick);
    return row;
  }

  function npFooterBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'et-edit-button' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function buildPanel(c) {
    function sync() { render(); openEdit(c); }
    const panel = document.createElement('div');
    panel.className = 'et-edit-panel';
    panel.dataset.cardId = c.id;
    const header = document.createElement('div');
    header.className = 'et-edit-panel-header';
    const title = document.createElement('div');
    title.className = 'et-edit-panel-title';
    title.textContent = 'Edit Card';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'et-edit-panel-close';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', hideEdit);
    header.appendChild(title);
    header.appendChild(x);
    panel.appendChild(header);

    panel.appendChild(npSecLabel('Content'));
    panel.appendChild(npField('Product Title', npTextInput(c.title, false, function(v) { c.title = v; live(c); })));
    const boxLabel = document.createElement('div');
    boxLabel.className = 'np-sec-label';
    boxLabel.textContent = 'Description boxes (each prints as its own box)';
    panel.appendChild(boxLabel);
    c.descLines.forEach(function(line, i) {
      const ed = document.createElement('div');
      ed.className = 'np-descbox-edit';
      const head = document.createElement('div');
      head.className = 'np-descbox-head';
      const nm = document.createElement('span');
      nm.textContent = 'Box ' + (i + 1);
      head.appendChild(nm);
      if (c.descLines.length > 1) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'np-mini';
        rm.textContent = 'Remove';
        rm.addEventListener('click', function() { c.descLines.splice(i, 1); sync(); });
        head.appendChild(rm);
      }
      const ta = document.createElement('textarea');
      ta.value = line || '';
      ta.addEventListener('input', function() { c.descLines[i] = ta.value; live(c); });
      ed.appendChild(head);
      ed.appendChild(ta);
      panel.appendChild(ed);
    });
    if (c.descLines.length < 4) {
      const addBox = document.createElement('button');
      addBox.type = 'button';
      addBox.className = 'np-mini go';
      addBox.textContent = '+ Add description box';
      addBox.addEventListener('click', function() { c.descLines.push(''); sync(); });
      panel.appendChild(addBox);
    }
    panel.appendChild(npField('Price', npTextInput(c.price, false, function(v) { c.price = v; live(c); })));
    panel.appendChild(npField('Old Price', npTextInput(c.oldPrice, false, function(v) { c.oldPrice = v; live(c); })));
    panel.appendChild(npField('Part Number', npTextInput(c.partNumber, false, function(v) { c.partNumber = v; live(c); })));
    panel.appendChild(npField('Extra Note', npTextInput(c.gstNote, false, function(v) { c.gstNote = v; live(c); })));

    panel.appendChild(npSecLabel('Text size'));
    SIZE_FIELDS.forEach(function(f) {
      if (!c.sizes) c.sizes = {};
      panel.appendChild(npStepper(f[1], function() {
        return c.sizes[f[0]] != null ? c.sizes[f[0]] : effSize(c, f[0]);
      }, function(v) { c.sizes[f[0]] = v; live(c); }, f[2], f[3], function() {}));
    });
    const resetSizes = document.createElement('button');
    resetSizes.type = 'button';
    resetSizes.className = 'np-linkbtn';
    resetSizes.textContent = 'Reset to layout defaults';
    resetSizes.addEventListener('click', function() { c.sizes = {}; sync(); });
    panel.appendChild(resetSizes);

    panel.appendChild(npSecLabel('Show on card'));
    panel.appendChild(npCheck('Old price', c.showOldPrice, function(v) { c.showOldPrice = v; sync(); }));
    panel.appendChild(npCheck('Part number', c.showPart, function(v) { c.showPart = v; sync(); }));
    panel.appendChild(npCheck('Note', c.showGst, function(v) { c.showGst = v; sync(); }));

    panel.appendChild(npSecLabel('Boxes'));
    panel.appendChild(npField('Box columns', npSelect([['1', '1 column'], ['2', '2 columns'], ['3', '3 columns']], String(c.descCols), function(v) { c.descCols = parseInt(v, 10) || 1; sync(); })));

    panel.appendChild(npSecLabel('Arrange (top to bottom)'));
    c.order.forEach(function(key, i) {
      const row = document.createElement('div');
      row.className = 'np-order-row';
      const nm = document.createElement('span');
      nm.textContent = (i + 1) + '. ' + (BLOCK_LABELS[key] || key);
      const btns = document.createElement('span');
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'np-mini';
      up.textContent = '↑';
      up.disabled = i === 0;
      const dn = document.createElement('button');
      dn.type = 'button';
      dn.className = 'np-mini';
      dn.textContent = '↓';
      dn.disabled = i === c.order.length - 1;
      up.addEventListener('click', function() {
        const t = c.order[i - 1];
        c.order[i - 1] = c.order[i];
        c.order[i] = t;
        sync();
      });
      dn.addEventListener('click', function() {
        const t = c.order[i + 1];
        c.order[i + 1] = c.order[i];
        c.order[i] = t;
        sync();
      });
      btns.appendChild(up);
      btns.appendChild(dn);
      row.appendChild(nm);
      row.appendChild(btns);
      panel.appendChild(row);
    });

    panel.appendChild(npSecLabel('Card feel'));
    panel.appendChild(npField('Style for this card', npSelect([['ep', 'Everyday green'], ['cp', 'Clearance black'], ['pp', 'Promo red']], c.type, function(v) {
      c.type = v;
      c.colors = Object.assign({}, FEEL_COLORS[v] || FEEL_COLORS.ep);
      sync();
    })));
    COLOR_FIELDS.forEach(function(f) {
      panel.appendChild(npColorRow(f[1], (c.colors || {})[f[0]] || '#000000', function(v) { c.colors[f[0]] = v; live(c); }));
    });
    const resetCol = document.createElement('button');
    resetCol.type = 'button';
    resetCol.className = 'np-linkbtn';
    resetCol.textContent = 'Reset colours to feel';
    resetCol.addEventListener('click', function() {
      c.colors = Object.assign({}, FEEL_COLORS[c.type] || FEEL_COLORS.ep);
      sync();
    });
    panel.appendChild(resetCol);
    panel.appendChild(npCheck('Shelf fold tab', c.tab !== false, function(v) { c.tab = v; sync(); }));

    const footer = document.createElement('div');
    footer.className = 'et-edit-panel-footer';
    footer.appendChild(npFooterBtn('Duplicate', '', function() {
      const n = add(Object.assign(clone(c), { id: undefined, title: (c.title || 'Product') + ' (copy)' }));
      openEdit(n);
    }));
    footer.appendChild(npFooterBtn('Delete', '', function() { del(c.id); }));
    footer.appendChild(npFooterBtn('Done', 'primary', function() { hideEdit(); }));
    panel.appendChild(footer);
    return panel;
  }

  function injectStyles() {

    if (
      document.getElementById(
        'et-pricing-styles'
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'et-pricing-styles';

    style.textContent = `

.et-everyday-card,
.et-clearance-card,
.et-promo-card{
display:flex!important;
flex-direction:column!important;
height:100%!important;
box-sizing:border-box!important;
overflow:hidden!important;
position:relative!important
}

.everyday-card,
.clearance-card,
.promo-card{
flex:1 1 auto!important;
min-height:0!important;
display:flex!important;
flex-direction:column!important;
box-sizing:border-box!important
}

.everyday-card-body-wrapper,
.clearance-card-body-wrapper,
.promo-card-body-wrapper{
flex:1 1 auto!important;
min-height:0!important;
display:flex!important;
flex-direction:column!important
}

.everyday-card-body,
.clearance-card-body,
.promo-card-body{
flex:1 1 auto!important;
min-height:0!important;
height:100%!important;
box-sizing:border-box!important;
display:flex!important;
flex-direction:column!important
}

.card-top-wrapper{
flex:1 1 auto!important;
min-height:0!important;
overflow:hidden!important
}

.card-bottom-wrapper{
flex:0 0 auto!important;
margin-top:auto!important
}

.card-text-title,
.card-text-description,
.card-text-price,
.card-text-price-old,
.card-text-extra,
.card-config-text{
margin:0!important
}

.card-grid-title,
.card-grid-description,
.card-grid-part-number,
.card-grid-extra-note,
.card-grid-old-price{
min-width:0;
box-sizing:border-box
}

.card-config-item{
min-width:0;
box-sizing:border-box
}

.card-extra-info-grid{
width:100%;
box-sizing:border-box;
display:grid!important;
grid-template-columns:minmax(0,1fr) auto!important;
align-items:end!important;
gap:10px!important
}

.card-extra-info{
min-width:0;
display:flex;
flex-direction:column;
align-items:stretch
}

.card-old-price-wrapper{
min-width:0;
text-align:right
}

.et-page{
background:#fff;
box-shadow:
0 0 0 1px rgba(0,0,0,.08),
0 4px 16px rgba(0,0,0,.08);
margin-bottom:24px
}

.et-card-overlay{
position:absolute;
inset:0;
display:flex;
align-items:center;
justify-content:center;
background:rgba(0,0,0,.55);
opacity:0;
transition:opacity .2s;
cursor:pointer;
z-index:999
}

.et-card-overlay:hover{
opacity:1
}

.et-card-overlay-icon svg{
width:32px;
height:32px;
color:#fff
}

.et-everyday-card:hover .everyday-card,
.et-clearance-card:hover .clearance-card,
.et-promo-card:hover .promo-card{
filter:blur(2px) grayscale(90%)
}

.card-view-container{
min-width:0!important;
overflow-x:auto!important;
overflow-y:hidden!important;
flex:1 1 auto!important;
scrollbar-width:none!important;
-ms-overflow-style:none!important;
overscroll-behavior-x:contain!important;
scroll-behavior:smooth!important
}

.card-view-container::-webkit-scrollbar{
display:none!important;
width:0!important;
height:0!important
}

.card-view-container > .et-current-card{
flex:0 0 auto!important;
min-width:0!important
}

.db-left-content.editing{
width:100%!important;
height: 100% !important;
min-height:0!important;
max-height: 100% !important;
overflow:hidden!important;
display:flex!important;
flex-direction:column!important;
overscroll-behavior:contain!important;
overscroll-behavior-y:contain!important;
}

.db-left-content.editing .et-edit-panel{
flex:1 1 auto!important;
width:100%!important;
height: 45% !important;
min-height:0!important;
max-height: 45% !important;
overflow-y:auto!important;
overflow-x:hidden!important;
box-sizing:border-box!important;
padding-right:10px!important;
overscroll-behavior:contain!important;
overscroll-behavior-y:contain!important;
-webkit-overflow-scrolling:touch!important;
scrollbar-width:thin;
touch-action:pan-y;
-ms-overflow-style: none; 
scrollbar-width: none;
}

.et-edit-panel::-webkit-scrollbar{
display: none;
}

.et-edit-panel::-webkit-scrollbar-track{
background:transparent;
}

.et-edit-panel::-webkit-scrollbar-thumb{
background:#ccc;
border-radius:10px;
}

.et-edit-panel::-webkit-scrollbar-thumb:hover{
background:#aaa;
}

.et-edit-panel-header{
display:flex;
justify-content:space-between;
align-items:center;
flex:0 0 auto;
margin-bottom:16px;
padding-bottom:12px;
border-bottom:1px solid #eee
}

.et-edit-panel-title{
font-weight:700;
font-size:18px
}

.et-edit-panel-close{
border:0;
background:none;
font-size:24px;
cursor:pointer;
line-height:1
}

.et-edit-section{
border-top:1px solid #eee;
padding-top:16px;
margin-top:16px
}

.et-edit-section-title{
font-size:11px;
font-weight:700;
text-transform:uppercase;
margin-bottom:12px
}

.et-field-group{
margin-bottom:12px
}

.et-field-label,
.et-control-label{
display:block;
font-size:11px;
font-weight:600;
color:#444;
margin-bottom:5px
}

.et-field-input{
width:100%;
box-sizing:border-box;
padding:8px;
border:1px solid #ccc;
border-radius:5px;
font:inherit;
font-size:12px
}

textarea.et-field-input{
resize:vertical
}

.et-control-row{
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
margin-bottom:8px
}

.et-control{
min-width:120px;
padding:6px;
border:1px solid #ccc;
border-radius:5px;
background:#fff;
font:inherit;
font-size:11px
}

.et-number{
width:80px;
min-width:80px
}

.et-checkbox{
width:16px;
height:16px
}

.et-field-editor,
.et-content-editor{
border:1px solid #e5e5e5;
border-radius:6px;
padding:9px;
margin-bottom:7px
}

.et-field-editor-header,
.et-content-editor-header{
display:flex;
align-items:center;
justify-content:space-between
}

.et-field-editor-name,
.et-grid-item-title,
.et-grid-text-title{
font-size:12px;
font-weight:700
}

.et-field-editor-toggle{
border:0;
background:none;
cursor:pointer;
font-size:10px
}

.et-field-editor-body,
.et-content-editor-body{
display:none;
padding-top:9px
}

.et-field-editor.open .et-field-editor-body,
.et-content-editor.open .et-content-editor-body{
display:block
}

.et-content-settings{
border-bottom:1px solid #eee;
padding-bottom:8px;
margin-bottom:10px
}

.et-grid-item{
border:1px solid #ddd;
border-radius:5px;
padding:8px;
margin-bottom:8px
}

.et-grid-item-header,
.et-grid-text-header{
display:flex;
align-items:center;
justify-content:space-between;
gap:8px;
margin-bottom:7px
}

.et-grid-text{
border-top:1px solid #eee;
padding-top:8px;
margin-top:8px
}

.et-remove-button{
border:0;
background:none;
cursor:pointer;
font-size:16px;
line-height:1
}

.et-small-add{
width:100%;
border:1px dashed #bbb;
background:#fafafa;
border-radius:5px;
padding:7px;
cursor:pointer;
font-size:11px;
font-weight:600
}

.et-text-settings{
margin-top:8px;
padding-top:8px;
border-top:1px solid #eee
}

.et-edit-panel-footer{
display:flex;
justify-content:flex-end;
align-items:center;
gap:8px;
margin-top:18px;
padding-top:14px;
border-top:1px solid #eee
}

.et-edit-button{
border:1px solid #ccc;
background:#fff;
border-radius:5px;
padding:8px 12px;
cursor:pointer;
font-size:11px;
font-weight:600
}

.et-edit-button.primary{
background:#111;
color:#fff;
border-color:#111
}

@media print{

@page{
size:A4;
margin:0
}

*{
-webkit-print-color-adjust:exact!important;
print-color-adjust:exact!important;
color-adjust:exact!important
}

.et-card-body-wrapper{
display:none!important
}

.et-card-overlay,
.et-edit-panel{
display:none!important
}

.et-page{
width:210mm!important;
height:297mm!important;
margin:0!important;
padding:0!important;
overflow:hidden!important;
box-shadow:none!important;
border:0!important;
outline:0!important;
page-break-after:always;
break-after:page
}

.et-page:last-child{
page-break-after:auto;
break-after:auto
}

.et-grid-cards{
width:100%!important;
height:100%!important;
margin:0!important;
border:0!important;
outline:0!important;
box-shadow:none!important
}

.et-everyday-card,
.et-clearance-card,
.et-promo-card,
.everyday-card,
.clearance-card,
.promo-card{
width:100%!important;
height:100%!important;
border:0!important;
outline:0!important
}

.w-webflow-badge,
[class*=webflow-badge],
a[href*=webflow\\\\.com?utm]{
display:none!important;
visibility:hidden!important
}

}

`;

    document.head.appendChild(
      style
    );
  }

  function injectNewStyles() {
    if (document.getElementById('et-pricing-new')) return;
    const style = document.createElement('style');
    style.id = 'et-pricing-new';
    style.textContent = [
      '.np-grid-cards{width:100%;height:100%;display:grid;gap:0px;box-sizing:border-box}',
      '.np-card{position:relative;min-height:0;min-width:0;display:flex;overflow:hidden}',
      '.np-cut{position:relative;flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:#0da50d;border:1.5px dashed #4b5563;box-sizing:border-box}',
      '.np-card[data-type="cp"] .np-cut{background:#1c1c1e}',
      '.np-card[data-type="pp"] .np-cut{background:#c1121f}',
      '.np-tab{height:28px;flex:0 0 auto;background:#dedede;border-bottom:2px dashed #8c8c8c}',
      '.np-head{margin:10px 14px 0;color:#202020;font-weight:900;text-align:center;font-size:21px;line-height:1.1}',
      '.np-card[data-type="cp"] .np-head,.np-card[data-type="pp"] .np-head{color:#fff}',
      '.np-body{margin:10px 14px 14px;background:#fff;padding:10px 12px;flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}',
      '.np-title{margin:0;font-weight:900;text-transform:uppercase;overflow-wrap:anywhere;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}',
      '.np-descboxes{min-width:0;overflow:hidden}',
      '.np-descboxes.cols-2{column-count:2;column-gap:10px}',
      '.np-descboxes.cols-3{column-count:3;column-gap:8px}',
      '.np-descbox{border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;padding:6px 8px;margin:0 0 6px;break-inside:avoid}',
      '.np-descbox p{margin:0;white-space:pre-line}',
      '.np-price-row{margin-top:auto;padding-top:8px;display:flex;align-items:baseline;gap:8px}',
      '.np-price{font-weight:900;line-height:1}',
      '.np-foot{margin-top:6px;border-top:1px solid #e5e7eb;padding-top:5px}',
      '.np-part{font-size:11px}',
      '.np-botrow{display:flex;justify-content:space-between;gap:8px;margin-top:3px}',
      '.np-gst{font-size:10px}',
      '.np-old{font-size:10px;text-decoration:line-through}',
      '.np-overlay{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);opacity:0;transition:opacity .18s ease;cursor:pointer}',
      '.np-card:hover .np-overlay,.np-card:focus-within .np-overlay{opacity:1}',
      '.np-overlay-btn{border:2px solid #fff;color:#fff;border-radius:999px;padding:8px 22px;font-size:13px;font-weight:800;pointer-events:none}',
      '.np-sec-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 8px;opacity:.75;color:#f2f2f2}',
      '.np-f{margin-bottom:10px}',
      '.np-f>label{display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:#e8e8e8}',
      '.np-f input,.np-f textarea,.np-f select{width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:5px;font:inherit;font-size:12px;background:#fff;color:#111}',
      '.np-f textarea{min-height:52px;resize:vertical}',
      '.np-check{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;font-size:12px;font-weight:600;color:#f2f2f2}',
      '.np-check input{width:17px;height:17px}',
      '.np-stepper{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.np-stepper-name{flex:1;font-size:12px;color:#f2f2f2}',
      '.np-stepper button{width:28px;height:28px;border-radius:6px;border:1px solid #ccc;background:#fff;font-size:15px;cursor:pointer;color:#111}',
      '.np-stepper-val{min-width:44px;text-align:center;font-size:12px;color:#fff}',
      '.np-order-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #555;border-radius:6px;padding:5px 8px;font-size:12px;margin-bottom:6px;color:#f2f2f2}',
      '.np-mini{border:1px solid #ccc;background:#fff;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;color:#111}',
      '.np-mini.go{background:#111;color:#fff;border-color:#111}',
      '.np-mini:disabled{opacity:.35;cursor:not-allowed}',
      '.np-linkbtn{background:none;border:0;text-decoration:underline;cursor:pointer;font-size:11px;padding:0;opacity:.85;color:#f2f2f2;margin-bottom:8px}',
      '.np-color-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0;color:#f2f2f2}',
      '.np-color-row input[type=color]{width:38px;height:26px;border:1px solid #ccc;border-radius:5px;padding:1px;cursor:pointer}',
      '.np-descbox-edit{border:1px solid #ccc;border-radius:6px;padding:6px;margin-bottom:6px}',
      '.np-descbox-edit textarea{width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:5px;padding:6px 8px;font:inherit;font-size:12px;min-height:44px;resize:vertical;background:#fff;color:#111}',
      '.np-descbox-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;margin-bottom:4px;color:#f2f2f2}',
      '@media print{.np-overlay{display:none !important}.np-grid-cards{width:100% !important;height:100% !important}.np-card{width:100% !important;height:100% !important}body:has(#np-print-root)>:not(#np-print-root){display:none !important}#np-print-root{display:block !important;position:static !important;width:100% !important;margin:0 !important;padding:0 !important}#np-print-root,#np-print-root *{visibility:visible !important;opacity:1 !important;transform:none !important;filter:none !important}.et-card-body-wrapper{display:none !important}#np-print-root .et-page{width:210mm !important;height:297mm !important;margin:0 !important;padding:0 !important;overflow:hidden !important;box-shadow:none !important;border:0 !important;break-after:page;page-break-after:always}#np-print-root .et-page:last-child{break-after:auto;page-break-after:auto}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function makeScrollable(el) {

    if (!el) return;

    el.style.overflowY =
      'auto';

    el.style.overscrollBehavior =
      'contain';
  }

  function onListClick(e) {

    const action =
      e.target.closest(
        '[btn]'
      );

    if (!action) {
      return;
    }

    const row =
      e.target.closest(
        '[data-card-id]'
      );

    if (!row) {
      return;
    }

    const i =
      row.dataset.cardId;

    if (
      action.getAttribute(
        'btn'
      ) === 'edit'
    ) {

      openEdit(
        get(i)
      );
    }

    if (
      action.getAttribute(
        'btn'
      ) === 'delete'
    ) {

      del(i);
    }
  }

  function init() {

  cache();

  if (!els.cardView || !els.pages) {
    setTimeout(start, 100);
    return;
  }

  if (!initialized) {

    initialized = true;

    injectStyles();

    injectNewStyles();

    if (els.scrollBtnLeft) {
      els.scrollBtnLeft.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        scrollCurrentCards(
          els.cardView,
          -1
        );
      };
    }

    if (els.scrollBtnRight) {
      els.scrollBtnRight.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        scrollCurrentCards(
          els.cardView,
          1
        );
      };
    }

    if (els.type) {
      els.type.value = state.type;

      els.type.addEventListener(
        'change',
        e => {
          state.type = e.target.value;
          hideEdit();
          state.cards = [];
          openEdit(add());
        }
      );
    }

    if (els.layout) {
      els.layout.value = state.layout;

      els.layout.addEventListener(
        'change',
        e => {
          state.layout = e.target.value;
          state.cards.forEach(function(c) { c.sizes = {}; });
          render();
          if (editing) {
            const c = get(editing);
            if (c) openEdit(c);
            else hideEdit();
          }
        }
      );
    }

    if (els.list) {
      els.list.addEventListener(
        'click',
        onListClick
      );
    }

    if (els.add) {
      els.add.addEventListener(
        'click',
        () => {
          const c = add();
          openEdit(c);
        }
      );
    }

    if (els.print) {
      els.print.addEventListener(
        'click',
        () => {
          if (!preparePrint()) return;
          window.print();
        }
      );
    }


    window.addEventListener(
      'beforeprint',
      () => {
        if (!isPromoToolOpen()) {
          const stale =
            document.getElementById(
              'np-print-root'
            );
          if (stale) stale.remove();
          return;
        }

        preparePrint();

        if (!els.pages) return;

        let e = els.pages.parentElement;

        while (
          e &&
          e !== document.body
        ) {

          e.style.setProperty(
            'overflow',
            'visible',
            'important'
          );

          e.style.setProperty(
            'height',
            'auto',
            'important'
          );

          e.style.setProperty(
            'max-height',
            'none',
            'important'
          );

          e.style.setProperty(
            'transform',
            'none',
            'important'
          );

          e = e.parentElement;
        }
      }
    );

    window.addEventListener(
      'afterprint',
      () => {
        const root =
          document.getElementById(
            'np-print-root'
          );
        if (root) root.remove();
      }
    );
  }

  makeScrollable(els.pages);

  if (!state.cards.length) {
    add();
  } else {
    render();
  }
}

  function start() {

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );

    return;
  }

  cache();

  if (
    !els.cardView ||
    !els.pages
  ) {
    setTimeout(
      start,
      100
    );

    return;
  }

  init();
}

document.addEventListener(
  'db-tool-open',
  e => {

    if (
      e.detail?.id !== 'promotion-label'
    ) {
      return;
    }

    start();
  }
);

start();

  window.ETPricingTool = {
    state,
    addCard: add,
    deleteCard: del,
    getCard: get,
    render,
    showEditPanel: openEdit,
    hideEditPanel: hideEdit
  };

})();
