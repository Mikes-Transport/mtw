'use strict';

// Drag-and-drop page builder: custom navigation tools, the editor, saving/publishing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://mtw.test';
const BASE_URL = `${ORIGIN}/apps/dashboard/js/navigation/`;

class RepoLoader extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith(ORIGIN)) return null;
    const file = path.join(REPO_ROOT, decodeURIComponent(new URL(url).pathname));
    if (!file.startsWith(REPO_ROOT) || !fs.existsSync(file)) return Promise.reject(new Error('404 ' + url));
    return Object.assign(Promise.resolve(fs.readFileSync(file)), { abort() {} });
  }
}

// Minimal Firestore stand-in: collections of docs; getDoc/setDoc/addDoc/deleteDoc and
// onSnapshot on a doc or a whole collection.
function store(initial) {
  const data = JSON.parse(JSON.stringify(initial || {}));
  const listeners = [];
  let next = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const docSnap = ref => {
    const value = (data[ref.collection] || {})[ref.id];
    return { id: ref.id, exists: () => value !== undefined, data: () => copy(value) };
  };
  const colSnap = name => {
    const rows = Object.entries(data[name] || {});
    return { forEach(fn) { rows.forEach(([id, value]) => fn({ id, data: () => copy(value) })); } };
  };
  return {
    data,
    writes: [],
    api(window) {
      const self = this;
      const notify = name => listeners.forEach(l => {
        if (l.ref.name === name) window.setTimeout(() => l.fn(colSnap(name)), 0);
        if (l.ref.collection === name) window.setTimeout(() => l.fn(docSnap(l.ref)), 0);
      });
      return {
        db: {},
        collection: (db, name) => ({ name }),
        getDocs: async ref => colSnap(ref.name),
        doc: (db, collection, id) => ({ collection, id }),
        getDoc: async ref => docSnap(ref),
        setDoc: async (ref, value) => {
          (data[ref.collection] = data[ref.collection] || {})[ref.id] = copy(value);
          self.writes.push({ ref, value });
          notify(ref.collection);
        },
        addDoc: async (ref, value) => {
          const id = `rec${++next}`;
          (data[ref.name] = data[ref.name] || {})[id] = copy(value);
          self.writes.push({ ref: { collection: ref.name, id }, value });
          notify(ref.name);
          return { id };
        },
        deleteDoc: async ref => {
          delete (data[ref.collection] || {})[ref.id];
          notify(ref.collection);
        },
        updateDoc: async (ref, value) => {
          const tableData = data[ref.collection] || {};
          if (tableData[ref.id]) tableData[ref.id] = { ...tableData[ref.id], ...copy(value) };
          self.writes.push({ ref, value, update: true });
          notify(ref.collection);
        },
        onSnapshot: (ref, fn) => {
          const entry = { ref, fn };
          listeners.push(entry);
          window.setTimeout(() => fn(ref.name ? colSnap(ref.name) : docSnap(ref)), 0);
          return () => listeners.splice(listeners.indexOf(entry), 1);
        }
      };
    }
  };
}

function host({ role = 'Managers', db } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(String(error.message || error)));
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><script src="dashboard-navigation.js"></script></body></html>', {
    url: BASE_URL + 'host.html',
    runScripts: 'dangerously',
    resources: new RepoLoader(),
    virtualConsole,
    pretendToBeVisual: true,
    beforeParse(window) {
      if (role) window.sessionStorage.setItem('mtw_admin_name', role);
      window.MTW = db.api(window);
    }
  });
  return { dom, window: dom.window, document: dom.window.document, errors };
}

function waitFor(window, predicate, timeout = 4000) {
  const where = (new Error().stack.split('\n')[2] || '').trim();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      let ok = false;
      try { ok = predicate(); } catch (error) { ok = false; }
      if (ok) return resolve();
      if (Date.now() - started > timeout) return reject(new Error(`timed out ${where}`));
      window.setTimeout(poll, 20);
    })();
  });
}

const tick = window => new Promise(resolve => window.setTimeout(resolve, 20));

function pointer(window, target, type, x = 0, y = 0) {
  const Ctor = window.PointerEvent || window.MouseEvent;
  target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerType: 'mouse' }));
}

const PUBLISHED = {
  sections: [{
    id: 's-one', layout: '1-1', style: {},
    columns: [
      { id: 'c-one', blocks: [{ id: 'b-head', type: 'heading', props: { text: 'Vehicle checks', level: 'h1' } }] },
      { id: 'c-two', blocks: [{ id: 'b-text', type: 'text', props: { text: '<img src=x onerror="window.__xss=1">' } }] }
    ]
  }]
};

const TOOLS = { 'dashboard-tools': { jobs: { custom: true, name: 'Jobs', roles: ['Managers', 'Stores'], enabled: true } } };

test('a custom tool shows its published page; Managers get Edit page, others do not', async () => {
  for (const role of ['Managers', 'Stores']) {
    const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: PUBLISHED } } });
    const { dom, window, document } = host({ role, db });
    await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-page'));
    const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
    assert.equal(panel.querySelector('h1').textContent, 'Vehicle checks');
    assert.equal(panel.querySelector('.mtw-pb-text').textContent, '<img src=x onerror="window.__xss=1">', 'text, not HTML');
    assert.equal(panel.querySelector('img'), null);
    assert.equal(window.__xss, undefined);
    assert.equal(panel.querySelectorAll('.mtw-pb-col').length, 2);
    assert.equal(Boolean(panel.querySelector('.mtw-pb-edit-page')), role === 'Managers', `${role} edit button`);
    dom.window.close();
  }
});

test('an unbuilt custom tool explains how to build it', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => /Edit page to build it/.test(document.querySelector('.custom-dashboard-tool-jobs-panel')?.textContent || ''));
  dom.window.close();
});

