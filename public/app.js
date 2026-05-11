const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const pageTitle = $('#pageTitle');
const navButtons = $$('.nav-item');
const views = $$('.view');
const logPanel = $('#logs');
const logPageList = $('#logPageList');
const connState = $('#connState');
const logCount = $('#logCount');
const btnStatusReload = $('#btnStatusReload');
const btnLogin = $('#btnLogin');
const btnClearLogs = $('#btnClearLogs');
const adsSearch = $('#adsSearch');
const adsStatusFilter = $('#adsStatusFilter');
const adsSlotFilter = $('#adsSlotFilter');
const btnNewAd = $('#btnNewAd');
const btnNewSlot = $('#btnNewSlot');
const slotGrid = $('#slotGrid');
const mediaGrid = $('#mediaGrid');
const mediaDropzone = $('#uploadDropzone');
const mediaFileInput = $('#mediaFileInput');
const tasksTableBody = $('#tasksTable tbody');
const recentExecutionsTable = $('#recentExecutionsTable tbody');
const failedTasksTable = $('#failedTasksTable tbody');
const dashboardCards = $('#dashboardCards');
const trendChart = $('#trendChart');
const pieChart = $('#pieChart');
const accountAuth = $('#accountAuth');
const accountAI = $('#accountAI');
const accountHeadless = $('#accountHeadless');
const accountAdminUrl = $('#accountAdminUrl');
const assistantError = $('#assistantError');
const assistantHistory = $('#assistantHistory');
const authStatus = $('#authStatus');
const aiStatus = $('#aiStatus');
const inputOpenAI = $('#inputOpenAI');
const inputClaude = $('#inputClaude');
const inputAdminUrl = $('#inputAdminUrl');
const inputLoginUrl = $('#inputLoginUrl');
const inputHeadless = $('#inputHeadless');
const inputRetry = $('#inputRetry');
const inputTimeout = $('#inputTimeout');
const inputBrowserPath = $('#inputBrowserPath');
const btnSaveSettings = $('#btnSaveSettings');
const btnReloadSettings = $('#btnReloadSettings');
const modalOverlay = $('#modalOverlay');
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const modalClose = $('#modalClose');
const messagesEl = $('#messages');
const composerEl = $('#composer');
const inputEl = $('#input');
const sendBtn = $('#send');

const PAGE_NAMES = {
  dashboard: '控制台',
  ads: '广告管理',
  slots: '广告位管理',
  media: '素材中心',
  tasks: '批量任务',
  assistant: 'AI助手',
  logs: '执行日志',
  account: '账号状态',
  settings: '设置',
};

const state = {
  logs: [],
  ads: [],
  slots: [],
  media: [],
  tasks: [],
  settings: {},
};

function setActiveView(viewKey) {
  views.forEach((view) => view.classList.toggle('active', view.id === `${viewKey}View`));
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === viewKey));
  pageTitle.textContent = PAGE_NAMES[viewKey] || 'AI 平台';
}

function formatTime(value) {
  const date = new Date(value);
  return isNaN(date) ? '-' : date.toLocaleString();
}

function addLogEntry(level, text) {
  const row = document.createElement('div');
  row.className = 'log-item';
  row.innerHTML = `<strong>${level}</strong> ${formatTime(Date.now())} · ${text}`;
  logPanel.prepend(row);
  logPageList.prepend(row.cloneNode(true));
  state.logs.unshift({ level, text, ts: Date.now() });
  if (state.logs.length > 200) state.logs.length = 200;
  logCount.textContent = state.logs.length;
}

