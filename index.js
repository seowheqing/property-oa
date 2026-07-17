/**
 * 物业工单系统后端
 * 读取飞书多维表格数据，前端操作写回飞书
 */
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

// 读取环境变量（简易版，不引入 dotenv）
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const APP_TOKEN = process.env.FEISHU_APP_TOKEN;
const TABLE_ID = process.env.FEISHU_TABLE_ID;
const PORT = process.env.PORT || 3001;

const BASE_URL = 'https://open.feishu.cn/open-apis';

// ============ Token 缓存 ============
let tokenCache = { token: null, expire: 0 };

async function getTenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.expire) return tokenCache.token;
  const resp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error('获取 token 失败: ' + data.msg);
  tokenCache = { token: data.tenant_access_token, expire: Date.now() + (data.expire - 300) * 1000 };
  return tokenCache.token;
}

async function feishuGet(path) {
  const token = await getTenantToken();
  const resp = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return resp.json();
}

async function feishuPost(path, body) {
  const token = await getTenantToken();
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return resp.json();
}

async function feishuPut(path, body) {
  const token = await getTenantToken();
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return resp.json();
}

// ============ 字段映射 ============
const PRIORITY_MAP = { '紧急': 'urgent', '高': 'high', '普通': 'normal', '低': 'low' };
const STATUS_MAP = { '待派单': 'wait', '处理中': 'doing', '待确认': 'confirm', '已完成': 'done' };
const TYPE_MAP = { '报修': 'repair', '投诉': 'complaint', '帮助/其他': 'help' };

const PRIORITY_REV = Object.fromEntries(Object.entries(PRIORITY_MAP).map(([k, v]) => [v, k]));
const STATUS_REV = Object.fromEntries(Object.entries(STATUS_MAP).map(([k, v]) => [v, k]));
const TYPE_REV = Object.fromEntries(Object.entries(TYPE_MAP).map(([k, v]) => [v, k]));

function recordToTicket(record) {
  const f = record.fields;
  return {
    record_id: record.record_id,
    id: f['文本'] || record.record_id,
    type: TYPE_MAP[f['工单类型']] || 'repair',
    cat: f['事件类别'] || '其他',
    desc: f['问题描述'] || '',
    loc: f['位置'] || '',
    priority: PRIORITY_MAP[f['紧急程度']] || 'normal',
    status: STATUS_MAP[f['工单状态']] || 'wait',
    worker: f['负责人'] || null,
    created: f['创建时间'] ? new Date(f['创建时间']).toISOString() : new Date().toISOString(),
    finished: f['完成时间'] ? new Date(f['完成时间']).toISOString() : null,
    rejectReason: f['驳回原因'] || '',
    source: f['来源'] || '系统录入',
  };
}

// ============ Express ============
const app = express();
app.use(cors());
app.use(express.json());

// 静态文件（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/tickets — 获取所有工单
app.get('/api/tickets', async (req, res) => {
  try {
    let all = [], pageToken = '';
    do {
      const url = `/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=100${pageToken ? '&page_token=' + pageToken : ''}`;
      const data = await feishuGet(url);
      if (data.code !== 0) return res.status(500).json({ error: data.msg });
      all = all.concat((data.data.items || []).map(recordToTicket));
      pageToken = data.data.has_more ? data.data.page_token : '';
    } while (pageToken);
    res.json({ data: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tickets/:recordId — 更新工单字段（派单/驳回/完成等）
app.patch('/api/tickets/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const updates = req.body; // { status, worker, rejectReason, finished }
    const fields = {};
    if (updates.status) fields['工单状态'] = STATUS_REV[updates.status] || updates.status;
    if (updates.worker !== undefined) fields['负责人'] = updates.worker || '';
    if (updates.rejectReason !== undefined) fields['驳回原因'] = updates.rejectReason;
    if (updates.finished) fields['完成时间'] = new Date(updates.finished).getTime();
    if (updates.priority) fields['紧急程度'] = PRIORITY_REV[updates.priority] || updates.priority;

    const url = `/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
    const data = await feishuPut(url, { fields });
    if (data.code !== 0) return res.status(500).json({ error: data.msg, code: data.code });
    res.json({ success: true, record: recordToTicket(data.data.record) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tickets — 创建新工单
app.post('/api/tickets', async (req, res) => {
  try {
    const t = req.body;
    const fields = {
      '文本': t.id || 'WX' + Date.now(),
      '工单类型': TYPE_REV[t.type] || '报修',
      '事件类别': t.cat || '其他',
      '问题描述': t.desc || '',
      '位置': t.loc || '',
      '紧急程度': PRIORITY_REV[t.priority] || '普通',
      '工单状态': STATUS_REV[t.status] || '待派单',
      '负责人': t.worker || '',
      '创建时间': Date.now(),
      '来源': t.source || '系统录入',
    };
    const url = `/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;
    const data = await feishuPost(url, { fields });
    if (data.code !== 0) return res.status(500).json({ error: data.msg, code: data.code });
    res.json({ success: true, record: recordToTicket(data.data.record) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`物业工单后端已启动: http://localhost:${PORT}`);
  console.log(`飞书表格: https://juzihudong.feishu.cn/base/${APP_TOKEN}`);
});
