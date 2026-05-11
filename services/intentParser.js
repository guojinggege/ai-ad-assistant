// 意图解析：优先 OpenAI（若配置 OPENAI_API_KEY），否则使用本地规则
// 返回结构: { action, params, reply }
// action 枚举: create | delete | sort | replaceLinks | batchToggle | login | help | unknown

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseChineseNumber(s) {
  if (s == null) return null;
  const n = Number(s);
  if (!Number.isNaN(n)) return n;
  if (CN_NUM[s]) return CN_NUM[s];
  return null;
}

// ---------- 规则解析 ----------
function ruleParse(text) {
  const t = String(text || '').trim();
  if (!t) return { action: 'unknown', params: {}, reply: '请输入指令' };

  // 帮助
  if (/^(help|帮助|怎么用|使用说明)/i.test(t)) {
    return { action: 'help', params: {}, reply: '' };
  }

  // 登录
  if (/(保存登录|重新登录|登录后台|登录态)/.test(t)) {
    return { action: 'login', params: {}, reply: '准备打开浏览器，请手动完成登录' };
  }

  // 排序：把 X 排到第 N / 置顶 X
  let m = t.match(/把\s*([^，。,\s]+?)\s*(?:排到|挪到|移到|放到)\s*第?\s*([0-9一二三四五六七八九十]+)/);
  if (m) {
    return {
      action: 'sort',
      params: { name: m[1], position: parseChineseNumber(m[2]) || 1 },
      reply: `将把"${m[1]}"排到第 ${parseChineseNumber(m[2])} 位`,
    };
  }
  m = t.match(/(?:置顶|排到第一|放第一)\s*[:：]?\s*([^，。,\s]+)/);
  if (m) {
    return { action: 'sort', params: { name: m[1], position: 1 }, reply: `将把"${m[1]}"置顶` };
  }

  // 批量替换链接
  if (/批量.*(替换|更换).*链接/.test(t)) {
    // 尝试抽取 names + 新链接
    const url = (t.match(/https?:\/\/\S+/) || [])[0];
    const namesMatch = t.match(/(?:把|将)\s*([^把将]+?)\s*(?:的)?\s*链接/);
    const names = namesMatch
      ? namesMatch[1].split(/[、,，\s]+/).filter(Boolean)
      : [];
    return {
      action: 'replaceLinks',
      params: { names, to: url },
      reply:
        names.length && url
          ? `将把 ${names.join('、')} 的链接替换为 ${url}`
          : '请提供广告名称列表和新链接，例如：把 A、B 的链接批量替换为 https://new.url',
    };
  }

  // 批量上下架
  m = t.match(/批量\s*(上架|下架|启用|停用|开启|关闭)\s*[:：]?\s*(.+)/);
  if (m) {
    const action = /上架|启用|开启/.test(m[1]) ? 'on' : 'off';
    const names = m[2].split(/[、,，\s]+/).filter(Boolean);
    return {
      action: 'batchToggle',
      params: { names, action },
      reply: `将批量${action === 'on' ? '上架' : '下架'}：${names.join('、')}`,
    };
  }

  // 下架 / 删除
  m = t.match(/^(?:下架|删除|停用|关闭)\s*[:：]?\s*(.+)/);
  if (m) {
    return { action: 'delete', params: { name: m[1].trim() }, reply: `将下架"${m[1].trim()}"` };
  }

  // 上架 / 新增 / 创建
  if (/(上架|新增|创建|添加|新建).*广告/.test(t) || /^(上架|新增|添加|新建)$/.test(t)) {
    // 尝试抽取 name 和 url
    const url = (t.match(/https?:\/\/\S+/) || [])[0];
    const nameMatch = t.match(/(?:名称|名字|叫)\s*[:：]?\s*([^，。,\s]+)/);
    const codeMatch = t.match(/(?:谷歌验证码|验证码|code)\s*[:：]?\s*(\d+)/i);
    const params = {
      name: nameMatch ? nameMatch[1] : null,
      url: url || null,
      googleCode: codeMatch ? codeMatch[1] : null,
    };
    if (params.name && params.url) {
      return { action: 'create', params, reply: `将创建广告："${params.name}" → ${params.url}` };
    }
    return {
      action: 'create',
      params,
      reply:
        '需要更多信息才能上架广告。请按格式提供：\n上架广告 名称:示例广告 链接:https://example.com 验证码:123456',
    };
  }

  return {
    action: 'unknown',
    params: {},
    reply:
      '没听懂。可以试试：\n· 上架广告 名称:测试 链接:https://x.com 验证码:123456\n· 下架 测试\n· 把 测试 排到第一\n· 批量替换链接 把 A、B 的链接批量替换为 https://new.url\n· 批量下架 A、B、C',
  };
}

// ---------- OpenAI 解析 ----------
async function llmParse(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const system = `你是一个广告管理助手的意图解析器，把用户中文指令解析为 JSON。
只允许返回 JSON，不要任何额外文字。schema:
{
  "action": "create" | "delete" | "sort" | "replaceLinks" | "batchToggle" | "login" | "help" | "unknown",
  "params": {
    "name": string | null,
    "url": string | null,
    "googleCode": string | null,
    "position": number | null,
    "names": string[] | null,
    "to": string | null,
    "action": "on" | "off" | null
  },
  "reply": string
}
说明：
- "上架/新增广告" -> create，params 需要 name/url/googleCode
- "下架/删除 X" -> delete，params.name = X
- "把 X 排到第一/第N / 置顶 X" -> sort，params.name 和 position
- "批量替换链接" -> replaceLinks，params.names + params.to
- "批量上架/下架 A、B" -> batchToggle，params.names + params.action(on/off)
- 信息不全时仍返回该 action，但 reply 中明确告诉用户还需要哪些参数。`;

  const resp = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
  });

  const raw = resp.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function parseIntent(text) {
  try {
    const llm = await llmParse(text);
    if (llm && llm.action) return llm;
  } catch (e) {
    console.error('[intentParser] LLM 解析失败，降级到规则解析:', e.message);
  }
  return ruleParse(text);
}

module.exports = { parseIntent, ruleParse };
