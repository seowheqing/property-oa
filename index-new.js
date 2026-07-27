/**
 * 物业工单系统 — 入口文件（重构版）
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
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

// 登录接口限流：每 IP 每分钟最多 5 次
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: '请求过于频繁，请稍后再试' } });
app.use('/api/login', loginLimiter);
app.use('/api/register', loginLimiter);
app.use('/api/reset-password', loginLimiter);

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(config.UPLOAD_DIR));

// 挂载路由
app.use('/api', authRoutes);  // 登录/注册/重置 — 无需鉴权
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

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获异常:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
});

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
