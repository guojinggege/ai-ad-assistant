// 数据分析 · 上传 & 数据集列表
// 暴露：window.DP.renderUploadPane(container, ctx) → { refresh() }

(function () {
  window.DP = window.DP || {};

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  }

  function renderDatasetsList(container, ctx) {
    if (!ctx.datasets.length) {
      container.innerHTML = '<div class="dp-empty">暂无数据集，请先上传一个 .xlsx / .xls / .csv 文件</div>';
      return;
    }
    container.innerHTML = `
      <table class="dp-datasets-table">
        <thead>
          <tr><th>名称</th><th>原文件</th><th>行</th><th>列</th><th>大小</th><th>创建时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${ctx.datasets.map((ds) => `
            <tr data-id="${escapeHtml(ds.id)}">
              <td>${escapeHtml(ds.name)}</td>
              <td style="opacity:.7">${escapeHtml(ds.originalName)}</td>
              <td>${ds.rowCount}</td>
              <td>${(ds.columns || []).length}</td>
              <td>${(ds.size / 1024).toFixed(1)} KB</td>
              <td style="opacity:.7">${new Date(ds.createdAt).toLocaleString()}</td>
              <td class="dp-row-actions">
                <button class="btn-mini" data-act="dashboard">看板</button>
                <button class="btn-mini" data-act="query">查询</button>
                <button class="btn-mini" data-act="delete">删除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.currentTarget.closest('tr');
        const id = tr.dataset.id;
        const act = ev.currentTarget.dataset.act;
        if (act === 'dashboard') {
          await ctx.setCurrentDataset(id);
          ctx.switchTab('dashboard');
        } else if (act === 'query') {
          await ctx.setCurrentDataset(id);
          ctx.switchTab('query');
        } else if (act === 'delete') {
          if (!confirm('确定删除此数据集？此操作不可恢复。')) return;
          try {
            await ctx.api('DELETE', `/api/data/datasets/${id}`);
            ctx.toast('已删除', 'success');
            if (ctx.currentDatasetId === id) await ctx.setCurrentDataset(null);
            await ctx.reloadDatasets();
          } catch (e) {
            ctx.toast(`删除失败: ${e.message}`, 'error');
          }
        }
      });
    });
  }

  window.DP.renderUploadPane = function (container, ctx) {
    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-header"><span>导入数据</span></div>
        <div class="dp-dropzone" id="dpDropzone">
          <div><strong>拖拽 .xlsx / .xls / .csv 到此处</strong></div>
          <div style="margin-top:6px; font-size:12px; opacity:.7;">或点击选择文件 · 单文件最大 20MB</div>
          <input type="file" id="dpFileInput" accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" />
        </div>
        <div id="dpUploadStatus" style="margin-top:10px; font-size:12px; color:var(--fg-2, #a3acba); min-height:18px;"></div>
      </div>
      <div class="panel-card" style="margin-top:16px;">
        <div class="panel-header"><span>已导入数据集</span></div>
        <div id="dpDatasetsList"></div>
      </div>
    `;

    const dropzone = container.querySelector('#dpDropzone');
    const fileInput = container.querySelector('#dpFileInput');
    const status = container.querySelector('#dpUploadStatus');
    const listEl = container.querySelector('#dpDatasetsList');

    dropzone.addEventListener('click', () => fileInput.click());
    ['dragenter', 'dragover'].forEach((evName) => {
      dropzone.addEventListener(evName, (ev) => { ev.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach((evName) => {
      dropzone.addEventListener(evName, (ev) => { ev.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', (ev) => {
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    fileInput.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (f) handleFile(f);
      fileInput.value = '';
    });

    async function handleFile(file) {
      const MAX = 20 * 1024 * 1024;
      if (file.size > MAX) {
        ctx.toast(`文件超过 20MB 限制 (${(file.size / 1024 / 1024).toFixed(1)}MB)`, 'error');
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      status.textContent = `正在上传 ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`;
      try {
        const r = await ctx.api('POST', '/api/data/upload', fd, true);
        status.textContent = `已导入 ${r.dataset.name}，共 ${r.dataset.rowCount} 行 × ${(r.dataset.columns || []).length} 列`;
        ctx.toast(`已导入「${r.dataset.name}」`, 'success');
        await ctx.reloadDatasets();
        await ctx.setCurrentDataset(r.dataset.id);
      } catch (e) {
        status.textContent = '';
        ctx.toast(`上传失败: ${e.message}`, 'error');
      }
    }

    renderDatasetsList(listEl, ctx);

    return {
      refresh: () => renderDatasetsList(listEl, ctx),
    };
  };
})();
