const path = require('path');
const fs = require('fs/promises');

const DATA_PATH = path.join(__dirname, '..', 'ads.json');

const SAMPLE_ADS = [
  {
    id: 'ad-1',
    name: '澳门空降',
    status: 'online',
    slot: 'Banner',
    url: 'https://xx.vip',
    code: '123456',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    order: 1,
    category: '播放器',
  },
  {
    id: 'ad-2',
    name: '永利皇宫',
    status: 'offline',
    slot: '首页推荐',
    url: 'https://yy.vip',
    code: '456789',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    order: 2,
    category: 'BC',
  },
];

async function ensureStore() {
  try {
    await fs.access(DATA_PATH);
  } catch (e) {
    await fs.writeFile(DATA_PATH, JSON.stringify(SAMPLE_ADS, null, 2), 'utf8');
  }
}

async function loadAds() {
  try {
    await ensureStore();
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[ads] loadAds fallback to []:', err.message);
    return [];
  }
}

async function saveAds(items) {
  await fs.writeFile(DATA_PATH, JSON.stringify(items, null, 2), 'utf8');
  return items;
}

function normalizeAd(ad) {
  return {
    id: ad.id || `ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: ad.name || '未命名广告',
    status: ad.status || 'offline',
    slot: ad.slot || 'Banner',
    url: ad.url || '',
    code: ad.code || '',
    category: ad.category || '默认',
    createdAt: ad.createdAt || new Date().toISOString(),
    updatedAt: ad.updatedAt || new Date().toISOString(),
    order: typeof ad.order === 'number' ? ad.order : 999,
  };
}

async function listAds({ search = '', status = '', slot = '' } = {}) {
  const ads = await loadAds();
  return ads
    .filter((item) => {
      const matchSearch = search
        ? item.name.toLowerCase().includes(search.toLowerCase()) || item.url.toLowerCase().includes(search.toLowerCase())
        : true;
      const matchStatus = status ? item.status === status : true;
      const matchSlot = slot ? item.slot === slot : true;
      return matchSearch && matchStatus && matchSlot;
    })
    .sort((a, b) => a.order - b.order);
}

async function getAd(id) {
  const ads = await loadAds();
  return ads.find((item) => item.id === id);
}

async function createAd(ad) {
  const ads = await loadAds();
  const item = normalizeAd({ ...ad, status: ad.status || 'online', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (ads.find((existing) => existing.name === item.name)) {
    throw new Error('广告名称已存在');
  }
  item.order = ads.length + 1;
  ads.push(item);
  await saveAds(ads);
  return item;
}

async function updateAd(id, data) {
  const ads = await loadAds();
  const index = ads.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('广告不存在');
  const updated = {
    ...ads[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  ads[index] = normalizeAd(updated);
  await saveAds(ads);
  return ads[index];
}

async function deleteAd(id) {
  const ads = await loadAds();
  const next = ads.filter((item) => item.id !== id).map((item, idx) => ({ ...item, order: idx + 1 }));
  await saveAds(next);
  return { ok: true, id };
}

async function toggleAd(id, status) {
  const ad = await getAd(id);
  if (!ad) throw new Error('广告不存在');
  return updateAd(id, { status });
}

async function dashboardMetrics() {
  const ads = await loadAds();
  const today = new Date().toISOString().slice(0, 10);
  const todayCreated = ads.filter((item) => item.createdAt.startsWith(today)).length;
  const todayOffline = ads.filter((item) => item.status === 'offline' && item.updatedAt.startsWith(today)).length;
  const onlineCount = ads.filter((item) => item.status === 'online').length;
  return {
    todayCreated,
    todayOffline,
    onlineCount,
    slotCount: 0,
    totalAds: ads.length,
  };
}

module.exports = {
  listAds,
  getAd,
  createAd,
  updateAd,
  deleteAd,
  toggleAd,
  dashboardMetrics,
};
