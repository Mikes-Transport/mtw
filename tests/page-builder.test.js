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
        updateDoc: async () => {},
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
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      let ok = false;
      try { ok = predicate(); } catch (error) { ok = false; }
      if (ok) return resolve();
      if (Date.now() - started > timeout) return reject(new Error('timed out'));
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
