const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const AUTH_PATH = path.join(ROOT, 'auth.json');
const ADMIN_URL = process.env.ADMIN_URL || 'https://adsys.cc/advertise/manage';
const HEADLESS = String(process.env.HEADLESS || 'false') === 'true';

function authExists() {
  return fs.existsSync(AUTH_PATH);
}

async function openAdminPage(log = console.log) {
  if (!authExists()) {
    throw new Error('未检测到 auth.json，请先在界面点击 "保存登录态" 或运行 npm run login');
  }

  log('启动浏览器...');
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 400 });
  const context = await browser.newContext({ storageState: AUTH_PATH });
  const page = await context.newPage();

  log(`打开广告后台 ${ADMIN_URL}`);
  await page.goto(ADMIN_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  log('已进入后台');

  return { browser, context, page };
}

async function closeBrowser(browser, log = console.log) {
  log('关闭浏览器');
  await browser.close();
}

// 在广告列表中按名称定位一行（adsys.cc 用 Naive UI 表格）
// 通过单元格文本匹配，然后向上找到 tr
async function findRowByName(page, name) {
  const cell = page.locator('td', { hasText: name }).first();
  await cell.waitFor({ state: 'visible', timeout: 8000 });
  return cell.locator('xpath=ancestor::tr[1]');
}

module.exports = {
  ROOT,
  AUTH_PATH,
  ADMIN_URL,
  HEADLESS,
  authExists,
  openAdminPage,
  closeBrowser,
  findRowByName,
};
