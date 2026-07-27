/**
 * 物业工单系统 — 入口文件（重构版）
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDB } = require('./db');
const { verifyToken } = require('./middleware/auth');

// 路由
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const communityRoutes = require('./routes/communities');
const staffRoutes = require('./routes/staff');
const settingsRoutes = require('./routes/settings');

const app = express();
app.use(cors());
app.use(express.json());
app.use(verifyToken); // 所有请求尝试解析 token（不强制）

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(config.UPLOAD_DIR));

// 挂载路由
app.use('/api', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api', settingsRoutes);

// 启动
async function start() {
  await initDB();
  app.listen(config.PORT, () => {
    console.log(`✅ 物业工单系统已启动: http://localhost:${config.PORT}`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
