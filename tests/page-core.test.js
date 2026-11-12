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
  page = core.updateBlock(page, copy, { props: { label: 'Go', actions: [{ type: 'openUrl', url: 'javascript:alert(1)' }] }, style: { color: 'red; x', align: 'center' } });
  const block = core.findBlock(page, copy).block;
  assert.equal(block.props.label, 'Go');
  assert.equal(block.props.actions[0].url, '', 'unsafe URL dropped');
  assert.notEqual(block.name, core.findBlock(page, id).block.name, 'copies get their own element name');
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
            { id: 'b-four', type: 'button', props: { action: 'link', url: '/products', newTab: 'yes' } }
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
  assert.deepEqual(blocks[3].props.actions.map(step => [step.type, step.url, step.newTab]), [['openUrl', '/products', 'yes']], 'old buttons become steps');
  assert.deepEqual(blocks.map(block => block.name), ['heading_1', 'image_1', 'embed_1', 'button_1']);
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

test('tables: structured columns and rows; older pipe text converts', () => {
  let { page, id } = core.insertBlock(core.createPage(), 'table');
  let props = core.findBlock(page, id).block.props;
  assert.deepEqual(props.columns.map(col => col.label), ['Name', 'Role', 'Phone']);
  props = core.grid.addColumn(props, 'Email');
  const email = props.columns[3].id;
  props = core.grid.addRow(props);
  const row = props.rows[1].id;
  props = core.grid.setCell(props, row, email, 'jo@mtw.co.nz');
  props = core.grid.setHeading(props, email, 'E-mail');
  props = core.grid.moveColumn(props, email, 0);
  props = core.grid.moveRow(props, row, 0);
  page = core.updateBlock(page, id, { props });
  let saved = core.findBlock(core.sanitizePage(page), id).block.props;
  assert.deepEqual(saved.columns.map(col => col.label), ['E-mail', 'Name', 'Role', 'Phone']);
  assert.equal(saved.rows[0].cells[email], 'jo@mtw.co.nz');
  assert.equal(saved.rows[1].cells[email], '', 'every row gets the new column');
  props = core.grid.removeColumn(saved, email);
  assert.equal(props.rows[0].cells[email], undefined);
  assert.equal(core.grid.removeRow(props, row).rows.length, 1);

  const legacy = core.sanitizePage({ sections: [{ columns: [{ blocks: [{ type: 'table', props: { rows: 'Name | Role\nSam | Stores\nJo | Counter', header: 'yes' } }] }] }] });
  const t = legacy.sections[0].columns[0].blocks[0].props;
  assert.deepEqual(t.columns.map(col => col.label), ['Name', 'Role']);
  assert.deepEqual(t.rows.map(r => t.columns.map(col => r.cells[col.id])), [['Sam', 'Stores'], ['Jo', 'Counter']]);
});

test('data tables and fields keep stable keys', () => {
  let { page, id } = core.addTable(core.createPage(), 'Vehicle checks');
  let key;
  ({ page, key } = core.addField(page, id, 'Rego number', 'text'));
  assert.equal(key, 'rego_number');
  ({ page, key: key } = core.addField(page, id, 'Rego number', 'number'));
  assert.equal(key, 'rego_number_2');
  page = core.updateField(page, id, 'rego_number', { label: 'Rego', required: true, type: 'choice', options: 'A\nB' });
  const field = core.findTable(page, id).fields.find(f => f.key === 'rego_number');
  assert.deepEqual({ ...field }, { key: 'rego_number', label: 'Rego', type: 'choice', required: true, options: 'A\nB' });
  page = core.moveField(page, id, 'rego_number', 0);
  assert.equal(core.findTable(page, id).fields[0].key, 'rego_number');
  page = core.removeField(page, id, 'rego_number_2');
  assert.equal(core.sanitizePage(page).tables[0].fields.length, 3);
  assert.equal(core.dataCollection('jobs', id), `dashboard-data-jobs-${id}`);
  assert.equal(core.removeTable(page, id).tables.length, 0);
});

test('element names: automatic, unique, renameable', () => {
  let page = core.createPage();
  let a;
  let b;
  ({ page, id: a } = core.insertBlock(page, 'input'));
  ({ page, id: b } = core.insertBlock(page, 'input', page.sections[0].columns[0].id));
  assert.deepEqual(core.pageElements(page).map(e => e.name), ['input_1', 'input_2']);
  let r = core.renameBlock(page, a, 'order_number');
  assert.equal(r.error, null);
  page = r.page;
  assert.match(core.renameBlock(page, b, 'order_number').error, /already called/);
  assert.match(core.renameBlock(page, b, '9 bad name').error, /letter/);
  const dup = core.sanitizePage({ sections: [{ columns: [{ blocks: [{ type: 'text', name: 'x' }, { type: 'text', name: 'x' }] }] }] });
  assert.deepEqual(dup.sections[0].columns[0].blocks.map(block => block.name), ['x', 'text_1']);
});

