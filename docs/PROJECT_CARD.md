# AI 广告助手 · 项目档案卡

最后更新：2026-05-19（PR #3 合并后）

## 1. 项目身份
- **名称**：ai-ad-assistant
- **定位**：广告运营平台（智能广告后台）
- **维护者**：guojinggege
- **GitHub**：https://github.com/guojinggege/ai-ad-assistant
- **生产 URL**：https://ad-assistant-kappa.vercel.app

## 2. 技术栈
- **后端**：Node.js + Express，单 `server.js` 入口
- **前端**：原生 JS（`public/app.js`），无构建步骤
- **持久化（当前）**：本地 JSON 文件（`services/*.js` 读写仓库根的 `*.json`）
- **部署**：Vercel serverless（`api/index.js` 包装 `server.js`）

## 3. 目录结构（重点）

~~~
.
├── server.js              # Express 入口，所有 /api/* 路由挂这里
├── api/
│   └── index.js           # Vercel serverless 包装层
├── services/              # 业务逻辑 + 持久化
│   ├── slots.js           # ⚠ load* 已加 cold-start 守卫
│   ├── upload.js          # ⚠ load* 已加 cold-start 守卫
│   ├── ads.js             # ⚠ load* 已加 cold-start 守卫
│   ├── tasks.js           # ⚠ load* 已加 cold-start 守卫
│   ├── settings.js        # ⚠ load* 已加 cold-start 守卫
│   ├── auth.js            # 已自带 try/catch
│   ├── intentParser.js    # 无文件 IO
│   ├── browser.js         # 不涉及持久化
│   ├── executor.js        # 不涉及持久化
│   └── data-platform/
│       └── store.js       # 数据分析模块独立存储，用 /tmp
├── routes/
│   └── dataPlatform.js    # 数据分析模块独立路由
├── public/
│   └── app.js             # 前端入口（state.* + 渲染）
└── *.json                 # slots.json / media.json / ads.json /
                           # tasks.json / settings.json（仓库根）
~~~

## 4. 已上线版本

### v1.0（基础）
- **PR #1**（merged）：feat 数据分析模块（表格导入 + 自动看板 + 查询库）
- **PR #2**（merged）：fix(query) 无聚合无分组时返回完整原始行

### v1.1（hotfix）
- **PR #3**（merged · `c5216b3`）：fix(dashboard) cold-start 守卫
  - 修复 5 个 `services/*.js` 的 `loadXxx` 在 Vercel 只读 FS 下的崩溃
  - 净变 +47 / -15，全部在 `services/`
  - 涉及文件：`slots.js`、`upload.js`、`ads.js`、`tasks.js`、`settings.js`

## 5. 工程惯例

### 5.1 持久化 service 模板（cold-start 安全）

所有走 `fs.readFile` 读本地 JSON 的 service 必须遵循：

- `loadXxx` 包 try/catch
- 解析后用 `Array.isArray`（数组型）或 `parsed && typeof parsed === 'object' && !Array.isArray(parsed)`（对象型）守卫
- catch 块返默认值（`[]` 或 `{}`），并打 `console.warn` 记录降级原因
- `ensureStore` 本体不动，让它本地能初始化文件即可

数组型模板（参考 `services/slots.js`）：

~~~js
async function loadXxx() {
  try {
    await ensureStore();
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[xxx] loadXxx fallback to []:', err.message);
    return [];
  }
}
~~~

对象型模板（参考 `services/settings.js`）：

~~~js
async function loadXxx() {
  try {
    await ensureStore();
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? parsed
      : {};
  } catch (err) {
    console.warn('[xxx] loadXxx fallback to {}:', err.message);
    return {};
  }
}
~~~

### 5.2 commit 与 PR

- 不在 main 直接 commit，所有改动走 PR
- 不加 `Co-Authored-By` trailer
- Author / Committer 必须是 `guojinggege <guojing2026@venuslondontechnology.co.uk>`
- Merge 方式：**Create a merge commit**（保持和 PR #1 #2 一致）
- merge commit 允许使用 GitHub noreply 邮箱（账号 email privacy 决定）

### 5.3 Vercel 验证

- 本地 `npm start` + curl 验证只是初筛
- 真正的回归必须在 PR 的 Vercel preview 上验完才能 merge

## 6. 已知问题 / 未解决（v2 候选）

### 6.1 Vercel 持久化未根本解决（关键）

- 当前 `services/*.js` 在 Vercel 上 cold-start 不再崩溃，但 `saveXxx` 仍然失败（EROFS）
- 也就是说：生产 URL 上任何"新增 / 修改广告位 / 上传素材 / 创建任务"实际都没存住
- 解决方向：Vercel KV / Vercel Blob / Postgres 三选一
- **这是 v2 必须先决策的事，否则任何新功能在 prod 都跑不通**

### 6.2 前端 UI 小瑕疵

- 页面左下角硬编码 `运行端口 localhost:3100`，在 Vercel 上也照样显示
- 优先级：低

## 7. v2 路线（待规划）

- [ ] **持久化层选型（前置）** — 必须先定，否则后面所有功能都重蹈 PR #3
- [ ] **问题反馈模块** — 用户已提需求：左侧加菜单"问题反馈"，提交入口 + 列表呈现，含图片/视频上传、问题类型、描述、解决方案、解决进度。等持久化层定了再开始
- [ ] product-360 重构 — 暂缓

## 8. 重启项目 checklist

1. `cd ~/Desktop/ai-projects/ai-ad-assistant`
2. `git checkout main && git pull`
3. `git status` 确认 clean
4. `npm install`（如果是 fresh clone）
5. `npm start`，打开 http://localhost:3100 验证基础渲染
6. 读这份档案卡的 §4（看上次到哪）和 §6（看有什么坑）
