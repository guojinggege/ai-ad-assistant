// 自然语言 → 查询 spec（数据集感知，无外部依赖）
//
// 算法（v2，按 token 边界匹配，避免整段 includes 误匹配）：
//   1) 找最右最长的聚合动词位置（合计/求和/sum/avg/平均/min/max/count/计数/均值/最大/最小）
//   2) 以聚合动词位置切分 text 为 before / after：
//        before  → 维度（groupBy）+ 过滤条件（filter）候选区
//        after   → 度量（aggregate target）候选区
//   3) 过滤条件: "X 为 Y" / "X 是 Y" / "X = Y" / "X 等于 Y" → filter X = Y（X 必须能匹配到 column）
//   4) 维度: "按 X" / "每个 X" / "by X" → groupBy = X
//   5) 度量: 优先扫 after 的 tokens（要求 number 类型）；找不到再扫 before 剩余 tokens；
//      再退化到任意 token 匹配；count 时允许任意列占位
//
// findColumnByToken 严格按 token 边界匹配，杜绝 "客户合计花费".includes("花费") 误命中。

const AGG_KEYWORDS = [
  ['总和', 'sum'], ['合计', 'sum'], ['求和', 'sum'], ['sum', 'sum'],
  ['平均值', 'avg'], ['均值', 'avg'], ['平均', 'avg'], ['avg', 'avg'], ['mean', 'avg'],
  ['计数', 'count'], ['数量', 'count'], ['多少', 'count'], ['count', 'count'],
  ['最大值', 'max'], ['最大', 'max'], ['最高', 'max'], ['max', 'max'],
  ['最小值', 'min'], ['最小', 'min'], ['最低', 'min'], ['min', 'min'],
];

// token 之间的分隔/停用：聚合词、连接词、标点
const STOP_CHARS_CLASS = '\\s，,。、；;:：（）()|的之时为是按每和与及等于';

function errCode(code, message) {
  return { ok: false, error: { code, message } };
}

function detectAggOp(text) {
  // 取最右最长的匹配（语句中 "X的均值" 形式，op 在后；多关键词时偏向后者更直观）
  const lower = text.toLowerCase();
  let best = null;
  for (const [kw, op] of AGG_KEYWORDS) {
    const k = kw.toLowerCase();
    let idx = lower.indexOf(k);
    while (idx !== -1) {
      const end = idx + k.length;
      if (!best || end > best.end || (end === best.end && k.length > best.kw.length)) {
        best = { kw: k, op, start: idx, end };
      }
      idx = lower.indexOf(k, idx + 1);
    }
  }
  return best; // 或 null
}

function tokenize(s) {
  if (!s) return [];
  let tmp = String(s);
  // 先把聚合关键词替换成空格，避免它们粘连进 token
  for (const [kw] of AGG_KEYWORDS) {
    tmp = tmp.split(kw).join(' ');
  }
  return tmp
    .split(new RegExp(`[${STOP_CHARS_CLASS}]+`))
    .map((x) => x.trim())
    .filter(Boolean);
}

function findColumnByToken(columns, token, predicate) {
  if (!token) return null;
  const t = String(token).trim();
  if (!t) return null;
  const ok = (c) => !predicate || predicate(c);

  // 1) 完全相等（大小写不敏感对英文 header 友好）
  let c = columns.find((c) => c.header === t && ok(c));
  if (c) return c;
  c = columns.find((c) => c.header.toLowerCase() === t.toLowerCase() && ok(c));
  if (c) return c;

  // 2) token 以 header 开头或结尾（如 "客户ID" 命中 "客户"），仅当 header 长度 >= 2
  c = columns.find((c) => c.header.length >= 2 && (t.startsWith(c.header) || t.endsWith(c.header)) && ok(c));
  if (c) return c;

  // 3) header 以 token 开头或结尾（短 token 命中长 header）
  c = columns.find((c) => t.length >= 2 && (c.header.startsWith(t) || c.header.endsWith(t)) && ok(c));
  if (c) return c;

  return null;
}