test('build a page: click and drop blocks, edit, undo, save draft, publish (live in the tool)', async () => {
  const db = store(TOOLS);
  const { dom, window, document, errors } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-edit-page'));
  document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-edit-page').click();
  await waitFor(window, () => window.MTW_PAGE_BUILDER && window.MTW_PAGE_BUILDER.current);
  const editor = window.MTW_PAGE_BUILDER.current;
  await editor.loaded;
  const ui = editor.element;
  assert.ok(ui.isConnected);
  assert.ok(ui.querySelector('.mtw-pb-empty'), 'empty page offers templates');
  assert.ok(ui.querySelector('.mtw-pb-tile[data-block-type="heading"]'));

  // Click (press and release without moving) a palette tile adds the block.
  const headingTile = ui.querySelector('.mtw-pb-tile[data-block-type="heading"]');
  pointer(window, headingTile, 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  assert.equal(editor.page.sections.length, 1);
  const heading = editor.page.sections[0].columns[0].blocks[0];
  assert.equal(heading.type, 'heading');
  assert.deepEqual({ ...editor.selected }, { kind: 'block', id: heading.id });
  assert.ok(ui.querySelector(`.mtw-pb-item[data-block-id="${heading.id}"].is-selected .mtw-pb-toolbar`));

  // Edit the text in the inspector: the canvas follows, the field keeps focus.
  const textInput = ui.querySelector('.mtw-pb-inspector [data-field="text"] input');
  textInput.focus();
  textInput.value = 'Jobs board';
  textInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(ui.querySelector('.mtw-pb-frame h2').textContent, 'Jobs board');
  assert.equal(document.activeElement, textInput);
  // Look: centre it.
  const align = ui.querySelector('.mtw-pb-inspector [data-field="align"] select');
  align.value = 'center';
  align.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(ui.querySelector('.mtw-pb-frame h2').style.textAlign, 'center');

  // Drop a new section and drag a text block into its right column.
  const twoCols = ui.querySelector('.mtw-pb-tile-layout[data-layout="1-1"]');
  pointer(window, twoCols, 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  assert.equal(editor.page.sections.length, 2);
  const right = editor.page.sections[1].columns[1].id;
  editor.drop({ kind: 'new', type: 'text' }, { type: 'block', columnId: right, index: 0 });
  assert.equal(editor.page.sections[1].columns[1].blocks[0].type, 'text');
  // Move the heading into that column, above the text.
  editor.drop({ kind: 'block', id: heading.id }, { type: 'block', columnId: right, index: 0 });
  assert.deepEqual([...editor.page.sections[1].columns[1].blocks.map(b => b.type)], ['heading', 'text']);
  assert.equal(editor.page.sections[0].columns[0].blocks.length, 0);

  // Undo the move, redo it.
  ui.querySelector('[title="Undo (Ctrl+Z)"]').click();
  assert.equal(editor.page.sections[0].columns[0].blocks[0].id, heading.id);
  ui.querySelector('[title="Redo (Ctrl+Shift+Z)"]').click();
  assert.equal(editor.page.sections[1].columns[1].blocks[0].id, heading.id);

  // Delete the empty first section from its toolbar.
  const firstSection = ui.querySelector('.mtw-pb-frame .mtw-pb-section');
  firstSection.querySelector('.mtw-pb-tool-delete').click();
  assert.equal(editor.page.sections.length, 1);

  // Save a draft: stored, not published, tool unchanged.
  assert.equal(ui.querySelector('.mtw-pb-status').textContent, 'Unsaved changes');
  ui.querySelector('.mtw-pb-top-actions [title="Save without changing what people see"]').click();
  await waitFor(window, () => db.writes.length === 1);
  const draftWrite = db.writes[0];
  assert.equal(draftWrite.ref.collection, 'dashboard-tool-pages');
  assert.equal(draftWrite.ref.id, 'jobs');
  assert.equal(draftWrite.value.draft.sections.length, 1);
  assert.equal(draftWrite.value.published, undefined);
  assert.equal(draftWrite.value.updatedBy, 'Managers');
  await tick(window);
  assert.equal(editor.dirty, false);
  assert.ok(document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-panel-content').textContent.includes('Edit page to build it'));

  // Publish: the tool panel updates live.
  ui.querySelector('.mtw-pb-top-actions [title="Save and show this page in the tool"]').click();
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-page h2'));
  assert.equal(document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-page h2').textContent, 'Jobs board');
  assert.equal(db.data['dashboard-tool-pages'].jobs.publishedBy, 'Managers');
  assert.equal(ui.querySelector('.mtw-pb-status').dataset.state, 'ok');

  // Unsaved changes ask before closing; Discard closes.
  const textBlock = editor.page.sections[0].columns[1].blocks[1];
  editor.select({ kind: 'block', id: textBlock.id });
  ui.querySelector('.mtw-pb-inspector .mtw-pb-inspector-delete').click();
  ui.querySelector('.mtw-pb-close').click();
  assert.ok(ui.isConnected, 'still open');
  assert.equal(ui.querySelector('.mtw-pb-confirm').hidden, false);
  [...ui.querySelectorAll('.mtw-pb-confirm button')].find(b => b.textContent === 'Discard changes').click();
  assert.equal(ui.isConnected, false);
  assert.equal(window.MTW_PAGE_BUILDER.current, null);
  assert.deepEqual(errors.filter(e => !/stylesheet|Could not parse CSS/i.test(e)), []);
  dom.window.close();
});

test('templates, preview, keyboard shortcuts and section columns', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  ui.querySelector('.mtw-pb-template[data-template="tiles"]').click();
  assert.equal(editor.page.sections.length, 3);
  assert.equal(ui.querySelectorAll('.mtw-pb-frame .mtw-pb-stat').length, 3);
  assert.equal(ui.querySelectorAll('.mtw-pb-frame table tr').length, 3);

  // Section: switch three columns to one; the tiles all move into it.
  const tilesSection = editor.page.sections[1];
  editor.select({ kind: 'section', id: tilesSection.id });
  const layout = ui.querySelector('.mtw-pb-inspector [data-field="layout"] select');
  layout.value = '1';
  layout.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(editor.page.sections[1].columns.length, 1);
  assert.equal(editor.page.sections[1].columns[0].blocks.length, 3);

  // Keyboard: select a tile, duplicate (Ctrl+D), delete (Delete), undo (Ctrl+Z).
  const tile = editor.page.sections[1].columns[0].blocks[0];
  editor.select({ kind: 'block', id: tile.id });
  const key = (k, extra) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  key('d', { ctrlKey: true });
  assert.equal(editor.page.sections[1].columns[0].blocks.length, 4);
  key('Delete');
  assert.equal(editor.page.sections[1].columns[0].blocks.length, 3);
  key('z', { ctrlKey: true });
  assert.equal(editor.page.sections[1].columns[0].blocks.length, 4);
  key('ArrowUp', { altKey: true });

  // Preview hides the editing handles; links don't navigate while editing.
  ui.querySelector('.mtw-pb-top-actions .mtw-pb-btn[aria-pressed]') || null;
  [...ui.querySelectorAll('.mtw-pb-top-actions button')].find(b => b.textContent === 'Preview').click();
  assert.equal(ui.querySelector('.mtw-pb-frame .mtw-pb-toolbar'), null);
  assert.equal(ui.querySelector('.mtw-pb-frame .mtw-pb-page.is-editing'), null);
  [...ui.querySelectorAll('.mtw-pb-top-actions button')].find(b => b.textContent === 'Edit').click();
  assert.ok(ui.querySelector('.mtw-pb-frame .mtw-pb-toolbar'));

  // Device widths.
  ui.querySelector('[data-device="phone"]').click();
  assert.equal(ui.querySelector('.mtw-pb-frame').dataset.device, 'phone');

  editor.close(true);
  dom.window.close();
});

test('Manager Tools: custom items open the page builder; built-in ones do not offer it', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => document.querySelector('.developer-tools-panel .developer-tool-row'));
  document.querySelector('.db-list-toolcard[data-select="developer-tools"]').click();
  const rows = [...document.querySelectorAll('.developer-tools-panel .developer-tool-row')];
  const jobs = rows.find(row => row.textContent.startsWith('Jobs'));
  assert.match(jobs.textContent, /Custom page/);
  rows.find(row => !row.textContent.startsWith('Jobs')).click();
  assert.equal(document.querySelector('.developer-tool-build-page'), null);
  document.querySelector('#exit-btn').click();
  [...document.querySelectorAll('.developer-tools-panel .developer-tool-row')].find(row => row.textContent.startsWith('Jobs')).click();
  document.querySelector('.developer-tool-build-page').click();
  await waitFor(window, () => window.MTW_PAGE_BUILDER && window.MTW_PAGE_BUILDER.current);
  assert.match(window.MTW_PAGE_BUILDER.current.element.querySelector('.mtw-pb-top-title strong').textContent, /Jobs/);
  window.MTW_PAGE_BUILDER.current.close(true);
  dom.window.close();
});

test('non-managers cannot open the builder', async () => {
  const db = store(TOOLS);
  const { dom, window } = host({ role: 'Stores', db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  await assert.rejects(window.MTW_OPEN_PAGE_BUILDER('jobs'), /Only Managers/);
  dom.window.close();
});


// ---------- stage 2: data tables, inputs, steps ----------

const JOBS_PAGE = {
  tables: [{
    id: 't-jobs', name: 'Jobs',
    fields: [
      { key: 'order_number', label: 'Order number', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'choice', options: 'Normal\nUrgent' }
    ]
  }],
  onOpen: [{ type: 'hide', target: 'rush_note' }],
  sections: [{
    layout: '1-1',
    columns: [
      { blocks: [
        { type: 'input', name: 'order_number', props: { label: 'Order number', bind: 't-jobs.order_number' } },
        { type: 'input', name: 'status', props: { label: 'Status', bind: 't-jobs.status', actions: [
          { type: 'if', left: 'status', op: 'equals', right: 'urgent',
            then: [{ type: 'show', target: 'rush_note' }, { type: 'setText', target: 'title', value: 'Rush job {order_number}' }],
            else: [{ type: 'hide', target: 'rush_note' }] }
        ] } },
        { type: 'notice', name: 'rush_note', props: { tone: 'warning', title: 'Rush', text: 'Call the customer.' } },
        { type: 'heading', name: 'title', props: { text: 'New job', level: 'h2' } },
        { type: 'button', name: 'save', props: { label: 'Save job', actions: [
          { type: 'save', table: 't-jobs' },
          { type: 'message', text: 'Saved {order_number} for {user}', tone: 'success' },
          { type: 'clear' }
        ] } }
      ] },
      { blocks: [
        { type: 'stat', name: 'urgent_count', props: { label: 'Urgent jobs', source: 'count', table: 't-jobs', filterField: 'status', filterValue: 'Urgent' } },
        { type: 'records', name: 'job_list', props: { table: 't-jobs', allowDelete: 'managers', search: 'yes' } },
        { type: 'table', name: 'contacts', props: {
          header: 'yes',
          columns: [{ id: 'k-name', label: 'Name' }, { id: 'k-role', label: 'Role' }],
          rows: [{ id: 'r-1', cells: { 'k-name': 'Sam', 'k-role': 'Stores' } }]
        } }
      ] }
    ]
  }]
};

function setControl(window, panel, name, value) {
  const control = panel.querySelector(`[data-name="${name}"] .mtw-pb-control`);
  control.value = value;
  control.dispatchEvent(new window.Event('input', { bubbles: true }));
  control.dispatchEvent(new window.Event('change', { bubbles: true }));
}

test('a published page works: required check, save, message, clear, If/else, show/hide, live list and count, delete', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: JOBS_PAGE } } });
  const { dom, window, document, errors } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-page'));
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  const visibleEl = name => panel.querySelector(`[data-name="${name}"]`).style.display !== 'none';
  await waitFor(window, () => !visibleEl('rush_note'));
  assert.equal(panel.querySelector('[data-name="status"] select').options.length, 3, 'choose + 2 choices from the table field');
  assert.ok(panel.querySelector('[data-name="order_number"] label').textContent.includes('*'), 'required from the table field');

  // If status = Urgent (any case): show the note and set the heading text.
  setControl(window, panel, 'order_number', '1001');
  setControl(window, panel, 'status', 'Urgent');
  await waitFor(window, () => visibleEl('rush_note'));
  assert.equal(panel.querySelector('[data-name="title"]').textContent, 'Rush job 1001');
  setControl(window, panel, 'status', 'Normal');
  await waitFor(window, () => !visibleEl('rush_note'));
  setControl(window, panel, 'status', 'Urgent');
  await waitFor(window, () => visibleEl('rush_note'));

  // Required field missing: nothing saved, a message says what's missing.
  setControl(window, panel, 'order_number', '');
  panel.querySelector('[data-name="save"] button').click();
  await waitFor(window, () => /Please fill in: Order number/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  assert.equal(Object.keys(db.data['dashboard-data-jobs-t-jobs'] || {}).length, 0);

  setControl(window, panel, 'order_number', '1001');
  panel.querySelector('[data-name="save"] button').click();
  await waitFor(window, () => Object.keys(db.data['dashboard-data-jobs-t-jobs'] || {}).length === 1);
  const saved = Object.values(db.data['dashboard-data-jobs-t-jobs'])[0];
  assert.equal(saved.order_number, '1001');
  assert.equal(saved.status, 'Urgent');
  assert.equal(saved._createdBy, 'Managers');
  assert.equal(typeof saved._createdAt, 'number');
  await waitFor(window, () => /Saved 1001 for Managers/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  await waitFor(window, () => panel.querySelector('[data-name="order_number"] .mtw-pb-control').value === '');

  // Live list and count.
  await waitFor(window, () => panel.querySelectorAll('[data-name="job_list"] tbody tr').length === 1);
  assert.equal(panel.querySelector('[data-name="job_list"] tbody td').textContent, '1001');
  await waitFor(window, () => panel.querySelector('[data-name="urgent_count"] .mtw-pb-stat-value').textContent === '1');
  // Structured static table.
  assert.deepEqual([...panel.querySelectorAll('[data-name="contacts"] th')].map(th => th.textContent), ['Name', 'Role']);
  assert.deepEqual([...panel.querySelectorAll('[data-name="contacts"] td')].map(td => td.textContent), ['Sam', 'Stores']);

  // Delete asks first (No keeps it, Yes removes it).
  panel.querySelector('.mtw-pb-records-delete').click();
  await waitFor(window, () => panel.querySelector('.mtw-pb-ask'));
  [...panel.querySelectorAll('.mtw-pb-ask button')].find(b => b.textContent === 'No').click();
  await tick(window);
  assert.equal(Object.keys(db.data['dashboard-data-jobs-t-jobs']).length, 1);
  panel.querySelector('.mtw-pb-records-delete').click();
  await waitFor(window, () => panel.querySelector('.mtw-pb-ask'));
  [...panel.querySelectorAll('.mtw-pb-ask button')].find(b => b.textContent === 'Yes').click();
  await waitFor(window, () => Object.keys(db.data['dashboard-data-jobs-t-jobs']).length === 0);
  await waitFor(window, () => panel.querySelector('[data-name="urgent_count"] .mtw-pb-stat-value').textContent === '0');
  await waitFor(window, () => /Nothing here yet/.test(panel.querySelector('[data-name="job_list"]').textContent));
  assert.deepEqual(errors.filter(e => !/stylesheet|Could not parse CSS/i.test(e)), []);
  dom.window.close();
});

test('records: non-managers get no delete button when only managers may delete', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: JOBS_PAGE } }, 'dashboard-data-jobs-t-jobs': { a: { order_number: '7', status: 'Normal', _createdAt: 1 } } });
  const { dom, window, document } = host({ role: 'Stores', db });
  await waitFor(window, () => document.querySelectorAll('.custom-dashboard-tool-jobs-panel [data-name="job_list"] tbody tr').length === 1);
  assert.equal(document.querySelector('.mtw-pb-records-delete'), null);
  dom.window.close();
});

