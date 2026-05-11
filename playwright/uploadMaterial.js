const path = require('path');
const { openAdminPage, closeBrowser } = require('../services/browser');

async function uploadMaterial({ filePath, category = '默认' }, log = console.log) {
  if (!filePath) throw new Error('uploadMaterial: filePath 为必填项');

  const { browser, page } = await openAdminPage(log);
  try {
    log('导航到素材管理页面');
    await page.waitForTimeout(1500);
    await page.goto(`${page.url().split('/advertise')[0]}/advertise/media`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);

    const input = page.locator('input[type="file"]');
    if (await input.count()) {
      log('选择文件上传');
      await input.setInputFiles(path.resolve(filePath));
    } else {
      log('尝试通过页面上传按钮打开文件选择器');
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('button:has-text("上传"), span:has-text("上传")').first().click({ force: true }),
      ]);
      await chooser.setFiles(path.resolve(filePath));
    }

    await page.waitForTimeout(2200);
    log('文件已添加，提交等待完成');
    await page.locator('button:has-text("保存"), button:has-text("提交"), span:has-text("保存")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    log('素材上传完成');
    return { ok: true, filePath };
  } finally {
    await closeBrowser(browser, log);
  }
}

module.exports = { uploadMaterial };
