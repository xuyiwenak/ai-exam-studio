(() => {
  'use strict';

  const BANKS = {...window.EXAM_BANKS};
  const APP = document.getElementById('app');
  const STORAGE = 'exam-studio-v1';
  const TYPE_LABELS = {single: '单选题', multiple: '多选题', boolean: '判断题', essay: '简答题'};
  const LETTERS = 'ABCDEFGHIJ';
  let saved = readStorage();
  let screen = 'home';
  let setup = {bank: 'vibe', count: 50, duration: 60, passLine: 60};
  let reviewFilter = 'all';
  let reviewPage = 0;
  let activeResult = null;
  let timerHandle;
  let backendAvailable = false;
  let aiConfig = {base_url: 'https://api.openai.com/v1', model: '', has_key: false, masked_key: ''};
  let importState = {file: null, title: '', questions: [], warnings: [], summary: null, source: '', busy: false, error: '', page: 0, editingIndex: null, editingDraft: null};

  async function requestJSON(path, options = {}) {
    const response = await fetch(path, options);
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error('本地服务未运行，请使用 start.command 启动。'); }
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }
  async function loadServerData() {
    try {
      const [banks, config] = await Promise.all([requestJSON('/api/banks'), requestJSON('/api/config')]);
      for (const bank of banks.banks) BANKS[bank.id] = bank;
      aiConfig = config;
      backendAvailable = true;
      const historyCount = saved.history.length;
      saved.history = saved.history.filter(item => BANKS[item.bank]);
      const missingSession = saved.session && !BANKS[saved.session.bank];
      if (missingSession) saved.session = null;
      if (saved.history.length !== historyCount || missingSession) persist();
    } catch (_) { backendAvailable = false; }
    render();
  }
  function showScreen(next) { screen = next; render(); window.scrollTo(0, 0); }

  function readStorage() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE));
      if (value && Array.isArray(value.history)) return value;
    } catch (_) { /* A private or cleared browser may reject storage. */ }
    return {session: null, history: []};
  }
  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch (_) { toast('浏览器未能保存进度'); }
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function countByType(questions) {
    return questions.reduce((acc, q) => (acc[q.type] = (acc[q.type] || 0) + 1, acc), {});
  }
  function bankQuestions(bankId) { return BANKS[bankId].questions; }
  function paperQuestions(paper) {
    const byId = new Map(bankQuestions(paper.bank).map(q => [q.id, q]));
    return paper.ids.map(id => byId.get(id)).filter(Boolean);
  }
  function answered(q, value) {
    return q.type === 'essay' ? Boolean((value || '').trim()) : Array.isArray(value) && value.length > 0;
  }
  function answerText(q, value) {
    if (q.type === 'essay') return value?.trim() || '未作答';
    if (!answered(q, value)) return '未作答';
    return value.map(index => `${LETTERS[index]}. ${q.options[index]}`).join('；');
  }
  function invalidText(q) {
    return q.id === 'opc-96' ? '原题库标注 A/B/C/D，但缺少 D 选项。' : '本题缺少可用答案或选项。';
  }
  function correct(q, value) {
    if (q.type === 'essay' || q.invalid || !answered(q, value)) return false;
    return [...value].sort().join(',') === [...q.answer].sort().join(',');
  }
  function formatTime(seconds) {
    if (seconds == null) return '不限时';
    const min = Math.floor(seconds / 60);
    return `${String(min).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function remaining(session) { return session.deadline ? Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000)) : null; }
  function shuffle(values) {
    const items = [...values];
    for (let i = items.length - 1; i > 0; i--) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const j = random[0] % (i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
  function goHome() { screen = 'home'; render(); window.scrollTo(0, 0); }

  function renderHome() {
    const resume = saved.session && BANKS[saved.session.bank] ? saved.session : null;
    const bankEntries = Object.entries(BANKS);
    const totalQuestions = bankEntries.reduce((sum, [, bank]) => sum + bank.questions.length, 0);
    const cards = bankEntries.map(([id, bank], index) => {
      const counts = countByType(bank.questions);
      return `<article class="bank-card">
        <div class="bank-top"><span class="bank-icon">${id === 'vibe' ? 'VC' : id === 'opc' ? 'OPC' : '题'}</span><span class="bank-num">${String(index + 1).padStart(2, '0')} / ${String(bankEntries.length).padStart(2, '0')}</span></div>
        <h3>${esc(bank.title)}</h3><p>${bank.questions.length} 道题 · ${id.startsWith('import-') ? '自定义题库' : '原始题库'} · 选择适合自己的模拟节奏</p>
        <div class="card-bottom"><div class="tag-row"><span class="tag">单选 ${counts.single || 0}</span><span class="tag">多选 ${counts.multiple || 0}</span><span class="tag">判断 ${counts.boolean || 0}</span>${counts.essay ? `<span class="tag">简答 ${counts.essay}</span>` : ''}</div><button class="circle-arrow" type="button" data-action="setup" data-bank="${id}" aria-label="设置${esc(bank.title)}模拟考试">↗</button></div>
      </article>`;
    }).join('');
    APP.innerHTML = `<section class="hero"><div><div class="eyebrow">EXAM PRACTICE / 2026</div><h1>把练习，<br><span>当作真正的考试。</span></h1><p>选择现有题库，或导入自己的 PDF、Word、Excel。限时作答、标记疑问、交卷复盘。</p></div><div class="hero-stat"><span class="stat-label">题库总量 / TOTAL QUESTIONS</span><div><strong>${totalQuestions}</strong><br><small>${bankEntries.length} 套题库，随时开始。</small></div></div></section>
      <section><div class="section-title"><h2>选择考试科目</h2><button class="text-button" type="button" data-action="nav-import">＋ 导入新题库</button></div><div class="bank-grid">${cards}</div></section>
      ${resume ? `<div class="soft-card"><div><strong>上次考试尚未交卷</strong><span>${esc(BANKS[resume.bank].title)} · ${resume.ids.length} 题 · 已作答 ${paperQuestions(resume).filter(q => answered(q, resume.answers[q.id])).length} 题</span></div><button class="text-button" type="button" data-action="resume">继续答题 →</button></div>` : ''}
      ${saved.history.length ? `<div class="soft-card" style="align-items:flex-start"><div style="width:100%"><div class="history-heading"><strong>最近的考试记录</strong><button class="text-button" type="button" data-action="clear-history">清空记录</button></div><div class="history-list">${saved.history.filter(item => BANKS[item.bank]).slice(0, 3).map(item => `<div class="history-item"><span>${esc(BANKS[item.bank].title)} · ${new Date(item.finishedAt).toLocaleString('zh-CN')}</span><button class="text-button" type="button" data-action="history" data-id="${esc(item.id)}">${item.score}%　查看复盘 →</button></div>`).join('')}</div></div></div>` : ''}`;
  }

  function renderLibrary() {
    const entries = Object.entries(BANKS);
    APP.innerHTML = `<section class="page-intro"><div><div class="eyebrow">QUESTION BANKS</div><h1>题库管理</h1><p>现有题库和新导入的题库都在这里。选择一套题库，即可开始模拟考试。</p></div><button class="primary" type="button" data-action="nav-import">＋ 导入题库</button></section><section class="library-list">${entries.map(([id, bank]) => {
      const counts = countByType(bank.questions);
      return `<div class="panel library-row"><div class="library-row-main"><span class="bank-icon">${id === 'vibe' ? 'VC' : id === 'opc' ? 'OPC' : '题'}</span><div><h3>${esc(bank.title)}</h3><p>${esc(bank.source || '本地题库')} · 单选 ${counts.single || 0} · 多选 ${counts.multiple || 0} · 判断 ${counts.boolean || 0}${counts.essay ? ` · 简答 ${counts.essay}` : ''}</p></div></div><div class="library-row-actions"><span class="library-count">${bank.questions.length} 题</span><button class="secondary" type="button" data-action="setup" data-bank="${esc(id)}">开始练习 →</button></div></div>`;
    }).join('')}</section><div class="action-card"><div><strong>有新的题库文件？</strong><p>支持 Excel、Word、PDF，由你配置的大模型分析题目与答案，核对后加入题库。</p></div><button class="primary" type="button" data-action="nav-import">前往导入</button></div>`;
  }

  function renderSettings() {
    APP.innerHTML = `<section class="page-intro"><div><div class="eyebrow">AI CONNECTION</div><h1>AI 配置</h1><p>填写兼容 OpenAI Chat Completions 的接口地址、模型 ID 和 API Key。</p></div><span class="source-badge">${aiConfig.has_key ? `已配置 ${esc(aiConfig.masked_key)}` : '尚未配置密钥'}</span></section><div class="wide-layout"><section class="panel content-panel"><h2>模型连接</h2><p>配置只保存在这台电脑的本地服务中。</p>${!backendAvailable ? '<div class="inline-note danger-note">本地导入服务未运行。请双击 start.command 启动，再打开网页。</div>' : ''}
      <div class="form-field"><label for="apiBase">API 基础地址</label><input id="apiBase" type="url" value="${esc(aiConfig.base_url || '')}" placeholder="https://api.openai.com/v1" autocomplete="off"><small>远程地址必须是 HTTPS。本机模型可以使用 http://127.0.0.1。</small></div>
      <div class="field-grid"><div class="form-field"><label for="apiModel">模型 ID</label><input id="apiModel" type="text" value="${esc(aiConfig.model || '')}" placeholder="请选择支持图片理解的多模态模型" autocomplete="off"></div><div class="form-field"><label for="apiKey">API Key</label><input id="apiKey" type="password" value="" placeholder="${aiConfig.has_key ? '已保存；留空则保持原密钥' : '粘贴你的 API Key'}" autocomplete="new-password"></div></div>
      <div class="inline-note warning-note"><strong>扫描版 PDF 提示：</strong>请配置支持图片输入的多模态模型。系统会把没有可提取文字的 PDF 页面转成图片，直接交给该模型识别；图片调用可能产生额外费用。保存的 API Key 仅在本机服务中使用。</div>
      <div class="settings-actions"><button class="primary" type="button" data-action="save-config" ${!backendAvailable ? 'disabled' : ''}>保存配置</button><button class="secondary" type="button" data-action="test-config" ${!backendAvailable || !aiConfig.has_key ? 'disabled' : ''}>测试连接</button>${aiConfig.has_key ? '<button class="text-button danger-text" type="button" data-action="clear-config">清除密钥</button>' : ''}</div></section>
      <aside class="panel aside-info"><h3>数据如何流转</h3><div class="step-list"><div class="step-item"><span class="step-no">01</span><div><strong>本地读取文件</strong><p>Excel、Word 和 PDF 的可提取文字先在本机读取；扫描页在本机转成图片。</p></div></div><div class="step-item"><span class="step-no">02</span><div><strong>模型整理题目</strong><p>提取文字或扫描页图片发送到你配置的 API，由模型识别题干、选项和答案。</p></div></div><div class="step-item"><span class="step-no">03</span><div><strong>人工核对再入库</strong><p>可在预览页修改题目。确认后保存题库到本机。</p></div></div></div><div class="inline-note">原始文件不会被本地服务长期保存。模型供应商会收到用于解析的文字或扫描页图片。</div></aside></div>`;
  }

  function renderEditor() {
    const q = importState.editingDraft;
    if (!q) return '';
    const showOptions = q.type !== 'essay';
    return `<div class="editor"><h3>编辑第 ${importState.editingIndex + 1} 题</h3><div class="muted">检查模型提取结果，尤其是正确答案。</div><div class="field-grid"><div class="form-field"><label for="editType">题型</label><select id="editType"><option value="single" ${q.type === 'single' ? 'selected' : ''}>单选</option><option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>多选</option><option value="boolean" ${q.type === 'boolean' ? 'selected' : ''}>判断</option><option value="essay" ${q.type === 'essay' ? 'selected' : ''}>简答</option></select></div></div><div class="form-field"><label for="editText">题干</label><textarea id="editText">${esc(q.text)}</textarea></div>${showOptions ? `<div class="form-field"><label>选项</label><div class="editor-options">${q.options.map((option, index) => `<div class="option-edit-row"><span>${LETTERS[index]}</span><input data-edit-option="${index}" type="text" value="${esc(option)}" ${q.type === 'boolean' ? 'disabled' : ''}></div>`).join('')}</div>${q.type !== 'boolean' && q.options.length < 10 ? '<button class="text-button" type="button" data-action="add-option">＋ 添加选项</button>' : ''}</div><div class="form-field"><label>正确答案</label><div class="answer-picks">${q.options.map((_, index) => `<button type="button" class="answer-pick ${q.answer.includes(index) ? 'selected' : ''}" data-action="edit-answer" data-value="${index}">${LETTERS[index]}${q.type === 'boolean' ? ` · ${index === 0 ? '正确' : '错误'}` : ''}</button>`).join('')}</div><small>没有明确答案时可留空，该题将不参与自动计分。</small></div>` : '<div class="inline-note">简答题保留作答，不自动判分。</div>'}<div class="form-field"><label for="editExplanation">解析（可留空）</label><textarea id="editExplanation">${esc(q.explanation || '')}</textarea></div><div class="toolbar-row"><button class="primary" type="button" data-action="save-question">保存本题</button><button class="secondary" type="button" data-action="cancel-edit">取消</button></div></div>`;
  }

  function renderImport() {
    const state = importState;
    const pageCount = Math.max(1, Math.ceil(state.questions.length / 15));
    state.page = Math.min(state.page, pageCount - 1);
    const visible = state.questions.slice(state.page * 15, (state.page + 1) * 15);
    const invalid = state.questions.filter(q => q.invalid).length;
    APP.innerHTML = `<section class="page-intro"><div><div class="eyebrow">IMPORT QUESTION BANK</div><h1>导入题库</h1><p>上传文件 → AI 识别题目 → 人工核对 → 保存为可考试的题库。</p></div><button class="secondary" type="button" data-action="nav-library">返回题库</button></section><div class="wide-layout"><section class="panel content-panel"><h2>选择题库文件</h2><p>支持 .xlsx、.docx 和 .pdf（含扫描版）。可提取文字或扫描页图片会发送给配置的模型。</p>${!backendAvailable ? '<div class="inline-note danger-note">导入服务未运行。请双击 start.command 启动本地服务。</div>' : ''}${!aiConfig.has_key ? '<div class="inline-note warning-note">尚未配置 API Key。请先到 AI 配置页面填写接口信息；扫描版 PDF 还需要支持图片输入的模型。</div>' : ''}
      <label class="file-picker" for="importFile"><input id="importFile" type="file" accept=".xlsx,.docx,.pdf" ${state.busy ? 'disabled' : ''}><span class="file-picker-icon">↑</span><strong>${state.file ? esc(state.file.name) : '点击选择 Excel、Word 或 PDF 文件'}</strong><span>${state.file ? `${(state.file.size / 1024).toFixed(1)} KB · 点击可重新选择` : '单个文件不超过 20 MB'}</span></label>
      <div class="toolbar-row"><button class="primary" type="button" data-action="analyze-file" ${!state.file || state.busy || !backendAvailable || !aiConfig.has_key ? 'disabled' : ''}>${state.busy ? '正在分析…' : '用 AI 分析题目'}</button>${state.busy ? '<span class="busy"><i class="spinner"></i>正在解析文件并调用模型，题量多时可能需要几分钟</span>' : ''}</div>${state.error ? `<div class="inline-note danger-note">${esc(state.error)}</div>` : ''}
      ${state.questions.length ? `<hr class="rule"><div class="preview-head"><div><strong>识别结果 · ${state.questions.length} 道题</strong><p>${invalid ? `${invalid} 道需要核对答案或选项。` : '全部题目均有可用答案或为简答题。'}请核对模型识别结果后再保存。${state.summary?.vision_pages ? `其中 ${state.summary.vision_pages} 页由多模态模型读取图片。` : ''}</p></div><span class="source-badge">${esc(state.source)}</span></div>${state.warnings.map(warning => `<div class="inline-note warning-note">${esc(warning)}</div>`).join('')}<div class="form-field"><label for="importTitle">题库名称</label><input id="importTitle" type="text" value="${esc(state.title)}" maxlength="100"></div>${state.editingDraft ? renderEditor() : ''}<div class="preview-list">${visible.map((q, localIndex) => {
        const index = state.page * 15 + localIndex;
        return `<div class="preview-item"><div class="preview-item-top"><span class="index">${String(index + 1).padStart(2, '0')}</span><span class="question">${esc(q.text)}</span><span class="status ${q.invalid ? 'wrong' : 'correct'}">${q.invalid ? '待核对' : TYPE_LABELS[q.type]}</span></div><div class="option-preview">${q.options.map((option, i) => `${LETTERS[i]}. ${esc(option)}`).join('　')}<br>答案：${q.type === 'essay' ? '简答待自评' : q.answer.length ? q.answer.map(i => LETTERS[i]).join('、') : '缺失'}</div><div class="preview-actions"><button type="button" data-action="edit-question" data-value="${index}">编辑</button><button type="button" class="remove" data-action="remove-question" data-value="${index}">移除</button></div></div>`;
      }).join('')}</div>${pageCount > 1 ? `<div class="preview-pagination"><button class="secondary" type="button" data-action="import-page" data-value="${state.page - 1}" ${state.page === 0 ? 'disabled' : ''}>上一页</button><span>${state.page + 1} / ${pageCount} 页</span><button class="secondary" type="button" data-action="import-page" data-value="${state.page + 1}" ${state.page === pageCount - 1 ? 'disabled' : ''}>下一页</button></div>` : ''}<div class="toolbar-row"><button class="primary" type="button" data-action="save-bank" ${state.busy ? 'disabled' : ''}>确认导入 ${state.questions.length} 道题 →</button><span class="muted">导入后可在题库管理中选择考试。</span></div>` : ''}</section>
      <aside class="panel aside-info"><h3>导入说明</h3><div class="step-list"><div class="step-item"><span class="step-no">01</span><div><strong>上传文件</strong><p>本机提取文本和表格，扫描页转成图片。</p></div></div><div class="step-item"><span class="step-no">02</span><div><strong>模型识别</strong><p>文字和扫描页图片交给配置的模型，识别题目、选项与原文标注的答案。</p></div></div><div class="step-item"><span class="step-no">03</span><div><strong>检查后保存</strong><p>AI 识别可能出错；请核对答案。缺答案题不会自动计分。</p></div></div></div><div class="inline-note">扫描版 PDF 需要支持图片输入的多模态模型，可能产生较高的模型调用费用。</div></aside></div>`;
  }

  function renderSetup() {
    const bank = BANKS[setup.bank];
    const counts = countByType(bank.questions);
    const invalidCount = bank.questions.filter(q => q.invalid).length;
    const eligibleCount = bank.questions.filter(q => q.type !== 'essay' && !q.invalid).length;
    const countChoices = [25, 50, 100].filter(value => value <= eligibleCount).concat('all');
    APP.innerHTML = `<div class="setup-layout"><section class="panel setup-main"><button class="back-link" type="button" data-action="home">← 返回题库</button><div class="eyebrow">SET UP YOUR EXAM</div><h1>${esc(bank.title)}</h1><div class="muted">按自己的节奏组一张模拟试卷。随机抽题，交卷后查看正确率和每道题的答案。</div><hr class="rule">
      <div class="field-group"><div class="field-title">题目数量 <span>随机抽取，不重复</span></div><div class="segmented">${countChoices.map(v => `<button type="button" class="chip ${setup.count === v ? 'active' : ''}" data-action="count" data-value="${v}">${v === 'all' ? `全部 ${bank.questions.length} 题` : `${v} 题`}</button>`).join('')}</div></div>
      <div class="field-group"><div class="field-title">考试时长 <span>时间结束自动交卷</span></div><div class="segmented">${[30, 60, 90, 0].map(v => `<button type="button" class="chip ${setup.duration === v ? 'active' : ''}" data-action="duration" data-value="${v}">${v ? `${v} 分钟` : '不限时'}</button>`).join('')}</div></div>
      <div class="field-group"><div class="field-title">自设及格线 <span>按客观题正确率计算</span></div><div class="input-line"><input id="passLine" type="number" min="1" max="100" value="${setup.passLine}" aria-label="及格线百分比"><span class="muted">%</span></div></div>
      ${counts.essay ? `<div class="notice">选择“全部”会包含 ${counts.essay} 道简答题。原表未提供简答题标准答案，页面会保存作答内容，但不自动判分。</div>` : ''}${invalidCount ? `<div class="notice">原题库有 ${invalidCount} 道题缺少答案所需的选项。随机模拟会避开；“全部”模式会展示，但不计分。</div>` : ''}
      <div class="start-row"><button class="primary" type="button" data-action="start">开始模拟考试 →</button><small>题目与答案来自所选题库；规则仅用于自测。</small></div></section>
      <aside class="panel aside-info"><h3>题库概览</h3><div class="info-row"><span>题目总数</span><strong>${bank.questions.length} 题</strong></div><div class="info-row"><span>单选题</span><strong>${counts.single || 0} 题</strong></div><div class="info-row"><span>多选题</span><strong>${counts.multiple || 0} 题</strong></div><div class="info-row"><span>判断题</span><strong>${counts.boolean || 0} 题</strong></div>${counts.essay ? `<div class="info-row"><span>简答题</span><strong>${counts.essay} 题</strong></div>` : ''}<div class="notice">这里的时长、题量和及格线均可自行设置，不能代表正式考试要求。</div></aside></div>`;
  }

  function renderExam() {
    const session = saved.session;
    if (!session) return goHome();
    const questions = paperQuestions(session);
    const q = questions[session.current];
    const value = session.answers[q.id];
    const answerable = questions.filter(item => !item.invalid);
    const done = answerable.filter(item => answered(item, session.answers[item.id])).length;
    const marked = Object.values(session.marks).filter(Boolean).length;
    const options = q.type === 'essay'
      ? `<textarea id="essayAnswer" class="essay-input" placeholder="在这里写下你的答案……">${esc(value || '')}</textarea><div class="hint">此题无标准答案，交卷后请自行回顾。</div>`
      : `<div class="option-list">${q.options.map((option, index) => `<button type="button" class="option ${Array.isArray(value) && value.includes(index) ? 'selected' : ''}" data-action="answer" data-value="${index}" aria-pressed="${Array.isArray(value) && value.includes(index)}" ${q.invalid ? 'disabled' : ''}><span class="option-letter">${LETTERS[index]}</span><span>${esc(option)}</span></button>`).join('')}</div>${q.invalid ? `<div class="notice">${invalidText(q)}本题不参与计分。</div>` : q.type === 'multiple' ? '<div class="hint">多选题需选全且无多选才算正确。</div>' : ''}`;
    APP.innerHTML = `<div class="exam-head"><div class="exam-title-row"><span class="mini-icon">${session.bank === 'vibe' ? 'VC' : session.bank === 'opc' ? 'OPC' : '题'}</span><div><strong>${esc(BANKS[session.bank].title)}</strong><span>模拟考试 · ${questions.length} 题</span></div></div><div class="exam-head-right"><span class="timer" id="timer">${formatTime(remaining(session))}</span><button class="secondary" type="button" data-action="submit">交卷</button></div></div>
      <div class="exam-body"><section class="panel question-panel"><div class="question-meta"><span class="type">${TYPE_LABELS[q.type]}</span><span>第 ${session.current + 1} / ${questions.length} 题</span></div><h1 class="question-title">${esc(q.text)}</h1>${options}<div class="question-bottom"><div class="left-actions"><button class="secondary" type="button" data-action="mark">${session.marks[q.id] ? '★ 已标记' : '☆ 标记此题'}</button>${answered(q, value) ? '<button class="secondary" type="button" data-action="clear">清空答案</button>' : ''}</div><div class="right-actions"><button class="secondary" type="button" data-action="prev" ${session.current === 0 ? 'disabled' : ''}>上一题</button><button class="primary" type="button" data-action="next">${session.current === questions.length - 1 ? '完成并检查' : '下一题 →'}</button></div></div></section>
      <aside class="panel palette-panel"><div class="palette-head"><h3>答题卡</h3><span>${done} / ${answerable.length} 可答题已答</span></div><div class="progress-track"><div class="progress-fill" style="width:${answerable.length ? done / answerable.length * 100 : 100}%"></div></div><div class="legend"><span><i class="dot done"></i>已作答</span><span><i class="dot"></i>未作答</span><span><i class="dot marked"></i>已标记</span></div><div class="palette-grid">${questions.map((item, index) => `<button class="qnum ${item.invalid ? 'invalid' : answered(item, session.answers[item.id]) ? 'answered' : ''} ${session.marks[item.id] ? 'marked' : ''} ${index === session.current ? 'current' : ''}" type="button" data-action="jump" data-value="${index}" aria-label="跳转到第${index + 1}题${item.invalid ? '，题库缺项' : ''}">${item.invalid ? '!' : index + 1}</button>`).join('')}</div><div class="palette-foot"><div><strong>${done}</strong><span>已作答</span></div><div><strong>${answerable.length - done}</strong><span>未作答</span></div><div><strong>${marked}</strong><span>已标记</span></div></div></aside></div>`;
    updateTimer();
  }

  function makeResult(session, reason) {
    const questions = paperQuestions(session);
    const objective = questions.filter(q => q.type !== 'essay' && !q.invalid);
    const right = objective.filter(q => correct(q, session.answers[q.id])).length;
    return {
      ...session, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      finishedAt: Date.now(), reason, right, total: objective.length,
      score: objective.length ? Math.round(right / objective.length * 100) : 0,
    };
  }
  function submit(reason = 'manual') {
    const session = saved.session;
    if (!session) return;
    const questions = paperQuestions(session);
    const unanswered = questions.filter(q => !q.invalid && !answered(q, session.answers[q.id])).length;
    if (reason === 'manual' && unanswered && !confirm(`还有 ${unanswered} 道题未作答，确定交卷吗？`)) return;
    const result = makeResult(session, reason);
    saved.history.unshift(result);
    saved.history = saved.history.slice(0, 30);
    saved.session = null;
    persist();
    activeResult = result;
    reviewFilter = 'all';
    reviewPage = 0;
    screen = 'result';
    render();
    window.scrollTo(0, 0);
    if (reason === 'timeout') toast('考试时间已到，已自动交卷');
  }

  function renderResult() {
    const result = activeResult;
    if (!result) return goHome();
    const questions = paperQuestions(result);
    const essays = questions.filter(q => q.type === 'essay').length;
    const invalid = questions.filter(q => q.invalid).length;
    const unanswered = questions.filter(q => !q.invalid && !answered(q, result.answers[q.id])).length;
    const wrong = questions.filter(q => q.type !== 'essay' && !q.invalid && answered(q, result.answers[q.id]) && !correct(q, result.answers[q.id])).length;
    const passed = result.score >= result.passLine;
    const filtered = questions.filter(q => reviewFilter === 'all' || (reviewFilter === 'wrong' && q.type !== 'essay' && !q.invalid && !correct(q, result.answers[q.id])) || (reviewFilter === 'unanswered' && !q.invalid && !answered(q, result.answers[q.id])));
    const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
    reviewPage = Math.min(reviewPage, pageCount - 1);
    const visible = filtered.slice(reviewPage * 20, (reviewPage + 1) * 20);
    APP.innerHTML = `<section class="result-hero ${passed ? '' : 'fail'}"><div><div class="eyebrow">EXAM REPORT / ${esc(BANKS[result.bank].title)}</div><h1>${passed ? '达到自设及格线' : '距离自设及格线还差一点'}</h1><p>${result.reason === 'timeout' ? '考试时间结束，试卷已自动提交。' : '试卷已提交。'}${essays ? ` 本卷含 ${essays} 道简答题，未纳入自动评分。` : ''}${invalid ? ` 另有 ${invalid} 道题库缺项题，不计分。` : ''}<br>此结果仅反映当前模拟试卷的客观题正确率。</p></div><div class="score-block"><strong>${result.score}%</strong><span>客观题正确率 · 自设及格线 ${result.passLine}%</span></div></section>
      <section class="metrics"><div class="panel metric"><span>客观题答对</span><strong>${result.right} / ${result.total}</strong></div><div class="panel metric"><span>答错</span><strong>${wrong}</strong></div><div class="panel metric"><span>未作答</span><strong>${unanswered}</strong></div><div class="panel metric"><span>不计分题目</span><strong>${essays + invalid}</strong></div></section>
      <section class="panel review-panel"><div class="review-top"><h2>逐题复盘</h2><div class="filters">${[['all','全部'],['wrong','错题'],['unanswered','未作答']].map(([id,label]) => `<button type="button" class="filter ${reviewFilter === id ? 'active' : ''}" data-action="filter" data-value="${id}">${label}</button>`).join('')}</div></div><div class="review-list">${visible.length ? visible.map(q => {
        const index = questions.indexOf(q) + 1;
        const isDone = answered(q, result.answers[q.id]);
        const status = q.invalid ? '题库缺项' : q.type === 'essay' ? '待自评' : !isDone ? '未作答' : correct(q, result.answers[q.id]) ? '正确' : '错误';
        const statusClass = status === '正确' ? 'correct' : status === '错误' ? 'wrong' : '';
        return `<details class="review-item"><summary class="review-summary"><span class="review-index">${String(index).padStart(2, '0')}</span><span class="review-text">${esc(q.text)}</span><span class="status ${statusClass}">${status}</span></summary><div class="review-detail"><div><strong>你的答案：</strong>${esc(answerText(q, result.answers[q.id]))}</div><div><strong>${q.type === 'essay' ? '参考答案：' : '正确答案：'}</strong>${q.invalid ? invalidText(q) : q.type === 'essay' ? '原题库未提供，请自行复盘' : esc(answerText(q, q.answer))}</div>${q.explanation ? `<div><strong>解析：</strong>${esc(q.explanation)}</div>` : ''}</div></details>`;
      }).join('') : '<div class="empty">这里暂时没有题目</div>'}</div>${pageCount > 1 ? `<div class="review-pagination"><button class="secondary" type="button" data-action="review-page" data-value="${reviewPage - 1}" ${reviewPage === 0 ? 'disabled' : ''}>上一页</button><span>${reviewPage + 1} / ${pageCount} 页 · 共 ${filtered.length} 题</span><button class="secondary" type="button" data-action="review-page" data-value="${reviewPage + 1}" ${reviewPage === pageCount - 1 ? 'disabled' : ''}>下一页</button></div>` : ''}</section><div class="result-actions"><button class="primary" type="button" data-action="retry">再考一次</button><button class="secondary" type="button" data-action="home">返回题库</button></div>`;
  }

  function render() {
    if (saved.session?.deadline && BANKS[saved.session.bank] && Date.now() >= saved.session.deadline) return submit('timeout');
    document.title = `${screen === 'home' ? '考点' : screen === 'setup' ? BANKS[setup.bank].title : screen === 'exam' ? '正在考试' : screen === 'result' ? '考试报告' : screen === 'library' ? '题库管理' : screen === 'import' ? '导入题库' : 'AI 配置'} · 本地模拟考试`;
    document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === screen));
    if (screen === 'home') renderHome();
    if (screen === 'library') renderLibrary();
    if (screen === 'import') renderImport();
    if (screen === 'settings') renderSettings();
    if (screen === 'setup') renderSetup();
    if (screen === 'exam') renderExam();
    if (screen === 'result') renderResult();
  }
  function updateTimer() {
    if (screen !== 'exam' || !saved.session) return;
    const left = remaining(saved.session);
    const el = document.getElementById('timer');
    if (el) { el.textContent = formatTime(left); el.classList.toggle('warn', left != null && left <= 300); }
    if (left === 0) submit('timeout');
  }
  function startExam() {
    const pass = Number(document.getElementById('passLine').value);
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) return toast('及格线请输入 1～100 的整数');
    setup.passLine = pass;
    if (saved.session && !confirm('已有一份未交卷的试卷。开始新考试将覆盖它，确定继续吗？')) return;
    const pool = bankQuestions(setup.bank);
    const chosen = setup.count === 'all' ? [...pool] : shuffle(pool.filter(q => q.type !== 'essay' && !q.invalid)).slice(0, setup.count);
    const now = Date.now();
    saved.session = {bank: setup.bank, ids: chosen.map(q => q.id), answers: {}, marks: {}, current: 0, duration: setup.duration, passLine: setup.passLine, startedAt: now, deadline: setup.duration ? now + setup.duration * 60000 : null};
    persist();
    screen = 'exam'; render(); window.scrollTo(0, 0);
  }

  async function saveAIConfig() {
    const payload = {
      base_url: document.getElementById('apiBase').value,
      model: document.getElementById('apiModel').value,
      api_key: document.getElementById('apiKey').value,
    };
    try {
      aiConfig = await requestJSON('/api/config', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      render(); toast('AI 配置已保存在本机');
    } catch (error) { toast(error.message); }
  }
  async function testAIConfig() {
    toast('正在测试模型连接…');
    try { await requestJSON('/api/test-connection', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}); toast('模型连接成功'); }
    catch (error) { toast(error.message); }
  }
  async function clearAIConfig() {
    if (!confirm('确定清除本机保存的 API Key 和模型设置吗？')) return;
    try { aiConfig = await requestJSON('/api/config/clear', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}); render(); toast('AI 配置已清除'); }
    catch (error) { toast(error.message); }
  }
  async function analyzeFile() {
    const file = importState.file;
    if (!file) return toast('请先选择文件');
    if (file.size > 20 * 1024 * 1024) return toast('文件不能超过 20 MB');
    importState.busy = true; importState.error = ''; importState.questions = []; renderImport();
    try {
      const data = await requestJSON(`/api/preview?filename=${encodeURIComponent(file.name)}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: file});
      importState.questions = data.questions;
      importState.warnings = data.warnings || [];
      importState.summary = data.summary;
      importState.source = data.filename;
      importState.title = file.name.replace(/\.[^.]+$/, '');
      importState.page = 0;
      importState.editingIndex = null;
      importState.editingDraft = null;
      toast(`识别出 ${data.questions.length} 道题，请核对后导入`);
    } catch (error) { importState.error = error.message; }
    finally { importState.busy = false; renderImport(); }
  }
  async function saveImportedBank() {
    if (importState.busy || !importState.questions.length) return;
    if (importState.editingDraft) return toast('请先保存正在编辑的题目');
    if (!importState.title.trim()) return toast('请填写题库名称');
    importState.busy = true; renderImport();
    try {
      const data = await requestJSON('/api/banks', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: importState.title, source: importState.source, questions: importState.questions})});
      BANKS[data.bank.id] = data.bank;
      importState = {file: null, title: '', questions: [], warnings: [], summary: null, source: '', busy: false, error: '', page: 0, editingIndex: null, editingDraft: null};
      showScreen('library'); toast(`已导入 ${data.bank.questions.length} 道题`);
    } catch (error) { importState.error = error.message; importState.busy = false; renderImport(); }
  }
  function saveEditedQuestion() {
    const draft = importState.editingDraft;
    if (!draft || !draft.text.trim()) return toast('题干不能为空');
    draft.text = draft.text.trim();
    if (draft.type === 'boolean') draft.options = ['正确', '错误'];
    if (draft.type === 'essay') { draft.options = []; draft.answer = []; }
    else {
      const oldOptions = draft.options;
      draft.options = oldOptions.map(value => value.trim()).filter(Boolean);
      draft.answer = draft.answer.filter(oldIndex => oldOptions[oldIndex]?.trim()).map(oldIndex => oldOptions.slice(0, oldIndex + 1).filter(value => value.trim()).length - 1).filter(index => index >= 0 && index < draft.options.length);
      draft.answer = [...new Set(draft.answer)].sort((a, b) => a - b);
      if (draft.type !== 'multiple') draft.answer = draft.answer.slice(0, 1);
    }
    draft.invalid = draft.type !== 'essay' && (draft.options.length < 2 || draft.answer.length === 0);
    importState.questions[importState.editingIndex] = draft;
    importState.editingIndex = null; importState.editingDraft = null;
    renderImport(); toast('题目已更新');
  }

  APP.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || !APP.contains(button)) return;
    const {action, value} = button.dataset;
    const session = saved.session;
    if (action === 'home') return goHome();
    if (action === 'nav-import') return showScreen('import');
    if (action === 'nav-library') return showScreen('library');
    if (action === 'save-config') return saveAIConfig();
    if (action === 'test-config') return testAIConfig();
    if (action === 'clear-config') return clearAIConfig();
    if (action === 'analyze-file') return analyzeFile();
    if (action === 'save-bank') return saveImportedBank();
    if (action === 'import-page') { importState.page = Number(value); renderImport(); document.querySelector('.preview-head')?.scrollIntoView({block: 'start'}); return; }
    if (action === 'edit-question') { importState.editingIndex = Number(value); importState.editingDraft = structuredClone(importState.questions[importState.editingIndex]); renderImport(); document.querySelector('.editor')?.scrollIntoView({block: 'start'}); return; }
    if (action === 'cancel-edit') { importState.editingIndex = null; importState.editingDraft = null; return renderImport(); }
    if (action === 'save-question') return saveEditedQuestion();
    if (action === 'add-option' && importState.editingDraft) { importState.editingDraft.options.push(''); return renderImport(); }
    if (action === 'edit-answer' && importState.editingDraft) {
      const selected = Number(value);
      const draft = importState.editingDraft;
      draft.answer = draft.type === 'multiple' ? draft.answer.includes(selected) ? draft.answer.filter(index => index !== selected) : [...draft.answer, selected].sort((a, b) => a - b) : [selected];
      renderImport(); document.querySelector('.editor')?.scrollIntoView({block: 'start'}); return;
    }
    if (action === 'remove-question') { if (confirm(`确定移除第 ${Number(value) + 1} 题吗？`)) { importState.questions.splice(Number(value), 1); importState.editingIndex = null; importState.editingDraft = null; renderImport(); } return; }
    if (action === 'clear-history') { if (confirm('确定清空此浏览器中的所有考试记录吗？')) { saved.history = []; persist(); render(); } return; }
    if (action === 'setup') { setup.bank = button.dataset.bank; const eligible = bankQuestions(setup.bank).filter(q => q.type !== 'essay' && !q.invalid).length; setup.count = eligible >= 50 ? 50 : eligible >= 25 ? 25 : 'all'; screen = 'setup'; render(); window.scrollTo(0, 0); return; }
    if (action === 'count') { setup.count = value === 'all' ? 'all' : Number(value); return render(); }
    if (action === 'duration') { setup.duration = Number(value); return render(); }
    if (action === 'start') return startExam();
    if (action === 'resume' && session) { screen = 'exam'; return render(); }
    if (action === 'history') { activeResult = saved.history.find(item => item.id === button.dataset.id); reviewFilter = 'all'; reviewPage = 0; screen = 'result'; render(); window.scrollTo(0, 0); return; }
    if (action === 'retry' && activeResult) { setup.bank = activeResult.bank; setup.count = activeResult.ids.length === bankQuestions(activeResult.bank).length ? 'all' : activeResult.ids.length; setup.duration = activeResult.duration; setup.passLine = activeResult.passLine; screen = 'setup'; render(); window.scrollTo(0, 0); return; }
    if (action === 'filter') { reviewFilter = value; reviewPage = 0; return render(); }
    if (action === 'review-page') { reviewPage = Number(value); render(); document.querySelector('.review-panel')?.scrollIntoView({block: 'start'}); return; }
    if (!session) return;
    const q = paperQuestions(session)[session.current];
    if (action === 'answer') {
      const index = Number(value);
      const old = session.answers[q.id] || [];
      session.answers[q.id] = q.type === 'multiple' ? (old.includes(index) ? old.filter(v => v !== index) : [...old, index].sort()) : [index];
      persist(); return render();
    }
    if (action === 'mark') { session.marks[q.id] = !session.marks[q.id]; persist(); return render(); }
    if (action === 'clear') { delete session.answers[q.id]; persist(); return render(); }
    if (action === 'prev') session.current = Math.max(0, session.current - 1);
    if (action === 'next') { if (session.current === session.ids.length - 1) return submit(); session.current++; }
    if (action === 'jump') session.current = Number(value);
    if (action === 'submit') return submit();
    persist(); render();
  });
  APP.addEventListener('input', event => {
    if (event.target.id === 'importTitle') importState.title = event.target.value;
    if (importState.editingDraft) {
      if (event.target.id === 'editText') importState.editingDraft.text = event.target.value;
      if (event.target.id === 'editExplanation') importState.editingDraft.explanation = event.target.value;
      if (event.target.dataset.editOption !== undefined) importState.editingDraft.options[Number(event.target.dataset.editOption)] = event.target.value;
    }
    if (event.target.id === 'essayAnswer' && saved.session) {
      const q = paperQuestions(saved.session)[saved.session.current];
      saved.session.answers[q.id] = event.target.value;
      persist();
    }
    if (event.target.id === 'passLine') setup.passLine = Number(event.target.value);
  });
  APP.addEventListener('change', event => {
    if (event.target.id === 'importFile') {
      importState.file = event.target.files?.[0] || null;
      importState.questions = []; importState.error = ''; importState.source = '';
      renderImport();
    }
    if (event.target.id === 'editType' && importState.editingDraft) {
      const draft = importState.editingDraft;
      draft.type = event.target.value;
      if (draft.type === 'boolean') { draft.options = ['正确', '错误']; draft.answer = []; }
      else if (draft.type === 'essay') { draft.options = []; draft.answer = []; }
      else if (draft.options.length < 2) { draft.options = ['', '', '', '']; draft.answer = []; }
      renderImport();
    }
  });
  document.getElementById('brandButton').addEventListener('click', goHome);
  document.querySelector('.main-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-nav]');
    if (button) showScreen(button.dataset.nav);
  });
  timerHandle = setInterval(updateTimer, 1000);
  loadServerData();
})();
