// 数据分析模块的存储层。
// - 默认 fs 后端，根目录: storage/data/
// - VERCEL=1 时切到 /tmp/ad-data（serverless 无法写项目目录）
// - 预留 DATA_BACKEND 抽象（read/write/delete/list/readJSON/writeJSON），
//   后续接 Vercel Blob/KV 只需新增一个 backend 实现。
// - 原子写：先写 .tmp 再 rename
// - 路径安全：safeJoin 拒绝任何非 basename 形式的 name
// - 文件名校验：拒绝包含 '..'、路径分隔符、绝对路径的名字

const fs = require('fs');
const path = require('path');

const isVercel = process.env.VERCEL === '1' || String(process.env.VERCEL || '').toLowerCase() === 'true';
const ROOT = isVercel
  ? path.join('/tmp', 'ad-data')
  : path.resolve(__dirname, '..', '..', 'storage', 'data');

const SUBDIRS = {
  uploads: path.join(ROOT, 'uploads'),
  datasets: path.join(ROOT, 'datasets'),
  templates: path.join(ROOT, 'templates'),
};

async function ensureDirs() {
  for (const d of Object.values(SUBDIRS)) {
    await fs.promises.mkdir(d, { recursive: true });
  }
}

// 仅允许 basename，禁止 '..' 与路径穿越
function validateFilename(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.length > 255) return false;
  if (name.includes('..')) return false;
  if (path.isAbsolute(name)) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (path.basename(name) !== name) return false;
  return true;
}

function safeJoin(ns, name) {
  const base = SUBDIRS[ns];
  if (!base) throw new Error(`unknown namespace: ${ns}`);
  if (!validateFilename(name)) throw new Error(`illegal filename: ${name}`);
  const resolved = path.resolve(base, name);
  const root = path.resolve(base);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`path escape: ${name}`);
  }
  return resolved;
}

async function atomicWriteFile(filePath, payload) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, payload);
  await fs.promises.rename(tmp, filePath);
}

const fsBackend = {
  name: 'fs',
  root: ROOT,

  async read(ns, key) {
    return fs.promises.readFile(safeJoin(ns, key));
  },
  async readJSON(ns, key) {
    const buf = await this.read(ns, key);
    return JSON.parse(buf.toString('utf8'));
  },
  async write(ns, key, buffer) {
    await ensureDirs();
    await atomicWriteFile(safeJoin(ns, key), buffer);
  },
  async writeJSON(ns, key, obj) {
    await ensureDirs();
    await atomicWriteFile(safeJoin(ns, key), JSON.stringify(obj));
  },
  async delete(ns, key) {
    try {
      await fs.promises.unlink(safeJoin(ns, key));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  },
  async list(ns) {
    await ensureDirs();
    try {
      return await fs.promises.readdir(SUBDIRS[ns]);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  },
};

function getBackend() {
  const want = (process.env.DATA_BACKEND || 'fs').toLowerCase();
  if (want === 'fs') return fsBackend;
  throw new Error(`backend not implemented: ${want}`);
}

module.exports = {
  ROOT,
  SUBDIRS,
  ensureDirs,
  validateFilename,
  getBackend,
  fsBackend,
};