test('builder: data table editor, form shortcut, element names, step drag targets, table cards', async () => {
  const db = store(TOOLS);
  const { dom, window, document, errors } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');

  // Data tab: new table with default fields; add and rename a field.
  ui.querySelector('.mtw-pb-tab[data-tab="data"]').click();
  ui.querySelector('.mtw-pb-add-table').click();
  const tableId = editor.page.tables[0].id;
  assert.deepEqual({ ...editor.selected }, { kind: 'table', id: tableId });
  assert.deepEqual([...editor.page.tables[0].fields.map(f => f.key)], ['name', 'notes']);
  inspector.querySelector('.mtw-pb-add-field').click();
  const labelInput = [...inspector.querySelectorAll('.mtw-pb-card-item')][2].querySelector('[data-field^="label-"] input');
  labelInput.value = 'Order number';
  labelInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(editor.page.tables[0].fields[2].label, 'Order number');
  assert.equal(editor.page.tables[0].fields[2].key, 'field_3', 'keys stay put when renamed');

  // Shortcut: a form (inputs bound to each field), a Save button with steps, and a list.
  inspector.querySelector('.mtw-pb-make-form').click();
  const blocks = editor.page.sections[0].columns.flatMap(col => col.blocks);
  assert.deepEqual([...blocks.map(b => b.type)], ['heading', 'input', 'input', 'input', 'button', 'heading', 'records']);
  assert.deepEqual([...blocks.filter(b => b.type === 'input').map(b => b.props.bind)], [`${tableId}.name`, `${tableId}.notes`, `${tableId}.field_3`]);
  const saveBtn = blocks.find(b => b.type === 'button');
  assert.deepEqual([...saveBtn.props.actions.map(a => a.type)], ['save', 'message', 'clear']);
  assert.equal(saveBtn.props.actions[0].table, tableId);
  assert.equal(ui.querySelectorAll('.mtw-pb-frame .mtw-pb-input').length, 3);

  // Rename the first input; steps that use it follow.
  const firstInput = blocks.find(b => b.type === 'input');
  editor.select({ kind: 'block', id: saveBtn.id });
  editor.dropStep({ kind: 'newStep', type: 'if', scope: `block:${saveBtn.id}` }, [], 0);
  const ifStep = c => c.page.sections[0].columns[0].blocks.find(b => b.id === saveBtn.id).props.actions[0];
  assert.equal(ifStep(editor).type, 'if');
  // The right panel shows a summary; the steps themselves open in the wide Steps panel.
  assert.match(inspector.querySelector('.mtw-pb-steps-outline').textContent, /If \/ then \/ else/);
  inspector.querySelector('.mtw-pb-edit-steps').click();
  const logic = ui.querySelector('.mtw-pb-logic');
  assert.equal(logic.hidden, false);
  assert.match(logic.querySelector('.mtw-pb-logic-trigger').textContent, /When it is clicked/);
  assert.ok(logic.querySelector('.mtw-pb-step-tile[data-step-type="clear"] span').textContent.includes('form is ready'), 'steps explain themselves');
  const leftSelect = logic.querySelector('.mtw-pb-step-if [data-field="left"] select');
  assert.ok([...leftSelect.options].some(o => o.value === firstInput.name), 'If can pick any named element');
  leftSelect.value = firstInput.name;
  leftSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  // Drop a Stop step into the If's Then branch.
  editor.dropStep({ kind: 'newStep', type: 'stop', scope: `block:${saveBtn.id}` }, [ifStep(editor).id, 'then'], 0);
  assert.equal(ifStep(editor).then[0].type, 'stop');
  // Move the message step into Else.
  const messageId = editor.page.sections[0].columns[0].blocks.find(b => b.id === saveBtn.id).props.actions[2].id;
  editor.dropStep({ kind: 'step', id: messageId, scope: `block:${saveBtn.id}` }, [ifStep(editor).id, 'else'], 0);
  assert.equal(ifStep(editor).else[0].type, 'message');
  assert.equal(logic.querySelectorAll('.mtw-pb-step').length, 5, 'if, stop, message, save, clear cards');
  logic.querySelector('.mtw-pb-logic-done').click();
  assert.equal(logic.hidden, true);

  editor.select({ kind: 'block', id: firstInput.id });
  const nameInput = inspector.querySelector('[data-field="name"] input');
  nameInput.value = 'customer';
  nameInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(ifStep(editor).left, 'customer');
  // Token picker inserts {name}.
  editor.select({ kind: 'block', id: saveBtn.id });
  editor.openSteps(`block:${saveBtn.id}`);
  const msgInput = logic.querySelector('.mtw-pb-step-message [data-field="text"] input');
  msgInput.value = 'Hi ';
  msgInput.setSelectionRange(3, 3);
  const picker = logic.querySelector('.mtw-pb-step-message .mtw-pb-token');
  picker.value = '{customer}';
  picker.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(ifStep(editor).else[0].text, 'Hi {customer}');
  editor.closeSteps();

  // Hidden at start: ticked in the right panel, faded with a tag in the editor.
  editor.select({ kind: 'block', id: firstInput.id });
  const hide = inspector.querySelector('.mtw-pb-hidden-start input');
  hide.click();
  assert.equal(editor.page.sections[0].columns[0].blocks.find(b => b.id === firstInput.id).hidden, true);
  assert.ok(ui.querySelector(`.mtw-pb-frame .mtw-pb-item[data-block-id="${firstInput.id}"]`).classList.contains('is-start-hidden'));

  // Table block: column and row cards.
  ui.querySelector('.mtw-pb-tab[data-tab="blocks"]').click();
  editor.select(null);
  pointer(window, ui.querySelector('.mtw-pb-tile[data-block-type="table"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  const tableBlockId = editor.selected.id;
  assert.equal(inspector.querySelectorAll('.mtw-pb-cards')[0].children.length, 3, 'three column cards');
  inspector.querySelector('.mtw-pb-add-col').click();
  inspector.querySelector('.mtw-pb-add-row').click();
  const props = () => editor.page.sections.flatMap(s => s.columns.flatMap(col => col.blocks)).find(b => b.id === tableBlockId).props;
  assert.equal(props().columns.length, 4);
  assert.equal(props().rows.length, 2);
  const rowCards = inspector.querySelectorAll('.mtw-pb-cards')[1].children;
  const cellInputs = rowCards[1].querySelectorAll('.mtw-pb-field input');
  assert.equal(cellInputs.length, 4, 'one box per column');
  assert.equal(rowCards[1].querySelector('.mtw-pb-field label').textContent, 'Name', 'labelled by the column heading');
  cellInputs[0].value = 'Jo';
  cellInputs[0].dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(props().rows[1].cells[props().columns[0].id], 'Jo');
  assert.ok([...ui.querySelectorAll(`.mtw-pb-frame [data-block-id="${tableBlockId}"] td`)].some(td => td.textContent === 'Jo'));
  rowCards[0].querySelector('.mtw-pb-card-delete').click();
  assert.equal(props().rows.length, 1);

  // Save keeps it all.
  editor.save(true);
  await waitFor(window, () => db.data['dashboard-tool-pages'] && db.data['dashboard-tool-pages'].jobs);
  assert.equal(db.data['dashboard-tool-pages'].jobs.published.tables[0].fields.length, 3);
  editor.close(true);
  assert.deepEqual(errors.filter(e => !/stylesheet|Could not parse CSS/i.test(e)), []);
  dom.window.close();
});

test('hidden at start and middle-aligned sections on a published page', async () => {
  const page = {
    sections: [{
      layout: '1-1', style: { valign: 'center' },
      columns: [
        { blocks: [{ type: 'notice', name: 'done_note', hidden: true, props: { text: 'Done!' } }] },
        { blocks: [{ type: 'button', name: 'go', props: { label: 'Go', actions: [{ type: 'show', target: 'done_note' }] } }] }
      ]
    }]
  };
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="go"]'));
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  assert.equal(panel.querySelector('[data-name="done_note"]').style.display, 'none');
  assert.equal(panel.querySelector('.mtw-pb-row').dataset.valign, 'center');
  panel.querySelector('[data-name="go"] button').click();
  await waitFor(window, () => panel.querySelector('[data-name="done_note"]').style.display !== 'none');
  dom.window.close();
});

// ---------- stage 3: popups, card lists, export, import ----------

const BOARD_PAGE = {
  tables: [{
    id: 't-jobs', name: 'Jobs',
    fields: [
      { key: 'customer', label: 'Customer', type: 'text', required: true },
      { key: 'notes', label: 'Notes', type: 'longtext' },
      { key: 'qty', label: 'Qty', type: 'number' }
    ]
  }],
  sections: [
    { layout: '1-1', columns: [
      { blocks: [{ type: 'heading', name: 'board_title', props: { text: 'Jobs' } }] },
      { blocks: [
        { type: 'button', name: 'add', props: { label: '+ Add', actions: [{ type: 'openPopup', target: 'add_job' }] } },
        { type: 'button', name: 'export', props: { label: 'Export', actions: [{ type: 'exportCsv', table: 't-jobs' }] } },
        { type: 'button', name: 'import', props: { label: 'Import', actions: [{ type: 'importCsv', table: 't-jobs' }] } }
      ] }
    ] },
    { layout: '1', columns: [{ blocks: [
      { type: 'cards', name: 'job_cards', props: { table: 't-jobs', titleField: 'customer', textField: 'notes', fields: ['qty'], actions: [
        { type: 'setText', target: 'detail_title', value: '{record.customer} ({record.qty})' },
        { type: 'if', left: 'record.qty', op: 'greater', right: '5', then: [{ type: 'message', text: 'Big job for {record.customer}' }] },
        { type: 'openPopup', target: 'details' }
      ] } }
    ] }] },
    { layout: '1', popup: true, name: 'add_job', title: 'Add a job', columns: [{ blocks: [
      { type: 'input', name: 'customer', props: { label: 'Customer', bind: 't-jobs.customer' } },
      { type: 'input', name: 'notes', props: { label: 'Notes', bind: 't-jobs.notes' } },
      { type: 'input', name: 'qty', props: { label: 'Qty', bind: 't-jobs.qty' } },
      { type: 'button', name: 'save', props: { label: 'Save', actions: [
        { type: 'save', table: 't-jobs' }, { type: 'clear' }, { type: 'closePopup', target: 'add_job' }
      ] } }
    ] }] },
    { layout: '1', popup: true, name: 'details', title: 'Job', columns: [{ blocks: [
      { type: 'heading', name: 'detail_title', props: { text: '' } },
      { type: 'button', name: 'close_details', props: { label: 'Close', actions: [{ type: 'closePopup' }] } }
    ] }] }
  ]
};

test('card board: popup form adds a card, card click fills a popup with the record, export, import', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: BOARD_PAGE } } });
  const { dom, window, document, errors } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="job_cards"]'));
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  const popup = name => panel.querySelector(`.mtw-pb-popup[data-popup="${name}"]`);
  assert.equal(popup('add_job').hidden, true, 'popups start closed');
  assert.equal(panel.querySelector('.mtw-pb-popup-tag'), null, 'no editor tags on the live page');
  await waitFor(window, () => /No cards yet/.test(panel.querySelector('[data-name="job_cards"]').textContent));

  // + Add opens the popup; Save adds a record, clears and closes it.
  panel.querySelector('[data-name="add"] button').click();
  await waitFor(window, () => !popup('add_job').hidden);
  assert.equal(popup('add_job').querySelector('.mtw-pb-popup-head strong').textContent, 'Add a job');
  setControl(window, panel, 'customer', 'Smith Ltd');
  setControl(window, panel, 'notes', 'Two pallets');
  setControl(window, panel, 'qty', '8');
  panel.querySelector('[data-name="save"] button').click();
  await waitFor(window, () => popup('add_job').hidden);
  const rows = Object.values(db.data['dashboard-data-jobs-t-jobs']);
  assert.deepEqual([rows[0].customer, rows[0].notes, rows[0].qty], ['Smith Ltd', 'Two pallets', 8], 'numbers saved as numbers');
  await waitFor(window, () => panel.querySelectorAll('.mtw-pb-record-card').length === 1);
  const card = panel.querySelector('.mtw-pb-record-card');
  assert.equal(card.querySelector('.mtw-pb-record-card-title').textContent, 'Smith Ltd');
  assert.equal(card.querySelector('.mtw-pb-record-card-text').textContent, 'Two pallets');
  assert.deepEqual([...card.querySelectorAll('dt, dd')].map(n => n.textContent), ['Qty', '8']);

  // Clicking a card: {record.*} and If on record values, then the details popup.
  card.click();
  await waitFor(window, () => !popup('details').hidden);
  assert.equal(panel.querySelector('[data-name="detail_title"]').textContent, 'Smith Ltd (8)');
  await waitFor(window, () => /Big job for Smith Ltd/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  // Close with no target closes the open popup; Esc also closes.
  panel.querySelector('[data-name="close_details"] button').click();
  await waitFor(window, () => popup('details').hidden);
  card.click();
  await waitFor(window, () => !popup('details').hidden);
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  await waitFor(window, () => popup('details').hidden);

  // Export: a CSV download of the table.
  let download = null;
  window.URL.createObjectURL = blob => { download = { blob }; return 'blob:mtw'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { if (download) download.name = this.download; };
  panel.querySelector('[data-name="export"] button').click();
  await waitFor(window, () => download && download.name);
  assert.match(download.name, /^Jobs \d{4}-\d{2}-\d{2}\.csv$/);
  const text = await new Promise(resolve => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(download.blob);
  });
  const csv = text.replace(/^﻿/, '').split('\r\n');
  assert.equal(csv[0], 'Customer,Notes,Qty,Added,Added by');
  assert.match(csv[1], /^Smith Ltd,Two pallets,8,.+,Managers$/);

  // Import: pick a CSV, preview (matched columns, skipped rows), import.
  panel.querySelector('[data-name="import"] button').click();
  await waitFor(window, () => panel.querySelector('.mtw-pb-file-input'));
  const fileInput = panel.querySelector('.mtw-pb-file-input');
  const file = new window.File(['customer,QTY,Colour\nJones,3,red\n,4,blue\n"Brown, Co",x,green\nGreen,12,\n'], 'jobs.csv', { type: 'text/csv' });
  Object.defineProperty(fileInput, 'files', { value: [file] });
  fileInput.dispatchEvent(new window.Event('change'));
  await waitFor(window, () => panel.querySelector('.mtw-pb-import'));
  const preview = panel.querySelector('.mtw-pb-import');
  assert.match(preview.textContent, /2 of 4 rows ready to add\. 2 will be skipped/);
  assert.match(preview.textContent, /customer → Customer/);
  assert.match(preview.textContent, /Colour: not imported/);
  assert.match(preview.textContent, /Row 3: Customer is empty/);
  assert.match(preview.textContent, /Row 4: Qty isn't a number/);
  [...preview.querySelectorAll('button')].find(b => /^Import/.test(b.textContent)).click();
  await waitFor(window, () => Object.keys(db.data['dashboard-data-jobs-t-jobs']).length === 3);
  const imported = Object.values(db.data['dashboard-data-jobs-t-jobs']).map(r => [r.customer, r.qty]);
  assert.deepEqual(imported.slice(1), [['Jones', 3], ['Green', 12]]);
  await waitFor(window, () => /Imported 2 records, skipped 2/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  await waitFor(window, () => panel.querySelectorAll('.mtw-pb-record-card').length === 3);
  assert.deepEqual(errors.filter(e => !/stylesheet|Could not parse CSS|navigation to another Document/i.test(e)), []);
  dom.window.close();
});

test('builder: popups are built like pages, card board shortcut, record fields in the steps panel', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  ui.querySelector('.mtw-pb-tab[data-tab="data"]').click();
  ui.querySelector('.mtw-pb-add-table').click();
  const tableId = editor.page.tables[0].id;
  inspector.querySelector('.mtw-pb-make-board').click();
  const popups = editor.page.popups;
  assert.equal(popups.length, 1);
  const blocks = editor.page.sections.concat(...editor.page.popups.map(p => p.sections)).flatMap(s => s.columns.flatMap(col => col.blocks));
  const byLabel = label => blocks.find(b => b.props.label === label);
  assert.equal(byLabel('+ Add').props.popup, popups[0].name, '+ Add opens the popup');
  assert.deepEqual([...byLabel('Save').props.actions.map(a => a.type)], ['save', 'message', 'clear', 'closePopup']);
  assert.equal(byLabel('Export').props.actions[0].table, tableId);
  assert.equal(byLabel('Import').props.actions[0].type, 'importCsv');
  const cards = blocks.find(b => b.type === 'cards');
  assert.equal(cards.props.table, tableId);
  assert.equal(cards.props.titleField, 'name');
  // Popups aren't drawn on the page canvas; the Popups tab opens one to build it.
  assert.equal(ui.querySelector('.mtw-pb-frame .mtw-pb-popup-dialog'), null);

  // The cards' steps: record fields are offered; "Delete this record" is available.
  editor.select({ kind: 'block', id: cards.id });
  inspector.querySelector('.mtw-pb-edit-steps').click();
  const logic = ui.querySelector('.mtw-pb-logic');
  assert.match(logic.querySelector('.mtw-pb-logic-trigger').textContent, /When a card is clicked/);
  assert.ok(logic.querySelector('.mtw-pb-step-tile[data-step-type="deleteRecord"]'));
  editor.dropStep({ kind: 'newStep', type: 'if', scope: `block:${cards.id}` }, [], 0);
  const left = logic.querySelector('.mtw-pb-step-if [data-field="left"] select');
  assert.ok([...left.options].some(o => o.value === 'record.name'), 'If can test the clicked record');
  const token = logic.querySelector('.mtw-pb-step-if .mtw-pb-token');
  assert.ok([...token.options].some(o => o.value === '{record.name}'));
  editor.closeSteps();
  // A button's steps don't offer record-only steps.
  editor.select({ kind: 'block', id: byLabel('+ Add').id });
  inspector.querySelector('.mtw-pb-edit-steps').click();
  assert.equal(logic.querySelector('.mtw-pb-step-tile[data-step-type="deleteRecord"]'), null);
  editor.dropStep({ kind: 'newStep', type: 'openPopup', scope: `block:${byLabel('+ Add').id}` }, [], 0);
  assert.ok([...logic.querySelector('.mtw-pb-step-openPopup [data-field="target"] select').options].some(o => o.value === popups[0].name));
  editor.closeSteps();

  // Popups tab -> open the popup on the canvas; add a two-column section; drop blocks in it.
  editor.select(null);
  ui.querySelector('.mtw-pb-tab[data-tab="popups"]').click();
  ui.querySelector('.mtw-pb-popup-item').click();
  assert.ok(ui.querySelector('.mtw-pb-frame .mtw-pb-page.is-popup-canvas .mtw-pb-popup-dialog'));
  assert.equal(ui.querySelector('.mtw-pb-canvas-bar').hidden, false);
  assert.match(inspector.textContent, /Popup name/);
  const popupId = popups[0].id;
  ui.querySelector('.mtw-pb-tab[data-tab="blocks"]').click();
  pointer(window, ui.querySelector('.mtw-pb-tile-layout[data-layout="1-1"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  const popupNow = () => editor.page.popups.find(p => p.id === popupId);
  assert.equal(popupNow().sections.length, 2, 'section added inside the popup');
  assert.equal(editor.page.sections.length, 2, 'page sections untouched');
  const [l, r] = popupNow().sections[1].columns.map(col => col.id);
  editor.drop({ kind: 'new', type: 'button' }, { type: 'block', columnId: l, index: 0 });
  editor.drop({ kind: 'new', type: 'button' }, { type: 'block', columnId: r, index: 0 });
  assert.equal(popupNow().sections[1].columns.map(col => col.blocks.length).join(), '1,1');
  // Popup settings: width and title.
  editor.select(null);
  const width = inspector.querySelector('[data-field="width"] select');
  width.value = 'large';
  width.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(popupNow().width, 'large');
  ui.querySelector('.mtw-pb-canvas-back').click();
  assert.equal(ui.querySelector('.mtw-pb-frame .mtw-pb-popup-dialog'), null, 'back on the page');
  editor.close(true);
  dom.window.close();
});

test('builder preview runs steps without writing to Firestore', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { draft: BOARD_PAGE } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  [...ui.querySelectorAll('.mtw-pb-top-actions button')].find(b => b.textContent === 'Preview').click();
  const frame = ui.querySelector('.mtw-pb-frame');
  frame.querySelector('[data-name="add"] button').click();
  await waitFor(window, () => !frame.querySelector('.mtw-pb-popup[data-popup="add_job"]').hidden);
  setControl(window, frame, 'customer', 'Test Co');
  frame.querySelector('[data-name="save"] button').click();
  await waitFor(window, () => frame.querySelector('.mtw-pb-popup[data-popup="add_job"]').hidden);
  assert.equal(db.data['dashboard-data-jobs-t-jobs'], undefined, 'nothing written');
  // ...but the card shows in the preview, until going back to editing.
  await waitFor(window, () => [...frame.querySelectorAll('.mtw-pb-record-card-title')].some(n => n.textContent === 'Test Co'));
  [...ui.querySelectorAll('.mtw-pb-top-actions button')].find(b => b.textContent === 'Edit').click();
  assert.ok(![...ui.querySelectorAll('.mtw-pb-frame .mtw-pb-record-card-title')].some(n => n.textContent === 'Test Co'), 'preview-only card gone');
  editor.close(true);
  dom.window.close();
});

test('card list without a data table: typed cards, click steps use the card', async () => {
  const page = { sections: [{ layout: '1', columns: [{ blocks: [
    { type: 'heading', name: 'picked', props: { text: 'Pick one' } },
    { type: 'cards', name: 'menu', props: {
      source: 'manual', perRow: 2, search: 'yes',
      items: [{ id: 'i-a', title: 'Brakes', text: 'Pads and discs', note: '2 hours' }, { id: 'i-b', title: 'Tyres', text: 'Fit and balance' }],
      actions: [{ type: 'setText', target: 'picked', value: 'You picked {record.title} ({record.note})' }]
    } }
  ] }] }] };
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => document.querySelectorAll('.custom-dashboard-tool-jobs-panel .mtw-pb-record-card').length === 2);
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  const cards = [...panel.querySelectorAll('.mtw-pb-record-card')];
  assert.deepEqual(cards.map(card => card.querySelector('strong').textContent), ['Brakes', 'Tyres']);
  assert.equal(panel.querySelector('.mtw-pb-card-grid').style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  cards[0].click();
  await waitFor(window, () => panel.querySelector('[data-name="picked"]').textContent === 'You picked Brakes (2 hours)');
  const search = panel.querySelector('.mtw-pb-records-search');
  search.value = 'tyre';
  search.dispatchEvent(new window.Event('input'));
  assert.deepEqual([...panel.querySelectorAll('.mtw-pb-record-card strong')].map(n => n.textContent), ['Tyres']);
  dom.window.close();
});

test('builder: card list cards are added and edited as cards; no table needed', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  pointer(window, ui.querySelector('.mtw-pb-tile[data-block-type="cards"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  const id = editor.selected.id;
  const props = () => editor.page.sections[0].columns[0].blocks.find(b => b.id === id).props;
  assert.equal(props().source, 'manual');
  assert.equal(inspector.querySelector('[data-field="table"]'), null, 'no data table picker for typed cards');
  assert.equal(ui.querySelectorAll('.mtw-pb-frame .mtw-pb-record-card').length, 3);
  inspector.querySelector('.mtw-pb-add-card').click();
  assert.equal(props().items.length, 4);
  const cards = inspector.querySelectorAll('.mtw-pb-cards')[0].children;
  const title = cards[3].querySelector('[data-field^="title-"] input');
  title.value = 'Wipers';
  title.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(props().items[3].title, 'Wipers');
  assert.ok([...ui.querySelectorAll('.mtw-pb-frame .mtw-pb-record-card strong')].some(n => n.textContent === 'Wipers'));
  cards[0].querySelector('.mtw-pb-card-delete').click();
  assert.deepEqual([...props().items.map(i => i.title)], ['Second card', 'Third card', 'Wipers']);
  // Steps for typed cards offer the card's fields, and no "Delete this record".
  inspector.querySelector('.mtw-pb-edit-steps').click();
  const logic = ui.querySelector('.mtw-pb-logic');
  assert.equal(logic.querySelector('.mtw-pb-step-tile[data-step-type="deleteRecord"]'), null);
  editor.dropStep({ kind: 'newStep', type: 'if', scope: `block:${id}` }, [], 0);
  assert.ok([...logic.querySelector('.mtw-pb-step-if [data-field="left"] select').options].some(o => o.value === 'record.title'));
  editor.closeSteps();
  // Switching to a data table shows the table settings instead.
  const source = inspector.querySelector('[data-field="source"] select');
  source.value = 'table';
  source.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(inspector.querySelector('[data-field="table"]'));
  assert.equal(inspector.querySelector('.mtw-pb-add-card'), null);
  editor.close(true);
  dom.window.close();
});

test('cards people add: each card list gets its own popup + table; fields stay in sync; works live', async () => {
  const db = store(TOOLS);
  const { dom, window, document, errors } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  const all = () => editor.page.sections.concat(...editor.page.popups.map(p => p.sections)).flatMap(s => s.columns.flatMap(col => col.blocks));
  const addCardList = async () => {
    editor.select(null);
    pointer(window, ui.querySelector('.mtw-pb-tile[data-block-type="cards"]'), 'pointerdown');
    pointer(window, document, 'pointerup');
    await tick(window);
    const id = editor.selected.id;
    const source = inspector.querySelector('[data-field="source"] select');
    source.value = 'added';
    source.dispatchEvent(new window.Event('change', { bubbles: true }));
    return id;
  };

  const first = await addCardList();
  const p1 = all().find(b => b.id === first).props;
  assert.equal(p1.source, 'added');
  const t1 = editor.page.tables.find(t => t.id === p1.table);
  assert.deepEqual([...t1.fields.map(f => f.label)], ['Title', 'Details']);
  const popup1 = editor.page.popups.find(p => p.name === p1.formPopup);
  assert.ok(popup1, 'its own popup');
  assert.deepEqual([...popup1.sections[0].columns[0].blocks.map(b => [b.type, b.props.bind || b.props.label])],
    [['input', `${t1.id}.name`], ['input', `${t1.id}.notes`], ['button', 'Save card']]);
  assert.ok(all().some(b => b.type === 'button' && b.props.label === '+ Add card' && b.props.popup === p1.formPopup));

  // Card fields: add one -> the popup gets an input; rename -> label follows; delete -> input goes.
  inspector.querySelector('.mtw-pb-add-card-field').click();
  const t1b = () => editor.page.tables.find(t => t.id === p1.table);
  const newKey = t1b().fields[2].key;
  const popupBlocks = () => editor.page.popups.find(p => p.name === p1.formPopup).sections[0].columns[0].blocks;
  assert.deepEqual([...popupBlocks().map(b => b.props.bind || b.props.label)], [`${t1.id}.name`, `${t1.id}.notes`, `${t1.id}.${newKey}`, 'Save card']);
  const fieldCards = inspector.querySelectorAll('[data-drop-group^="cardfields:"] .mtw-pb-card-item');
  const label = fieldCards[2].querySelector('[data-field^="label-"] input');
  label.value = 'Order number';
  label.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(popupBlocks()[2].props.label, 'Order number');
  inspector.querySelectorAll('[data-drop-group^="cardfields:"] .mtw-pb-card-item')[1].querySelector('.mtw-pb-card-delete').click();
  assert.deepEqual([...popupBlocks().map(b => b.props.bind || b.props.label)], [`${t1.id}.name`, `${t1.id}.${newKey}`, 'Save card']);

  // A second card list: a different table and a different popup.
  const second = await addCardList();
  const p2 = all().find(b => b.id === second).props;
  assert.notEqual(p2.table, p1.table);
  assert.notEqual(p2.formPopup, p1.formPopup);

  // Popups tab lists both; a button's "Opens a popup" can create a new one.
  ui.querySelector('.mtw-pb-tab[data-tab="popups"]').click();
  assert.equal(ui.querySelectorAll('.mtw-pb-popup-item').length, 2);
  ui.querySelector('.mtw-pb-new-popup').click();
  assert.equal(editor.page.popups.length, 3);
  ui.querySelector('.mtw-pb-tab[data-tab="blocks"]').click();
  editor.select(null);
  pointer(window, ui.querySelector('.mtw-pb-tile[data-block-type="button"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  const btnId = editor.selected.id;
  const pick = inspector.querySelector('[data-field="popup"] select');
  pick.value = '__new__';
  pick.dispatchEvent(new window.Event('change', { bubbles: true }));
  const btnPopup = all().find(b => b.id === btnId).props.popup;
  assert.ok(btnPopup && editor.page.popups.some(p => p.name === btnPopup), 'new popup made and attached');
  assert.equal(editor.page.popups.length, 4);

  // Publish and use it: + Add card -> popup -> Save -> card saved to Firestore and shown.
  editor.save(true);
  await waitFor(window, () => db.data['dashboard-tool-pages'] && db.data['dashboard-tool-pages'].jobs);
  editor.close(true);
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  await waitFor(window, () => panel.querySelector(`.mtw-pb-popup[data-popup="${p1.formPopup}"]`));
  const addButtons = [...panel.querySelectorAll('.mtw-pb-button')].filter(b => b.textContent === '+ Add card');
  assert.equal(addButtons.length, 2);
  addButtons[0].click();
  const shell = panel.querySelector(`.mtw-pb-popup[data-popup="${p1.formPopup}"]`);
  await waitFor(window, () => !shell.hidden);
  const controls = shell.querySelectorAll('.mtw-pb-control');
  controls[0].value = 'Smith Ltd';
  controls[0].dispatchEvent(new window.Event('input', { bubbles: true }));
  controls[1].value = '1001';
  controls[1].dispatchEvent(new window.Event('input', { bubbles: true }));
  [...shell.querySelectorAll('.mtw-pb-button')].find(b => b.textContent === 'Save card').click();
  await waitFor(window, () => shell.hidden);
  const saved = Object.values(db.data[`dashboard-data-jobs-${p1.table}`]);
  assert.deepEqual([saved[0].name, saved[0][newKey]], ['Smith Ltd', '1001']);
  await waitFor(window, () => [...panel.querySelectorAll('.mtw-pb-record-card-title')].some(n => n.textContent === 'Smith Ltd'));
  assert.equal(db.data[`dashboard-data-jobs-${p2.table}`], undefined, 'the other list is untouched');
  assert.deepEqual(errors.filter(e => !/stylesheet|Could not parse CSS/i.test(e)), []);
  dom.window.close();
});

test('designed cards on the live page: fields, labels, badges, text with record values, card look', async () => {
  const page = {
    tables: [{ id: 't-jobs', name: 'Jobs', fields: [
      { key: 'customer', label: 'Customer', type: 'text' }, { key: 'status', label: 'Status', type: 'choice', options: 'Open\nDone' },
      { key: 'qty', label: 'Qty', type: 'number' }] }],
    sections: [{ layout: '1', columns: [{ blocks: [{ type: 'cards', name: 'jobs', props: {
      source: 'table', table: 't-jobs',
      design: {
        parts: [
          { type: 'field', field: 'customer', size: 'large', weight: '700' },
          { type: 'badge', field: 'status', tone: 'success', inline: 'yes', align: 'right' },
          { type: 'field', field: 'qty', showLabel: 'before' },
          { type: 'text', text: 'Job for {record.customer}', color: '#777774' },
          { type: 'divider' },
          { type: 'meta', show: 'who' }
        ],
        style: { accent: '#3b82f6', radius: 14, padding: 20 }
      }
    } }] }] }]
  };
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } },
    'dashboard-data-jobs-t-jobs': { a: { customer: 'Smith Ltd', status: 'Open', qty: 4, _createdAt: 5, _createdBy: 'Stores' } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-record-card .mtw-pb-card-line'));
  const card = document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-record-card');
  const lines = [...card.querySelectorAll(':scope > .mtw-pb-card-line')];
  assert.equal(lines.length, 5, 'badge shares the first line');
  assert.equal(lines[0].children[0].textContent, 'Smith Ltd');
  assert.equal(lines[0].children[0].style.fontWeight, '700');
  assert.equal(lines[0].children[1].className.includes('mtw-pb-badge-success'), true);
  assert.equal(lines[0].children[1].textContent, 'Open');
  assert.equal(lines[1].textContent, 'Qty: 4');
  assert.equal(lines[2].textContent, 'Job for Smith Ltd');
  assert.equal(lines[4].textContent, 'by Stores');
  assert.equal(card.style.borderLeft, '4px solid rgb(59, 130, 246)');
  assert.equal(card.style.borderRadius, '14px');
  dom.window.close();
});

test('builder: card designer adds, edits and styles parts with a live preview', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  pointer(window, ui.querySelector('.mtw-pb-tile[data-block-type="cards"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  const id = editor.selected.id;
  const design = () => editor.page.sections[0].columns[0].blocks.find(b => b.id === id).props.design;
  assert.match(inspector.textContent, /Using the standard card look/);
  inspector.querySelector('.mtw-pb-design-cards').click();
  const logic = ui.querySelector('.mtw-pb-logic');
  assert.equal(logic.hidden, false);
  assert.deepEqual([...design().parts.map(p => p.field)], ['title', 'text'], 'starts from the current look');
  // Click a Badge tile: added at the bottom with the first field.
  pointer(window, logic.querySelector('.mtw-pb-step-tile[data-part-type="badge"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  assert.equal(design().parts.length, 3);
  const badgeCard = logic.querySelectorAll('.mtw-pb-part')[2];
  const tone = badgeCard.querySelector('[data-field="tone"] select');
  tone.value = 'danger';
  tone.dispatchEvent(new window.Event('change', { bubbles: true }));
  const field = logic.querySelectorAll('.mtw-pb-part')[2].querySelector('[data-field="field"] select');
  field.value = 'note';
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepEqual([design().parts[2].type, design().parts[2].tone, design().parts[2].field], ['badge', 'danger', 'note']);
  // Card look: accent strip shows in the preview and on the page.
  const accent = [...logic.querySelectorAll('.mtw-pb-design-side .mtw-pb-field')].find(f => f.dataset.field === 'accent').querySelector('input[type="text"]');
  accent.value = '#ff0000';
  accent.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(design().style.accent, '#ff0000');
  assert.equal(logic.querySelector('.mtw-pb-design-preview .mtw-pb-record-card').style.borderLeft, '4px solid rgb(255, 0, 0)');
  assert.equal(ui.querySelector('.mtw-pb-frame .mtw-pb-record-card').style.borderLeft, '4px solid rgb(255, 0, 0)');
  // Text part with a record value in the preview.
  pointer(window, logic.querySelector('.mtw-pb-step-tile[data-part-type="text"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  const textInput = logic.querySelectorAll('.mtw-pb-part')[3].querySelector('[data-field="text"] input');
  textInput.value = 'About {record.title}';
  textInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.ok([...logic.querySelectorAll('.mtw-pb-design-preview .mtw-pb-card-text')].some(n => n.textContent === 'About {record.title}' || n.textContent.startsWith('About')));
  assert.ok([...ui.querySelectorAll('.mtw-pb-frame .mtw-pb-card-text')].some(n => n.textContent === 'About First card'), 'page cards fill in the record');
  // Remove a part; then go back to the standard look.
  logic.querySelectorAll('.mtw-pb-part')[0].querySelector('.mtw-pb-card-delete').click();
  assert.equal(design().parts.length, 3);
  logic.querySelector('.mtw-pb-design-reset').click();
  assert.equal(design().parts.length, 0);
  assert.equal(logic.hidden, true);
  editor.close(true);
  dom.window.close();
});


test('card buttons: Edit fills the popup and Save updates the card; Delete; managers-only; own steps; images', async () => {
  const page = {
    tables: [{ id: 't-jobs', name: 'Jobs', fields: [
      { key: 'customer', label: 'Customer', type: 'text', required: true }, { key: 'photo', label: 'Photo', type: 'text' }] }],
    sections: [
      { layout: '1', columns: [{ blocks: [{ type: 'cards', name: 'jobs', props: {
        source: 'added', table: 't-jobs', formPopup: 'job_form',
        design: { parts: [
          { type: 'image', source: 'field', field: 'photo', height: 100 },
          { type: 'field', field: 'customer' },
          { type: 'button', label: 'Edit', preset: 'edit' },
          { type: 'button', label: 'Delete', preset: 'delete', variant: 'danger', inline: 'yes', visibleTo: 'managers' },
          { type: 'button', label: 'Hello', preset: 'steps', inline: 'yes', actions: [{ type: 'message', text: 'Hi {record.customer}' }] }
        ], style: {} }
      } }] }] },
      { layout: '1', popup: true, name: 'job_form', title: 'Job', columns: [{ blocks: [
        { type: 'input', name: 'customer', props: { label: 'Customer', bind: 't-jobs.customer' } },
        { type: 'input', name: 'photo', props: { label: 'Photo', bind: 't-jobs.photo' } },
        { type: 'button', name: 'save', props: { label: 'Save card', actions: [
          { type: 'save', table: 't-jobs' }, { type: 'clear' }, { type: 'closePopup', target: 'job_form' }] } }
      ] }] }
    ]
  };
  const records = { a: { customer: 'Smith Ltd', photo: 'https://example.com/a.jpg', _createdAt: 1 }, b: { customer: 'Jones', photo: 'javascript:alert(1)', _createdAt: 2 } };
  for (const role of ['Stores', 'Managers']) {
    const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } }, 'dashboard-data-jobs-t-jobs': records });
    const { dom, window, document } = host({ role, db });
    await waitFor(window, () => document.querySelectorAll('.custom-dashboard-tool-jobs-panel .mtw-pb-record-card').length === 2);
    const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
    const cardFor = name => [...panel.querySelectorAll('.mtw-pb-record-card')].find(card => card.textContent.includes(name));
    const buttons = card => [...card.querySelectorAll('.mtw-pb-card-button')].map(b => b.textContent);
    assert.deepEqual(buttons(cardFor('Smith Ltd')), role === 'Managers' ? ['Edit', 'Delete', 'Hello'] : ['Edit', 'Hello']);
    assert.equal(cardFor('Smith Ltd').querySelector('img.mtw-pb-card-image').getAttribute('src'), 'https://example.com/a.jpg');
    assert.equal(cardFor('Jones').querySelector('img'), null, 'unsafe image addresses are not shown');
    if (role === 'Stores') {
      dom.window.close();
      continue;
    }
    // Own steps with the card's values.
    [...cardFor('Jones').querySelectorAll('.mtw-pb-card-button')].find(b => b.textContent === 'Hello').click();
    await waitFor(window, () => /Hi Jones/.test(panel.querySelector('.mtw-pb-toasts').textContent));
    // Edit: popup opens filled in; Save updates the same record.
    [...cardFor('Smith Ltd').querySelectorAll('.mtw-pb-card-button')].find(b => b.textContent === 'Edit').click();
    const shell = panel.querySelector('.mtw-pb-popup[data-popup="job_form"]');
    await waitFor(window, () => !shell.hidden);
    assert.equal(shell.querySelector('[data-name="customer"] .mtw-pb-control').value, 'Smith Ltd');
    setControl(window, shell, 'customer', 'Smith & Sons');
    shell.querySelector('[data-name="save"] button').click();
    await waitFor(window, () => shell.hidden);
    assert.equal(Object.keys(db.data['dashboard-data-jobs-t-jobs']).length, 2, 'updated, not added');
    assert.equal(db.data['dashboard-data-jobs-t-jobs'].a.customer, 'Smith & Sons');
    assert.equal(db.data['dashboard-data-jobs-t-jobs'].a._updatedBy, 'Managers');
    await waitFor(window, () => cardFor('Smith & Sons'));
    // Closing an edit without saving: the next Save adds a new card instead.
    [...cardFor('Jones').querySelectorAll('.mtw-pb-card-button')].find(b => b.textContent === 'Edit').click();
    await waitFor(window, () => !shell.hidden);
    shell.querySelector('.mtw-pb-popup-close').click();
    window.MTW_TEST_SHELL = shell;
    shell.hidden = false; // reopen as "+ Add card" would
    setControl(window, shell, 'customer', 'New Co');
    shell.querySelector('[data-name="save"] button').click();
    await waitFor(window, () => Object.keys(db.data['dashboard-data-jobs-t-jobs']).length === 3);
    assert.equal(db.data['dashboard-data-jobs-t-jobs'].b.customer, 'Jones', 'Jones untouched');
    // Delete (asks first).
    [...cardFor('Jones').querySelectorAll('.mtw-pb-card-button')].find(b => b.textContent === 'Delete').click();
    await waitFor(window, () => panel.querySelector('.mtw-pb-ask'));
    [...panel.querySelectorAll('.mtw-pb-ask button')].find(b => b.textContent === 'Yes').click();
    await waitFor(window, () => !db.data['dashboard-data-jobs-t-jobs'].b);
    dom.window.close();
  }
});

test('builder: card designer buttons, images and button steps', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  pointer(window, ui.querySelector('.mtw-pb-tile[data-block-type="cards"]'), 'pointerdown');
  pointer(window, document, 'pointerup');
  await tick(window);
  const id = editor.selected.id;
  const source = inspector.querySelector('[data-field="source"] select');
  source.value = 'added';
  source.dispatchEvent(new window.Event('change', { bubbles: true }));
  inspector.querySelector('.mtw-pb-design-cards').click();
  const logic = ui.querySelector('.mtw-pb-logic');
  const design = () => editor.page.sections.flatMap(s => s.columns.flatMap(col => col.blocks)).find(b => b.id === id).props.design;
  const tap = type => {
    pointer(window, logic.querySelector(`.mtw-pb-step-tile[data-part-type="${type}"]`), 'pointerdown');
    pointer(window, document, 'pointerup');
  };
  tap('image');
  tap('button');
  const parts = design().parts;
  assert.equal(parts[0].type, 'image', 'an image goes at the top');
  assert.equal(parts[parts.length - 1].type, 'button');
  // "Cards people add": the image comes from a new Image field, so the popup gets a web address box.
  const listProps = editor.page.sections.flatMap(s => s.columns.flatMap(col => col.blocks)).find(b => b.id === id).props;
  const imageField = editor.page.tables.find(t => t.id === listProps.table).fields.find(f => f.type === 'image');
  assert.ok(imageField, 'Image field added');
  assert.equal(parts[0].source, 'field');
  assert.equal(parts[0].field, imageField.key);
  const formInputs = editor.page.popups.find(p => p.name === listProps.formPopup).sections[0].columns[0].blocks;
  assert.ok(formInputs.some(b => b.type === 'input' && b.props.bind === `${listProps.table}.${imageField.key}`), 'popup has an image address input');
  assert.ok(logic.querySelector('.mtw-pb-design-preview .mtw-pb-card-image'), 'image placeholder in the preview');
  assert.ok([...logic.querySelectorAll('.mtw-pb-design-preview .mtw-pb-card-button')].some(b => b.textContent === 'Edit'));
  // Button set to "Run my steps": Edit steps opens the steps panel; Done comes back here.
  const buttonCard = [...logic.querySelectorAll('.mtw-pb-part')].pop();
  const preset = buttonCard.querySelector('[data-field="preset"] select');
  preset.value = 'steps';
  preset.dispatchEvent(new window.Event('change', { bubbles: true }));
  [...logic.querySelectorAll('.mtw-pb-part')].pop().querySelector('.mtw-pb-part-edit-steps').click();
  assert.match(logic.querySelector('.mtw-pb-logic-head strong').textContent, /Card button/);
  assert.ok(logic.querySelector('.mtw-pb-step-tile[data-step-type="fillFromRecord"]'), 'edit-this-record step offered');
  const partId = design().parts[design().parts.length - 1].id;
  editor.dropStep({ kind: 'newStep', type: 'message', scope: `part:${id}:${partId}` }, [], 0);
  assert.equal(design().parts.find(p => p.id === partId).actions[0].type, 'message');
  logic.querySelector('.mtw-pb-logic-done').click();
  assert.match(logic.querySelector('.mtw-pb-logic-head strong').textContent, /cards_1/, 'back in the card designer');
  // Image from a typed address instead
  const imageCard = () => [...logic.querySelectorAll('.mtw-pb-part')].find(card => card.classList.contains('mtw-pb-part-image'));
  const src = imageCard().querySelector('[data-field="source"] select');
  src.value = 'url';
  src.dispatchEvent(new window.Event('change', { bubbles: true }));
  const url = imageCard().querySelector('[data-field="url"] input');
  url.value = 'https://example.com/x.png';
  url.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(logic.querySelector('.mtw-pb-design-preview img.mtw-pb-card-image').getAttribute('src'), 'https://example.com/x.png');
  editor.close(true);
  dom.window.close();
});


test('image fields: web address input, checked on save, shown on cards', async () => {
  const page = {
    tables: [{ id: 't-st', name: 'Stock', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'photo', label: 'Photo', type: 'image' }] }],
    sections: [{ layout: '1', columns: [{ blocks: [
      { type: 'input', name: 'name', props: { label: 'Name', bind: 't-st.name' } },
      { type: 'input', name: 'photo', props: { label: 'Photo', bind: 't-st.photo' } },
      { type: 'button', name: 'save', props: { label: 'Save', actions: [{ type: 'save', table: 't-st' }] } },
      { type: 'cards', name: 'stock', props: { source: 'table', table: 't-st', titleField: 'name' } }
    ] }] }]
  };
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="photo"]'));
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  assert.equal(panel.querySelector('[data-name="photo"] input').type, 'url');
  setControl(window, panel, 'name', 'Tyre');
  setControl(window, panel, 'photo', 'not a link');
  panel.querySelector('[data-name="save"] button').click();
  await waitFor(window, () => /Photo must be a web address/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  assert.equal(db.data['dashboard-data-jobs-t-st'], undefined);
  setControl(window, panel, 'photo', 'https://example.com/tyre.jpg');
  panel.querySelector('[data-name="save"] button').click();
  await waitFor(window, () => panel.querySelector('.mtw-pb-record-card img'));
  assert.equal(panel.querySelector('.mtw-pb-record-card img').getAttribute('src'), 'https://example.com/tyre.jpg');
  dom.window.close();
});

test('Manager Tools: delete a custom item (asks first; records kept unless ticked); built-ins cannot be deleted', async () => {
  for (const alsoRecords of [false, true]) {
    const db = store({
      ...TOOLS,
      'dashboard-tool-pages': { jobs: { draft: JOBS_PAGE, published: JOBS_PAGE } },
      'dashboard-data-jobs-t-jobs': { a: { order_number: '1' }, b: { order_number: '2' } }
    });
    const { dom, window, document } = host({ db });
    await waitFor(window, () => document.querySelector('.db-list-toolcard[data-select="jobs"]') &&
      document.querySelector('.developer-tools-panel .developer-tool-row'));
    document.querySelector('.db-list-toolcard[data-select="developer-tools"]').click();
    const rows = () => [...document.querySelectorAll('.developer-tools-panel .developer-tool-row')];
    rows().find(row => !row.textContent.startsWith('Jobs')).click();
    assert.equal(document.querySelector('.developer-tool-delete'), null, 'no delete for built-in tools');
    document.querySelector('#exit-btn').click();
    rows().find(row => row.textContent.startsWith('Jobs')).click();
    document.querySelector('.developer-tool-delete').click();
    const box = document.querySelector('.developer-tool-delete-confirm');
    assert.match(box.textContent, /Delete "Jobs"\?/);
    await waitFor(window, () => /2 in 1 table/.test(box.textContent));
    // Cancel does nothing.
    box.querySelector('.developer-tool-delete-cancel').click();
    assert.ok(db.data['dashboard-tools'].jobs);
    document.querySelector('.developer-tool-delete').click();
    const again = document.querySelector('.developer-tool-delete-confirm');
    await waitFor(window, () => !again.querySelector('input[type="checkbox"]').disabled);
    if (alsoRecords) again.querySelector('input[type="checkbox"]').click();
    again.querySelector('.developer-tool-delete-yes').click();
    await waitFor(window, () => !db.data['dashboard-tools'].jobs);
    assert.equal(db.data['dashboard-tool-pages'].jobs, undefined, 'page deleted');
    assert.equal(Object.keys(db.data['dashboard-data-jobs-t-jobs']).length, alsoRecords ? 0 : 2);
    await waitFor(window, () => !document.querySelector('.db-list-toolcard[data-select="jobs"]'));
    assert.equal(document.querySelector('.custom-dashboard-tool-jobs-panel'), null);
    assert.match(document.querySelector('.developer-tools-status').textContent, /Deleted "Jobs"/);
    dom.window.close();
  }
});

test('Manage data: managers edit records like a spreadsheet from the live tool', async () => {
  const page = {
    tables: [
      { id: 't-jobs', name: 'Jobs', fields: [
        { key: 'customer', label: 'Customer', type: 'text', required: true },
        { key: 'qty', label: 'Qty', type: 'number' },
        { key: 'status', label: 'Status', type: 'choice', options: 'Open\nDone' },
        { key: 'photo', label: 'Photo', type: 'image' }] },
      { id: 't-parts', name: 'Parts', fields: [{ key: 'part', label: 'Part', type: 'text' }] }
    ],
    sections: [{ layout: '1', columns: [{ blocks: [{ type: 'heading', props: { text: 'Jobs' } }] }] }]
  };
  for (const role of ['Stores', 'Managers']) {
    const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } },
      'dashboard-data-jobs-t-jobs': { a: { customer: 'Smith', qty: 2, status: 'Open', _createdAt: 1 } } });
    const { dom, window, document } = host({ role, db });
    await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-page'));
    const button0 = document.querySelector('.custom-dashboard-tool-jobs-panel .mtw-pb-manage-data');
    if (role === 'Stores') {
      assert.equal(button0, null, 'only managers');
      dom.window.close();
      continue;
    }
    button0.click();
    await waitFor(window, () => document.querySelector('.mtw-pb-data .mtw-pb-data-grid tbody tr'));
    const ui = document.querySelector('.mtw-pb-data');
    assert.deepEqual([...ui.querySelectorAll('.mtw-pb-data-tab')].map(t => t.textContent), ['Jobs', 'Parts']);
    assert.deepEqual([...ui.querySelectorAll('.mtw-pb-data-grid th')].slice(0, 3).map(th => th.textContent), ['Customer *', 'Qty', 'Status']);
    const cells = ui.querySelectorAll('tbody tr')[0].querySelectorAll('.mtw-pb-data-cell');
    assert.equal(cells[0].value, 'Smith');
    assert.equal(cells[2].tagName, 'SELECT');
    // Edit a cell: saved when leaving it.
    cells[0].focus();
    cells[0].value = 'Smith & Sons';
    cells[0].dispatchEvent(new window.Event('blur'));
    await waitFor(window, () => db.data['dashboard-data-jobs-t-jobs'].a.customer === 'Smith & Sons');
    await waitFor(window, () => /Saved Customer/.test(ui.querySelector('.mtw-pb-data-status').textContent));
    assert.equal(db.data['dashboard-data-jobs-t-jobs'].a._updatedBy, 'Managers');
    // Bad image address: not saved, shown as an error.
    const photo = ui.querySelectorAll('tbody tr')[0].querySelectorAll('.mtw-pb-data-cell')[3];
    photo.value = 'not a link';
    photo.dispatchEvent(new window.Event('blur'));
    await waitFor(window, () => /Photo must be a web address/.test(ui.querySelector('.mtw-pb-data-status').textContent));
    assert.equal(db.data['dashboard-data-jobs-t-jobs'].a.photo, undefined);
    // Numbers save as numbers.
    const qty = ui.querySelectorAll('tbody tr')[0].querySelectorAll('.mtw-pb-data-cell')[1];
    qty.value = '5';
    qty.dispatchEvent(new window.Event('blur'));
    await waitFor(window, () => db.data['dashboard-data-jobs-t-jobs'].a.qty === 5);
    // Dropdown saves on change.
    const status = ui.querySelectorAll('tbody tr')[0].querySelectorAll('.mtw-pb-data-cell')[2];
    status.value = 'Done';
    status.dispatchEvent(new window.Event('change'));
    await waitFor(window, () => db.data['dashboard-data-jobs-t-jobs'].a.status === 'Done');
    // + Add row, then delete it (asks first).
    ui.querySelector('.mtw-pb-data-add').click();
    await waitFor(window, () => ui.querySelectorAll('tbody tr').length === 2);
    assert.equal(Object.keys(db.data['dashboard-data-jobs-t-jobs']).length, 2);
    ui.querySelectorAll('tbody tr')[0].querySelector('.mtw-pb-records-delete').click();
    await waitFor(window, () => ui.querySelector('.mtw-pb-ask'));
    [...ui.querySelectorAll('.mtw-pb-ask button')].find(b => b.textContent === 'Yes').click();
    await waitFor(window, () => Object.keys(db.data['dashboard-data-jobs-t-jobs']).length === 1);
    // Other table's tab.
    ui.querySelectorAll('.mtw-pb-data-tab')[1].click();
    await waitFor(window, () => /No records yet/.test(ui.querySelector('.mtw-pb-data-footer').textContent));
    ui.querySelector('.mtw-pb-data-add').click();
    await waitFor(window, () => db.data['dashboard-data-jobs-t-parts'] && Object.keys(db.data['dashboard-data-jobs-t-parts']).length === 1);
    ui.querySelector('.mtw-pb-data-close').click();
    assert.equal(document.querySelector('.mtw-pb-data'), null);
    dom.window.close();
  }
});

