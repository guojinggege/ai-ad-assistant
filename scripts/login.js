const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const AUTH_PATH = path.join(ROOT, 'auth.json');
const LOGIN_URL = process.env.LOGIN_URL || 'https://adsys.cc/login?redirect=/advertise/manage';

// 打开浏览器让用户手动登录，登录后保存 storageState 到 auth.json
// log: 进度回调；onReady: 浏览器打开后立即通知前端（带上提示语）
async function login({ log = console.log, onReady } = {}) {
  log('启动浏览器（请勿手动关闭）...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  log(`打开登录页 ${LOGIN_URL}`);
  await page.goto(LOGIN_URL);

  log('请在浏览器中完成登录。登录成功并跳转到后台后，本程序会自动检测并保存登录态。');
  if (onReady) onReady('请在弹出的浏览器中完成登录');

  // 等待跳转到后台页面（最长 5 分钟）
  await page.waitForURL(/\/advertise\/manage/, { timeout: 5 * 60 * 1000 });
  log('检测到已进入后台，保存登录态...');

  // 多等一会，让 localStorage / cookie 全部写入
  await page.waitForTimeout(2500);
  await context.storageState({ path: AUTH_PATH });
  log(`登录态已保存: ${AUTH_PATH}`);

  await browser.close();
  return { ok: true, path: AUTH_PATH };
}

if (require.main === module) {
  login().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { login };
