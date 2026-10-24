const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const banks = {
  vibe: {
    title: '测试题库',
    questions: [
      {id: 'q1', type: 'single', text: '单选', options: ['错误一', '正确项', '错误二'], answer: [1], explanation: ''},
      {id: 'q2', type: 'multiple', text: '多选', options: ['正确一', '正确二', '正确三', '错误项'], answer: [0, 1, 2], explanation: ''},
    ],
  },
};

async function createApp() {
  const listeners = {};
  const memory = new Map();
  const app = {innerHTML: '', addEventListener(name, handler) { listeners[name] = handler; }, contains() { return true; }};
  const noop = () => {};
  const document = {
    title: '',
    getElementById(id) {
      if (id === 'app') return app;
      if (id === 'passLine') return {value: '60'};
      if (id === 'brandButton') return {addEventListener: noop};
      return {textContent: '', classList: {add: noop, remove: noop, toggle: noop}};
    },
    querySelector(selector) { return selector === '.main-nav' ? {addEventListener: noop} : null; },
    querySelectorAll() { return []; },
  };
  const context = {
    document,
    window: {EXAM_BANKS: banks, scrollTo: noop},
    localStorage: {getItem(key) { return memory.get(key) || null; }, setItem(key, value) { memory.set(key, value); }},
    fetch: async route => ({ok: true, json: async () => route === '/api/banks' ? {banks: []} : {base_url: '', model: '', has_key: false}}),
    crypto: {getRandomValues(array) { array[0] = 0; return array; }},
    setInterval: noop,
    setTimeout: noop,
    clearTimeout: noop,
    confirm: () => true,
    structuredClone,
    console,
  };
  vm.runInNewContext(appSource, context);
  await Promise.resolve();
  await Promise.resolve();
  const click = (action, value, bank) => listeners.click({target: {closest: () => ({dataset: {action, value, bank}})}});
  const change = (id, checked) => listeners.change({target: {id, checked}});
  const state = () => JSON.parse(memory.get('exam-studio-v1'));
  return {app, click, change, state};
}

test('shuffled labels stay stable and score against original answer indices', async () => {
  const ui = await createApp();
  ui.click('setup', undefined, 'vibe');
  assert.match(ui.app.innerHTML, /打乱单选和多选题的选项顺序/);
  ui.click('start');
  assert.deepEqual(Array.from(ui.state().session.optionOrder.q1), [1, 2, 0]);
  assert.match(ui.app.innerHTML, /data-value="1"[^>]*><span class="option-letter">A<\/span><span>正确项<\/span>/);

  ui.click('answer', '1');
  assert.match(ui.app.innerHTML, /data-value="1"[^>]*><span class="option-letter">A<\/span><span>正确项<\/span>/);
  ui.click('next');
  for (const answer of ['0', '1', '2']) ui.click('answer', answer);
  ui.click('submit');

  const result = ui.state().history[0];
  assert.equal(result.score, 100);
  assert.match(ui.app.innerHTML, /正确答案：<\/strong>A\. 正确项/);
  assert.doesNotMatch(ui.app.innerHTML, /正确答案：<\/strong>B\. 正确项/);
});

test('turning option shuffle off preserves source labels', async () => {
  const ui = await createApp();
  ui.click('setup', undefined, 'vibe');
  ui.change('shuffleOptions', false);
  ui.click('start');
  assert.equal(Object.keys(ui.state().session.optionOrder).length, 0);
  assert.match(ui.app.innerHTML, /data-value="1"[^>]*><span class="option-letter">B<\/span><span>正确项<\/span>/);
});
