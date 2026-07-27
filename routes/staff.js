/**
 * 人员状态路由
 */
const express = require('express');
const router = express.Router();
const { queryAll, run, saveDB } = require('../db');

// POST /api/staff/status
router.post('/status', (req, res) => {
  const { name, status } = req.body;
  if (!name || !status) return res.status(400).json({ error: '缺少 name 或 status' });
  const allowed = ['on', 'busy', 'off'];
  if (!allowed.includes(status)) return res.status(400).json({ error: '无效状态值' });
  run('INSERT OR REPLACE INTO staff_status (name, status, updated) VALUES (?, ?, ?)', [name, status, new Date().toISOString()]);
  saveDB();
  res.json({ success: true, name, status });
});

// GET /api/staff/status
router.get('/status', (req, res) => {
  const rows = queryAll('SELECT * FROM staff_status');
  res.json({ data: rows });
});

module.exports = router;
