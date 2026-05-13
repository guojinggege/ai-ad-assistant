// 把 .xlsx/.xls/.csv buffer 解析为标准的 { columns, rows, sheetName }。
// - .xls 用 codepage:936 处理中文旧表
// - 通用：raw:false + cellDates:true，让日期成 Date 对象而非 Excel 序列号
// - 表头空缺用 "列N" 兜底
// - 列类型推断：number/date/boolean/string，基于前 50 个非空样本投票
// - 同时计算列统计（sum/avg/min/max/distinct/topValues）供 dashboard 用

const XLSX = require('xlsx');

const SAMPLE_SIZE = 50;

function isNumberLike(v) {
  if (typeof v === 'number') return isFinite(v);
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (t === '') return false;
  const n = Number(t);
  return isFinite(n) && /^-?\d/.test(t);
}

function isDateLike(v) {
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (t === '') return false;
  // 必须含日期/时间分隔符；否则 "1200"/"98.5" 会被 new Date 当成 year 1200 等
  if (!/[-/:年月日]/.test(t)) return false;
  if (!/\d{4}|\d{1,2}[\-/]\d{1,2}/.test(t)) return false;
  const d = new Date(t);
  return !isNaN(d.getTime());
}

function isBoolLike(v) {
  if (typeof v === 'boolean') return true;
  if (typeof v !== 'string') return false;
  return /^(true|false|yes|no|y|n|是|否)$/i.test(v.trim());
}

function inferType(samples) {
  let nums = 0, dates = 0, bools = 0, strs = 0, total = 0;
  for (const v of samples) {
    if (v === null || v === undefined || v === '') continue;
    total++;
    if (v instanceof Date) { dates++; continue; }
    if (typeof v === 'number') { nums++; continue; }
    if (typeof v === 'boolean') { bools++; continue; }
    // number 优先于 date：纯数字一律先归数字，避免 "1200" 被 new Date 当成年份
    if (isNumberLike(v)) { nums++; continue; }
    if (isDateLike(v)) { dates++; continue; }
    if (isBoolLike(v)) { bools++; continue; }
    strs++;
  }
  if (total === 0) return 'string';
  if (dates / total > 0.6) return 'date';
  if (nums / total > 0.6) return 'number';
  if (bools / total > 0.6) return 'boolean';
  return 'string';
}

function coerce(v, type) {
  if (v === null || v === undefined || v === '') return null;
  switch (type) {
    case 'number': {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      const n = Number(String(v).trim());
      return isFinite(n) ? n : null;
    }
    case 'date': {
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
      const d = new Date(String(v).trim());
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'boolean': {
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      if (['true', 'yes', 'y', '是', '1'].includes(s)) return true;
      if (['false', 'no', 'n', '否', '0'].includes(s)) return false;
      return null;
    }
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

function computeStats(col, rows) {
  const vals = rows.map((r) => r[col.key]).filter((v) => v !== null && v !== undefined);
  col.nullCount = rows.length - vals.length;
  col.count = vals.length;

  if (col.type === 'number') {
    let sum = 0, min = Infinity, max = -Infinity;
    for (const v of vals) { sum += v; if (v < min) min = v; if (v > max) max = v; }
    col.sum = vals.length ? round(sum) : 0;
    col.avg = vals.length ? round(sum / vals.length) : 0;
    col.min = vals.length ? min : null;
    col.max = vals.length ? max : null;
  } else if (col.type === 'date') {
    let min = null, max = null;
    for (const v of vals) {
      if (!min || v < min) min = v;
      if (!max || v > max) max = v;
    }
    col.min = min; col.max = max;
  } else {
    const counts = new Map();
    for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
    col.distinct = counts.size;
    col.topValues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));
  }
}

function round(n, p = 4) {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

function parseBuffer(buffer, ext) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('parser 需要 Buffer 输入');
  }
  const e = String(ext || '').toLowerCase();

  // CSV 单独走 string 入口：xlsx 读 CSV 默认按 cp1252 解码 UTF-8 字节会乱码
  let input, opts;
  if (e === '.csv') {
    let s = buffer.toString('utf8');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); // 剥 UTF-8 BOM
    input = s;
    opts = { type: 'string', cellDates: true, raw: false };
  } else {
    input = buffer;
    opts = { type: 'buffer', cellDates: true, raw: false };
    if (e === '.xls') opts.codepage = 936; // 中文 .xls 旧格式（GBK）
  }

  let wb;
  try {
    wb = XLSX.read(input, opts);
  } catch (e2) {
    throw new Error(`xlsx 解析失败: ${e2.message}`);
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('文件没有任何工作表');

  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  if (!aoa.length) {
    return { columns: [], rows: [], sheetName };
  }

  const headers = (aoa[0] || []).map((h, i) => {
    const s = h === null || h === undefined ? '' : String(h).trim();
    return s || `列${i + 1}`;
  });
  const dataRows = aoa.slice(1);

  // 抽样推断类型
  const sampleN = Math.min(SAMPLE_SIZE, dataRows.length);
  const columns = headers.map((header, idx) => {
    const samples = [];
    for (let r = 0; r < sampleN; r++) {
      samples.push(dataRows[r] ? dataRows[r][idx] : null);
    }
    return { key: `c${idx}`, header, type: inferType(samples), index: idx };
  });

  // 按列类型把每一行规范化
  const rows = dataRows.map((row) => {
    const obj = {};
    for (const col of columns) {
      obj[col.key] = coerce(row ? row[col.index] : null, col.type);
    }
    return obj;
  });

  for (const col of columns) computeStats(col, rows);

  return { columns, rows, sheetName };
}

module.exports = { parseBuffer, inferType, coerce };
