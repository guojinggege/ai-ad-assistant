const { openAdminPage, closeBrowser, findRowByName } = require('./_browser');

// 批量替换广告链接
// 用法一：mappings: [{ name, url }] —— 按名称精确替换
// 用法二：from + to —— 把链接里包含 from 的全部替换为 to（实际是逐条编辑）
async function replaceLinks(params, log = console.log) {
  const { mappings, from, to, names } = params || {};

  let workList = [];
  if (Array.isArray(mappings) && mappings.length) {
    workList = mappings;
  } else if (to && Array.isArray(names) && names.length) {
    workList = names.map((n) => ({ name: n, url: to }));
  } else if (to && from) {
    // 没有名单时，提示用户提供
    throw new Error('请提供 names 或 mappings；仅靠 from/to 暂不支持自动扫描全表');
  } else {
    throw new Error('缺少参数：mappings 或 (names + to)');
  }

  const { browser, page } = await openAdminPage(log);
  try {
    for (const item of workList) {
      log(`处理: ${item.name}  →  ${item.url}`);
      const row = await findRowByName(page, item.name);

      // 点击行内"编辑"
      await row.getByRole('button', { name: /编辑|修改/ }).click();
      await page.waitForTimeout(1500);

      // 在弹窗 / 编辑表单里替换链接
      const linkInput = page.locator('input[placeholder="请输入广告协议链接"]');
      await linkInput.waitFor({ state: 'visible', timeout: 8000 });
      await linkInput.click({ clickCount: 3 });
      await linkInput.fill(item.url);

      // 提交
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.locator('span.n-button__content')
        .filter({ hasText: /提交|保存|确定/ })
        .last()
        .click({ force: true });

      await page.waitForTimeout(2500);
      log(`已更新: ${item.name}`);
    }

    log(`共更新 ${workList.length} 条广告链接`);
    return { ok: true, count: workList.length };
  } finally {
    await closeBrowser(browser, log);
  }
}

if (require.main === module) {
  // node scripts/replaceLinks.js name1,name2 https://new.url
  const names = (process.argv[2] || '').split(',').filter(Boolean);
  const to = process.argv[3];
  if (!names.length || !to) {
    console.error('用法: node scripts/replaceLinks.js 名称1,名称2 https://new.url');
    process.exit(1);
  }
  replaceLinks({ names, to }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { replaceLinks };
