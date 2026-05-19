const path = require('path');
const fs = require('fs/promises');

const TASK_PATH = path.join(__dirname, '..', 'tasks.json');

const SAMPLE_TASKS = [
  {
    id: 'task-1',
    title: '上架广告「澳门空降」',
    action: 'create',
    status: 'success',
    progress: 100,
    startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    finishedAt: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
    logs: ['打开后台', '填写广告信息', '提交成功'],
    result: { ok: true },
  },
  {
    id: 'task-2',
    title: '批量下架广告',
    action: 'batchToggle',
    status: 'failed',
    progress: 100,
    startedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    finishedAt: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
    logs: ['识别指令', '定位广告', '发生错误：登录态失效'],
    result: { ok: false, reason: '登录态失效' },
  },
];

async function ensureStore() {
  try {
    await fs.access(TASK_PATH);
  } catch {
    await fs.writeFile(TASK_PATH, JSON.stringify(SAMPLE_TASKS, null, 2), 'utf8');
  }
}

async function loadTasks() {
  try {
    await ensureStore();
    const raw = await fs.readFile(TASK_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[tasks] loadTasks fallback to []:', err.message);
    return [];
  }
}

async function saveTasks(items) {
  await fs.writeFile(TASK_PATH, JSON.stringify(items, null, 2), 'utf8');
  return items;
}

function normalizeTask(task) {
  return {
    id: task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: task.title || '未命名任务',
    action: task.action || 'unknown',
    status: task.status || 'running',
    progress: typeof task.progress === 'number' ? task.progress : 0,
    startedAt: task.startedAt || new Date().toISOString(),
    finishedAt: task.finishedAt || null,
    logs: Array.isArray(task.logs) ? task.logs : [],
    result: task.result || {},
  };
}

async function listTasks() {
  const tasks = await loadTasks();
  return tasks.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

async function createTask(task) {
  const tasks = await loadTasks();
  const item = normalizeTask(task);
  tasks.unshift(item);
  await saveTasks(tasks.slice(0, 80));
  return item;
}

async function updateTask(id, update) {
  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error('任务不存在');
  }
  tasks[index] = normalizeTask({ ...tasks[index], ...update });
  await saveTasks(tasks);
  return tasks[index];
}

async function appendTaskLog(id, message) {
  const tasks = await loadTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;
  tasks[index].logs.push(message);
  await saveTasks(tasks);
  return tasks[index];
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  appendTaskLog,
};
