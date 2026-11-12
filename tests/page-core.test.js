'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../apps/dashboard/js/builder/page-core.js');

function ids(page) {
  return page.sections.map(section => section.columns.map(column => column.blocks.map(block => block.props.text || block.type)));
}

test('insert creates a section when there is no column, and keeps the input unchanged', () => {
  const empty = core.createPage();
  const { page, id } = core.insertBlock(empty, 'heading');
  assert.equal(empty.sections.length, 0);
  assert.equal(page.sections.length, 1);
  assert.equal(page.sections[0].layout, '1');
  assert.equal(page.sections[0].columns[0].blocks[0].id, id);
  assert.equal(page.sections[0].columns[0].blocks[0].props.text, 'New heading');
});

test('blocks insert at an index and move within and between columns', () => {
  let { page } = core.addSection(core.createPage(), '1-1');
  const [left, right] = page.sections[0].columns.map(column => column.id);
  ({ page } = core.insertBlock(page, 'text', left, 0, { text: 'A' }));
  ({ page } = core.insertBlock(page, 'text', left, 1, { text: 'B' }));
  ({ page } = core.insertBlock(page, 'text', left, 1, { text: 'C' }));
  assert.deepEqual(ids(page), [[['A', 'C', 'B'], []]]);

  const a = page.sections[0].columns[0].blocks[0].id;
  // Drop A below B (index 3 in the column as it looks before the move).
  page = core.moveBlock(page, a, left, 3);
  assert.deepEqual(ids(page), [[['C', 'B', 'A'], []]]);
  // Into the other column.
  page = core.moveBlock(page, a, right, 0);
  assert.deepEqual(ids(page), [[['C', 'B'], ['A']]]);
  // Step up/down.
  const b = page.sections[0].columns[0].blocks[1].id;
  page = core.stepBlock(page, b, -1);
  assert.deepEqual(ids(page), [[['B', 'C'], ['A']]]);
  page = core.stepBlock(page, b, 1);
  assert.deepEqual(ids(page), [[['C', 'B'], ['A']]]);
  assert.strictEqual(core.stepBlock(page, b, 1), page, 'cannot step past the end');
});

test('duplicate, update and remove blocks', () => {
  let { page, id } = core.insertBlock(core.createPage(), 'button');
  let copy;
  ({ page, id: copy } = core.duplicateBlock(page, id));
  assert.notEqual(copy, id);
  assert.equal(page.sections[0].columns[0].blocks.length, 2);
  page = core.updateBlock(page, copy, { props: { label: 'Go', url: 'javascript:alert(1)' }, style: { color: 'red; x', align: 'center' } });
  const block = core.findBlock(page, copy).block;
  assert.equal(block.props.label, 'Go');
  assert.equal(block.props.url, '', 'unsafe URL dropped');
  assert.deepEqual(block.style, { align: 'center' }, 'bad colour dropped');
  page = core.removeBlock(page, id);
  assert.equal(page.sections[0].columns[0].blocks.length, 1);
});

test('sections: add, move, duplicate (fresh ids), remove, change columns without losing blocks', () => {
  let page = core.createPage();
  let one;
  let two;
  ({ page, id: one } = core.addSection(page, '1-1-1'));
  ({ page, id: two } = core.addSection(page, '1'));
  const cols = page.sections[0].columns.map(column => column.id);
  ({ page } = core.insertBlock(page, 'text', cols[0], 0, { text: 'L' }));
  ({ page } = core.insertBlock(page, 'text', cols[1], 0, { text: 'M' }));
  ({ page } = core.insertBlock(page, 'text', cols[2], 0, { text: 'R' }));

  page = core.updateSection(page, one, { layout: '1', style: { gap: 300, background: '#fff' } });
  assert.deepEqual(ids(page)[0], [['L', 'M', 'R']], 'blocks from removed columns are kept');
  assert.equal(page.sections[0].style.gap, 120, 'gap clamped');
  page = core.updateSection(page, one, { layout: '1-1' });
  assert.equal(page.sections[0].columns.length, 2);

  page = core.moveSection(page, two, 0);
  assert.equal(page.sections[0].id, two);
  let copy;
  ({ page, id: copy } = core.duplicateSection(page, one));
  const original = core.findSection(page, one).section;
  const duplicate = core.findSection(page, copy).section;
  assert.notEqual(duplicate.columns[0].id, original.columns[0].id);
  assert.notEqual(duplicate.columns[0].blocks[0].id, original.columns[0].blocks[0].id);
  assert.deepEqual(ids({ sections: [duplicate] }), ids({ sections: [original] }));
  page = core.removeSection(page, two);
  assert.equal(page.sections.length, 2);
});

