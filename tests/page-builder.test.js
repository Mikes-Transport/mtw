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

// Minimal Firestore stand-in: docs by collection, getDoc/setDoc/onSnapshot on docs.
function store(initial) {
  const data = JSON.parse(JSON.stringify(initial || {}));
  const listeners = [];
  const snap = ref => {
    const value = (data[ref.collection] || {})[ref.id];
    return { id: ref.id, exists: () => value !== undefined, data: () => JSON.parse(JSON.stringify(value)) };
  };
  return {
    data,
    writes: [],
    api(window) {
      const self = this;
      return {
        db: {},
        collection: (db, name) => ({ name }),
        getDocs: async ref => {
          const rows = Object.entries(data[ref.name] || {});
          return { forEach(fn) { rows.forEach(([id, value]) => fn({ id, data: () => value })); } };
        },
        doc: (db, collection, id) => ({ collection, id }),
        getDoc: async ref => snap(ref),
        setDoc: async (ref, value) => {
          (data[ref.collection] = data[ref.collection] || {})[ref.id] = JSON.parse(JSON.stringify(value));
          self.writes.push({ ref, value });
          listeners.filter(l => l.ref.collection === ref.collection && l.ref.id === ref.id)
            .forEach(l => window.setTimeout(() => l.fn(snap(ref)), 0));
        },
        updateDoc: async () => {},
        onSnapshot: (ref, fn) => {
          const entry = { ref, fn };
          listeners.push(entry);
          window.setTimeout(() => fn(snap(ref)), 0);
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
