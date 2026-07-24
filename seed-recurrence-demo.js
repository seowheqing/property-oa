/**
 * 插入复发/重复反馈演示数据
 * 运行: node seed-recurrence-demo.js
 * 效果：
 *   1. 一条 10 天前已完成的"3号楼-1单元-302室 水压低"工单
 *   2. 一条今天新建的同地址同问题工单，自动标记复发、优先级提升
 *   3. 第二次相同提交被合并，feedbackCount = 2
 */
const fetch = require('node-fetch');
const BASE = 'http://localhost:3001';

function daysAgo(d, h = 9, m = 0) {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

async function run() {
  console.log('=== 复发工单演示数据 ===\n');

  // 1. 创建历史已完成工单
  const history = {
    id: 'WX-DEMO-R1',
    type: 'repair',
    cat: '水暖',
    desc: '3号楼1单元302室水压异常低，洗澡没水',
    loc: '3号楼-1单元-302室',
    priority: 'normal',
    status: 'wait',
    worker: '张师傅',
    message: '水压好低啊，洗澡都没水',
    created: daysAgo(10, 9, 15),
    community_id: 'default'
  };

  let r = await fetch(BASE + '/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(history)
  });
  let d = await r.json();
  console.log('1) 历史工单:', d.action, d.record ? d.record.id : d.mergedInto);

  // 标记为已完成
  await fetch(BASE + '/api/tickets/WX-DEMO-R1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done', finished: daysAgo(10, 12, 30) })
  });
  console.log('   → 已标记完成\n');

  // 2. 创建复发工单（同地址同问题，10天后再次出现）
  const recur = {
    type: 'repair',
    cat: '水暖',
    desc: '302室水压又变低了，比上次还严重',
    loc: '3号楼-1单元-302室',
    priority: 'normal',
    message: '水压又低了，上次修完没几天又这样',
    community_id: 'default'
  };

  r = await fetch(BASE + '/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recur)
  });
  d = await r.json();
  console.log('2) 复发工单:', d.action);
  console.log('   id:', d.record.id);
  console.log('   repeatOf:', d.record.repeatOf);
  console.log('   repeatCount:', d.record.repeatCount);
  console.log('   priority:', d.record.priority, '(normal → high 自动提升)');
  console.log('   isRecurring:', d.record.isRecurring);
  console.log('   recurrenceNote:', d.record.recurrenceNote);
  const recurId = d.record.id;

  // 3. 模拟另一位居民 5 分钟后也反馈同样问题 → 合并
  const dup = {
    type: 'repair',
    cat: '水暖',
    desc: '302水压低',
    loc: '3号楼-1单元-302室',
    priority: 'normal',
    message: '我也是302的，水压特别低',
    community_id: 'default'
  };

  r = await fetch(BASE + '/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dup)
  });
  d = await r.json();
  console.log('\n3) 重复反馈:', d.action);
  console.log('   mergedInto:', d.mergedInto);
  console.log('   feedbackCount:', d.record.feedbackCount, '(多人反馈)');

  console.log('\n✅ 演示数据插入完成！');
  console.log('   打开系统后在报修工单列表找到工单', recurId);
  console.log('   - 列表中会显示「复发 ×2」徽标');
  console.log('   - 列表中会显示「多人反馈 ×2」徽标');
  console.log('   - 点击打开详情，顶部会有橙红色复发问题提醒框');
  console.log('   - 提醒框内可点击「查看历史工单 WX-DEMO-R1」跳转');
}

run().catch(e => console.error('失败:', e.message));
