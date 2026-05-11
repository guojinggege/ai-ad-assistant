const path = require('path');
const fs = require('fs/promises');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');
const DEFAULT_SETTINGS = {
  openAIKey: process.env.OPENAI_API_KEY || '',
  claudeApi: '',
  adminUrl: process.env.ADMIN_URL || 'https://adsys.cc/advertise/manage',
  loginUrl: process.env.LOGIN_URL || 'https://adsys.cc/login?redirect=/advertise/manage',
  headless: false,
  autoRetry: 1,
  timeout: 60,
  browserPath: '',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};

async function ensureStore() {
  try {
    await fs.access(SETTINGS_PATH);
  } catch {
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
  }
}

async function loadSettings() {
  await ensureStore();
  const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
  return JSON.parse(raw || '{}');
}

async function saveSettings(next) {
  const current = await loadSettings();
  const merged = { ...current, ...next };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = {
  loadSettings,
  saveSettings,
};
