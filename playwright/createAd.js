const { openAdminPage, closeBrowser } = require('../services/browser');

async function createAd(params, log = console.log) {
  const { name, url, googleCode, slot } = params || {};
  if (!name || !url) throw new Error('createAd: name 和 url 为必填项');

  const { browser, page } = await openAdminPage(log);
  try {
    log('打开广告创建页面');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /新增|创建|添加/ }).click({ timeout: 8000 });
    await page.waitForTimeout(1200);

    log('填写广告名称和链接');
    await page.locator('input[placeholder*="广告名称"], input[placeholder*="请输入广告名称"]').fill(name);
    await page.locator('input[placeholder*="协议链接"], input[placeholder*="请输入广告协议链接"]').fill(url);
    if (googleCode) {
      await page.locator('input[placeholder*="验证码"], input[placeholder*="请输入谷歌验证码"]').fill(String(googleCode));
    }
    if (slot) {
      const slotField = page.locator('input[placeholder*="广告位"], input[placeholder*="请选择广告位"]').first();
      if (await slotField.count()) {
        await slotField.click();
        await page.keyboard.type(slot);
        await page.keyboard.press('Enter');
      }
    }

    log('提交广告信息');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    await page.locator('button:has-text("提交"), span:has-text("提交"):visible').first().click({ force: true });
    await page.waitForTimeout(3000);
    log(`广告 ${name} 已提交`);
    return { ok: true, name };
  } finally {
    await closeBrowser(browser, log);
  }
}

module.exports = { createAd };