test('builder: Open records on a data table opens Manage data on that table', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { draft: JOBS_PAGE } },
    'dashboard-data-jobs-t-jobs': { a: { order_number: '77', status: 'Urgent', _createdAt: 1 } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  editor.select({ kind: 'table', id: 't-jobs' });
  editor.element.querySelector('.mtw-pb-open-records').click();
  await waitFor(window, () => document.querySelector('.mtw-pb-data .mtw-pb-data-grid tbody tr'));
  assert.equal(document.querySelector('.mtw-pb-data .mtw-pb-data-cell').value, '77');
  document.querySelector('.mtw-pb-data-close').click();
  editor.close(true);
  dom.window.close();
});

test('notices, number tiles, headings, text, cards and images can run steps when clicked', async () => {
  const page = { sections: [{ layout: '1-1', columns: [
    { blocks: [
      { type: 'notice', name: 'alert', props: { title: 'Heads up', text: 'Click me', actions: [{ type: 'setText', target: 'tile', value: '99' }] } },
      { type: 'heading', name: 'plain', props: { text: 'No steps' } }
    ] },
    { blocks: [
      { type: 'stat', name: 'tile', props: { label: 'Count', value: '1', actions: [{ type: 'message', text: 'Tile is {tile}' }] } },
      { type: 'list', name: 'todo', props: { items: 'One\nTwo', actions: [{ type: 'message', text: 'List clicked' }] } },
      { type: 'table', name: 'grid', props: { actions: [{ type: 'hide', target: 'todo' }] } }
    ] }
  ] }] };
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="alert"]'));
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  const alert = panel.querySelector('[data-name="alert"]');
  assert.ok(alert.classList.contains('is-clickable'));
  assert.equal(alert.getAttribute('role'), 'button');
  assert.equal(panel.querySelector('[data-name="plain"]').classList.contains('is-clickable'), false, 'no steps, not clickable');
  alert.click();
  await waitFor(window, () => panel.querySelector('[data-name="tile"] .mtw-pb-stat-value').textContent === '99');
  panel.querySelector('[data-name="tile"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(window, () => /Tile is 99/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  panel.querySelector('[data-name="todo"]').click();
  await waitFor(window, () => /List clicked/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  panel.querySelector('[data-name="grid"]').click();
  await waitFor(window, () => panel.querySelector('[data-name="todo"]').style.display === 'none');
  dom.window.close();
});

test('every block type has a steps list in the builder', async () => {
  const db = store(TOOLS);
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  for (const tile of [...ui.querySelectorAll('.mtw-pb-tile[data-block-type]')]) {
    editor.select(null);
    pointer(window, tile, 'pointerdown');
    pointer(window, document, 'pointerup');
    await tick(window);
    assert.ok(ui.querySelector('.mtw-pb-inspector .mtw-pb-edit-steps'), `${tile.dataset.blockType} has steps`);
  }
  editor.close(true);
  dom.window.close();
});

test('automations: table changes, popup open/close, every N seconds, typing', async () => {
  const page = {
    tables: [{ id: 't-jobs', name: 'Jobs', fields: [{ key: 'customer', label: 'Customer', type: 'text' }] }],
    automations: [
      { when: 'tableChange', table: 't-jobs', change: 'added', steps: [{ type: 'message', text: 'New job for {record.customer}' }] },
      { when: 'tableChange', table: 't-jobs', change: 'deleted', steps: [{ type: 'setText', target: 'last', value: 'Removed {record.customer}' }] },
      { when: 'popupOpen', popup: 'box', steps: [{ type: 'setText', target: 'state', value: 'open' }] },
      { when: 'popupClose', popup: 'box', steps: [{ type: 'setText', target: 'state', value: 'closed' }] },
      { when: 'interval', seconds: 7, steps: [{ type: 'setText', target: 'tick', value: 'ticked' }] }
    ],
    sections: [{ layout: '1', columns: [{ blocks: [
      { type: 'heading', name: 'state', props: { text: 'idle' } },
      { type: 'heading', name: 'last', props: { text: '' } },
      { type: 'heading', name: 'tick', props: { text: '' } },
      { type: 'button', name: 'open', props: { label: 'Open', popup: 'box' } },
      { type: 'input', name: 'q', props: { label: 'Search', trigger: 'typing', actions: [{ type: 'setText', target: 'echo', value: 'You typed {q}' }] } },
      { type: 'heading', name: 'echo', props: { text: '' } }
    ] }] }],
    popups: [{ name: 'box', title: 'Box', sections: [{ layout: '1', columns: [{ blocks: [{ type: 'text', props: { text: 'Hi' } }] }] }] }]
  };
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } },
    'dashboard-data-jobs-t-jobs': { old: { customer: 'Existing', _createdAt: 1 } } });
  const { dom, window, document } = host({ db });
  const intervals = [];
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return realSetInterval(() => {}, 1e9); };
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="state"]'));
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  const text = name => panel.querySelector(`[data-name="${name}"]`).textContent;
  await tick(window);
  // Records that were already there don't count as "added".
  assert.doesNotMatch(panel.querySelector('.mtw-pb-toasts').textContent, /Existing/);
  // Someone adds a record (e.g. from another screen): the automation runs with it.
  await window.MTW.addDoc(window.MTW.collection(window.MTW.db, 'dashboard-data-jobs-t-jobs'), { customer: 'Smith', _createdAt: 2 });
  await waitFor(window, () => /New job for Smith/.test(panel.querySelector('.mtw-pb-toasts').textContent));
  await window.MTW.deleteDoc(window.MTW.doc(window.MTW.db, 'dashboard-data-jobs-t-jobs', 'old'));
  await waitFor(window, () => text('last') === 'Removed Existing');
  // Popup open / close.
  panel.querySelector('[data-name="open"] button').click();
  await waitFor(window, () => text('state') === 'open');
  panel.querySelector('.mtw-pb-popup[data-popup="box"] .mtw-pb-popup-close').click();
  await waitFor(window, () => text('state') === 'closed');
  // Every 7 seconds (the timer is captured; run it once).
  const timer = intervals.find(item => item.ms === 7000);
  assert.ok(timer, 'interval set for 7 seconds');
  timer.fn();
  await waitFor(window, () => text('tick') === 'ticked');
  // Typing trigger: runs after a short pause, without leaving the box.
  const q = panel.querySelector('[data-name="q"] .mtw-pb-control');
  q.value = 'tyres';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(window, () => text('echo') === 'You typed tyres');
  dom.window.close();
});

