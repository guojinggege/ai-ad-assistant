const { createAd } = require('../scripts/createAd');
const { deleteAd } = require('../scripts/deleteAd');
const { sortAd } = require('../scripts/sortAd');
const { replaceLinks } = require('../scripts/replaceLinks');
const { batchToggle } = require('../scripts/batchToggle');
const { login } = require('../scripts/login');

const HELP_TEXT = `支持的指令：
1. 上架广告  名称:测试 链接:https://x.com 验证码:123456
2. 下架 测试
3. 把 测试 排到第一
4. 批量替换链接  把 A、B 的链接批量替换为 https://new.url
5. 批量下架 A、B、C  （或：批量上架 A、B）
6. 保存登录态  —— 首次使用先执行此项`;

async function execute(intent, log) {
  const { action, params, reply } = intent;
  if (reply) log(reply);

  switch (action) {
    case 'create':
      if (!params.name || !params.url) {
        return { ok: false, reason: '参数不全', need: ['name', 'url'] };
      }
      return await createAd(params, log);

    case 'delete':
      if (!params.name) return { ok: false, reason: '缺少 name' };
      return await deleteAd(params, log);

    case 'sort':
      if (!params.name) return { ok: false, reason: '缺少 name' };
      return await sortAd(params, log);

    case 'replaceLinks':
      if (!params.to || !(params.names?.length)) {
        return { ok: false, reason: '需要 names 和 to', need: ['names', 'to'] };
      }
      return await replaceLinks(params, log);

    case 'batchToggle':
      if (!params.action || !(params.names?.length)) {
        return { ok: false, reason: '需要 names 和 action(on/off)' };
      }
      return await batchToggle(params, log);

    case 'login':
      return await login({ log });

    case 'help':
      log(HELP_TEXT);
      return { ok: true, help: HELP_TEXT };

    case 'unknown':
    default:
      log(HELP_TEXT);
      return { ok: false, reason: '未识别的指令' };
  }
}

module.exports = { execute, HELP_TEXT };
