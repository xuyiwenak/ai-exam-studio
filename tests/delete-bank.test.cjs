const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const importedId = 'import-123456789abc';
const question = {id: 'q1', type: 'single', text: '测试题', options: ['甲', '乙'], answer: [1], invalid: false};

async function createApp(deleteSucceeds = true) {
  const listeners = {};
  const requests = [];
  const memory = new Map([['exam-studio-v1', JSON.stringify({
    session: {bank: importedId, ids: ['q1'], answers: {}, marks: {}, current: 0},
    history: [{id: 'import-result', bank: importedId}, {id: 'built-in-result', bank: 'vibe'}],
  })]]);
  const dialog = {opened: 0, addEventListener() {}, showModal() { this.opened++; }};
  const app = {innerHTML: '', addEventListener(name, handler) { listeners[name] = handler; }, contains() { return true; }};
  const noop = () => {};
  const document = {
    title: '',
    getElementById(id) {
      if (id === 'app') return app;
      if (id === 'deleteBankDialog') return dialog;
      if (id === 'brandButton') return {addEventListener: noop};
      return {textContent: '', classList: {add: noop, remove: noop, toggle: noop}};
    },
    querySelector(selector) { return selector === '.main-nav' ? {addEventListener: noop} : null; },
    querySelectorAll() { return []; },
  };
  vm.runInNewContext(appSource, {
    document,
    window: {EXAM_BANKS: {vibe: {title: '内置题库', questions: [question]}, [importedId]: {title: '临时题库', questions: [question]}}, scrollTo: noop},
    localStorage: {getItem(key) { return memory.get(key); }, setItem(key, value) { memory.set(key, value); }},
    fetch: async (route, options = {}) => {
      requests.push({route, method: options.method || 'GET'});
      if (route === `/api/banks/${importedId}` && !deleteSucceeds) return {ok: false, status: 500, json: async () => ({error: '删除失败，请重试'})};
      return {ok: true, json: async () => route === '/api/banks' ? {banks: []} : route === `/api/banks/${importedId}` ? {deleted: importedId} : {has_key: false}};
    },
    setInterval: noop, setTimeout: noop, clearTimeout: noop, confirm: () => true, console,
  });
  await Promise.resolve();
  await Promise.resolve();
  const click = (action, bank) => listeners.click({target: {closest: () => ({dataset: {action, bank}})}});
  return {app, dialog, requests, memory, click};
}

test('trash icon confirms deletion and clears only its browser records', async () => {
  const ui = await createApp();
  ui.click('nav-library');
  assert.equal((ui.app.innerHTML.match(/data-action="delete-bank-prompt"/g) || []).length, 1);

  ui.click('delete-bank-prompt', importedId);
  assert.match(ui.app.innerHTML, /确认删除“临时题库”/);
  assert.ok(ui.dialog.opened > 0);
  assert.equal(ui.requests.filter(request => request.method === 'DELETE').length, 0);

  ui.click('delete-bank-cancel');
  assert.doesNotMatch(ui.app.innerHTML, /确认删除“临时题库”/);
  ui.click('delete-bank-prompt', importedId);
  await ui.click('delete-bank-confirm');

  assert.deepEqual(ui.requests.filter(request => request.method === 'DELETE'), [{route: `/api/banks/${importedId}`, method: 'DELETE'}]);
  assert.doesNotMatch(ui.app.innerHTML, /临时题库/);
  assert.match(ui.app.innerHTML, /内置题库/);
  const saved = JSON.parse(ui.memory.get('exam-studio-v1'));
  assert.equal(saved.session, null);
  assert.deepEqual(saved.history.map(result => result.id), ['built-in-result']);
});

test('failed deletion keeps the bank and its records', async () => {
  const ui = await createApp(false);
  ui.click('nav-library');
  ui.click('delete-bank-prompt', importedId);
  await ui.click('delete-bank-confirm');

  assert.match(ui.app.innerHTML, /临时题库/);
  assert.match(ui.app.innerHTML, /删除失败，请重试/);
  const saved = JSON.parse(ui.memory.get('exam-studio-v1'));
  assert.equal(saved.session.bank, importedId);
  assert.equal(saved.history.length, 2);
});