test('editable fields: dropdowns in records lists and on cards save in place; managers-only respected', async () => {
  const page = {
    tables: [{ id: 't-jobs', name: 'Jobs', fields: [
      { key: 'customer', label: 'Customer', type: 'text' }, { key: 'status', label: 'Status', type: 'choice', options: 'Open\nDone' }] }],
    sections: [{ layout: '1', columns: [{ blocks: [
      { type: 'records', name: 'list', props: { table: 't-jobs', editable: ['status'], editBy: 'everyone', search: 'no' } },
      { type: 'cards', name: 'cards', props: { source: 'table', table: 't-jobs', editBy: 'managers',
        design: { parts: [{ type: 'field', field: 'customer' }, { type: 'field', field: 'status', editable: 'yes' }], style: {} } } }
    ] }] }]
  };
  for (const role of ['Stores', 'Managers']) {
    const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } },
      'dashboard-data-jobs-t-jobs': { a: { customer: 'Smith', status: 'Open', _createdAt: 1 } } });
    const { dom, window, document } = host({ role, db });
    await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="list"] tbody tr'));
    const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
    const rowSelect = panel.querySelector('[data-name="list"] tbody select.mtw-pb-inline-edit');
    assert.ok(rowSelect, 'status is a dropdown in the list');
    assert.deepEqual([...rowSelect.options].map(o => o.value), ['', 'Open', 'Done']);
    const cardSelect = panel.querySelector('[data-name="cards"] select.mtw-pb-inline-edit');
    assert.equal(Boolean(cardSelect), role === 'Managers', 'card field editable by managers only');
    rowSelect.value = 'Done';
    rowSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitFor(window, () => db.data['dashboard-data-jobs-t-jobs'].a.status === 'Done');
    assert.equal(db.data['dashboard-data-jobs-t-jobs'].a._updatedBy, role);
    if (role === 'Managers') {
      await waitFor(window, () => panel.querySelector('[data-name="cards"] select.mtw-pb-inline-edit').value === 'Done');
      const sel = panel.querySelector('[data-name="cards"] select.mtw-pb-inline-edit');
      sel.value = 'Open';
      sel.dispatchEvent(new window.Event('change', { bubbles: true }));
      await waitFor(window, () => db.data['dashboard-data-jobs-t-jobs'].a.status === 'Open');
    } else {
      assert.match(panel.querySelector('[data-name="cards"]').textContent, /Open|Done/);
    }
    dom.window.close();
  }
});

