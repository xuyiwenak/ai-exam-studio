const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

async function createApp(previewChunks = []) {
  const listeners = {};
  const classes = new Set();
  const renders = [];
  const zone = {classList: {add(name) { classes.add(name); }, remove(name) { classes.delete(name); }}};
  const app = {
    get innerHTML() { return renders.at(-1) || ''; },
    set innerHTML(value) { renders.push(value); },
    addEventListener(name, handler) { listeners[name] = handler; },
    contains() { return true; },
  };
  const noop = () => {};
  const document = {
    title: '',
    getElementById(id) {
      if (id === 'app') return app;
      if (id === 'brandButton') return {addEventListener: noop};
      return {textContent: '', classList: {add: noop, remove: noop}};
    },
    querySelector(selector) { return selector === '.main-nav' ? {addEventListener: noop} : null; },
    querySelectorAll() { return []; },
  };
  vm.runInNewContext(appSource, {
    document,
    window: {EXAM_BANKS: {}, scrollTo: noop},
    localStorage: {getItem: () => null, setItem: noop},
    fetch: async route => {
      if (route.startsWith('/api/preview-stream')) {
        let index = 0;
        return {ok: true, body: {getReader: () => ({read: async () => index < previewChunks.length ? {value: new TextEncoder().encode(previewChunks[index++]), done: false} : {done: true}})}};
      }
      return {ok: true, json: async () => route === '/api/banks' ? {banks: []} : {base_url: '', model: '', has_key: false}};
    },
    TextDecoder, Uint8Array,
    setInterval: noop, setTimeout: noop, clearTimeout: noop, confirm: () => true, console,
  });
  await Promise.resolve();
  await Promise.resolve();
  listeners.click({target: {closest: () => ({dataset: {action: 'nav-import'}})}});
  const drag = (name, files, types = ['Files']) => {
    const transfer = {files, types, dropEffect: ''};
    let prevented = false;
    listeners[name]({target: {closest: () => zone}, dataTransfer: transfer, preventDefault() { prevented = true; }});
    return {prevented, transfer};
  };
  return {
    app, classes, renders, drag,
    change(files) { listeners.change({target: {id: 'importFile', files}}); },
    click(action) { return listeners.click({target: {closest: () => ({dataset: {action}})}}); },
  };
}

test('dragging a file highlights the zone and dropping selects it', async () => {
  const ui = await createApp();
  assert.match(ui.app.innerHTML, /拖入文件，或点击选择/);
  const file = {name: '模拟题库.xlsx', size: 2048};
  assert.equal(ui.drag('dragenter', [file]).prevented, true);
  assert.equal(ui.classes.has('drag-active'), true);
  assert.equal(ui.drag('dragover', [file]).transfer.dropEffect, 'copy');
  assert.equal(ui.drag('drop', [file]).prevented, true);
  assert.equal(ui.classes.has('drag-active'), false);
  assert.match(ui.app.innerHTML, /模拟题库.xlsx/);
  assert.doesNotMatch(ui.app.innerHTML, /仅支持 \.xlsx|一次只能导入一个文件|文件不能超过 20 MB/);
});

test('drag highlight survives nested enter and leave events', async () => {
  const ui = await createApp();
  ui.drag('dragenter', []);
  ui.drag('dragenter', []);
  ui.drag('dragleave', []);
  assert.equal(ui.classes.has('drag-active'), true);
  ui.drag('dragleave', []);
  assert.equal(ui.classes.has('drag-active'), false);
});

test('drop and file picker share format, size, and single-file checks', async () => {
  const ui = await createApp();
  ui.drag('drop', [{name: 'notes.txt', size: 10}]);
  assert.match(ui.app.innerHTML, /仅支持 \.xlsx、\.docx 和 \.pdf 文件/);
  ui.drag('drop', [{name: 'one.pdf', size: 10}, {name: 'two.pdf', size: 10}]);
  assert.match(ui.app.innerHTML, /一次只能导入一个文件/);
  ui.change([{name: 'large.pdf', size: 20 * 1024 * 1024 + 1}]);
  assert.match(ui.app.innerHTML, /文件不能超过 20 MB/);
  ui.change([{name: 'valid.docx', size: 100}]);
  assert.match(ui.app.innerHTML, /valid.docx/);
  assert.doesNotMatch(ui.app.innerHTML, /仅支持 \.xlsx|一次只能导入一个文件|文件不能超过 20 MB/);
});

test('streamed batch progress appears before the question preview', async () => {
  const result = JSON.stringify({type: 'result', questions: [{type: 'single', text: '题目', options: ['甲', '乙'], answer: [1], invalid: false}], warnings: [], summary: {rows: 1}, filename: 'sample.xlsx'});
  const ui = await createApp([
    '{"type":"progress","completed":0,"total":2}\n{"type":"progress","completed":1,',
    '"total":2}\n{"type":"progress","completed":2,"total":2}\n' + result + '\n',
  ]);
  ui.change([{name: 'sample.xlsx', size: 100}]);
  await ui.click('analyze-file');

  assert.ok(ui.renders.some(html => html.includes('已完成 1 / 2 批')));
  assert.ok(ui.renders.some(html => html.includes('已完成 2 / 2 批')));
  assert.match(ui.app.innerHTML, /识别结果 · 1 道题/);
});