test('sanitizePage drops unknown blocks, bad values and duplicate ids', () => {
  const page = core.sanitizePage({
    sections: [
      {
        id: 's-abc', layout: '9-9', style: { background: 'url(evil)', padding: '20', className: 'card x"><script' },
        columns: [{
          id: 'c-abc',
          blocks: [
            { id: 'b-one', type: 'heading', props: { text: 'Hi', level: 'h9' }, style: { fontSize: 1000, color: 'var(--mtw-ink)' } },
            { id: 'b-one', type: 'image', props: { src: 'data:image/png;base64,xx', height: '50' } },
            { id: 'b-two', type: 'script', props: {} },
            { id: 'b-three', type: 'embed', props: { url: 'http://example.com' } },
            { id: 'b-four', type: 'button', props: { action: 'tool', tool: 'barcodes', url: '/products' } }
          ]
        }, { id: 'c-extra', blocks: [{ type: 'text' }] }]
      },
      'nonsense'
    ]
  });
  assert.equal(page.sections.length, 1);
  const section = page.sections[0];
  assert.equal(section.layout, '1');
  assert.equal(section.columns.length, 1, 'extra columns ignored for a one-column layout');
  assert.deepEqual(section.style, { padding: 20, className: 'card' });
  const blocks = section.columns[0].blocks;
  assert.deepEqual(blocks.map(block => block.type), ['heading', 'image', 'embed', 'button']);
  assert.equal(blocks[0].props.level, 'h2');
  assert.deepEqual(blocks[0].style, { fontSize: 96, color: 'var(--mtw-ink)' });
  assert.notEqual(blocks[1].id, 'b-one', 'duplicate id replaced');
  assert.equal(blocks[1].props.src, '');
  assert.equal(blocks[1].props.height, 50);
  assert.equal(blocks[2].props.url, '', 'embeds need https');
  assert.equal(blocks[3].props.tool, 'barcodes');
  assert.equal(blocks[3].props.url, '/products');
  assert.equal(core.sanitizePage(null).sections.length, 0);
});

test('undo and redo', () => {
  const history = core.createHistory(core.createPage());
  const first = history.push(core.insertBlock(history.page, 'text').page);
  history.push(core.insertBlock(history.page, 'heading').page);
  assert.equal(history.page.sections.length, 2);
  history.undo();
  assert.strictEqual(history.page, first);
  assert.ok(history.canRedo);
  history.redo();
  assert.equal(history.page.sections.length, 2);
  history.undo();
  history.push(core.insertBlock(history.page, 'divider').page);
  assert.equal(history.canRedo, false, 'a new edit clears redo');
});

test('table and list helpers', () => {
  assert.deepEqual(core.tableRows('a | b\n\n c|d|e '), [['a', 'b'], ['c', 'd', 'e']]);
  assert.deepEqual(core.listItems(' one\n\ntwo '), ['one', 'two']);
  assert.equal(core.safeUrl('//evil.com'), '');
  assert.equal(core.safeUrl('/admin'), '/admin');
  assert.equal(core.safeUrl('https://mtw.co.nz/x?y=1'), 'https://mtw.co.nz/x?y=1');
});
