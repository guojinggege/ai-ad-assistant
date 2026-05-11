const { openAdminPage, closeBrowser } = require('./_browser');

// 创建一个广告
// params: { name, url, googleCode, client?, type?, mode? }
async function createAd(params, log = console.log) {
  const { name, url, googleCode } = params || {};
  if (!name || !url) {
    throw new Error('缺少必要参数：name / url');
  }

  const { browser, page } = await openAdminPage(log);

  try {
    log(`开始创建广告: ${name}`);
    await page.getByRole('button', { name: '新增' }).click();
    await page.waitForTimeout(1500);

    log('填写广告名称');
    await page.locator('input[placeholder="请输入广告名称"]').fill(name);

    log('填写广告链接');
    await page.locator('input[placeholder="请输入广告协议链接"]').fill(url);

    if (googleCode) {
      log('填写谷歌验证码');
      await page.locator('input[placeholder="请输入谷歌验证码"]').fill(String(googleCode));
    }

    // 滚到底再点提交，避免被弹窗遮挡
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    log('提交');
    await page.locator('span.n-button__content')
      .filter({ hasText: '提交' })
      .last()
      .click({ force: true });

    await page.waitForTimeout(3000);
    log(`广告 "${name}" 创建完成`);
    return { ok: true, name };
  } finally {
    await closeBrowser(browser, log);
  }
}

if (require.main === module) {
  const name = process.argv[2] || '测试广告';
  const url = process.argv[3] || 'https://example.com';
  const googleCode = process.argv[4];
  createAd({ name, url, googleCode }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createAd };
