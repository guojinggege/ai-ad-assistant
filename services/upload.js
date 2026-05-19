const path = require('path');
const fs = require('fs/promises');

const META_PATH = path.join(__dirname, '..', 'media.json');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

async function ensureStore() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
  try {
    await fs.access(META_PATH);
  } catch {
    await fs.writeFile(META_PATH, '[]', 'utf8');
  }
}

async function loadMedia() {
  try {
    await ensureStore();
    const raw = await fs.readFile(META_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[media] loadMedia fallback to []:', err.message);
    return [];
  }
}

async function saveMedia(items) {
  await fs.writeFile(META_PATH, JSON.stringify(items, null, 2), 'utf8');
  return items;
}

function normalizeItem(item) {
  return {
    id: item.id || `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: item.fileName || 'unknown',
    type: item.type || 'image',
    dimensions: item.dimensions || 'auto',
    size: item.size || 0,
    url: item.url || '',
    category: item.category || '默认',
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

async function listMedia() {
  return loadMedia();
}

async function saveMediaFile({ fileName, fileData, category = '默认' }) {
  if (!fileName || !fileData) {
    throw new Error('缺少文件数据');
  }
  await ensureStore();
  const buffer = Buffer.from(fileData, 'base64');
  const ext = path.extname(fileName) || '.dat';
  const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const savedFileName = `${id}${ext}`;
  const filePath = path.join(UPLOAD_DIR, savedFileName);
  await fs.writeFile(filePath, buffer);
  const url = `/uploads/${savedFileName}`;
  const type = ['.mp4', '.mov', '.webm'].includes(ext.toLowerCase()) ? 'video' : 'image';
  const item = normalizeItem({
    id,
    fileName,
    type,
    dimensions: 'auto',
    size: buffer.length,
    url,
    category,
    createdAt: new Date().toISOString(),
  });
  const items = await loadMedia();
  items.unshift(item);
  await saveMedia(items);
  return item;
}

async function deleteMedia(id) {
  const items = await loadMedia();
  const target = items.find((item) => item.id === id);
  if (!target) throw new Error('素材不存在');
  const filePath = path.join(UPLOAD_DIR, path.basename(target.url));
  await fs.unlink(filePath).catch(() => {});
  const next = items.filter((item) => item.id !== id);
  await saveMedia(next);
  return { ok: true, id };
}

module.exports = {
  listMedia,
  saveMediaFile,
  deleteMedia,
};
