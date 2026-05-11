// 兼容入口：直接以 CLI 形式打开广告后台并保持窗口（沿用旧 agent.js 行为）
// 推荐使用 server.js 启动 Web 服务
const { openAdminPage } = require('./scripts/_browser');

(async () => {
  const { browser } = await openAdminPage();
  console.log('已打开后台，按 Ctrl+C 退出');
  await new Promise(() => {});
  // eslint-disable-next-line no-unused-vars
  void browser;
})();
