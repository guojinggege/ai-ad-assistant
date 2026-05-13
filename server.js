require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { EventEmitter } = require('events');

const adsService = require('./services/ads');
const mediaService = require('./services/upload');
const slotsService = require('./services/slots');
const authService = require('./services/auth');
const settingsService = require('./services/settings');
const tasksService = require('./services/tasks');
const { parseIntent } = require('./services/intentParser');
const { execute } = require('./services/executor');
const { login } = require('./scripts/login');
const { authExists } = require('./scripts/_browser');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const bus = new EventEmitter();
bus.setMaxListeners(100);

function broadcast(type, data) {
  bus.emit('event', { type, data, ts: Date.now() });
}

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`: connected ${new Date().toISOString()}\n\n`);

  const onEvent = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  bus.on('event', onEvent);

  const heartbeat = setInterval(() => res.write(`: hb\n\n`), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('event', onEvent);
  });
});

app.get('/api/status', async (req, res) => {
  res.json(await authService.getStatus());
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const ads = await adsService.listAds();
    const slots = await slotsService.listSlots();
    const tasks = await tasksService.listTasks();
    const today = new Date().toISOString().slice(0, 10);
    const successCount = tasks.filter((task) => task.status === 'success').length;
    const failCount = tasks.filter((task) => task.status === 'failed').length;
    const runningCount = tasks.filter((task) => task.status === 'running').length;
    const createdToday = ads.filter((item) => (item.createdAt || '').startsWith(today)).length;
    const offlineToday = ads.filter((item) => item.status === 'offline' && (item.updatedAt || '').startsWith(today)).length;

    res.json({
      metrics: {
        todayCreated: createdToday,
        todayOffline: offlineToday,
        onlineAds: ads.filter((item) => item.status === 'online').length,
        slotCount: slots.length,
        successRate: tasks.length ? Math.round((successCount / tasks.length) * 100) : 100,
      },
      charts: {
        trend: Array.from({ length: 7 }, (_, idx) => ({
          label: `Day ${idx + 1}`,
          value: Math.max(0, Math.round(Math.random() * 20 + 10 + idx * 3)),
        })),
        distribution: [
          { label: '在线广告', value: ads.filter((item) => item.status === 'online').length },
          { label: '下线广告', value: ads.filter((item) => item.status === 'offline').length },
        ],
      },
      recentExecutions: tasks.slice(0, 6),
      aiTaskStats: {
        total: tasks.length,
        success: successCount,
        failed: failCount,
        running: runningCount,
      },
      failedTasks: tasks.filter((task) => task.status === 'failed').slice(0, 5),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ads', async (req, res) => {
  try {
    res.json(await adsService.listAds(req.query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ads', async (req, res) => {
  try {
    const ad = await adsService.createAd(req.body);
    broadcast('log', { message: `广告已创建：${ad.name}` });
    res.json(ad);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/ads/:id', async (req, res) => {
  try {
    const ad = await adsService.updateAd(req.params.id, req.body);
    broadcast('log', { message: `广告已更新：${ad.name}` });
    res.json(ad);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/ads/:id', async (req, res) => {
  try {
    const result = await adsService.deleteAd(req.params.id);
    broadcast('log', { message: `广告已删除：${req.params.id}` });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/ads/batch', async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length) throw new Error('缺少ids');
    const result = [];
    for (const id of ids) {
      const ad = await adsService.toggleAd(id, action === 'on' ? 'online' : 'offline');
      result.push(ad);
    }
    broadcast('log', { message: `批量操作已执行：${action}` });
    res.json({ ok: true, count: result.length, items: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/media', async (req, res) => {
  try {
    res.json(await mediaService.listMedia());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/media', async (req, res) => {
  try {
    const media = await mediaService.saveMediaFile(req.body);
    broadcast('log', { message: `素材已上传：${media.fileName}` });
    res.json(media);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  try {
    const result = await mediaService.deleteMedia(req.params.id);
    broadcast('log', { message: `素材已删除：${req.params.id}` });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/slots', async (req, res) => {
  try {
    res.json(await slotsService.listSlots());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/slots', async (req, res) => {
  try {
    const slot = await slotsService.createSlot(req.body);
    broadcast('log', { message: `广告位已创建：${slot.name}` });
    res.json(slot);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/slots/:id', async (req, res) => {
  try {
    const slot = await slotsService.updateSlot(req.params.id, req.body);
    broadcast('log', { message: `广告位已更新：${slot.name}` });
    res.json(slot);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/slots/:id', async (req, res) => {
  try {
    const result = await slotsService.deleteSlot(req.params.id);
    broadcast('log', { message: `广告位已删除：${req.params.id}` });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    res.json(await tasksService.listTasks());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    res.json(await settingsService.loadSettings());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = await settingsService.saveSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const message = (req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'empty message' });

  broadcast('user', { message });

  let task = await tasksService.createTask({
    title: `AI 执行：${message}`,
    action: 'ai',
    status: 'running',
    progress: 10,
    startedAt: new Date().toISOString(),
    logs: ['任务已提交到 AI 助手'],
  });
  broadcast('task', { task });

  const log = async (msg) => {
    const content = String(msg);
    console.log('[exec]', content);
    broadcast('log', { message: content });
    await tasksService.appendTaskLog(task.id, content);
    task = await tasksService.updateTask(task.id, { progress: Math.min(95, task.progress + 10) });
    broadcast('task', { task });
  };

  try {
    log(`解析指令: ${message}`);
    const intent = await parseIntent(message);
    broadcast('intent', intent);
    log(`识别为: ${intent.action}  参数: ${JSON.stringify(intent.params)}`);

    const result = await execute(intent, log);
    const finalTask = await tasksService.updateTask(task.id, {
      status: result.ok ? 'success' : 'failed',
      progress: 100,
      finishedAt: new Date().toISOString(),
      result,
    });
    broadcast('task', { task: finalTask });
    broadcast('result', { intent, result });
    res.json({ intent, result });
  } catch (e) {
    console.error(e);
    await tasksService.updateTask(task.id, {
      status: 'failed',
      progress: 100,
      finishedAt: new Date().toISOString(),
      result: { ok: false, reason: e.message },
    });
    log(`错误: ${e.message}`);
    broadcast('error', { message: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const log = (msg) => { console.log('[login]', msg); broadcast('log', { message: String(msg) }); };
  try {
    const result = await login({ log, onReady: (m) => broadcast('log', { message: m }) });
    broadcast('result', { intent: { action: 'login' }, result });
    res.json(result);
  } catch (e) {
    log(`错误: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI 广告助手已启动: http://localhost:${PORT}`);
    console.log(`auth.json 状态: ${authExists() ? '已就绪' : '未保存（请先点击\"保存登录态\"）'}`);
    console.log(`OpenAI Key: ${process.env.OPENAI_API_KEY ? '已配置' : '未配置 —— 将使用本地规则解析'}`);
  });
}

module.exports = app;

app.use('/api/data', require('./routes/dataPlatform'));
