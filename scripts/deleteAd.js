const { openAdminPage, closeBrowser, findRowByName } = require('./_browser');

// 下架/删除广告（默认走"删除"按钮；若后台用"下架"开关请改 toggleAd）
// params: { name }
async function deleteAd(params, log = console.log) {
  const { name } = params || {};
  if (!name) throw new Error('缺少参数：name');

  const { browser, page } = await openAdminPage(log);
  try {
    log(`定位广告行: ${name}`);
    const row = await findRowByName(page, name);

    log('点击行内"删除"按钮');
    await row.getByRole('button', { name: '删除' }).click();
    await page.waitForTimeout(1000);

    // 二次确认弹窗（Naive UI Popconfirm/Modal）
    log('确认删除');
    const confirm = page.locator('span.n-button__content').filter({ hasText: '确定' }).last();
    if (await confirm.count()) {
      await confirm.click({ force: true });
    }

    await page.waitForTimeout(2500);
    log(`广告 "${name}" 已下架/删除`);
    return { ok: true, name };
  } finally {
    await closeBrowser(browser, log);
  }
}

if (require.main === module) {
  const name = process.argv[2];
  if (!name) { console.error('用法: node scripts/deleteAd.js <广告名称>'); process.exit(1); }
  deleteAd({ name }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { deleteAd };
