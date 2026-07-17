/* ============================================================
   假数据（内嵌 JS） —— 物业 OA 工单审批系统 Demo
   说明：报修五类 / 投诉四类；约 22 张工单，覆盖各状态、各师傅、各类型。
   首次运行写入 localStorage，之后从 localStorage 读取并持久化。
   ============================================================ */

/* ---------- 角色定义 ---------- */
// 报修流程节点：发起 → 派单 → 现场确认 → 现场维修 → 结果确认 → 结束
// 投诉流程节点：发起 → 指派 → 处理 → 结果确认 → 结束
const ROLES = [
  { id: 'eng_lead',   name: '物业管理员/工程部主管', kind: '管理', icon: '管', color: '#1677ff' },
  { id: 'worker_zhang', name: '维修工·张师傅', kind: '维修工', color: '#13c2c2' },
  { id: 'worker_li',    name: '维修工·李师傅', kind: '维修工', color: '#52c41a' },
  { id: 'worker_wang',  name: '维修工·王师傅', kind: '维修工', color: '#fa8c16' },
  { id: 'worker_zhao',  name: '维修工·赵师傅', kind: '维修工', color: '#eb2f96' },
  { id: 'pm_lead',    name: '物业主管',     kind: '管理', icon: '主', color: '#722ed1' },
  { id: 'pm_keeper',  name: '物业管家',     kind: '管家', icon: '管', color: '#08979c' },
];

/* 报修五类 / 投诉四类 */
const REPAIR_CATS = ['水暖', '电路', '电器', '门窗', '公共设施'];
const COMPLAINT_CATS = ['突发事件', '物业服务', '便民服务', '其他'];

/* 报修工单状态机节点（用于时间线） */
const REPAIR_STEPS = ['发起人', '工单分配', '现场确认', '现场维修', '结果确认', '结束·微信群回复'];
const COMPLAINT_STEPS = ['发起人', '指派', '处理', '结果确认', '结束·微信群回复'];

/* ---------- 师傅（管理平台 CRUD 数据） ---------- */
const STAFF_SEED = [
  { id: 's1', name: '张师傅', role: '维修工', skill: '水暖/电器', phone: '138-0011-2201', status: 'on',  done: 42 },
  { id: 's2', name: '李师傅', role: '维修工', skill: '电路/电器', phone: '138-0011-2202', status: 'on',  done: 38 },
  { id: 's3', name: '王师傅', role: '维修工', skill: '门窗/公共设施', phone: '138-0011-2203', status: 'busy', done: 51 },
  { id: 's4', name: '赵师傅', role: '维修工', skill: '水暖/门窗', phone: '138-0011-2204', status: 'on',  done: 29 },
  { id: 's5', name: '孙师傅', role: '维修工', skill: '公共设施', phone: '138-0011-2205', status: 'off', done: 17 },
  { id: 's6', name: '陈管家', role: '物业管家', skill: '客户服务', phone: '138-0011-2301', status: 'on',  done: 63 },
  { id: 's7', name: '周管家', role: '物业管家', skill: '客户服务', phone: '138-0011-2302', status: 'on',  done: 47 },
];

/* 维修工映射（派单用） */
const WORKERS = ['张师傅', '李师傅', '王师傅', '赵师傅', '孙师傅'];
const KEEPERS = ['陈管家', '周管家'];

/* ---------- 居民（微信群成员） ---------- */
const RESIDENTS = [
  { name: '王女士', color: '#1677ff' },
  { name: '李先生', color: '#52c41a' },
  { name: '赵阿姨', color: '#fa8c16' },
  { name: '陈大爷', color: '#eb2f96' },
  { name: '刘女士', color: '#722ed1' },
  { name: '孙先生', color: '#13c2c2' },
  { name: '吴女士', color: '#f5222d' },
];

/* ---------- 工具：日期 ---------- */
function daysAgo(d, h = 0, m = 0) {
  const t = new Date('2026-06-29T09:00:00');
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}
function fmt(iso) {
  const t = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${t.getMonth() + 1}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}
/* 计算处理时长（小时） */
function durationHours(startIso, endIso) {
  if (!startIso || !endIso) return null;
  return +((new Date(endIso) - new Date(startIso)) / 3600000).toFixed(1);
}