test('builder: add automations and popup open/close steps', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { draft: BOARD_PAGE } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  editor.select(null);
  const add = inspector.querySelector('.mtw-pb-add-automation');
  add.value = 'tableChange';
  add.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(editor.page.automations[0].when, 'tableChange');
  assert.equal(editor.page.automations[0].table, 't-jobs', 'defaults to the first table');
  assert.match(inspector.querySelector('.mtw-pb-automation strong').textContent, /When Jobs gets a new record/);
  const autoId = editor.page.automations[0].id;
  inspector.querySelector('.mtw-pb-automation .mtw-pb-edit-steps').click();
  const logic = ui.querySelector('.mtw-pb-logic');
  assert.match(logic.querySelector('.mtw-pb-logic-trigger').textContent, /When Jobs gets a new record/);
  editor.dropStep({ kind: 'newStep', type: 'message', scope: `auto:${autoId}` }, [], 0);
  assert.equal(editor.page.automations[0].steps[0].type, 'message');
  assert.ok([...logic.querySelectorAll('.mtw-pb-token option')].some(o => o.value === '{record.customer}'), 'the changed record is offered');
  editor.closeSteps();
  // Popup inspector: steps when it opens.
  ui.querySelector('.mtw-pb-tab[data-tab="popups"]').click();
  ui.querySelector('.mtw-pb-popup-item').click();
  inspector.querySelector('.mtw-pb-popup-open-steps').click();
  assert.equal(editor.page.automations[1].when, 'popupOpen');
  assert.equal(logic.hidden, false);
  editor.close(true);
  dom.window.close();
});