function renderDashboard(data) {
  dashboardCards.innerHTML = '';
  const metrics = [
    { label: '今日上架广告', value: data.metrics.todayCreated },
    { label: '今日下架广告', value: data.metrics.todayOffline },
    { label: '在线广告', value: data.metrics.onlineAds },
    { label: '广告位数量', value: data.metrics.slotCount },
  ];
  metrics.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="metric-label">${item.label}</div><div class="metric-value">${item.value}</div>`;
    dashboardCards.appendChild(card);
  });

  trendChart.innerHTML = '';
  const maxValue = Math.max(...data.charts.trend.map((item) => item.value), 1);
  data.charts.trend.forEach((item) => {
    const height = Math.round((item.value / maxValue) * 160) + 20;
    const bar = document.createElement('div');
    bar.style.height = `${height}px`;
    bar.title = `${item.label} ${item.value}`;
    trendChart.appendChild(bar);
  });

  const total = data.charts.distribution.reduce((sum, item) => sum + item.value, 0) || 1;
  const online = data.charts.distribution[0]?.value || 0;
  const offline = data.charts.distribution[1]?.value || 0;
  pieChart.innerHTML = `<div data-label="在线 ${online} / 下线 ${offline}"></div>`;

  recentExecutionsTable.innerHTML = data.recentExecutions
    .map((task) => `<tr><td>${task.title}</td><td><span class="badge-pill ${task.status}">${task.status}</span></td><td>${formatTime(task.startedAt)}</td></tr>`)
    .join('');

  failedTasksTable.innerHTML = data.failedTasks
    .map((task) => `<tr><td>${task.title}</td><td>${task.result?.reason || '-'}</td><td>${formatTime(task.finishedAt)}</td></tr>`)
    .join('');
}

async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const data = await res.json();
  renderDashboard(data);
}

async function loadAds() {
  const query = new URLSearchParams({
    search: adsSearch.value.trim(),
    status: adsStatusFilter.value,
    slot: adsSlotFilter.value,
  });
  const res = await fetch(`/api/ads?${query}`);
  const list = await res.json();
  state.ads = list;
  renderAds();
}

function renderAds() {
  const tbody = $('#adsTable tbody');
  tbody.innerHTML = state.ads
    .map((ad) => `<tr>
        <td>${ad.name}</td>
        <td><span class="badge-pill ${ad.status}">${ad.status === 'online' ? '上架' : '下架'}</span></td>
        <td>${ad.slot}</td>
        <td class="breakable"><a href="${ad.url}" target="_blank">${ad.url}</a></td>
        <td>${ad.code || '-'}</td>
        <td>${formatTime(ad.createdAt)}</td>
        <td>${formatTime(ad.updatedAt)}</td>
        <td>${ad.order}</td>
        <td>
          <button class="action-button" data-action="edit" data-id="${ad.id}">编辑</button>
          <button class="action-button" data-action="delete" data-id="${ad.id}">删除</button>
          <button class="action-button" data-action="toggle" data-id="${ad.id}">${ad.status === 'online' ? '暂停' : '启用'}</button>
        </td>
      </tr>`)
    .join('');
}

function renderSlotFilter() {
  const slots = state.slots;
  const options = new Set(['']);
  slots.forEach((slot) => options.add(slot.name));
  adsSlotFilter.innerHTML = Array.from(options)
    .map((value) => `<option value="${value}">${value || '全部广告位'}</option>`)
    .join('');
}

async function loadSlots() {
  const res = await fetch('/api/slots');
  state.slots = await res.json();
  renderSlots();
  renderSlotFilter();
}

function renderSlots() {
  slotGrid.innerHTML = state.slots
    .map((slot) => `<div class="slot-card">
        <div class="slot-title">${slot.name}</div>
        <div class="slot-meta">
          <div>尺寸：${slot.size}</div>
          <div>位置：${slot.position}</div>
          <div>状态：${slot.status === 'active' ? '运行中' : '暂停'}</div>
          <div>当前广告：${slot.currentAds}</div>
        </div>
        <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="action-button" data-slot-action="edit" data-id="${slot.id}">编辑</button>
          <button class="action-button" data-slot-action="delete" data-id="${slot.id}">删除</button>
        </div>
      </div>`)
    .join('');
}

async function loadMedia() {
  const res = await fetch('/api/media');
  state.media = await res.json();
  renderMedia();
}

function renderMedia() {
  mediaGrid.innerHTML = state.media
    .map((item) => `<div class="media-card">
        <div class="media-preview">${item.type === 'video' ? '🎬' : '🖼️'}</div>
        <div class="media-body">
          <strong>${item.fileName}</strong>
          <div>类型：${item.type}</div>
          <div>尺寸：${item.dimensions}</div>
          <div>大小：${(item.size / 1024).toFixed(1)} KB</div>
          <div>分类：${item.category}</div>
          <div>时间：${formatTime(item.createdAt)}</div>
          <button class="action-button" data-media-delete="${item.id}">删除</button>
        </div>
      </div>`)
    .join('');
}

async function loadTasks() {
  const res = await fetch('/api/tasks');
  state.tasks = await res.json();
  renderTasks();
  updateAssistantHistory();
}

function renderTasks() {
  tasksTableBody.innerHTML = state.tasks
    .map((task) => `<tr>
      <td>${task.title}</td>
      <td>${task.action}</td>
      <td><span class="badge-pill ${task.status}">${task.status}</span></td>
      <td>${task.progress}%</td>
      <td>${formatTime(task.startedAt)}</td>
      <td>${task.finishedAt ? formatTime(task.finishedAt) : '-'}</td>
    </tr>`)
    .join('');
}

function updateAssistantHistory() {
  assistantHistory.textContent = `${state.tasks.length} 条历史任务`;
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  state.settings = await res.json();
  inputOpenAI.value = state.settings.openAIKey || '';
  inputClaude.value = state.settings.claudeApi || '';
  inputAdminUrl.value = state.settings.adminUrl || '';
  inputLoginUrl.value = state.settings.loginUrl || '';
  inputHeadless.value = state.settings.headless ? 'true' : 'false';
  inputRetry.value = state.settings.autoRetry ?? 1;
  inputTimeout.value = state.settings.timeout ?? 60;
  inputBrowserPath.value = state.settings.browserPath || '';
}

async function saveSettings() {
  const payload = {
    openAIKey: inputOpenAI.value.trim(),
    claudeApi: inputClaude.value.trim(),
    adminUrl: inputAdminUrl.value.trim(),
    loginUrl: inputLoginUrl.value.trim(),
    headless: inputHeadless.value === 'true',
    autoRetry: Number(inputRetry.value),
    timeout: Number(inputTimeout.value),
    browserPath: inputBrowserPath.value.trim(),
  };
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (res.ok) {
    addLogEntry('Info', '设置已保存');
    state.settings = result;
    updateAccountStatus();
  } else {
    addLogEntry('Error', result.error || '保存设置失败');
  }
}

function updateAccountStatus(status = {}) {
  accountAuth.textContent = status.authReady ? '已登录' : '未登录';
  accountAI.textContent = status.hasOpenAIKey ? 'OpenAI 已配置' : '本地规则模式';
  accountHeadless.textContent = status.headless ? '无头运行' : '有头运行';
  accountAdminUrl.textContent = state.settings.adminUrl || '未配置';
  authStatus.textContent = status.authReady ? '已就绪' : '未保存登录态';
  aiStatus.textContent = status.hasOpenAIKey ? 'OpenAI' : '本地规则';
}

async function refreshStatus() {
  const res = await fetch('/api/status');
  const status = await res.json();
  updateAccountStatus(status);
  return status;
}

function openModal(title, contentHtml) {
  modalTitle.textContent = title;
  modalBody.innerHTML = contentHtml;
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalBody.innerHTML = '';
}

function buildAdForm(mode, ad = {}) {
  return `
    <label>广告名称<input id="adName" class="input" value="${ad.name || ''}" placeholder="例如：测试广告" /></label>
    <label>广告链接<input id="adUrl" class="input" value="${ad.url || ''}" placeholder="https://example.com" /></label>
    <label>验证码<input id="adCode" class="input" value="${ad.code || ''}" placeholder="可选" /></label>
    <label>广告位<select id="adSlot" class="select">
      ${state.slots.map((slot) => `<option value="${slot.name}" ${slot.name === ad.slot ? 'selected' : ''}>${slot.name}</option>`).join('')}
    </select></label>
    <label>状态<select id="adStatus" class="select">
      <option value="online" ${ad.status === 'online' ? 'selected' : ''}>上架</option>
      <option value="offline" ${ad.status === 'offline' ? 'selected' : ''}>下架</option>
    </select></label>
    <div class="settings-actions">
      <button class="action-button primary" id="modalSaveAd">保存</button>
      <button class="action-button" id="modalCancelAd">取消</button>
    </div>
  `;
}

function buildSlotForm(mode, slot = {}) {
  return `
    <label>广告位名称<input id="slotName" class="input" value="${slot.name || ''}" placeholder="例如：首页Banner" /></label>
    <label>尺寸<input id="slotSize" class="input" value="${slot.size || ''}" placeholder="例如：1200x250" /></label>
    <label>页面位置<input id="slotPosition" class="input" value="${slot.position || ''}" placeholder="例如：首页顶部" /></label>
    <label>状态<select id="slotStatus" class="select">
      <option value="active" ${slot.status === 'active' ? 'selected' : ''}>活动</option>
      <option value="inactive" ${slot.status === 'inactive' ? 'selected' : ''}>暂停</option>
    </select></label>
    <label>当前广告数<input id="slotCurrentAds" class="input" type="number" min="0" value="${slot.currentAds ?? 0}" /></label>
    <div class="settings-actions">
      <button class="action-button primary" id="modalSaveSlot">保存</button>
      <button class="action-button" id="modalCancelSlot">取消</button>
    </div>
  `;
}

function listenModalActions() {
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (event) => {
    if (event.target === modalOverlay) closeModal();
  });
}

async function openAdModal(ad = null) {
  openModal(ad ? '编辑广告' : '新建广告', buildAdForm(ad));
  $('#modalCancelAd').addEventListener('click', closeModal);
  $('#modalSaveAd').addEventListener('click', async () => {
    const payload = {
      name: $('#adName').value.trim(),
      url: $('#adUrl').value.trim(),
      code: $('#adCode').value.trim(),
      slot: $('#adSlot').value,
      status: $('#adStatus').value,
    };
    if (!payload.name || !payload.url) {
      addLogEntry('Warn', '广告名称和链接为必填项');
      return;
    }
    try {
      if (ad) {
        await fetch(`/api/ads/${ad.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      await loadAds();
      await loadDashboard();
      closeModal();
    } catch (error) {
      addLogEntry('Error', error.message);
    }
  });
}

