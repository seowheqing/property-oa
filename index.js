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

let db;

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
      estimated_hours REAL DEFAULT 0
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
    estimated_hours: row.estimated_hours || 0
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
      `INSERT INTO tickets (id, type, cat, desc, loc, priority, status, worker, message, created, estimated_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, t.type || 'repair', t.cat || '其他', t.desc || '', t.loc || '', t.priority || 'normal', t.status || 'wait', t.worker || '', t.message || '', now, t.estimated_hours || 0]
    );
    saveDB();
    const row = queryOne('SELECT * FROM tickets WHERE id = ?', [id]);
    res.json({ success: true, record: rowToTicket(row) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tickets/:id — 更新工单
app.patch('/api/tickets/:id', (req, res) => {
  const updates = req.body;
  const allowed = { status: 'status', worker: 'worker', priority: 'priority', finished: 'finished', reject_reason: 'reject_reason', rejectReason: 'reject_reason', estimated_hours: 'estimated_hours', cat: 'cat', loc: 'loc', desc: 'desc', message: 'message' };
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
    res.json({ success: true, record: rowToTicket(row) });
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