const QUEUE_PAGE = {
  tables: [{ id: 't-q', name: 'Queue', fields: [
    { key: 'customer', label: 'Customer', type: 'text', required: true },
    { key: 'status', label: 'Status', type: 'choice', options: 'Waiting\nServed' },
    { key: 'note', label: 'Note', type: 'text' }] }],
  sections: [{ layout: '1', columns: [{ blocks: [
    { type: 'table', name: 'queue', props: { source: 'table', table: 't-q', show: ['customer', 'status'], editable: ['status'],
      addRows: 'everyone', addFields: ['status'], timerField: 'status', timerLabel: 'Waiting for',
      colorRules: [
        { field: 'status', op: 'equals', value: 'Waiting', minutes: 30, background: '#ff0000', target: 'row' },
        { field: 'status', op: 'equals', value: 'Served', color: '#00aa00', target: 'cell' }] } },
    { type: 'table', name: 'typed', props: { colorRules: [{ field: 'k-role', op: 'equals', value: 'Stores', background: '#ffee00' }] } },
    { type: 'stat', name: 'clock', props: { label: 'Open for', source: 'timer', timerKind: 'stopwatch', timerAuto: 'no',
      colorRules: [{ op: 'greater', value: '-1', background: '#123456' }] } },
    { type: 'stat', name: 'due', props: { label: 'Due', source: 'timer', timerKind: 'until', timerAt: '2000-01-01 00:00', doneText: 'Overdue' } },
    { type: 'button', name: 'go', props: { label: 'Go', actions: [{ type: 'startTimer', target: 'clock' }] } },
    { type: 'cards', name: 'cards', props: { source: 'table', table: 't-q', colorRules: [{ field: 'status', op: 'equals', value: 'Served', background: '#00ff00' }],
      design: { parts: [{ type: 'field', field: 'customer' }, { type: 'timer', field: 'status', text: 'Waiting' }], style: {} } } }
  ] }] }],
  automations: [{ when: 'recordTimer', table: 't-q', field: 'status', op: 'equals', value: 'Waiting', minutes: 1,
    steps: [{ type: 'message', text: '{record.customer} has waited', tone: 'warning' }] }]
};