/* ---------- 生成时间线 ---------- */
function tl(title, who, iso) { return { title, who, time: iso }; }

/* ---------- 报修工单种子 ---------- */
/* status: wait(待派单) / doing(处理中) / confirm(待确认) / done(已完成) */
let _rid = 1000;
function R(o) {
  _rid++;
  return Object.assign({
    id: 'WX' + _rid,
    type: 'repair',
    source: 'ai',
    photos: [],
    aggregated: [],
  }, o);
}

const REPAIR_SEED = [
  R({ cat: '水暖', loc: '3号楼-2单元-501室', status: 'done', worker: '张师傅', source: 'ai',
      desc: '主卧水管爆裂漏水', created: daysAgo(2, 8, 12), finished: daysAgo(2, 11, 40),
      elements: { event: '水管爆裂漏水', place: '3号楼-2单元-501室', time: '今早8点左右' },
      photos: ['🔧', '🚿', '✅'],
      aggregated: [
        { who: '王女士', msg: '3号楼2单元501水管爆了，地上全是水！', t: daysAgo(2, 8, 12) },
        { who: '李先生', msg: '我们501楼下也在漏水，麻烦快点', t: daysAgo(2, 8, 15) },
        { who: '赵阿姨', msg: '3-2-501这边水好大', t: daysAgo(2, 8, 18) },
      ],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI（聚合3条）', daysAgo(2, 8, 12)),
        tl('工单分配', '工程部主管', daysAgo(2, 8, 30)),
        tl('现场确认', '张师傅', daysAgo(2, 9, 20)),
        tl('现场维修·一次完成', '张师傅', daysAgo(2, 11, 10)),
        tl('结果确认', '工程部主管', daysAgo(2, 11, 35)),
        tl('微信群已回复「已处理完毕」', '句子秒懂AI', daysAgo(2, 11, 40)),
      ] }),

  R({ cat: '电路', loc: '5号楼-1单元-302室', status: 'doing', worker: '李师傅', source: 'ai',
      desc: '客厅跳闸，反复断电', created: daysAgo(0, 9, 5),
      elements: { event: '客厅频繁跳闸断电', place: '5号楼-1单元-302室', time: '今天上午' },
      photos: ['⚡', '🔌'],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 9, 5)),
        tl('工单分配', '工程部主管', daysAgo(0, 9, 18)),
        tl('现场确认', '李师傅', daysAgo(0, 9, 50)),
      ] }),

  R({ cat: '电器', loc: '2号楼-3单元-1102室', status: 'wait', worker: null, source: 'ai',
      desc: '燃气热水器不打火', created: daysAgo(0, 8, 40),
      elements: { event: '燃气热水器不打火', place: '2号楼-3单元-1102室', time: '今早' },
      steps: [ tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 8, 40)) ] }),

  R({ cat: '门窗', loc: '1号楼-1单元-201室', status: 'confirm', worker: '王师傅', source: 'manual',
      desc: '阳台推拉门脱轨', created: daysAgo(1, 10, 0),
      elements: { event: '阳台推拉门脱轨', place: '1号楼-1单元-201室', time: '昨天' },
      photos: ['🚪', '🔩', '🛠️'],
      steps: [
        tl('居民/微信群发起', '前台手动录入', daysAgo(1, 10, 0)),
        tl('工单分配', '工程部主管', daysAgo(1, 10, 20)),
        tl('现场确认', '王师傅', daysAgo(1, 11, 0)),
        tl('现场维修·一次完成', '王师傅', daysAgo(1, 15, 30)),
      ] }),

  R({ cat: '公共设施', loc: '小区中庭-健身区', status: 'done', worker: '王师傅', source: 'ai',
      desc: '健身器材螺丝松动', created: daysAgo(4, 14, 0), finished: daysAgo(4, 17, 20),
      elements: { event: '健身器材螺丝松动', place: '小区中庭-健身区', time: '前天下午' },
      photos: ['🏋️', '🔩', '✅'],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(4, 14, 0)),
        tl('工单分配', '工程部主管', daysAgo(4, 14, 30)),
        tl('现场确认', '王师傅', daysAgo(4, 15, 20)),
        tl('现场维修·一次完成', '王师傅', daysAgo(4, 16, 50)),
        tl('结果确认', '工程部主管', daysAgo(4, 17, 10)),
        tl('微信群已回复「已处理完毕」', '句子秒懂AI', daysAgo(4, 17, 20)),
      ] }),

  R({ cat: '水暖', loc: '6号楼-2单元-803室', status: 'done', worker: '赵师傅', source: 'ai',
      desc: '暖气片不热', created: daysAgo(6, 9, 0), finished: daysAgo(5, 11, 0),
      elements: { event: '暖气片不热', place: '6号楼-2单元-803室', time: '一周前' },
      photos: ['🌡️', '🔧', '✅'],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(6, 9, 0)),
        tl('工单分配', '工程部主管', daysAgo(6, 9, 40)),
        tl('现场确认', '赵师傅', daysAgo(6, 14, 0)),
        tl('现场维修·需二次上门', '赵师傅', daysAgo(6, 16, 0)),
        tl('二次上门·完成', '赵师傅', daysAgo(5, 10, 0)),
        tl('结果确认', '工程部主管', daysAgo(5, 10, 40)),
        tl('微信群已回复「已处理完毕」', '句子秒懂AI', daysAgo(5, 11, 0)),
      ] }),

  R({ cat: '电器', loc: '4号楼-1单元-603室', status: 'doing', worker: '张师傅', source: 'manual',
      desc: '油烟机异响', created: daysAgo(0, 10, 30),
      elements: { event: '抽油烟机异响', place: '4号楼-1单元-603室', time: '今天上午' },
      photos: ['🍳'],
      steps: [
        tl('居民/微信群发起', '前台手动录入', daysAgo(0, 10, 30)),
        tl('工单分配', '工程部主管', daysAgo(0, 10, 45)),
      ] }),

  R({ cat: '电路', loc: '7号楼-3单元-401室', status: 'wait', worker: null, source: 'ai',
      desc: '入户门口照明灯不亮', created: daysAgo(0, 7, 55),
      elements: { event: '门口照明灯不亮', place: '7号楼-3单元-401室', time: '今早' },
      steps: [ tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 7, 55)) ] }),

  R({ cat: '门窗', loc: '3号楼-1单元-902室', status: 'done', worker: '赵师傅', source: 'ai',
      desc: '卧室窗户密封条老化漏风', created: daysAgo(8, 9, 0), finished: daysAgo(8, 12, 30),
      elements: { event: '窗户密封条老化漏风', place: '3号楼-1单元-902室', time: '一周多前' },
      photos: ['🪟', '🛠️', '✅'],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(8, 9, 0)),
        tl('工单分配', '工程部主管', daysAgo(8, 9, 25)),
        tl('现场确认', '赵师傅', daysAgo(8, 10, 10)),
        tl('现场维修·一次完成', '赵师傅', daysAgo(8, 12, 0)),
        tl('结果确认', '工程部主管', daysAgo(8, 12, 20)),
        tl('微信群已回复「已处理完毕」', '句子秒懂AI', daysAgo(8, 12, 30)),
      ] }),

  R({ cat: '公共设施', loc: '地下车库-B2-坡道', status: 'confirm', worker: '孙师傅', source: 'ai',
      desc: '车库坡道地灯损坏多处', created: daysAgo(1, 8, 0),
      elements: { event: '坡道地灯多处损坏', place: '地下车库-B2-坡道', time: '昨天' },
      photos: ['🅿️', '💡'],
      aggregated: [
        { who: '孙先生', msg: 'B2坡道好几个地灯都不亮了，晚上看不清', t: daysAgo(1, 8, 0) },
        { who: '吴女士', msg: '车库坡道灯坏了，开车有点危险', t: daysAgo(1, 8, 6) },
      ],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI（聚合2条）', daysAgo(1, 8, 0)),
        tl('工单分配', '工程部主管', daysAgo(1, 8, 30)),
        tl('现场确认', '孙师傅', daysAgo(1, 9, 30)),
        tl('现场维修·需二次上门', '孙师傅', daysAgo(1, 14, 0)),
      ] }),

  R({ cat: '水暖', loc: '8号楼-2单元-1201室', status: 'wait', worker: null, source: 'ai',
      desc: '马桶下水堵塞', created: daysAgo(0, 11, 20),
      elements: { event: '马桶下水堵塞', place: '8号楼-2单元-1201室', time: '今天中午' },
      steps: [ tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 11, 20)) ] }),

  R({ cat: '电器', loc: '5号楼-2单元-705室', status: 'done', worker: '李师傅', source: 'ai',
      desc: '空调外机噪音大', created: daysAgo(3, 9, 0), finished: daysAgo(3, 13, 0),
      elements: { event: '空调外机噪音大', place: '5号楼-2单元-705室', time: '三天前' },
      photos: ['❄️', '🔧', '✅'],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(3, 9, 0)),
        tl('工单分配', '工程部主管', daysAgo(3, 9, 30)),
        tl('现场确认', '李师傅', daysAgo(3, 10, 30)),
        tl('现场维修·一次完成', '李师傅', daysAgo(3, 12, 30)),
        tl('结果确认', '工程部主管', daysAgo(3, 12, 50)),
        tl('微信群已回复「已处理完毕」', '句子秒懂AI', daysAgo(3, 13, 0)),
      ] }),

  R({ cat: '门窗', loc: '2号楼-1单元-1001室', status: 'doing', worker: '王师傅', source: 'ai',
      desc: '防盗门锁芯卡死', created: daysAgo(0, 9, 40),
      elements: { event: '防盗门锁芯卡死', place: '2号楼-1单元-1001室', time: '今早' },
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 9, 40)),
        tl('工单分配', '工程部主管', daysAgo(0, 9, 55)),
        tl('现场确认', '王师傅', daysAgo(0, 10, 30)),
      ] }),

  R({ cat: '公共设施', loc: '小区南门-道闸', status: 'done', worker: '孙师傅', source: 'manual',
      desc: '南门车辆道闸抬杆失灵', created: daysAgo(5, 8, 0), finished: daysAgo(5, 10, 30),
      elements: { event: '道闸抬杆失灵', place: '小区南门-道闸', time: '五天前' },
      photos: ['🚧', '🔧', '✅'],
      steps: [
        tl('居民/微信群发起', '前台手动录入', daysAgo(5, 8, 0)),
        tl('工单分配', '工程部主管', daysAgo(5, 8, 20)),
        tl('现场确认', '孙师傅', daysAgo(5, 9, 0)),
        tl('现场维修·一次完成', '孙师傅', daysAgo(5, 10, 10)),
        tl('结果确认', '工程部主管', daysAgo(5, 10, 25)),
        tl('微信群已回复「已处理完毕」', '句子秒懂AI', daysAgo(5, 10, 30)),
      ] }),
];

