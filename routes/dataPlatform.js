// 数据分析模块路由聚合（唯一被 server.js 引用的入口）
// 所有事件目前走本模块内部 EventEmitter；事件名带 'data.' 前缀，
// 未来若想接到现有 chat 的 broadcast/SSE，只需把这里的 bus 转发出去。

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const {
  ensureDirs,
  validateFilename,
  getBackend,
  SUBDIRS,
} = require('../services/data-platform/store');
const { parseBuffer } = require('../services/data-platform/parser');
const { buildDashboard, runQuery, computeChartData, AGG_OPS } = require('../services/data-platform/analyzer');
const { parseNL } = require('../services/data-platform/nl-query');

const router = express.Router();

const bus = new EventEmitter();
bus.setMaxListeners(100);
function broadcast(type, data) {
  bus.emit('event', { type, data, ts: Date.now() });
}

const ALLOW_EXT = new Set(['.xlsx', '.xls', '.csv']);
const ALLOW_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',                                          // xls
  'application/octet-stream',                                          // 某些浏览器
  'text/csv',
  'text/plain',                                                        // CSV 偶尔会是这个
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    // multer 默认把 originalname 按 latin1 解，按用户给的写法修正中文
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (!validateFilename(file.originalname)) {
      return cb(new Error('文件名非法（含 .. 或路径分隔符）'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOW_EXT.has(ext)) {
      return cb(new Error(`文件类型不支持: ${ext}，仅允许 .xlsx/.xls/.csv`));
    }
    if (!ALLOW_MIME.has(file.mimetype)) {
      return cb(new Error(`MIME 不被允许: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

function err(res, code, message, status = 400) {
  return res.status(status).json({ ok: false, error: { code, message } });
}

function newDatasetId() { return 'ds_' + crypto.randomBytes(8).toString('hex'); }
function newTemplateId() { return 'tpl_' + crypto.randomBytes(6).toString('hex'); }

// ---------- 健康检查 ----------
router.get('/health', async (req, res) => {
  try {
    await ensureDirs();
    res.json({
      ok: true,
      backend: (process.env.DATA_BACKEND || 'fs'),
      root: SUBDIRS.uploads.replace(/\/uploads$/, ''),
      vercel: !!process.env.VERCEL,
    });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 数据分析模块独立 SSE ----------
router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`: connected ${new Date().toISOString()}\n\n`);

  const onEvent = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  bus.on('event', onEvent);
  const hb = setInterval(() => res.write(`: hb\n\n`), 15000);
  req.on('close', () => { clearInterval(hb); bus.off('event', onEvent); });
});

// ---------- 上传 + 解析 ----------
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return err(res, 'no_file', '未收到文件');

    const id = newDatasetId();
    const ext = path.extname(req.file.originalname).toLowerCase();
    const backend = getBackend();

    await ensureDirs();
    await backend.write('uploads', `${id}${ext}`, req.file.buffer);

    let parsed;
    try {
      parsed = parseBuffer(req.file.buffer, ext);
    } catch (e) {
      broadcast('data.upload.fail', { id, name: req.file.originalname, message: e.message });
      // 清理原始文件，避免悬挂
      try { await backend.delete('uploads', `${id}${ext}`); } catch (_) {}
      return err(res, 'parse_failed', `解析失败: ${e.message}`);
    }

    const meta = {
      id,
      name: req.file.originalname.replace(/\.[^.]+$/, ''),
      originalName: req.file.originalname,
      ext,
      size: req.file.size,
      mimeType: req.file.mimetype,
      sheetName: parsed.sheetName,
      columns: parsed.columns,
      rowCount: parsed.rows.length,
      createdAt: new Date().toISOString(),
    };
    await backend.writeJSON('datasets', `${id}.json`, meta);
    await backend.writeJSON('datasets', `${id}.rows.json`, { rows: parsed.rows });

    broadcast('data.upload.ok', { id, name: meta.name, rowCount: meta.rowCount });
    res.json({ ok: true, dataset: meta });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 数据集列表 ----------
router.get('/datasets', async (req, res) => {
  try {
    const backend = getBackend();
    const files = await backend.list('datasets');
    const items = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      if (f.endsWith('.rows.json')) continue;
      try { items.push(await backend.readJSON('datasets', f)); } catch (_) { /* 跳过损坏 */ }
    }
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ ok: true, items });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 数据集详情（含 50 行预览） ----------
router.get('/datasets/:id', async (req, res) => {
  try {
    if (!validateFilename(req.params.id)) return err(res, 'bad_id', '非法 id');
    const backend = getBackend();
    const meta = await backend.readJSON('datasets', `${req.params.id}.json`);
    const all = await backend.readJSON('datasets', `${req.params.id}.rows.json`);
    res.json({ ok: true, dataset: meta, preview: (all.rows || []).slice(0, 50) });
  } catch (e) {
    if (e.code === 'ENOENT') return err(res, 'not_found', '数据集不存在', 404);
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 删除数据集 ----------
router.delete('/datasets/:id', async (req, res) => {
  try {
    if (!validateFilename(req.params.id)) return err(res, 'bad_id', '非法 id');
    const backend = getBackend();
    let ext = null;
    try {
      const meta = await backend.readJSON('datasets', `${req.params.id}.json`);
      ext = meta.ext;
    } catch (_) { /* 元数据可能已不存在 */ }
    await backend.delete('datasets', `${req.params.id}.json`);
    await backend.delete('datasets', `${req.params.id}.rows.json`);
    if (ext) await backend.delete('uploads', `${req.params.id}${ext}`);
    broadcast('data.dataset.delete', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 自动看板 ----------
router.get('/datasets/:id/dashboard', async (req, res) => {
  try {
    if (!validateFilename(req.params.id)) return err(res, 'bad_id', '非法 id');
    const backend = getBackend();
    const meta = await backend.readJSON('datasets', `${req.params.id}.json`);
    const all = await backend.readJSON('datasets', `${req.params.id}.rows.json`);
    const dash = buildDashboard(meta);
    const charts = dash.charts.map((c) => ({ chart: c, data: computeChartData(c, meta, all.rows || []) }));
    res.json({ ok: true, kpis: dash.kpis, charts });
  } catch (e) {
    if (e.code === 'ENOENT') return err(res, 'not_found', '数据集不存在', 404);
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 查询 ----------
router.post('/datasets/:id/query', async (req, res) => {
  try {
    if (!validateFilename(req.params.id)) return err(res, 'bad_id', '非法 id');
    const backend = getBackend();
    const meta = await backend.readJSON('datasets', `${req.params.id}.json`);
    const all = await backend.readJSON('datasets', `${req.params.id}.rows.json`);
    const result = runQuery(meta, all.rows || [], req.body || {});
    res.json({ ok: true, rows: result, count: result.length, supportedOps: AGG_OPS });
  } catch (e) {
    if (e.code === 'ENOENT') return err(res, 'not_found', '数据集不存在', 404);
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 自然语言查询 ----------
router.post('/datasets/:id/nl-query', async (req, res) => {
  try {
    if (!validateFilename(req.params.id)) return err(res, 'bad_id', '非法 id');
    const backend = getBackend();
    const meta = await backend.readJSON('datasets', `${req.params.id}.json`);
    const all = await backend.readJSON('datasets', `${req.params.id}.rows.json`);
    const parsed = parseNL(req.body?.text, meta);
    if (!parsed.ok) return err(res, parsed.error.code, parsed.error.message);
    const rows = runQuery(meta, all.rows || [], parsed.spec);
    res.json({ ok: true, spec: parsed.spec, reply: parsed.reply, rows, count: rows.length });
  } catch (e) {
    if (e.code === 'ENOENT') return err(res, 'not_found', '数据集不存在', 404);
    return err(res, 'internal', e.message, 500);
  }
});

// ---------- 查询模板：列表 / 保存 / 删除 ----------
router.get('/templates', async (req, res) => {
  try {
    const backend = getBackend();
    const files = await backend.list('templates');
    const items = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try { items.push(await backend.readJSON('templates', f)); } catch (_) {}
    }
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ ok: true, items });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, datasetId, spec } = req.body || {};
    if (!name || typeof name !== 'string') return err(res, 'bad_request', 'name 必填');
    if (!spec || typeof spec !== 'object') return err(res, 'bad_request', 'spec 必填');
    const id = newTemplateId();
    const tpl = {
      id,
      name: name.slice(0, 100),
      datasetId: typeof datasetId === 'string' ? datasetId : null,
      spec,
      createdAt: new Date().toISOString(),
    };
    const backend = getBackend();
    await backend.writeJSON('templates', `${id}.json`, tpl);
    res.json({ ok: true, template: tpl });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    if (!validateFilename(req.params.id)) return err(res, 'bad_id', '非法 id');
    const backend = getBackend();
    await backend.delete('templates', `${req.params.id}.json`);
    res.json({ ok: true });
  } catch (e) {
    return err(res, 'internal', e.message, 500);
  }
});

// multer 错误兜底
router.use((errObj, req, res, next) => {
  if (errObj) {
    const code = errObj.code === 'LIMIT_FILE_SIZE'
      ? 'file_too_large'
      : (errObj.code || 'upload_error');
    return res.status(400).json({ ok: false, error: { code, message: errObj.message } });
  }
  next();
});

module.exports = router;
