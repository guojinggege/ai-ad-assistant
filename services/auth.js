const path = require('path');
const fs = require('fs/promises');
const { authExists: browserAuthExists } = require('../scripts/_browser');
const { login } = require('../scripts/login');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');
const DEFAULT_SETTINGS = {
  openAIKey: process.env.OPENAI_API_KEY || '',
  claudeApi: '',
  adminUrl: process.env.ADMIN_URL || 'https://adsys.cc/advertise/manage',
  loginUrl: process.env.LOGIN_URL || 'https://adsys.cc/login?redirect=/advertise/manage',
  headless: String(process.env.HEADLESS || 'false') === 'true',
  autoRetry: 1,
  timeout: 60,
  browserPath: '',
};

async function getStatus() {
  return {
    authReady: browserAuthExists(),
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    headless: String(process.env.HEADLESS || 'false') === 'true',
  };
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings = {}) {
  const current = await loadSettings();
  const merged = { ...current, ...settings };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = {
  authExists: browserAuthExists,
  getStatus,
  loadSettings,
  saveSettings,
  login,
};