/* ---------- 投诉工单种子 ---------- */
let _cid = 2000;
function C(o) {
  _cid++;
  return Object.assign({
    id: 'TS' + _cid, type: 'complaint', source: 'ai', photos: [], aggregated: [],
  }, o);
}

const COMPLAINT_SEED = [
  C({ cat: '物业服务', loc: '6号楼-1单元', status: 'done', worker: '陈管家', source: 'ai',
      desc: '电梯卫生差、长期不清洁', created: daysAgo(3, 10, 0), finished: daysAgo(3, 15, 0),
      elements: { event: '电梯卫生差长期未清洁', place: '6号楼-1单元', time: '近期' },
      aggregated: [
        { who: '刘女士', msg: '6号楼1单元电梯太脏了，地上一堆垃圾', t: daysAgo(3, 10, 0) },
        { who: '陈大爷', msg: '电梯卫生确实差，希望物业重视', t: daysAgo(3, 10, 8) },
      ],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI（聚合2条）', daysAgo(3, 10, 0)),
        tl('指派', '物业主管', daysAgo(3, 10, 30)),
        tl('处理', '陈管家', daysAgo(3, 13, 0)),
        tl('结果确认', '物业主管', daysAgo(3, 14, 40)),
        tl('微信群已回复', '句子秒懂AI', daysAgo(3, 15, 0)),
      ] }),

  C({ cat: '突发事件', loc: '小区东区-绿化带', status: 'done', worker: '周管家', source: 'ai',
      desc: '大风刮倒树木挡住道路', created: daysAgo(2, 7, 0), finished: daysAgo(2, 9, 30),
      elements: { event: '大风刮倒树木挡路', place: '小区东区-绿化带', time: '今早大风后' },
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(2, 7, 0)),
        tl('指派', '物业主管', daysAgo(2, 7, 15)),
        tl('处理', '周管家（协调安保+绿化）', daysAgo(2, 8, 0)),
        tl('结果确认', '物业主管', daysAgo(2, 9, 20)),
        tl('微信群已回复', '句子秒懂AI', daysAgo(2, 9, 30)),
      ] }),

  C({ cat: '便民服务', loc: '物业服务中心', status: 'doing', worker: '周管家', source: 'manual',
      desc: '希望增设快递代收/临时寄存', created: daysAgo(1, 14, 0),
      elements: { event: '建议增设快递代收点', place: '物业服务中心', time: '昨天下午' },
      steps: [
        tl('居民/微信群发起', '前台手动录入', daysAgo(1, 14, 0)),
        tl('指派', '物业主管', daysAgo(1, 14, 30)),
      ] }),

  C({ cat: '物业服务', loc: '4号楼-地面停车场', status: 'wait', worker: null, source: 'ai',
      desc: '车位被外来车辆长期占用', created: daysAgo(0, 8, 50),
      elements: { event: '车位被外来车辆占用', place: '4号楼-地面停车场', time: '今早' },
      steps: [ tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 8, 50)) ] }),

  C({ cat: '其他', loc: '小区西区', status: 'confirm', worker: '陈管家', source: 'ai',
      desc: '夜间施工噪音扰民', created: daysAgo(1, 22, 0),
      elements: { event: '夜间施工噪音扰民', place: '小区西区', time: '昨晚' },
      aggregated: [
        { who: '吴女士', msg: '西区晚上施工太吵了，根本睡不着', t: daysAgo(1, 22, 0) },
        { who: '孙先生', msg: '附议，夜里还在打钻', t: daysAgo(1, 22, 5) },
        { who: '王女士', msg: '麻烦协调一下噪音问题', t: daysAgo(1, 22, 12) },
      ],
      steps: [
        tl('居民/微信群发起', '句子秒懂AI（聚合3条）', daysAgo(1, 22, 0)),
        tl('指派', '物业主管', daysAgo(1, 22, 30)),
        tl('处理', '陈管家（已约谈施工方）', daysAgo(0, 9, 0)),
      ] }),

  C({ cat: '突发事件', loc: '2号楼-地下车库', status: 'doing', worker: '周管家', source: 'ai',
      desc: '车库局部积水', created: daysAgo(0, 10, 0),
      elements: { event: '地下车库局部积水', place: '2号楼-地下车库', time: '今天上午' },
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 10, 0)),
        tl('指派', '物业主管', daysAgo(0, 10, 20)),
        tl('处理', '周管家', daysAgo(0, 10, 50)),
      ] }),

  C({ cat: '便民服务', loc: '小区中心广场', status: 'done', worker: '陈管家', source: 'ai',
      desc: '建议增加休息座椅', created: daysAgo(7, 11, 0), finished: daysAgo(6, 16, 0),
      elements: { event: '建议增设休息座椅', place: '小区中心广场', time: '一周前' },
      steps: [
        tl('居民/微信群发起', '句子秒懂AI', daysAgo(7, 11, 0)),
        tl('指派', '物业主管', daysAgo(7, 11, 30)),
        tl('处理', '陈管家', daysAgo(6, 14, 0)),
        tl('结果确认', '物业主管', daysAgo(6, 15, 40)),
        tl('微信群已回复', '句子秒懂AI', daysAgo(6, 16, 0)),
      ] }),

  C({ cat: '物业服务', loc: '7号楼-2单元', status: 'wait', worker: null, source: 'ai',
      desc: '楼道堆物占用消防通道', created: daysAgo(0, 9, 30),
      elements: { event: '楼道堆物占用消防通道', place: '7号楼-2单元', time: '今早' },
      steps: [ tl('居民/微信群发起', '句子秒懂AI', daysAgo(0, 9, 30)) ] }),
];

/* 暴露给应用 */
const SEED = {
  roles: ROLES,
  repairCats: REPAIR_CATS,
  complaintCats: COMPLAINT_CATS,
  repairSteps: REPAIR_STEPS,
  complaintSteps: COMPLAINT_STEPS,
  staff: STAFF_SEED,
  residents: RESIDENTS,
  workers: WORKERS,
  keepers: KEEPERS,
  tickets: [...REPAIR_SEED, ...COMPLAINT_SEED],
};
