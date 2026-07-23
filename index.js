/**
 * 物业工单系统后端
 * sql.js (纯JS SQLite) 本地存储
 */
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// 环境变量
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const PORT = process.env.PORT || 3001;
const NOTIFY_WEBHOOK = process.env.NOTIFY_WEBHOOK || '';
const DB_PATH = path.join(__dirname, 'data.db');

// ============ 句子秒懂 API 配置 ============
const JZMM_BASE_URL = 'https://stride-md.dpclouds.com';
const JZMM_ACCESS_KEY_ID = process.env.JZMM_ACCESS_KEY_ID || '';
const JZMM_ACCESS_KEY_SECRET = process.env.JZMM_ACCESS_KEY_SECRET || '';
const JZMM_BOT_ID = process.env.JZMM_BOT_ID || '449022b0-ff71-4f47-b8b4-2eac094c575e';
const JZMM_EVENT_ID = process.env.JZMM_EVENT_ID || 'a277efc6-025f-41cd-8888-43e3a8e8e28f';
const JZMM_SESSION_ID = process.env.JZMM_SESSION_ID || '6a5a19ebce406a6aee929fe0';

// accessToken 缓存
let cachedAccessToken = null;
let tokenExpiresAt = 0; // 时间戳(ms)

let db;

// ============ 句子秒懂 Token 管理 ============
/**
 * 获取句子秒懂 accessToken（带缓存，有效期内不重复请求）
 */
