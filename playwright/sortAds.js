const { openAdminPage, closeBrowser } = require('../services/browser');

async function sortAds(params, log = console.log) {
  const { name, position = 1 } = params || {};
  if (!name) throw new Error('sortAds: name 为必填项');

  const { browser, page } = await openAdminPage(log);
  try {
    log(`开始定位广告：${name}`);
    await page.waitForTimeout(1500);
    const row = page.locator('td', { hasText: name }).first();
    await row.waitFor({ state: 'visible', timeout: 8000 });
    const input = row.locator('input[type="number"], input.n-input__input-el').first();
    if (await input.count()) {
      await input.click({ clickCount: 3 });
      await input.fill(String(position));
      await input.press('Enter');
      await page.waitForTimeout(2000);
      log(`排序值已更新为 ${position}`);
      return { ok: true, name, position };
    }

    if (Number(position) === 1) {
      const topButton = row.locator('button:has-text("置顶"), button:has-text("排到第一"), span:has-text("置顶")').first();
      if (await topButton.count()) {
        await topButton.click();
        await page.waitForTimeout(2000);
        log(`广告 ${name} 已置顶`);
        return { ok: true, name, position: 1 };
      }
    }

    throw new Error('未找到可用的排序控件，请检查后台页面');
  } finally {
    await closeBrowser(browser, log);
  }
}

module.exports = { sortAds };
