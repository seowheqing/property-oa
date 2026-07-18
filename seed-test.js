/**
 * 插入测试工单数据（UTF-8）
 * 运行: node seed-test.js
 */
const fetch = require('node-fetch');
const BASE = 'http://localhost:3001';

const tickets = [
  {id:"WX7001", type:"repair", cat:"水暖", desc:"居民反馈小区出现停水情况，影响正常生活用水", loc:"牡丹园小区-公共区域", priority:"urgent", status:"wait", message:"停水了"},
  {id:"WX7002", type:"repair", cat:"电路", desc:"5号楼3单元走廊灯全部不亮，居民夜间出行不便", loc:"5号楼-3单元-走廊", priority:"high", status:"wait", message:"走廊灯全灭了，黑漆漆的太危险了"},
  {id:"WX7003", type:"repair", cat:"电器", desc:"电梯出现异响并频繁卡顿，存在安全隐患", loc:"2号楼-1单元-电梯", priority:"urgent", status:"doing", worker:"李师傅", message:"电梯又卡住了，里面还有人！"},
  {id:"WX7004", type:"repair", cat:"公共设施", desc:"小区南门道闸杆断裂，车辆无法正常出入", loc:"小区南门-道闸", priority:"high", status:"doing", worker:"孙师傅", message:"南门道闸杆断了，车都堵着出不去"},
  {id:"WX7005", type:"repair", cat:"水暖", desc:"地下车库消防管道漏水，地面大面积积水", loc:"地下车库-B1层", priority:"urgent", status:"doing", worker:"张师傅", message:"车库地上全是水，消防管在喷水！"},
  {id:"WX7006", type:"complaint", cat:"物业服务", desc:"垃圾清运不及时，垃圾桶满溢散发恶臭", loc:"8号楼-垃圾站", priority:"high", status:"wait", message:"垃圾桶都满了好几天了，臭死了"},
  {id:"WX7007", type:"complaint", cat:"突发事件", desc:"楼顶天台护栏松动，存在坠落风险", loc:"3号楼-楼顶天台", priority:"urgent", status:"doing", worker:"周管家", message:"天台的栏杆晃得厉害，太危险了"},
  {id:"WX7008", type:"repair", cat:"门窗", desc:"单元门门禁系统失灵，大门无法正常关闭", loc:"6号楼-2单元-门禁", priority:"high", status:"wait", message:"门禁坏了，门一直开着，谁都能进来"},
  {id:"WX7009", type:"help", cat:"生活帮助", desc:"独居老人需要帮助更换家中灯泡", loc:"1号楼-3单元-802室", priority:"low", status:"wait", message:"我年纪大了够不着，能不能帮忙换个灯泡"},
  {id:"WX7010", type:"repair", cat:"水暖", desc:"小区主供水管疑似破裂，多栋楼水压异常低", loc:"小区中心-主管道", priority:"urgent", status:"doing", worker:"赵师傅", message:"水压好低啊，洗澡都没水"}
];

async function seed() {
  for (const t of tickets) {
    try {
      const resp = await fetch(BASE + '/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(t)
      });
      const data = await resp.json();
      console.log('OK:', t.id, t.cat, t.desc.slice(0, 10));
    } catch (e) {
      console.error('FAIL:', t.id, e.message);
    }
  }
  console.log('\nDone! 共插入', tickets.length, '条测试工单');
}

seed();
