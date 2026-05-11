const { openAdminPage, closeBrowser, findRowByName } = require('./_browser');

// 把指定广告排到指定位置（默认第 1 位）
// 实现策略：优先尝试行内"排序"数字输入框；其次尝试"置顶"按钮
// params: { name, position }
async function sortAd(params, log = console.log) {
  const { name, position = 1 } = params || {};
  if (!name) throw new Error('缺少参数：name');

  const { browser, page } = await openAdminPage(log);
  try {
    log(`定位广告行: ${name}`);
    const row = await findRowByName(page, name);

    // 策略 A：行内有数字输入（排序权重）
    const sortInput = row.locator('input[type="number"], input.n-input__input-el').first();
    if (await sortInput.count()) {
      log(`填入排序值 ${position}`);
      await sortInput.click({ clickCount: 3 });
      await sortInput.fill(String(position));
      await sortInput.press('Enter');
      await page.waitForTimeout(2000);
      log(`广告 "${name}" 已排到第 ${position}`);
      return { ok: true, name, position };
    }

    // 策略 B：行内"置顶"按钮（仅当 position == 1）
    if (Number(position) === 1) {
      const topBtn = row.getByRole('button', { name: /置顶|排到第一|置首/ });
      if (await topBtn.count()) {
        log('点击"置顶"');
        await topBtn.click();
        await page.waitForTimeout(2000);
        log(`广告 "${name}" 已置顶`);
        return { ok: true, name, position: 1 };
      }
    }

    throw new Error('未在行内找到排序控件，请检查页面结构后调整 sortAd.js 中的选择器');
  } finally {
    await closeBrowser(browser, log);
  }
}

if (require.main === module) {
  const name = process.argv[2];
  const position = Number(process.argv[3] || 1);
  if (!name) { console.error('用法: node scripts/sortAd.js <广告名称> [位置]'); process.exit(1); }
  sortAd({ name, position }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { sortAd };
