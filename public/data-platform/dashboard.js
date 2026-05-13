// 数据分析 · 自动看板
// 暴露：window.DP.renderDashboardPane(container, ctx)
// 不引入任何图表库；line 用 SVG，bar 用 div + CSS，pie 用 SVG path 切片 + 文字图例

(function () {
  window.DP = window.DP || {};

  const PIE_COLORS = ['#10a37f', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  }

  function formatValue(v) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number' && isFinite(v)) {
      if (Math.abs(v) >= 10000) return v.toLocaleString();
      if (!Number.isInteger(v)) return v.toFixed(2);
      return String(v);
    }
    const s = String(v);
    // 缩短 ISO 日期
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    return s;
  }

  function renderKPIs(container, kpis) {
    if (!kpis || !kpis.length) {
      container.innerHTML = '<div class="dp-empty">无可显示指标</div>';
      return;
    }
    container.innerHTML = `
      <div class="dp-kpi-grid">
        ${kpis.map((k) => `
          <div class="dp-kpi-card">
            <div class="dp-kpi-label">${escapeHtml(k.label)}</div>
            <div class="dp-kpi-value">${escapeHtml(formatValue(k.value))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderLine(container, chart, rows) {
    const xKey = chart.x;
    const yKey = `${chart.agg || 'sum'}_${chart.y || chart.x}`;
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="dp-empty">无数据</div>';
      return;
    }
    const xs = rows.map((r) => r[xKey]);
    const ys = rows.map((r) => Number(r[yKey] ?? 0));
    const ymax = Math.max(...ys, 1);
    const w = 400, h = 200, pad = 36;
    const innerW = w - 2 * pad;
    const innerH = h - 2 * pad;
    const pts = ys.map((y, i) => {
      const px = pad + (rows.length > 1 ? (i / (rows.length - 1)) * innerW : innerW / 2);
      const py = h - pad - (y / ymax) * innerH;
      return [px, py];
    });
    const pointsStr = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" class="dp-chart-svg" xmlns="http://www.w3.org/2000/svg">
        <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="rgba(255,255,255,.15)" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="rgba(255,255,255,.15)" />
        <polyline points="${pointsStr}" fill="none" stroke="#10a37f" stroke-width="2"/>
        ${pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#10a37f"><title>${escapeHtml(formatValue(xs[i]))}: ${escapeHtml(formatValue(ys[i]))}</title></circle>`).join('')}
        <text x="${pad}" y="${h - 10}" font-size="10" fill="rgba(255,255,255,.5)">${escapeHtml(formatValue(xs[0]))}</text>
        <text x="${w - pad}" y="${h - 10}" font-size="10" fill="rgba(255,255,255,.5)" text-anchor="end">${escapeHtml(formatValue(xs[xs.length - 1]))}</text>
        <text x="${pad - 6}" y="${pad + 4}" font-size="10" fill="rgba(255,255,255,.5)" text-anchor="end">${escapeHtml(formatValue(ymax))}</text>
        <text x="${pad - 6}" y="${h - pad + 4}" font-size="10" fill="rgba(255,255,255,.5)" text-anchor="end">0</text>
      </svg>
    `;
  }

  function renderBar(container, chart, rows) {
    const xKey = chart.x;
    const yKey = `${chart.agg || 'sum'}_${chart.y || chart.x}`;
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="dp-empty">无数据</div>';
      return;
    }
    const ymax = Math.max(...rows.map((r) => Number(r[yKey] ?? 0)), 1);
    container.innerHTML = `
      <div class="dp-chart-bar">
        ${rows.slice(0, 20).map((r) => {
          const v = Number(r[yKey] ?? 0);
          const hp = Math.max((v / ymax) * 100, 3);
          const labelTrunc = String(r[xKey] ?? '').slice(0, 8);
          return `<div style="height:${hp}%" data-label="${escapeHtml(labelTrunc)}" title="${escapeHtml(String(r[xKey] ?? ''))}: ${escapeHtml(formatValue(v))}"></div>`;
        }).join('')}
      </div>
    `;
  }

  function renderPie(container, chart, rows) {
    const xKey = chart.x;
    const yKey = `${chart.agg || 'count'}_${chart.x}`;
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="dp-empty">无数据</div>';
      return;
    }
    const total = rows.reduce((a, r) => a + Number(r[yKey] ?? 0), 0) || 1;
    const cx = 100, cy = 100, R = 80;
    let acc = 0;
    const slices = rows.map((row, i) => {
      const v = Number(row[yKey] ?? 0);
      const ratio = v / total;
      const startA = acc * Math.PI * 2 - Math.PI / 2;
      acc += ratio;
      const endA = acc * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + R * Math.cos(startA);
      const y1 = cy + R * Math.sin(startA);
      const x2 = cx + R * Math.cos(endA);
      const y2 = cy + R * Math.sin(endA);
      const large = ratio > 0.5 ? 1 : 0;
      const path = (ratio >= 0.999)
        ? `M ${cx - R},${cy} a ${R},${R} 0 1,0 ${2 * R},0 a ${R},${R} 0 1,0 ${-2 * R},0`
        : `M${cx.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      return {
        path,
        color: PIE_COLORS[i % PIE_COLORS.length],
        label: String(row[xKey] ?? '-'),
        value: v,
        ratio,
      };
    });

    container.innerHTML = `
      <div style="display:flex; gap:18px; align-items:center;">
        <svg viewBox="0 0 200 200" style="width:140px; height:140px; flex:0 0 auto;" xmlns="http://www.w3.org/2000/svg">
          ${slices.map((s) => `<path d="${s.path}" fill="${s.color}" stroke="rgba(0,0,0,.18)" stroke-width="1"><title>${escapeHtml(s.label)}: ${escapeHtml(formatValue(s.value))} (${(s.ratio * 100).toFixed(1)}%)</title></path>`).join('')}
        </svg>
        <div class="dp-chart-legend" style="flex:1;">
          ${slices.map((s) => `
            <div class="item">
              <span><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>
              <strong>${escapeHtml(formatValue(s.value))}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderChart(container, chart, data) {
    container.innerHTML = `
      <div class="dp-chart-title">${escapeHtml(chart.title || '')}</div>
      <div class="dp-chart-body"></div>
    `;
    const body = container.querySelector('.dp-chart-body');
    switch (chart.type) {
      case 'line': renderLine(body, chart, data); break;
      case 'bar': renderBar(body, chart, data); break;
      case 'pie': renderPie(body, chart, data); break;
      default: body.innerHTML = `<div class="dp-empty">未知图表类型: ${escapeHtml(chart.type)}</div>`;
    }
  }

  window.DP.renderDashboardPane = async function (container, ctx) {
    container.innerHTML = '';
    if (!ctx.currentDatasetId) {
      container.innerHTML = '<div class="dp-empty">请先在「上传 & 数据集」选择一个数据集</div>';
      return;
    }
    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-header"><span>${escapeHtml(ctx.currentDataset && ctx.currentDataset.name || '加载中')} · 自动看板</span></div>
        <div id="dpKpiArea"></div>
        <div class="dp-charts" id="dpChartsArea" style="margin-top:14px;"></div>
      </div>
    `;
    try {
      const r = await ctx.api('GET', `/api/data/datasets/${ctx.currentDatasetId}/dashboard`);
      renderKPIs(container.querySelector('#dpKpiArea'), r.kpis || []);
      const chartsArea = container.querySelector('#dpChartsArea');
      const list = r.charts || [];
      if (!list.length) {
        chartsArea.innerHTML = '<div class="dp-empty">没有可生成的图表（缺少日期/数值/分类列）</div>';
        return;
      }
      chartsArea.innerHTML = list.map(() => '<div class="dp-chart-card"></div>').join('');
      const cards = chartsArea.querySelectorAll('.dp-chart-card');
      list.forEach((c, i) => renderChart(cards[i], c.chart, c.data));
    } catch (e) {
      container.innerHTML += `<div class="dp-empty">看板加载失败: ${escapeHtml(e.message)}</div>`;
      ctx.toast(`看板加载失败: ${e.message}`, 'error');
    }
  };
})();