test('step lists: add, nest in If branches, move between lists, update, remove', () => {
  let list = [];
  let r = core.steps.add(list, [], 'if');
  list = r.list;
  const ifId = r.id;
  list = core.steps.update(list, ifId, { left: 'status', op: 'equals', right: 'Urgent' });
  r = core.steps.add(list, [ifId, 'then'], 'message');
  list = r.list;
  const msg = r.id;
  r = core.steps.add(list, [], 'clear');
  list = r.list;
  const clear = r.id;
  list = core.steps.move(list, clear, [ifId, 'else'], 0);
  assert.deepEqual(list.map(s => s.type), ['if']);
  assert.deepEqual(list[0].else.map(s => s.type), ['clear']);
  assert.strictEqual(core.steps.move(list, ifId, [ifId, 'then'], 0), list, 'an If cannot go inside itself');
  list = core.steps.update(list, msg, { text: 'Rush {order_number}' });
  assert.equal(core.steps.find(list, msg).step.text, 'Rush {order_number}');
  list = core.steps.move(list, msg, [], 1);
  assert.deepEqual(list.map(s => s.type), ['if', 'message']);
  list = core.steps.remove(list, clear);
  assert.equal(core.steps.count(list), 2);
  assert.deepEqual(core.sanitizeActions(list), list);
  // Unknown types and bad targets are dropped/cleared.
  const clean = core.sanitizeActions([{ type: 'eval', code: 'x' }, { type: 'show', target: 'Bad Name!' }]);
  assert.deepEqual(clean.map(s => [s.type, s.target]), [['show', '']]);
});

test('CSV: parse quotes and line breaks, build safe CSV, match columns', () => {
  const rows = core.parseCsv('﻿Order number,"Notes, extra"\r\n1001,"Said ""hi""\nthen left"\n\n1002,\n');
  assert.deepEqual(rows, [['Order number', 'Notes, extra'], ['1001', 'Said "hi"\nthen left'], ['1002', '']]);
  assert.equal(core.toCsv([['a', '=SUM(A1)', 'x,y'], ['"q"', '', '-1']]), 'a,\'=SUM(A1),"x,y"\r\n"""q""",,\'-1');
  const table = { fields: [{ key: 'order_number', label: 'Order number' }, { key: 'notes', label: 'Notes' }] };
  assert.deepEqual(core.matchColumns(['ORDER NUMBER', 'notes', 'Other'], table), ['order_number', 'notes', null]);
});

test('popups: sections become named popups; names are shared with elements and renames follow', () => {
  let { page, id } = core.addSection(core.createPage(), '1');
  page = core.updateSection(page, id, { popup: true, title: 'Add job' });
  let r = core.insertBlock(page, 'button', page.sections[0].columns[0].id);
  page = core.updateBlock(r.page, r.id, { props: { actions: [{ type: 'openPopup', target: 'popup_1' }, { type: 'if', left: 'record.status', op: 'notEmpty' }] } });
  assert.deepEqual(core.pagePopups(page).map(p => [p.name, p.title]), [['popup_1', 'Add job']]);
  assert.match(core.renameBlock(page, r.id, 'popup_1').error, /already called/);
  page = core.renameBlock(page, id, 'add_job').page;
  const steps = core.findBlock(page, r.id).block.props.actions;
  assert.equal(steps[0].target, 'add_job');
  assert.equal(steps[1].left, 'record.status', 'record fields are valid If values');
  const again = core.sanitizePage(page);
  assert.equal(again.sections[0].popup, true);
  assert.equal(again.sections[0].name, 'add_job');
  const copy = core.duplicateSection(again, id);
  assert.notEqual(core.findSection(copy.page, copy.id).section.name, 'add_job');
  page = core.updateSection(page, id, { popup: false });
  assert.equal(page.sections[0].popup, undefined);
  assert.equal(page.sections[0].name, undefined);
});

test('card designs: parts, order, inline, style limits', () => {
  let d = core.cardDesign.starter('customer', 'notes');
  assert.deepEqual(d.parts.map(p => [p.type, p.field || p.show]), [['field', 'customer'], ['field', 'notes'], ['meta', 'when']]);
  let r = core.cardDesign.add(d, 'badge', 0, { field: 'status', tone: 'warning', inline: 'yes' });
  d = core.cardDesign.move(r.design, r.id, 3);
  assert.deepEqual(d.parts.map(p => p.type), ['field', 'field', 'badge', 'meta']);
  d = core.cardDesign.update(d, r.id, { tone: 'nope', field: 'Bad Field' });
  const badge = d.parts.find(p => p.id === r.id);
  assert.equal(badge.tone, 'neutral');
  assert.equal(badge.field, '');
  d = core.cardDesign.setStyle(d, { accent: '#0a0', radius: 500, border: 'weird', padding: '12' });
  assert.deepEqual(d.style, { accent: '#0a0', radius: 40, padding: 12 });
  assert.equal(core.sanitizeDesign({ parts: [{ type: 'script' }, { type: 'divider' }] }).parts.length, 1);
});