function extractFilters(beforeText, columns) {
  // X 为 Y / X 是 Y / X = Y / X 等于 Y
  const FILTER_RE = new RegExp(
    `([^${STOP_CHARS_CLASS}=]+?)\\s*(?:为|是|=|等于)\\s*([^${STOP_CHARS_CLASS}=]+)`,
    'g'
  );
  const filters = [];
  const consumed = [];
  let m;
  while ((m = FILTER_RE.exec(beforeText)) !== null) {
    const colName = (m[1] || '').trim();
    const value = (m[2] || '').trim();
    if (!colName || !value) continue;
    const col = findColumnByToken(columns, colName);
    if (col) {
      filters.push({ column: col.key, op: '=', value });
      consumed.push(m[0]);
    }
  }
  return { filters, consumed };
}

function extractGroup(beforeStripped, columns) {
  const GROUP_RE = new RegExp(`(?:按|每个?|by)\\s*([^${STOP_CHARS_CLASS}]+)`, 'i');
  const gm = beforeStripped.match(GROUP_RE);
  if (!gm) return { groupCol: null, consumed: '' };
  const groupCol = findColumnByToken(columns, gm[1].trim());
  return { groupCol, consumed: gm[0] };
}

function pickTarget(afterText, beforeRemainder, allText, columns) {
  const isNum = (c) => c.type === 'number';

  for (const tok of tokenize(afterText)) {
    const c = findColumnByToken(columns, tok, isNum);
    if (c) return c;
  }
  for (const tok of tokenize(beforeRemainder)) {
    const c = findColumnByToken(columns, tok, isNum);
    if (c) return c;
  }
  // 退化：任意类型
  for (const tok of tokenize(afterText)) {
    const c = findColumnByToken(columns, tok);
    if (c) return c;
  }
  for (const tok of tokenize(beforeRemainder)) {
    const c = findColumnByToken(columns, tok);
    if (c) return c;
  }
  for (const tok of tokenize(allText)) {
    const c = findColumnByToken(columns, tok);
    if (c) return c;
  }
  return null;
}

function parseNL(text, meta) {
  const t = String(text || '').trim();
  if (!t) return errCode('empty', '请输入查询文本');
  if (!meta || !Array.isArray(meta.columns) || !meta.columns.length) {
    return errCode('no_dataset', '未选择数据集或数据集为空');
  }

  // 1) 聚合动词
  const opMatch = detectAggOp(t);
  const op = opMatch ? opMatch.op : 'count';
  const before = opMatch ? t.slice(0, opMatch.start) : t;
  const after = opMatch ? t.slice(opMatch.end) : '';

  // 2) 过滤条件
  const { filters, consumed: filterConsumed } = extractFilters(before, meta.columns);
  let beforeAfterFilter = before;
  for (const s of filterConsumed) beforeAfterFilter = beforeAfterFilter.replace(s, ' ');

  // 3) 维度
  const { groupCol, consumed: groupConsumed } = extractGroup(beforeAfterFilter, meta.columns);
  const beforeRemainder = groupConsumed ? beforeAfterFilter.replace(groupConsumed, ' ') : beforeAfterFilter;

  // 4) 度量列
  let targetCol = pickTarget(after, beforeRemainder, t, meta.columns);

  if (!targetCol) {
    if (op === 'count') {
      targetCol = meta.columns[0]; // count 不在乎列
    } else {
      const numCols = meta.columns.filter((c) => c.type === 'number');
      if (numCols.length === 1) targetCol = numCols[0];
    }
  }
  if (!targetCol) {
    return errCode('no_target', '无法识别要聚合的列，请在文本中带上列名');
  }

  const spec = {
    filters,
    groupBy: groupCol ? [groupCol.key] : [],
    aggregates: [{ column: targetCol.key, op }],
    orderBy: groupCol ? { column: `${op}_${targetCol.key}`, direction: 'desc' } : null,
    limit: 100,
  };

  const headerOf = (key) => (meta.columns.find((c) => c.key === key) || {}).header || key;
  const filterStr = filters.length
    ? ` where ${filters.map((f) => `${headerOf(f.column)}=${f.value}`).join(',')}`
    : '';
  const reply =
    `识别为：${op}(${targetCol.header})` +
    (groupCol ? ` by ${groupCol.header}` : '') +
    filterStr;

  return { ok: true, spec, reply };
}

module.exports = { parseNL };