async function getJzmAccessToken() {
  // 如果缓存的 token 还有超过5分钟有效期，直接返回
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedAccessToken;
  }

  if (!JZMM_ACCESS_KEY_ID || !JZMM_ACCESS_KEY_SECRET) {
    throw new Error('未配置 JZMM_ACCESS_KEY_ID 或 JZMM_ACCESS_KEY_SECRET');
  }

  const resp = await fetch(`${JZMM_BASE_URL}/openapi/get-access-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessKeyId: JZMM_ACCESS_KEY_ID,
      accessKeySecret: JZMM_ACCESS_KEY_SECRET
    })
  });

  const result = await resp.json();
  if (result.code !== 0 || !result.data || !result.data.accessToken) {
    throw new Error(`获取 accessToken 失败: ${JSON.stringify(result)}`);
  }

  cachedAccessToken = result.data.accessToken;
  // expiresIn 是秒数，转为毫秒时间戳
  tokenExpiresAt = Date.now() + result.data.expiresIn * 1000;
  console.log(`[句子秒懂] accessToken 已刷新，有效期 ${result.data.expiresIn}s`);
  return cachedAccessToken;
}

/**
 * 触发句子秒懂流程引擎事件
 * @param {string} sessionId - 会话ID
 * @param {string} message - 要传递给流程引擎的消息内容
 * @param {object} [options] - 可选参数覆盖 botId/eventId
 */
async function triggerJzmWorkflowEvent(sessionId, message, options = {}) {
  const token = await getJzmAccessToken();
  const botId = options.botId || JZMM_BOT_ID;
  const eventId = options.eventId || JZMM_EVENT_ID;

  const body = {
    botId,
    eventId,
    sessionId,
    params: { message },
    isMh: true
  };

  console.log(`[句子秒懂] 触发事件: sessionId=${sessionId}, message=${message.substring(0, 50)}...`);

  const resp = await fetch(`${JZMM_BASE_URL}/openapi/workflow/event/trigger`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await resp.json().catch(() => ({}));
  if (resp.status === 201 || (result && result.code === 0)) {
    console.log(`[句子秒懂] 事件触发成功`);
    return { success: true, data: result };
  } else {
    console.error(`[句子秒懂] 事件触发失败:`, result);
    return { success: false, error: result };
  }
}

async function initDB() {
  const SQL = await initSqlJs();
  // 如果已有数据库文件则加载
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'repair',
      cat TEXT NOT NULL DEFAULT '其他',
      desc TEXT DEFAULT '',
      loc TEXT DEFAULT '',
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'wait',
      worker TEXT DEFAULT '',
      message TEXT DEFAULT '',
      created TEXT NOT NULL,
      finished TEXT DEFAULT '',
      reject_reason TEXT DEFAULT '',
      estimated_hours REAL DEFAULT 0,
      session_id TEXT DEFAULT ''
    )
  `);

  // 兼容旧数据库：如果 session_id 列不存在则添加
  try {
    db.run(`ALTER TABLE tickets ADD COLUMN session_id TEXT DEFAULT ''`);
  } catch (e) {
    // 列已存在，忽略
  }

  // 用户表（登录用）
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'worker'
    )
  `);

  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function rowToTicket(row) {
  return {
    id: row.id,
    type: row.type,
    cat: row.cat,
    desc: row.desc,
    loc: row.loc,
    priority: row.priority,
    status: row.status,
    worker: row.worker || null,
    message: row.message || '',
    created: row.created,
    finished: row.finished || null,
    rejectReason: row.reject_reason || '',
    estimated_hours: row.estimated_hours || 0,
    sessionId: row.session_id || ''
  };
}

// ============ Express ============
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ 登录接口 ============
// POST /api/login — 手机号+密码登录
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: '请输入手机号和密码' });
  const user = queryOne('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!user) return res.status(401).json({ error: '手机号未注册' });
  if (user.password !== password) return res.status(401).json({ error: '密码错误' });
  res.json({ success: true, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } });
});

// POST /api/users — 创建用户（主管在管理平台添加）
app.post('/api/users', (req, res) => {
  const { phone, password, name, role } = req.body;
  if (!phone || !password || !name) return res.status(400).json({ error: '手机号、密码、姓名必填' });
  try {
    db.run('INSERT INTO users (phone, password, name, role) VALUES (?, ?, ?, ?)', [phone, password, name, role || 'worker']);
    saveDB();
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: '该手机号已注册' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users — 获取所有用户
app.get('/api/users', (req, res) => {
  const users = queryAll('SELECT id, phone, name, role FROM users');
  res.json({ data: users });
});

// DELETE /api/users/:id — 删除用户
app.delete('/api/users/:id', (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ success: true });
});

// GET /api/tickets
app.get('/api/tickets', (req, res) => {
  const rows = queryAll('SELECT * FROM tickets ORDER BY created DESC');
  res.json({ data: rows.map(rowToTicket) });
});

// GET /api/tickets/:id
app.get('/api/tickets/:id', (req, res) => {
  const row = queryOne('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: '工单不存在' });
  res.json({ data: rowToTicket(row) });
});

// POST /api/tickets — 创建工单
app.post('/api/tickets', (req, res) => {
  const t = req.body;
  // id 不再是必传参数，如未传或传入无效值则自动生成顺序工单号
  const rawId = t.id ? String(t.id).trim() : '';
  const invalidIds = ['测试', 'test', ''];
  let id;
  if (rawId && !invalidIds.includes(rawId.toLowerCase())) {
    id = rawId;
  } else {
    // 查找数据库中最大的WX编号，+1生成新号
    const maxRow = queryOne("SELECT id FROM tickets WHERE id LIKE 'WX%' ORDER BY CAST(SUBSTR(id, 3) AS INTEGER) DESC LIMIT 1");
    const maxNum = maxRow ? parseInt(maxRow.id.replace('WX', '')) || 0 : 0;
    id = 'WX' + String(maxNum + 1).padStart(4, '0');
  }
  const now = t.created || new Date().toISOString();
  try {
    db.run(
      `INSERT INTO tickets (id, type, cat, desc, loc, priority, status, worker, message, created, estimated_hours, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, t.type || 'repair', t.cat || '其他', t.desc || '', t.loc || '', t.priority || 'normal', t.status || 'wait', t.worker || '', t.message || '', now, t.estimated_hours || 0, t.sessionId || '']
    );
    saveDB();
    const row = queryOne('SELECT * FROM tickets WHERE id = ?', [id]);
    const ticket = rowToTicket(row);
    // 计算预估最快接单时间
    const estimate = estimateNextAvailable();
    const estimateMsg = estimate.minutes === 0 
      ? `当前有 ${estimate.workers.length} 名空闲师傅（${estimate.workers.join('、')}），可立即响应` 
      : `当前师傅均在处理中，预计 ${estimate.workers[0]} 最快约 ${estimate.minutes} 分钟后可接单`;

    res.json({ success: true, record: ticket, estimate: { freeWorkers: estimate.workers, minutesUntilAvailable: estimate.minutes, message: estimateMsg } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tickets/:id — 更新工单
app.patch('/api/tickets/:id', async (req, res) => {
  const updates = req.body;
  const allowed = { status: 'status', worker: 'worker', priority: 'priority', finished: 'finished', reject_reason: 'reject_reason', rejectReason: 'reject_reason', estimated_hours: 'estimated_hours', cat: 'cat', loc: 'loc', desc: 'desc', message: 'message', sessionId: 'session_id' };
  const sets = [];
  const values = [];

  for (const [key, col] of Object.entries(allowed)) {
    if (updates[key] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(updates[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '无更新字段' });

  values.push(req.params.id);
  try {
    db.run(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, values);
    saveDB();
    const row = queryOne('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '工单不存在' });
    const ticket = rowToTicket(row);

    // 工单完成时自动触发句子秒懂流程引擎事件
    if (updates.status === 'done' && ticket.message) {
      const sid = ticket.sessionId || JZMM_SESSION_ID;
      // 从 message 中提取居民原始消息（如果 message 是整段话术则截取"原文消息："后面的内容）
      let originalMsg = ticket.message;
      const origMatch = ticket.message.match(/原文消息[：:]\s*(.+?)(?:\n|———|$)/);
      if (origMatch) originalMsg = origMatch[1].trim();
      // 构造完结通知话术
      const finishedTime = ticket.finished || new Date().toISOString();
      const fmtTime = new Date(finishedTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const completeMessage = `\n————工单完结提醒————\n时段：${fmtTime}\n工单号：${ticket.id}\n反馈事件：${ticket.cat}\n处理人：${ticket.worker || '未指定'}\n原文消息：${originalMsg}\n———！！已处理完毕！！———`;
      triggerJzmWorkflowEvent(sid, completeMessage).catch(err => {
        console.error('[句子秒懂] 完成工单触发事件失败:', err.message);
      });
    }

    res.json({ success: true, record: ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tickets/:id
app.delete('/api/tickets/:id', (req, res) => {
  db.run('DELETE FROM tickets WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ success: true });
});

// ============ 通知回调 ============
async function sendNotify(payload) {
  if (!NOTIFY_WEBHOOK) return { success: false, error: '未配置 NOTIFY_WEBHOOK' };
  try {
    const resp = await fetch(NOTIFY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    return { success: resp.ok, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// POST /api/notify
app.post('/api/notify', async (req, res) => {
  const { ticketId, event } = req.body;
  const row = queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!row) return res.status(404).json({ error: '工单不存在' });
  const ticket = rowToTicket(row);
  const payload = { event: event || 'completed', ticket, timestamp: new Date().toISOString() };
  const result = await sendNotify(payload);
  res.json(result);
});

// ============ 句子秒懂流程引擎 ============

// POST /api/jzm/trigger-event — 手动触发流程引擎事件
app.post('/api/jzm/trigger-event', async (req, res) => {
  const { sessionId, message, botId, eventId } = req.body;
  if (!sessionId) return res.status(400).json({ error: '缺少 sessionId' });
  if (!message) return res.status(400).json({ error: '缺少 message' });

  try {
    const result = await triggerJzmWorkflowEvent(sessionId, message, { botId, eventId });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/jzm/token — 获取/查看当前 accessToken（调试用）
app.post('/api/jzm/token', async (req, res) => {
  try {
    const token = await getJzmAccessToken();
    res.json({
      success: true,
      accessToken: token,
      expiresAt: new Date(tokenExpiresAt).toISOString(),
      remainingSeconds: Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000))
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ 定时任务：待派单提醒 & 预估接单时间 ============
const ALERT_SESSION_ID = process.env.JZMM_ALERT_SESSION_ID || JZMM_SESSION_ID;
let reminderInterval = 0; // 默认关闭推送
let reminderTimer = null;

// 句子秒懂直接发消息 API 配置
const JZMM_MSG_TOKEN = process.env.JZMM_MSG_TOKEN || 'd12195ec829f4bc7a84849e79f1c0bc7';
const JZMM_IM_BOT_ID = process.env.JZMM_IM_BOT_ID || '6a5a1834766986bb5adc5761';
const JZMM_ALERT_ROOM_ID = process.env.JZMM_ALERT_ROOM_ID || 'R:10856729056671822';
const JZMM_MANAGER_CONTACT_ID = process.env.JZMM_MANAGER_CONTACT_ID || '7881302262050947';

/**
 * 通过句子秒懂发送消息API直接发消息到群（支持@人）
 */
async function sendJzmMessage(roomId, text, mentionContactId) {
  const baseUrl = process.env.JZMM_MSG_BASE_URL || 'https://open.dpclouds.com';
  const url = `${baseUrl}/api/v2/message/send?token=${JZMM_MSG_TOKEN}`;
  const body = {
    imBotId: JZMM_IM_BOT_ID,
    imRoomId: roomId,
    messageType: 7,
    payload: { text, mentionContactIds: mentionContactId ? [mentionContactId] : [] }
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();
    if (result.errcode === 0) {
      console.log('[发消息] 成功发送到群:', roomId);
      return { success: true, data: result };
    } else {
      console.error('[发消息] 失败:', result);
      return { success: false, error: result };
    }
  } catch (e) {
    console.error('[发消息] 网络错误:', e.message);
    return { success: false, error: e.message };
  }
}

function getWaitingTicketsReminder() {
  const waitTickets = queryAll("SELECT * FROM tickets WHERE status = 'wait'");
  if (!waitTickets.length) return null;
  return `当前还有 ${waitTickets.length} 张工单待派单，请尽快处理。`;
}

function estimateNextAvailable() {
  // 获取所有在岗师傅，计算最早空闲时间
  const now = Date.now();
  const activeWorkers = queryAll("SELECT DISTINCT worker FROM tickets WHERE status = 'doing' AND worker != ''");
  const allWorkers = ['张师傅', '李师傅', '王师傅', '赵师傅', '孙师傅'];
  // 没有处理中工单的师傅 = 立即可用
  const busyNames = activeWorkers.map(r => r.worker);
  const freeWorkers = allWorkers.filter(w => !busyNames.includes(w));
  if (freeWorkers.length) {
    return { workers: freeWorkers, minutes: 0 };
  }
  // 所有师傅都忙，找最早完成的
  let earliest = Infinity;
  let earliestWorker = '';
  for (const r of activeWorkers) {
    const tasks = queryAll("SELECT * FROM tickets WHERE worker = ? AND status = 'doing'", [r.worker]);
    for (const t of tasks) {
      const start = new Date(t.created).getTime();
      const hours = t.estimated_hours || 2;
      const endTime = start + hours * 3600000;
      if (endTime < earliest) { earliest = endTime; earliestWorker = r.worker; }
    }
  }
  const minutesLeft = Math.max(0, Math.round((earliest - now) / 60000));
  return { workers: [earliestWorker], minutes: minutesLeft };
}

function startReminders() {
  if (reminderTimer) clearInterval(reminderTimer);
  if (reminderInterval <= 0) {
    console.log('[定时提醒] 已关闭');
    return;
  }
  reminderTimer = setInterval(async () => {
    try {
      const reminder = getWaitingTicketsReminder();
      if (reminder) {
        await triggerJzmWorkflowEvent(ALERT_SESSION_ID, reminder).catch(e => 
          console.error('[定时提醒] 推送失败:', e.message)
        );
        console.log('[定时提醒] 已推送待派单提醒，共', queryAll("SELECT COUNT(*) as c FROM tickets WHERE status='wait'")[0].c, '张');
      }
    } catch (e) {
      console.error('[定时提醒] 错误:', e.message);
    }
  }, reminderInterval);
  console.log(`[定时提醒] 已启动，每 ${reminderInterval/60000} 分钟检查待派单工单`);
}

// GET /api/settings/reminder
app.get('/api/settings/reminder', (req, res) => {
  res.json({ intervalMinutes: reminderInterval / 60000 });
});

// GET /api/reminder/trigger — 外部cron触发推送检查（防止Render休眠后定时器失效）
app.get('/api/reminder/trigger', async (req, res) => {
  try {
    const reminder = getWaitingTicketsReminder();
    if (reminder) {
      await triggerJzmWorkflowEvent(ALERT_SESSION_ID, reminder);
      console.log('[手动触发] 已推送待派单提醒');
      res.json({ success: true, message: '已推送提醒', waitCount: queryAll("SELECT COUNT(*) as c FROM tickets WHERE status='wait'")[0].c });
    } else {
      res.json({ success: true, message: '当前无待派单工单，无需推送' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/settings/reminder — 设置推送间隔
app.post('/api/settings/reminder', (req, res) => {
  const { intervalMinutes } = req.body;
  if (intervalMinutes === undefined) return res.status(400).json({ error: '缺少 intervalMinutes' });
  reminderInterval = Math.max(0, Number(intervalMinutes)) * 60000;
  startReminders();
  res.json({ success: true, intervalMinutes: reminderInterval / 60000, message: reminderInterval > 0 ? `已设置为每 ${reminderInterval/60000} 分钟推送` : '已关闭推送' });
});

// ============ 超时告警 ============
const SLA_THRESHOLDS = { urgent: 2, high: 8, normal: 24, low: 48 }; // 小时
let slaInterval = 0; // 默认关闭
let slaTimer = null;

function startSlaAlerts() {
  if (slaTimer) clearInterval(slaTimer);
  if (slaInterval <= 0) { console.log('[超时告警] 已关闭'); return; }
  slaTimer = setInterval(async () => {
    try {
      const overdue = checkSlaOverdue();
      if (overdue.length) {
        const lines = overdue.map(t => `• ${t.id}｜${t.cat}｜${t.loc}｜超时 ${t.hoursOverdue}h（SLA ${t.threshold}h）｜${t.worker || '未派单'}`);
        const msg = `⚠️ SLA 超时告警\n以下 ${overdue.length} 张工单已超出处理时限：\n\n${lines.join('\n')}\n\n请尽快处理！`;
        await triggerJzmWorkflowEvent(ALERT_SESSION_ID, msg).catch(e => console.error('[超时告警] 推送失败:', e.message));
        console.log('[超时告警] 已推送，共', overdue.length, '张超时');
      }
    } catch (e) { console.error('[超时告警] 错误:', e.message); }
  }, slaInterval);
  console.log(`[超时告警] 已启动，每 ${slaInterval/60000} 分钟检查`);
}

// GET /api/settings/sla
app.get('/api/settings/sla', (req, res) => {
  res.json({ intervalMinutes: slaInterval / 60000 });
});

// POST /api/settings/sla — 设置超时告警间隔
app.post('/api/settings/sla', (req, res) => {
  const { intervalMinutes } = req.body;
  if (intervalMinutes === undefined) return res.status(400).json({ error: '缺少 intervalMinutes' });
  slaInterval = Math.max(0, Number(intervalMinutes)) * 60000;
  startSlaAlerts();
  res.json({ success: true, intervalMinutes: slaInterval / 60000, message: slaInterval > 0 ? `已设置为每 ${slaInterval/60000} 分钟检查超时` : '已关闭超时告警' });
});

function checkSlaOverdue() {
  const now = Date.now();
  const active = queryAll("SELECT * FROM tickets WHERE status IN ('wait','doing','confirm')");
  const overdue = [];
  for (const row of active) {
    const t = rowToTicket(row);
    const hours = (now - new Date(t.created).getTime()) / 3600000;
    const threshold = SLA_THRESHOLDS[t.priority] || 24;
    if (hours > threshold) {
      overdue.push({ ...t, hoursOverdue: +(hours - threshold).toFixed(1), threshold });
    }
  }
  return overdue;
}

// GET /api/sla/overdue — 获取超时工单列表
app.get('/api/sla/overdue', (req, res) => {
  res.json({ data: checkSlaOverdue() });
});

// GET /api/sla/alert — 触发超时告警推送到预警群
app.get('/api/sla/alert', async (req, res) => {
  const overdue = checkSlaOverdue();
  if (!overdue.length) return res.json({ success: true, message: '当前无超时工单' });
  const lines = overdue.map(t => `• ${t.id}｜${t.cat}｜${t.loc}｜超时 ${t.hoursOverdue}h（SLA ${t.threshold}h）｜${t.worker || '未派单'}`);
  const msg = `⚠️ SLA 超时告警\n以下 ${overdue.length} 张工单已超出处理时限：\n\n${lines.join('\n')}\n\n请尽快处理！`;
  try {
    await triggerJzmWorkflowEvent(ALERT_SESSION_ID, msg);
    res.json({ success: true, message: '已推送超时告警', count: overdue.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ 月报生成 ============
app.get('/api/report', (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const to = req.query.to || new Date().toISOString();
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const all = queryAll("SELECT * FROM tickets").map(rowToTicket);
  const inRange = all.filter(t => new Date(t.created) >= fromDate && new Date(t.created) <= toDate);

  const repairs = inRange.filter(t => t.type === 'repair');
  const complaints = inRange.filter(t => t.type === 'complaint');
  const helps = inRange.filter(t => t.type === 'help');
  const done = inRange.filter(t => t.status === 'done' && t.finished);
  const doing = inRange.filter(t => t.status === 'doing');
  const wait = inRange.filter(t => t.status === 'wait');

  // 平均处理时长
  const durations = done.map(t => (new Date(t.finished) - new Date(t.created)) / 3600000).filter(h => h > 0);
  const avgHours = durations.length ? +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : 0;

  // 按时完成率
  const onTime = done.filter(t => {
    const h = (new Date(t.finished) - new Date(t.created)) / 3600000;
    return h <= (SLA_THRESHOLDS[t.priority] || 24);
  });
  const onTimeRate = done.length ? Math.round(onTime.length / done.length * 100) : 0;

  // 高频事件
  const catCount = {};
  inRange.forEach(t => { catCount[t.cat] = (catCount[t.cat] || 0) + 1; });
  const topEvents = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // 高频位置
  const locCount = {};
  inRange.forEach(t => { if (t.loc) locCount[t.loc] = (locCount[t.loc] || 0) + 1; });
  const topLocs = Object.entries(locCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // 师傅效率
  const workerStats = {};
  done.forEach(t => {
    if (!t.worker) return;
    if (!workerStats[t.worker]) workerStats[t.worker] = { count: 0, totalH: 0 };
    workerStats[t.worker].count++;
    workerStats[t.worker].totalH += (new Date(t.finished) - new Date(t.created)) / 3600000;
  });

  const fromStr = `${fromDate.getFullYear()}/${fromDate.getMonth()+1}/${fromDate.getDate()}`;
  const toStr = `${toDate.getFullYear()}/${toDate.getMonth()+1}/${toDate.getDate()}`;

  // 未解决工单
  const unresolved = inRange.filter(t => t.status !== 'done').sort((a, b) => new Date(a.created) - new Date(b.created)).slice(0, 5);

  let report = `【小区工单报告 · ${fromStr} ~ ${toStr}】\n\n`;
  report += `📊 总览\n`;
  report += `新增工单：${inRange.length} 张（报修 ${repairs.length} / 投诉 ${complaints.length} / 帮助 ${helps.length}）\n`;
  report += `已完成：${done.length} 张｜处理中：${doing.length} 张｜待派单：${wait.length} 张\n`;
  report += `平均处理时长：${avgHours} 小时\n`;
  report += `SLA 按时完成率：${onTimeRate}%\n\n`;

  report += `🔥 高频事件 TOP ${topEvents.length}\n`;
  topEvents.forEach(([cat, count], i) => { report += `${i+1}. ${cat}（${count} 次）\n`; });
  report += `\n`;

  report += `📍 高频位置 TOP ${topLocs.length}\n`;
  topLocs.forEach(([loc, count], i) => { report += `${i+1}. ${loc}（${count} 次）\n`; });
  report += `\n`;

  report += `👷 师傅效率\n`;
  Object.entries(workerStats).sort((a, b) => b[1].count - a[1].count).forEach(([name, s]) => {
    report += `• ${name}：完成 ${s.count} 张，平均 ${(s.totalH / s.count).toFixed(1)}h\n`;
  });
  report += `\n`;

  if (unresolved.length) {
    report += `⚠️ 未解决（前5）\n`;
    unresolved.forEach(t => {
      const waitH = +((Date.now() - new Date(t.created).getTime()) / 3600000).toFixed(1);
      report += `• ${t.id}｜${t.cat}｜${t.loc}｜${t.status === 'wait' ? '待派单' : '处理中'}｜已等 ${waitH}h\n`;
    });
  }

  res.json({ success: true, from: fromStr, to: toStr, report, stats: { total: inRange.length, done: done.length, doing: doing.length, wait: wait.length, avgHours, onTimeRate } });
});

// ============ AI 报告解析接口（预留给秒懂） ============
// POST /api/report/ai — 接收月报数据，返回AI分析建议
// 秒懂调用此接口传入报告文本，返回AI生成的智能总结和建议
app.post('/api/report/ai', async (req, res) => {
  const { report, aiEndpoint, aiKey } = req.body;
  if (!report) return res.status(400).json({ error: '缺少 report 文本' });

  // 如果配置了AI接口则调用，否则原样返回
  const AI_ENDPOINT = aiEndpoint || process.env.AI_API_URL || '';
  const AI_KEY = aiKey || process.env.AI_API_KEY || '';

  if (!AI_ENDPOINT) {
    return res.json({ success: true, aiSummary: null, message: '未配置AI接口，返回原始报告', report });
  }

  try {
    const aiResp = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'qwen-plus',
        messages: [
          { role: 'system', content: '你是物业管理专家。根据以下工单月报数据，给出智能分析总结：1.找出反复出现的问题和根因推测 2.给出具体改善建议 3.预测下月可能的高发问题。简洁有力，不超过300字。' },
          { role: 'user', content: report }
        ]
      })
    });
    const aiData = await aiResp.json();
    const aiSummary = aiData.choices?.[0]?.message?.content || aiData.output?.text || '解析失败';
    res.json({ success: true, aiSummary, report });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, report });
  }
});

// ============ 图片上传接口 ============
const multer = require('multer');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ticketDir = path.join(uploadDir, req.params.id);
    if (!fs.existsSync(ticketDir)) fs.mkdirSync(ticketDir, { recursive: true });
    cb(null, ticketDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 10 } });

// POST /api/tickets/:id/photos — 上传照片文件
app.post('/api/tickets/:id/photos', upload.array('photos', 10), (req, res) => {
  const ticketId = req.params.id;
  const row = queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  if (!row) return res.status(404).json({ error: '工单不存在' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: '没有上传文件' });

  const photos = req.files.map(f => ({
    filename: f.filename,
    originalName: f.originalname,
    url: `/uploads/${ticketId}/${f.filename}`,
    size: f.size,
    uploadedAt: new Date().toISOString()
  }));

  // 追加到JSON记录文件
  const photoFile = path.join(uploadDir, `${ticketId}.json`);
  let savedPhotos = [];
  if (fs.existsSync(photoFile)) {
    try { savedPhotos = JSON.parse(fs.readFileSync(photoFile, 'utf-8')); } catch(e) {}
  }
  savedPhotos.push(...photos);
  fs.writeFileSync(photoFile, JSON.stringify(savedPhotos, null, 2));

  res.json({ success: true, ticketId, uploaded: photos.length, totalPhotos: savedPhotos.length, photos: savedPhotos });
});

// GET /api/tickets/:id/photos — 获取工单照片列表
app.get('/api/tickets/:id/photos', (req, res) => {
  const ticketId = req.params.id;
  const photoFile = path.join(uploadDir, `${ticketId}.json`);
  if (!fs.existsSync(photoFile)) return res.json({ data: [] });
  try {
    const photos = JSON.parse(fs.readFileSync(photoFile, 'utf-8'));
    res.json({ data: photos });
  } catch(e) {
    res.json({ data: [] });
  }
});

// 静态托管上传文件
app.use('/uploads', express.static(uploadDir));

// ============ 启动 ============
initDB().then(() => {
  app.listen(PORT, () => {
    const rows = queryAll('SELECT COUNT(*) as c FROM tickets');
    const count = rows[0] ? rows[0].c : 0;
    console.log(`物业工单后端已启动: http://localhost:${PORT}`);
    console.log(`数据库: ${DB_PATH} (${count} 条工单)`);
    if (NOTIFY_WEBHOOK) console.log('通知回调：已配置');
    else console.log('通知回调：未配置 NOTIFY_WEBHOOK');
    // 启动定时提醒
    startReminders();
    startSlaAlerts();
  });
});
