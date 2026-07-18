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
  const id = t.id;
  if (!id) return res.status(400).json({ error: '缺少必填字段 id（工单号）' });
  const now = t.created || new Date().toISOString();
  try {
    db.run(
      `INSERT INTO tickets (id, type, cat, desc, loc, priority, status, worker, message, created, estimated_hours, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, t.type || 'repair', t.cat || '其他', t.desc || '', t.loc || '', t.priority || 'normal', t.status || 'wait', t.worker || '', t.message || '', now, t.estimated_hours || 0, t.sessionId || '']
    );
    saveDB();
    const row = queryOne('SELECT * FROM tickets WHERE id = ?', [id]);
    res.json({ success: true, record: rowToTicket(row) });
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
      triggerJzmWorkflowEvent(sid, ticket.message).catch(err => {
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

// DELETE /api/tickets — 清空全部工单
app.delete('/api/tickets', (req, res) => {
  db.run('DELETE FROM tickets');
  saveDB();
  res.json({ success: true, message: '已清空全部工单' });
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

// ============ 启动 ============
initDB().then(() => {
  app.listen(PORT, () => {
    const rows = queryAll('SELECT COUNT(*) as c FROM tickets');
    const count = rows[0] ? rows[0].c : 0;
    console.log(`物业工单后端已启动: http://localhost:${PORT}`);
    console.log(`数据库: ${DB_PATH} (${count} 条工单)`);
    if (NOTIFY_WEBHOOK) console.log('通知回调：已配置');
    else console.log('通知回调：未配置 NOTIFY_WEBHOOK');
  });
});
