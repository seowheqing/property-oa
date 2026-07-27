/**
 * 密码迁移脚本
 * 将数据库中所有明文密码转为 bcrypt 哈希
 * 
 * 使用方法：
 *   cd server
 *   node migrate-passwords.js
 * 
 * 注意：
 * - 只需运行一次
 * - 运行前建议备份 data.db
 * - 已经是 bcrypt 格式的密码会自动跳过（以 $2a$ 或 $2b$ 开头）
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data.db');

async function migrate() {
  console.log('🔐 密码迁移脚本启动...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ 数据库文件不存在:', DB_PATH);
    process.exit(1);
  }

  // 备份
  const backupPath = DB_PATH + '.backup-' + Date.now();
  fs.copyFileSync(DB_PATH, backupPath);
  console.log('📦 已备份数据库到:', path.basename(backupPath));

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  // 查询所有用户
  const stmt = db.prepare('SELECT id, phone, name, password FROM users');
  const users = [];
  while (stmt.step()) users.push(stmt.getAsObject());
  stmt.free();

  console.log(`\n找到 ${users.length} 个用户账号：\n`);

  let migrated = 0, skipped = 0;

  for (const user of users) {
    // 检查是否已经是 bcrypt 哈希
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      console.log(`  ⏭  ${user.name} (${user.phone}) — 已是哈希，跳过`);
      skipped++;
      continue;
    }

    // 明文密码 → bcrypt 哈希
    const hash = await bcrypt.hash(user.password, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
    console.log(`  ✅ ${user.name} (${user.phone}) — 已加密`);
    migrated++;
  }

  // 同时处理待审核注册表
  try {
    const regStmt = db.prepare("SELECT id, name, phone, password FROM pending_registrations WHERE status = 'pending'");
    const regs = [];
    while (regStmt.step()) regs.push(regStmt.getAsObject());
    regStmt.free();

    for (const reg of regs) {
      if (reg.password && (reg.password.startsWith('$2a$') || reg.password.startsWith('$2b$'))) continue;
      const hash = await bcrypt.hash(reg.password, 10);
      db.run('UPDATE pending_registrations SET password = ? WHERE id = ?', [hash, reg.id]);
      console.log(`  ✅ [待审核] ${reg.name} (${reg.phone}) — 已加密`);
      migrated++;
    }
  } catch(e) { /* pending_registrations 表可能不存在 */ }

  // 保存
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  console.log(`\n✅ 迁移完成！加密 ${migrated} 个，跳过 ${skipped} 个`);
  console.log(`\n现在可以切换到新后端：`);
  console.log(`  将 package.json 中 "start" 改为 "node index-new.js"`);
  console.log(`  或运行: npm run start:new\n`);
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err);
  process.exit(1);
});