async function openSlotModal(slot = null) {
  openModal(slot ? '编辑广告位' : '新建广告位', buildSlotForm(slot));
  $('#modalCancelSlot').addEventListener('click', closeModal);
  $('#modalSaveSlot').addEventListener('click', async () => {
    const payload = {
      name: $('#slotName').value.trim(),
      size: $('#slotSize').value.trim(),
      position: $('#slotPosition').value.trim(),
      status: $('#slotStatus').value,
      currentAds: Number($('#slotCurrentAds').value),
    };
    if (!payload.name || !payload.size || !payload.position) {
      addLogEntry('Warn', '广告位名称/尺寸/位置为必填项');
      return;
    }
    try {
      if (slot) {
        await fetch(`/api/slots/${slot.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch('/api/slots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      await loadSlots();
      await loadDashboard();
      closeModal();
    } catch (error) {
      addLogEntry('Error', error.message);
    }
  });
}

async function deleteAd(id) {
  if (!confirm('确认删除该广告吗？')) return;
  await fetch(`/api/ads/${id}`, { method: 'DELETE' });
  await loadAds();
  await loadDashboard();
}

async function toggleAd(id, currentStatus) {
  await fetch('/api/ads/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], action: currentStatus === 'online' ? 'off' : 'on' }) });
  await loadAds();
  await loadDashboard();
}

async function deleteSlot(id) {
  if (!confirm('确认删除该广告位吗？')) return;
  await fetch(`/api/slots/${id}`, { method: 'DELETE' });
  await loadSlots();
  await loadDashboard();
}

async function deleteMedia(id) {
  if (!confirm('确认删除该素材吗？')) return;
  await fetch(`/api/media/${id}`, { method: 'DELETE' });
  await loadMedia();
}

async function uploadMediaFiles(files) {
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileData: base64, category: '默认' }),
      });
      await loadMedia();
      await loadDashboard();
    };
    reader.readAsDataURL(file);
  }
}

function initEvents() {
  navButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveView(button.dataset.view));
  });

  btnStatusReload.addEventListener('click', () => {
    refreshStatus();
    loadDashboard();
  });

  btnLogin.addEventListener('click', async () => {
    if (!confirm('将打开浏览器进行后台登录，登录成功后会保存登录态。继续？')) return;
    btnLogin.disabled = true;
    try {
      await fetch('/api/login', { method: 'POST' });
      await refreshStatus();
    } finally {
      btnLogin.disabled = false;
    }
  });

  btnClearLogs.addEventListener('click', () => {
    logPanel.innerHTML = '';
    logPageList.innerHTML = '';
    state.logs = [];
    logCount.textContent = '0';
  });

  adsSearch.addEventListener('input', debounce(loadAds, 300));
  adsStatusFilter.addEventListener('change', loadAds);
  adsSlotFilter.addEventListener('change', loadAds);
  btnNewAd.addEventListener('click', () => openAdModal());

  slotGrid.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-slot-action]');
    if (!target) return;
    const id = target.dataset.id;
    const slot = state.slots.find((item) => item.id === id);
    if (target.dataset.slotAction === 'edit') openSlotModal(slot);
    if (target.dataset.slotAction === 'delete') deleteSlot(id);
  });

  $('#adsTable tbody').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    const ad = state.ads.find((item) => item.id === id);
    if (!action || !ad) return;
    if (action === 'edit') openAdModal(ad);
    if (action === 'delete') deleteAd(id);
    if (action === 'toggle') toggleAd(id, ad.status);
  });

  mediaGrid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-media-delete]');
    if (!button) return;
    deleteMedia(button.dataset.mediaDelete);
  });

  mediaDropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    await uploadMediaFiles(files);
  });

  mediaDropzone.addEventListener('dragover', (event) => event.preventDefault());
  mediaFileInput.addEventListener('change', async (event) => {
    await uploadMediaFiles(Array.from(event.target.files));
    mediaFileInput.value = '';
  });

  btnNewSlot.addEventListener('click', () => openSlotModal());
  btnSaveSettings.addEventListener('click', saveSettings);
  btnReloadSettings.addEventListener('click', loadSettings);
  listenModalActions();

  composerEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    addAssistantMessage('user', text);
    inputEl.value = '';
    sendBtn.disabled = true;
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        addAssistantMessage('assistant', `❌ ${error.error || res.statusText}`);
        sendBtn.disabled = false;
      }
    } catch (e) {
      addAssistantMessage('assistant', `❌ 网络错误：${e.message}`);
      sendBtn.disabled = false;
    }
  });

  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      composerEl.requestSubmit();
    }
  });
}

function addAssistantMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(null, args), wait);
  };
}

function handleEventStream(event) {
  const { type, data } = event;
  if (type === 'log') addLogEntry('Info', data.message);
  if (type === 'error') addLogEntry('Error', data.message);
  if (type === 'user') addLogEntry('User', data.message);
  if (type === 'intent') addLogEntry('Intent', `${data.action} ${JSON.stringify(data.params)}`);
  if (type === 'result') addLogEntry('Result', JSON.stringify(data.result));
  if (type === 'task') {
    if (data.task) {
      state.tasks = [data.task, ...state.tasks.filter((item) => item.id !== data.task.id)];
      renderTasks();
      updateAssistantHistory();
    }
  }
}

function connectStream() {
  const es = new EventSource('/api/events');
  es.onopen = () => {
    connState.textContent = '已连接';
  };
  es.onerror = () => {
    connState.textContent = '断线，重连中...';
  };
  es.onmessage = (message) => {
    try {
      const payload = JSON.parse(message.data);
      handleEventStream(payload);
    } catch (e) {
      console.warn('事件解析失败', e);
    }
  };
}

async function init() {
  initEvents();
  await refreshStatus();
  await loadSettings();
  await Promise.all([loadDashboard(), loadAds(), loadSlots(), loadMedia(), loadTasks()]);
  connectStream();
}

init().catch((error) => {
  console.error(error);
  addLogEntry('Error', error.message);
});