test('tables from a data table: add rows, timer column, colour rules; timer tiles; timer cards', async () => {
  const old = Date.now() - 45 * 60000;
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: QUEUE_PAGE } },
    'dashboard-data-jobs-t-q': {
      a: { customer: 'Ann', status: 'Waiting', _createdAt: old, _since_status: old },
      b: { customer: 'Bob', status: 'Served', _createdAt: old + 1 } } });
  const { dom, window, document } = host({ role: 'Stores', db });
  await waitFor(window, () => document.querySelectorAll('.custom-dashboard-tool-jobs-panel [data-name="queue"] tbody tr').length === 2);
  const panel = document.querySelector('.custom-dashboard-tool-jobs-panel');
  const queue = panel.querySelector('[data-name="queue"]');
  assert.deepEqual([...queue.querySelectorAll('thead th')].map(th => th.textContent).slice(0, 3), ['Customer', 'Status', 'Waiting for']);
  const rows = [...queue.querySelectorAll('tbody tr')];
  const ann = rows.find(tr => tr.textContent.includes('Ann'));
  const bob = rows.find(tr => tr.textContent.includes('Bob'));
  assert.equal(ann.style.background, 'rgb(255, 0, 0)', 'waiting 30+ minutes is red');
  assert.match(ann.querySelector('.mtw-pb-records-timer').textContent, /^45m/);
  assert.equal(bob.style.color, '', 'cell rule leaves the row alone');
  assert.equal(bob.children[1].style.color, 'rgb(0, 170, 0)', 'only the status cell is green');
  // typed table colours its rows by column
  assert.equal(panel.querySelector('[data-name="typed"] tbody tr').style.background, 'rgb(255, 238, 0)');
  // cards: colour + ticking timer part
  const bobCard = [...panel.querySelectorAll('[data-name="cards"] .mtw-pb-record-card')].find(card => card.textContent.includes('Bob'));
  assert.equal(bobCard.style.background, 'rgb(0, 255, 0)');
  assert.match(panel.querySelector('[data-name="cards"] .mtw-pb-card-timer').textContent, /^Waiting \d/);
  // countdown in the past shows its done text; stopwatch waits for its Start step
  assert.equal(panel.querySelector('[data-name="due"] .mtw-pb-stat-value').textContent, 'Overdue');
  assert.equal(panel.querySelector('[data-name="clock"] .mtw-pb-stat-value').textContent, '0s');
  assert.equal(panel.querySelector('[data-name="clock"]').style.background, 'rgb(18, 52, 86)');
  panel.querySelector('[data-name="go"] button').click();
  await waitFor(window, () => panel.querySelector('[data-name="clock"] .mtw-pb-stat-value').textContent === '1s', 3000);
  // + Add row: only the picked fields plus required ones
  queue.querySelector('.mtw-pb-add-row-open').click();
  const form = queue.querySelector('.mtw-pb-add-row');
  assert.equal(form.hidden, false);
  assert.deepEqual([...form.querySelectorAll('[data-field]')].map(c => c.dataset.field), ['customer', 'status']);
  form.querySelector('[data-field="status"]').value = 'Waiting';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(window, () => /Customer/.test(form.querySelector('.mtw-pb-add-row-error').textContent));
  form.querySelector('[data-field="customer"]').value = 'Cat';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(window, () => Object.values(db.data['dashboard-data-jobs-t-q']).some(r => r.customer === 'Cat'));
  const cat = Object.values(db.data['dashboard-data-jobs-t-q']).find(r => r.customer === 'Cat');
  assert.equal(cat.status, 'Waiting');
  assert.equal(cat._createdBy, 'Stores');
  assert.ok(cat._since_status > 0, 'remembers when status was set');
  await waitFor(window, () => queue.querySelectorAll('tbody tr').length === 3);
  assert.equal(form.hidden, true);
  // changing the status in place restarts its timer
  const annSelect = [...queue.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Ann')).querySelector('select');
  annSelect.value = 'Served';
  annSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await waitFor(window, () => db.data['dashboard-data-jobs-t-q'].a.status === 'Served');
  assert.ok(db.data['dashboard-data-jobs-t-q'].a._since_status > old);
  dom.window.close();
});

test('add rows: managers-only hides the button from others; runtime timers, parseWhen and record timers', async () => {
  const page = JSON.parse(JSON.stringify(QUEUE_PAGE));
  page.sections[0].columns[0].blocks[0].props.addRows = 'managers';
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { published: page } }, 'dashboard-data-jobs-t-q': {} });
  const { dom, window, document } = host({ role: 'Stores', db });
  await waitFor(window, () => document.querySelector('.custom-dashboard-tool-jobs-panel [data-name="queue"] .mtw-pb-records-status'));
  assert.equal(document.querySelector('[data-name="queue"] .mtw-pb-add-row-open'), null);
  const lib = window.MTW_PAGE_RUNTIME;
  const at = lib.parseWhen('2026-12-24 17:30');
  assert.equal(new window.Date(at).getHours(), 17);
  assert.ok(Number.isNaN(lib.parseWhen('soon')));
  assert.equal(lib.colorFor([{ field: 'x', op: 'equals', value: 'a', minutes: 5, background: '#fff' }], { x: 'a', _since_x: Date.now() }), null, 'not long enough yet');
  // record timer automation: fires once when a record crosses the time while open
  const msgs = [];
  const rt = lib.create({ page: QUEUE_PAGE, toolId: 'jobs', api: window.MTW, user: 'Stores', ui: { toast: text => msgs.push(text) } });
  rt.start();
  await waitFor(window, () => rt.table('t-q').loaded);
  const entry = rt.table('t-q');
  entry.rows = [{ _id: 'z', customer: 'Zed', status: 'Waiting', _since_status: Date.now() - 30000 }];
  entry.listeners.forEach(fn => fn(entry));
  entry.rows = [{ _id: 'z', customer: 'Zed', status: 'Waiting', _since_status: Date.now() - 61000 }];
  entry.listeners.forEach(fn => fn(entry));
  await waitFor(window, () => msgs.length === 1);
  entry.listeners.forEach(fn => fn(entry));
  await tick(window);
  assert.deepEqual(msgs, ['Zed has waited'], 'only once per record');
  assert.equal(rt.value('clock'), 0, 'timer tiles give minutes to steps');
  rt.dispose();
  dom.window.close();
});

test('builder: Table block can use a data table; colour rules, timer tiles and new automations in the inspector', async () => {
  const db = store({ ...TOOLS, 'dashboard-tool-pages': { jobs: { draft: QUEUE_PAGE } } });
  const { dom, window, document } = host({ db });
  await waitFor(window, () => typeof window.MTW_OPEN_PAGE_BUILDER === 'function');
  const editor = await window.MTW_OPEN_PAGE_BUILDER('jobs');
  await editor.loaded;
  const ui = editor.element;
  const inspector = ui.querySelector('.mtw-pb-inspector');
  const typedId = editor.page.sections[0].columns[0].blocks[1].id;
  editor.select({ kind: 'block', id: typedId });
  const source = inspector.querySelector('[data-field="source"] select');
  assert.equal(source.value, 'typed');
  assert.equal(inspector.querySelector('[data-field="table"]'), null);
  source.value = 'table';
  source.dispatchEvent(new window.Event('change', { bubbles: true }));
  const pick = inspector.querySelector('[data-field="table"] select');
  assert.ok(pick, 'a data table picker appears');
  pick.value = 't-q';
  pick.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(editor.page.sections[0].columns[0].blocks[1].props.table, 't-q');
  assert.ok(inspector.querySelector('[data-field="addRows"]'), 'add rows option');
  assert.ok(inspector.querySelector('[data-field="timerField"]'), 'timer column option');
  // colour rules: the old typed-column rule is still there; add one on a data field
  inspector.querySelector('.mtw-pb-add-colour-rule').click();
  const rules = editor.page.sections[0].columns[0].blocks[1].props.colorRules;
  assert.equal(rules.length, 2);
  assert.equal(rules[1].field, 'customer');
  assert.ok(inspector.querySelector(`[data-rule-id="${rules[1].id}"] [data-field="minutes"]`), 'data tables get "for at least N minutes"');
  // automations offer the new triggers
  editor.select(null);
  const add = inspector.querySelector('.mtw-pb-add-automation');
  add.value = 'timerDone';
  add.dispatchEvent(new window.Event('change', { bubbles: true }));
  const auto = editor.page.automations.find(a => a.when === 'timerDone');
  assert.equal(auto.target, 'due', 'defaults to the first countdown');
  assert.match(inspector.textContent, /When due ends/);
  editor.close(true);
  dom.window.close();
});
