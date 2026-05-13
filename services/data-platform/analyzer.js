// 分析层：自动看板 + 通用查询引擎
// - buildDashboard(meta)：根据列类型生成 KPI 卡片和图表 spec（不含数据）
// - computeChartData(chart, meta, rows)：把 chart spec 转成查询然后执行
// - runQuery(meta, rows, querySpec)：filter + groupBy + aggregates + orderBy + limit

const AGG_OPS = ['sum', 'avg', 'count', 'min', 'max'];

function round(n, p = 4) {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

function formatDateRange(a, b) {
  if (!a || !b) return '-';
  return `${String(a).slice(0, 10)} ~ ${String(b).slice(0, 10)}`;
}

function buildDashboard(meta) {
  const cols = meta.columns || [];
  const numCols = cols.filter((c) => c.type === 'number');
  const dateCols = cols.filter((c) => c.type === 'date');
  const catCols = cols.filter((c) => c.type === 'string' && c.distinct != null && c.distinct >= 2 && c.distinct <= 30);

  const kpis = [];
  kpis.push({ label: '总行数', value: meta.rowCount, kind: 'number' });
  for (const c of numCols.slice(0, 3)) {
    kpis.push({ label: `${c.header} · 合计`, value: c.sum, kind: 'number', columnKey: c.key });
    kpis.push({ label: `${c.header} · 平均`, value: c.avg, kind: 'number', columnKey: c.key });
  }
  if (dateCols[0]) {
    kpis.push({
      label: `${dateCols[0].header} · 范围`,
      value: formatDateRange(dateCols[0].min, dateCols[0].max),
      kind: 'text',
      columnKey: dateCols[0].key,
    });
  }

  const charts = [];

  // 折线：日期 + 数值（取首个组合）
  if (dateCols[0] && numCols[0]) {
    charts.push({
      type: 'line',
      title: `${numCols[0].header} 随 ${dateCols[0].header} 趋势`,
      x: dateCols[0].key,
      y: numCols[0].key,
      agg: 'sum',
    });
  }

  // 柱状：分类 + 数值
  if (catCols[0] && numCols[0]) {
    charts.push({
      type: 'bar',
      title: `按 ${catCols[0].header} 汇总 ${numCols[0].header}`,
      x: catCols[0].key,
      y: numCols[0].key,
      agg: 'sum',
    });
  }

  // 饼图：分类分布
  for (const c of catCols.slice(0, 2)) {
    charts.push({
      type: 'pie',
      title: `${c.header} 占比`,
      x: c.key,
      agg: 'count',
    });
  }

  // 若没有数值列，则用第二个分类列再做一张柱图
  if (!numCols.length && catCols[0] && catCols[1]) {
    charts.push({
      type: 'bar',
      title: `${catCols[1].header} 按 ${catCols[0].header} 数量`,
      x: catCols[0].key,
      y: catCols[1].key,
      agg: 'count',
    });
  }

  return { kpis, charts };
}

function matchFilter(row, f) {
  if (!f || !f.column) return true;
  const v = row[f.column];
  const t = f.value;
  switch (f.op) {
    case '=': return String(v) === String(t);
    case '!=': return String(v) !== String(t);
    case '>': return Number(v) > Number(t);
    case '>=': return Number(v) >= Number(t);
    case '<': return Number(v) < Number(t);
    case '<=': return Number(v) <= Number(t);
    case 'contains': return String(v ?? '').includes(String(t ?? ''));
    case 'in': return Array.isArray(t) && t.map(String).includes(String(v));
    default: return true;
  }
}

function computeAgg(rows, column, op) {
  const vals = rows
    .map((r) => r[column])
    .filter((v) => v !== null && v !== undefined && v !== '');
  switch (op) {
    case 'count': return rows.length;
    case 'sum': return round(vals.reduce((a, v) => a + Number(v || 0), 0));
    case 'avg': return vals.length ? round(vals.reduce((a, v) => a + Number(v || 0), 0) / vals.length) : 0;
    case 'min': {
      const nums = vals.map(Number).filter((n) => isFinite(n));
      return nums.length ? Math.min(...nums) : null;
    }
    case 'max': {
      const nums = vals.map(Number).filter((n) => isFinite(n));
      return nums.length ? Math.max(...nums) : null;
    }
    default: return null;
  }
}

function runQuery(meta, rows, spec) {
  const filters = Array.isArray(spec?.filters) ? spec.filters : [];
  const groupBy = Array.isArray(spec?.groupBy) ? spec.groupBy : [];
  const aggregates = Array.isArray(spec?.aggregates) ? spec.aggregates : [];

  let filtered = rows;
  for (const f of filters) {
    filtered = filtered.filter((r) => matchFilter(r, f));
  }

  let groups;
  if (groupBy.length === 0) {
    groups = new Map([['__all__', filtered]]);
  } else {
    groups = new Map();
    for (const r of filtered) {
      const key = groupBy.map((g) => String(r[g] ?? '')).join('');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
  }

  const out = [];
  for (const members of groups.values()) {
    const row = {};
    if (groupBy.length) {
      for (const g of groupBy) row[g] = members[0]?.[g] ?? null;
    }
    if (aggregates.length) {
      for (const a of aggregates) {
        if (!AGG_OPS.includes(a.op)) continue;
        row[`${a.op}_${a.column}`] = computeAgg(members, a.column, a.op);
      }
    } else {
      row.__count__ = members.length;
    }
    out.push(row);
  }

  if (spec?.orderBy?.column) {
    const dir = spec.orderBy.direction === 'desc' ? -1 : 1;
    const col = spec.orderBy.column;
    out.sort((a, b) => {
      const av = a[col]; const bv = b[col];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av < bv ? -dir : dir;
    });
  }

  const limit = Number.isFinite(Number(spec?.limit)) && Number(spec.limit) > 0
    ? Math.min(Number(spec.limit), 10000)
    : 1000;
  return out.slice(0, limit);
}

function computeChartData(chart, meta, rows) {
  const spec = {
    filters: [],
    groupBy: chart.x ? [chart.x] : [],
    aggregates: [{ column: chart.y || chart.x, op: chart.agg || 'count' }],
    orderBy: chart.type === 'line' && chart.x ? { column: chart.x, direction: 'asc' } : null,
    limit: chart.type === 'pie' ? 10 : 100,
  };
  return runQuery(meta, rows, spec);
}

module.exports = { buildDashboard, runQuery, computeChartData, AGG_OPS };
