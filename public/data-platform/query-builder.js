// 数据分析 · 查询库（可视化条件 + 分组 + 聚合 + 模板）
// 暴露：window.DP.renderQueryPane(container, ctx)

(function () {
  window.DP = window.DP || {};

  const OPS = ['sum', 'avg', 'count', 'min', 'max'];
  const FILTER_OPS = ['=', '!=', '>', '>=', '<', '<=', 'contains'];

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  }

  function formatCell(v) {
    if (v === null || v === undefined) return '-';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    if (typeof v === 'number' && isFinite(v)) {
      if (Math.abs(v) >= 10000) return v.toLocaleString();
      if (!Number.isInteger(v)) return v.toFixed(2);
    }
    return s;
  }

  function columnsOptions(columns, selected) {
    return columns.map((c) =>
      `<option value="${escapeHtml(c.key)}"${c.key === selected ? ' selected' : ''}>${escapeHtml(c.header)} <small>(${c.type})</small></option>`
    ).join('');
  }

  window.DP.renderQueryPane = async function (container, ctx) {
    container.innerHTML = '';
    if (!ctx.currentDatasetId) {
      container.innerHTML = '<div class="dp-empty">请先在「上传 & 数据集」选择一个数据集</div>';
      return;
    }
    const meta = ctx.currentDataset;
    if (!meta || !Array.isArray(meta.columns) || !meta.columns.length) {
      container.innerHTML = '<div class="dp-empty">数据集元数据未加载</div>';
      return;
    }

    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <span>${escapeHtml(meta.name)} · 查询库</span>
          <div style="display:flex;gap:6px;">
            <button class="btn-mini" id="dpLoadTemplates">载入模板</button>
            <button class="btn-mini" id="dpSaveTemplate">另存为模板</button>
          </div>
        </div>

        <div class="dp-section-title">过滤条件</div>
        <div id="dpFilters"></div>
        <button class="btn-mini" id="dpAddFilter">+ 添加条件</button>

        <div class="dp-section-title">分组 (Group By)</div>
        <div id="dpGroups"></div>
        <button class="btn-mini" id="dpAddGroup">+ 添加分组列</button>

        <div class="dp-section-title">聚合</div>
        <div id="dpAggs"></div>
        <button class="btn-mini" id="dpAddAgg">+ 添加聚合</button>

        <div class="dp-section-title">排序 & 数量</div>
        <div class="dp-query-row">
          <select id="dpOrderCol"></select>
          <select id="dpOrderDir">
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
          <span style="margin-left:8px;">Limit：</span>
          <input type="number" id="dpLimit" value="100" min="1" max="10000" style="width:90px;" />
        </div>

        <div class="dp-query-row" style="margin-top:14px;">
          <button class="action-button primary" id="dpRun">执行查询</button>
          <span id="dpQueryStatus" style="margin-left:10px;font-size:13px;color:var(--fg-2,#a3acba);"></span>
        </div>
      </div>

      <div class="panel-card" style="margin-top:16px;">
        <div class="panel-header"><span>结果</span></div>
        <div id="dpResults"><div class="dp-empty">点击「执行查询」查看结果</div></div>
      </div>
    `;

    const filtersEl = container.querySelector('#dpFilters');
    const groupsEl = container.querySelector('#dpGroups');
    const aggsEl = container.querySelector('#dpAggs');
    const orderCol = container.querySelector('#dpOrderCol');
    const orderDir = container.querySelector('#dpOrderDir');
    const limitEl = container.querySelector('#dpLimit');
    const statusEl = container.querySelector('#dpQueryStatus');
    const resultsEl = container.querySelector('#dpResults');

    function refreshOrderOptions(selected) {
      orderCol.innerHTML = '<option value="">不排序</option>' +
        meta.columns.map((c) => `<option value="${escapeHtml(c.key)}"${c.key === selected ? ' selected' : ''}>${escapeHtml(c.header)}</option>`).join('');
    }
    refreshOrderOptions();

    function addFilter(initial) {
      const row = document.createElement('div');
      row.className = 'dp-query-row dp-filter-row';
      row.innerHTML = `
        <select class="dp-filter-col">${columnsOptions(meta.columns, initial?.column)}</select>
        <select class="dp-filter-op">${FILTER_OPS.map((o) => `<option value="${o}"${o === initial?.op ? ' selected' : ''}>${o}</option>`).join('')}</select>
        <input class="dp-filter-val" placeholder="值" value="${escapeHtml(initial?.value || '')}" />
        <button class="btn-mini dp-remove" type="button">×</button>
      `;
      row.querySelector('.dp-remove').addEventListener('click', () => row.remove());
      filtersEl.appendChild(row);
    }

    function addGroup(initialKey) {
      const row = document.createElement('div');
      row.className = 'dp-query-row dp-group-row';
      row.innerHTML = `
        <select class="dp-group-col">${columnsOptions(meta.columns, initialKey)}</select>
        <button class="btn-mini dp-remove" type="button">×</button>
      `;
      row.querySelector('.dp-remove').addEventListener('click', () => row.remove());
      groupsEl.appendChild(row);
    }

    function addAgg(initial) {
      const row = document.createElement('div');
      row.className = 'dp-query-row dp-agg-row';
      row.innerHTML = `
        <select class="dp-agg-op">${OPS.map((o) => `<option value="${o}"${o === initial?.op ? ' selected' : ''}>${o}</option>`).join('')}</select>
        <select class="dp-agg-col">${columnsOptions(meta.columns, initial?.column)}</select>
        <button class="btn-mini dp-remove" type="button">×</button>
      `;
      row.querySelector('.dp-remove').addEventListener('click', () => row.remove());
      aggsEl.appendChild(row);
    }

    container.querySelector('#dpAddFilter').addEventListener('click', () => addFilter());
    container.querySelector('#dpAddGroup').addEventListener('click', () => addGroup());
    container.querySelector('#dpAddAgg').addEventListener('click', () => addAgg());

    // 默认放一个 agg 行（count + 第一列）
    addAgg({ op: 'count', column: meta.columns[0]?.key });

    function collectSpec() {
      const filters = [...filtersEl.querySelectorAll('.dp-filter-row')]
        .map((r) => ({
          column: r.querySelector('.dp-filter-col').value,
          op: r.querySelector('.dp-filter-op').value,
          value: r.querySelector('.dp-filter-val').value,
        }))
        .filter((f) => f.column && f.value !== '');
      const groupBy = [...groupsEl.querySelectorAll('.dp-group-row')].map((r) => r.querySelector('.dp-group-col').value);
      const aggregates = [...aggsEl.querySelectorAll('.dp-agg-row')].map((r) => ({
        op: r.querySelector('.dp-agg-op').value,
        column: r.querySelector('.dp-agg-col').value,
      }));
      return {
        filters,
        groupBy,
        aggregates,
        orderBy: orderCol.value ? { column: orderCol.value, direction: orderDir.value } : null,
        limit: Number(limitEl.value) || 100,
      };
    }

    function applySpec(spec) {
      filtersEl.innerHTML = '';
      groupsEl.innerHTML = '';
      aggsEl.innerHTML = '';
      (spec.filters || []).forEach((f) => addFilter(f));
      (spec.groupBy || []).forEach((k) => addGroup(k));
      (spec.aggregates || []).forEach((a) => addAgg(a));
      if (spec.orderBy && spec.orderBy.column) {
        refreshOrderOptions(spec.orderBy.column);
        orderDir.value = spec.orderBy.direction === 'desc' ? 'desc' : 'asc';
      } else {
        refreshOrderOptions();
      }
      limitEl.value = spec.limit || 100;
    }

    function renderResults(rows) {
      if (!rows || !rows.length) {
        resultsEl.innerHTML = '<div class="dp-empty">无结果</div>';
        return;
      }
      const colMap = Object.fromEntries(meta.columns.map((c) => [c.key, c.header]));
      const keys = Object.keys(rows[0]);
      const headerFor = (k) => {
        // sum_c2 → "sum(花费)"
        const m = k.match(/^(sum|avg|count|min|max)_(.+)$/);
        if (m) return `${m[1]}(${colMap[m[2]] || m[2]})`;
        return colMap[k] || k;
      };
      resultsEl.innerHTML = `
        <div class="table-scroll" style="max-height:50vh; overflow:auto;">
          <table class="dp-results-table">
            <thead><tr>${keys.map((k) => `<th>${escapeHtml(headerFor(k))}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(formatCell(r[k]))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    container.querySelector('#dpRun').addEventListener('click', async () => {
      const spec = collectSpec();
      statusEl.textContent = '执行中...';
      try {
        const r = await ctx.api('POST', `/api/data/datasets/${ctx.currentDatasetId}/query`, spec);
        renderResults(r.rows || []);
        statusEl.textContent = `返回 ${r.count} 行`;
      } catch (e) {
        statusEl.textContent = '执行失败';
        ctx.toast(`查询失败: ${e.message}`, 'error');
      }
    });

    container.querySelector('#dpSaveTemplate').addEventListener('click', async () => {
      const name = prompt('为模板命名：');
      if (!name || !name.trim()) return;
      const spec = collectSpec();
      try {
        await ctx.api('POST', '/api/data/templates', { name: name.trim(), datasetId: ctx.currentDatasetId, spec });
        ctx.toast(`已保存模板「${name.trim()}」`, 'success');
      } catch (e) {
        ctx.toast(`保存失败: ${e.message}`, 'error');
      }
    });

    container.querySelector('#dpLoadTemplates').addEventListener('click', async () => {
      try {
        const r = await ctx.api('GET', '/api/data/templates');
        if (!r.items || !r.items.length) {
          ctx.toast('暂无模板', 'info');
          return;
        }
        const choices = r.items.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
        const sel = prompt(`选择模板（输入编号 1-${r.items.length}）：\n\n${choices}`);
        const idx = parseInt(sel, 10) - 1;
        if (!Number.isFinite(idx) || !r.items[idx]) return;
        applySpec(r.items[idx].spec || {});
        ctx.toast(`已载入「${r.items[idx].name}」`, 'success');
      } catch (e) {
        ctx.toast(`载入失败: ${e.message}`, 'error');
      }
    });
  };
})();
