const path = require('path');
const fs = require('fs/promises');

const DATA_PATH = path.join(__dirname, '..', 'slots.json');

const SAMPLE_SLOTS = [
  {
    id: 'slot-1',
    name: '首页Banner',
    size: '1200x250',
    position: '首页顶部',
    status: 'active',
    currentAds: 4,
    preview: 'banner',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'slot-2',
    name: '弹窗浮层',
    size: '600x600',
    position: '页面中间',
    status: 'active',
    currentAds: 2,
    preview: 'popup',
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'slot-3',
    name: '侧边栏',
    size: '300x600',
    position: '页面侧边',
    status: 'inactive',
    currentAds: 1,
    preview: 'sidebar',
    createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'slot-4',
    name: '首页推荐',
    size: '950x200',
    position: '首页推荐区',
    status: 'active',
    currentAds: 3,
    preview: 'recommend',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'slot-5',
    name: '开屏广告',
    size: '1080x1920',
    position: '启动页',
    status: 'active',
    currentAds: 1,
    preview: 'splash',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
];

async function ensureStore() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.writeFile(DATA_PATH, JSON.stringify(SAMPLE_SLOTS, null, 2), 'utf8');
  }
}

async function loadSlots() {
  await ensureStore();
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw || '[]');
}

async function saveSlots(items) {
  await fs.writeFile(DATA_PATH, JSON.stringify(items, null, 2), 'utf8');
  return items;
}

function normalizeSlot(slot) {
  return {
    id: slot.id || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: slot.name || '未命名广告位',
    size: slot.size || 'auto',
    position: slot.position || '未知位置',
    status: slot.status || 'inactive',
    currentAds: typeof slot.currentAds === 'number' ? slot.currentAds : 0,
    preview: slot.preview || 'none',
    createdAt: slot.createdAt || new Date().toISOString(),
  };
}

async function listSlots() {
  return loadSlots();
}

async function getSlot(id) {
  const slots = await loadSlots();
  return slots.find((item) => item.id === id);
}

async function createSlot(data) {
  const slots = await loadSlots();
  const item = normalizeSlot({ ...data, createdAt: new Date().toISOString() });
  slots.push(item);
  await saveSlots(slots);
  return item;
}

async function updateSlot(id, data) {
  const slots = await loadSlots();
  const index = slots.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('广告位不存在');
  slots[index] = normalizeSlot({ ...slots[index], ...data });
  await saveSlots(slots);
  return slots[index];
}

async function deleteSlot(id) {
  const slots = await loadSlots();
  const next = slots.filter((item) => item.id !== id);
  await saveSlots(next);
  return { ok: true, id };
}

module.exports = {
  listSlots,
  getSlot,
  createSlot,
  updateSlot,
  deleteSlot,
};
