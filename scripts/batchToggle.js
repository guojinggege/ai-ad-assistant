const { openAdminPage, closeBrowser, findRowByName } = require('./_browser');

// 批量上架/下架（点击行内的状态开关 n-switch）
// params: { names: string[], action: 'on' | 'off' }
async function batchToggle(params, log = console.log) {
  const { names, action } = params || {};
  if (!Array.isArray(names) || !names.length) throw new Error('缺少参数：names');
  if (!['on', 'off'].includes(action)) throw new Error('action 必须是 on 或 off');

  const { browser, page } = await openAdminPage(log);
  try {
    for (const name of names) {
      log(`定位: ${name}`);
      const row = await findRowByName(page, name);
      const sw = row.locator('.n-switch');
      await sw.waitFor({ state: 'visible', timeout: 6000 });

      // 当前是否已激活
      const isActive = await sw.evaluate((el) => el.classList.contains('n-switch--active'));
      const wantActive = action === 'on';

      if (isActive === wantActive) {
        log(`  跳过 (${name} 已处于 ${action === 'on' ? '上架' : '下架'} 状态)`);
        continue;
      }

      log(`  点击切换 → ${action === 'on' ? '上架' : '下架'}`);
      await sw.click();
      await page.waitForTimeout(800);

      // 可能出现确认弹窗
      const confirm = page.locator('span.n-button__content').filter({ hasText: '确定' }).last();
      if (await confirm.count()) {
        await confirm.click({ force: true });
      }

      await page.waitForTimeout(1500);
    }

    log(`批量${action === 'on' ? '上架' : '下架'}完成，共 ${names.length} 条`);
    return { ok: true, count: names.length, action };
  } finally {
    await closeBrowser(browser, log);
  }
}

if (require.main === module) {
  const action = process.argv[2]; // on / off
  const names = (process.argv[3] || '').split(',').filter(Boolean);
  if (!action || !names.length) {
    console.error('用法: node scripts/batchToggle.js on|off 名称1,名称2');
    process.exit(1);
  }
  batchToggle({ names, action }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { batchToggle };
