// 自然语言 → 查询 spec（阶段 1 占位实现）
// - 不修改现有 intentParser
// - 只做数据集感知的关键词解析；够支撑常见查询，复杂情况返回 unknown
// - 后续可在这里接 LLM，输出仍按 runQuery 接受的 spec 结构

const AGG_KEYWORDS = [
  ['总和', 'sum'], ['合计', 'sum'], ['求和', 'sum'], ['sum', 'sum'],
  ['平均', 'avg'], ['均值', 'avg'], ['avg', 'avg'], ['mean', 'avg'],
  ['计数', 'count'], ['数量', 'count'], ['多少', 'count'], ['count', 'count'],
  ['最大', 'max'], ['最高', 'max'], ['max', 'max'],
  ['最小', 'min'], ['最低', 'min'], ['min', 'min'],
];

function findColumn(columns, text, predicate) {
  // 完整 header 命中优先
  const matches = columns.filter((c) => text.includes(c.header));
  if (predicate) {
    const p = matches.find(predicate);
    if (p) return p;
  }
  return matches[0] || null;
}

function detectAggOp(text) {
  const lower = String(text || '').toLowerCase();
  for (const [kw, op] of AGG_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return op;
  }
  return null;
}

function detectGroupColumn(text, columns) {
  const m = String(text || '').match(/(?:按|分组|group\s*by|每个?|by)\s*([^\s，,的之]+)/i);
  if (!m) return null;
  const hint = m[1];
  for (const c of columns) {
    if (c.header.includes(hint) || hint.includes(c.header)) return c;
  }
  return null;
}

function parseNL(text, meta) {
  const t = String(text || '').trim();
  if (!t) {
    return { ok: false, error: { code: 'empty', message: '请输入查询文本' } };
  }
  if (!meta || !Array.isArray(meta.columns) || !meta.columns.length) {
    return { ok: false, error: { code: 'no_dataset', message: '未选择数据集或数据集为空' } };
  }

  const op = detectAggOp(t) || 'count';
  const numCols = meta.columns.filter((c) => c.type === 'number');

  // 目标聚合列
  let target = findColumn(meta.columns, t, (c) => c.type === 'number');
  if (!target && op !== 'count') {
    if (numCols.length === 1) {
      target = numCols[0];
    } else {
      return { ok: false, error: { code: 'no_target', message: '无法识别要聚合的数值列，请在文本中带上列名' } };
    }
  }
  if (!target) target = meta.columns[0];

  const groupCol = detectGroupColumn(t, meta.columns);

  const spec = {
    filters: [],
    groupBy: groupCol ? [groupCol.key] : [],
    aggregates: [{ column: target.key, op }],
    orderBy: groupCol ? { column: `${op}_${target.key}`, direction: 'desc' } : null,
    limit: 100,
  };

  const reply =
    `识别为：${op}(${target.header})` +
    (groupCol ? ` by ${groupCol.header}` : '');

  return { ok: true, spec, reply };
}

module.exports = { parseNL };
