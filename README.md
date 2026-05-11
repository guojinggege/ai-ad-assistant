# AI 广告助手 (ad-assistant)

对话式广告管理：用户输入一句话 → AI 解析意图 → Playwright 自动操作 adsys.cc 后台。

## 功能

- 上架广告 / 下架广告
- 排序（置顶 / 排到第 N 位）
- 批量替换链接
- 批量上下架
- ChatGPT 风格 UI：左侧聊天，右侧实时执行日志（SSE 推流）
- 登录态持久化到 `auth.json`，无需每次扫码

## 快速开始

```bash
# 1. 依赖已就绪（cors / express / openai / playwright / dotenv 均已安装）
#    若 node_modules 损坏可重装:
npm install
npx playwright install chromium

# 2. 配置环境变量（可选）
cp .env.example .env
#   不填 OPENAI_API_KEY 也能跑 —— 会自动用本地规则解析

# 3. 启动服务
npm start
#   打开 http://localhost:3100
#   （3000 通常被父目录的 Next.js dev server 占着，因此默认 3100）

# 4. 首次使用：点击右上角 "保存登录态"
#    会打开浏览器，手动登录广告后台，登录后 auth.json 自动写入
#    （本仓库已从 ../auth.json 复制了一份初始登录态）
```

## 指令示例（直接在聊天框输入）

```
上架广告 名称:澳门空降 链接:https://xx.vip 验证码:123456
下架 永利皇宫
把 澳门空降 排到第一
批量替换链接 把 澳门空降、永利皇宫 的链接批量替换为 https://new.vip
批量下架 澳门空降、永利皇宫
保存登录态
```

## 项目结构

```
ad-assistant/
├── server.js                Express + SSE 服务
├── package.json
├── .env.example
├── auth.json                Playwright 登录态（由 scripts/login.js 写入）
├── ads.json                 示例广告数据
├── public/                  前端
│   ├── index.html
│   ├── style.css
│   └── app.js
├── services/
│   ├── intentParser.js      意图解析（OpenAI + 规则降级）
│   └── executor.js          调度到对应脚本
└── scripts/                 Playwright 自动化
    ├── _browser.js          共享：打开后台 / 关闭浏览器 / 行定位
    ├── login.js             保存登录态
    ├── createAd.js          上架
    ├── deleteAd.js          下架/删除
    ├── sortAd.js            排序
    ├── replaceLinks.js      批量替换链接
    └── batchToggle.js       批量上下架
```

## 架构

```
浏览器
 │  POST /api/chat  { message }
 ▼
Express ── parseIntent (OpenAI / 规则) ──► { action, params, reply }
   │
   ▼
executor.dispatch(action) ──► scripts/*.js (Playwright)
   │
   └── log(msg) ──► EventEmitter ──► SSE /api/events ──► 前端右栏
```

## 关于选择器

`createAd.js` 中的选择器（`新增` 按钮、`input[placeholder="请输入广告名称"]`、`span.n-button__content` 等）是从父目录中已经跑通的 `../create-ads.js` 移植过来的。

`deleteAd / sortAd / replaceLinks / batchToggle` 的选择器是基于 Naive UI 常见模式的合理推测。**首次运行某个操作时请打开 headless=false 观察，并在脚本顶部对应位置微调选择器**：

- 删除按钮文案：默认 "删除"，部分后台可能是 "停用" / 行内图标
- 排序控件：默认尝试行内数字输入框，否则尝试 "置顶" 按钮
- 状态开关：默认 `.n-switch`
- 编辑按钮：默认 "编辑" 或 "修改"

## 自定义 / 扩展

- 加新操作：在 `scripts/` 写新脚本，在 `executor.js` 加 case，在 `intentParser.js` 增加规则或更新 LLM prompt
- 切换模型：修改 `.env` 的 `OPENAI_MODEL`
- 让浏览器后台运行：`.env` 设 `HEADLESS=true`

## 故障排查

- **`未检测到 auth.json`**：点击 "保存登录态" 或 `npm run login`
- **元素找不到**：把 `.env` 的 `HEADLESS` 设为 `false`，对着实际页面调整 `scripts/` 里的 selector
- **OpenAI 调用失败**：会自动回退到规则解析，前端徽章会显示 `AI: 本地规则`
