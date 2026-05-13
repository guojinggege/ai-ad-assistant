// 数据分析模块前端入口（唯一被 index.html 加载的 script）
// 启动流程：
//   1) 动态注入 /data-platform/styles.css
//   2) 串行 await 加载 upload/dashboard/query-builder 三个子模块（各自挂到 window.DP）
//   3) 渲染 #dataView 内的 tab 切换容器
//   4) 初始化"上传"面板，拉一次 datasets 列表

(function () {
  const STYLE_HREF = '/data-platform/styles.css';
  const SUB_SCRIPTS = [
    '/data-platform/upload.js',
    '/data-platform/dashboard.js',
    '/data-platform/query-builder.js',
  ];

  function loadStylesheet(href) {
    if (document.querySelector(`link[data-dp="1"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.dp = '1';
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('加载失败: ' + src));
      document.head.appendChild(s);
    });
  }

  function toast(message, kind) {
    const t = document.createElement('div');
    t.className = `dp-toast${kind ? ' ' + kind : ''}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity .25s';
      setTimeout(() => t.remove(), 280);
    }, 3500);
  }

  async function api(method, url, body, isFormData) {
    const opts = { method };
    if (body) {
      if (isFormData) {
        opts.body = body;
      } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
    }
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      throw new Error('网络错误: ' + e.message);
    }
    let j = null;
    try { j = await r.json(); } catch (_) { /* 非 JSON */ }
    if (!r.ok || (j && j.ok === false)) {
      const msg = (j && j.error && j.error.message) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return j || {};
  }

  const state = {
    datasets: [],
    currentDatasetId: null,
    currentDataset: null,
    activeTab: 'upload',
    uploadRender: null,
  };

  function updateCurrentLabel() {
    const label = document.getElementById('dpCurrent');
    if (!label) return;
    label.textContent = state.currentDataset
      ? `当前：${state.currentDataset.name} (${state.currentDataset.rowCount} 行 × ${(state.currentDataset.columns || []).length} 列)`
      : '未选数据集';
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.dp-tab').forEach((b) => b.classList.toggle('active', b.dataset.dpTab === tab));
    document.querySelectorAll('.dp-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.dpPane !== tab));
    if (tab === 'dashboard') {
      window.DP.renderDashboardPane(document.querySelector('[data-dp-pane="dashboard"]'), ctx);
    } else if (tab === 'query') {
      window.DP.renderQueryPane(document.querySelector('[data-dp-pane="query"]'), ctx);
    }
  }

  const ctx = {
    get datasets() { return state.datasets; },
    get currentDatasetId() { return state.currentDatasetId; },
    get currentDataset() { return state.currentDataset; },
    api,
    toast,
    setCurrentDataset: async (id) => {
      state.currentDatasetId = id || null;
      state.currentDataset = null;
      if (id) {
        try {
          const r = await api('GET', `/api/data/datasets/${id}`);
          state.currentDataset = r.dataset || null;
        } catch (e) {
          toast(`数据集详情加载失败: ${e.message}`, 'error');
        }
      }
      updateCurrentLabel();
    },
    reloadDatasets: async () => {
      try {
        const r = await api('GET', '/api/data/datasets');
        state.datasets = r.items || [];
        if (state.uploadRender && state.uploadRender.refresh) state.uploadRender.refresh();
      } catch (e) {
        toast(`数据集列表加载失败: ${e.message}`, 'error');
      }
    },
    switchTab,
  };

  async function init() {
    const container = document.getElementById('dataView');
    if (!container) return; // 防止页面没注入 view 容器时报错

    loadStylesheet(STYLE_HREF);

    try {
      for (const src of SUB_SCRIPTS) await loadScript(src);
    } catch (e) {
      container.innerHTML = `<div class="dp-empty">数据分析模块子脚本加载失败：${e.message}</div>`;
      return;
    }

    container.innerHTML = `
      <div class="dp-toolbar">
        <div class="dp-tabs">
          <button class="dp-tab active" data-dp-tab="upload" type="button">📥 上传 &amp; 数据集</button>
          <button class="dp-tab" data-dp-tab="dashboard" type="button">📊 自动看板</button>
          <button class="dp-tab" data-dp-tab="query" type="button">🔎 查询库</button>
        </div>
        <div id="dpCurrent">未选数据集</div>
      </div>
      <div class="dp-panel" data-dp-pane="upload"></div>
      <div class="dp-panel hidden" data-dp-pane="dashboard"></div>
      <div class="dp-panel hidden" data-dp-pane="query"></div>
    `;

    document.querySelectorAll('.dp-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.dpTab));
    });

    state.uploadRender = window.DP.renderUploadPane(
      document.querySelector('[data-dp-pane="upload"]'),
      ctx
    );

    await ctx.reloadDatasets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // defer 脚本会在 DOMContentLoaded 之后跑；这里兜底支持热加载
    init();
  }
})();
