/**
 * 插入丰富测试工单数据（不同日期、不同状态、不同师傅）
 * 运行: node seed-test.js
 */
const fetch = require('node-fetch');
const BASE = 'http://localhost:3001';

// 生成过去N天的时间
function daysAgo(d, h = 9, m = 0) {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

const tickets = [
  // ===== 已完成工单（不同师傅、不同天数）=====
  {id:"WX8001", type:"repair", cat:"水暖", desc:"3号楼2单元501水管爆裂漏水严重", loc:"3号楼-2单元-501室", priority:"urgent", status:"done", worker:"张师傅", message:"水管爆了，地上全是水！", created: daysAgo(25, 8, 12), finished: daysAgo(25, 11, 40)},
  {id:"WX8002", type:"repair", cat:"电路", desc:"5号楼1单元走廊照明全部不亮", loc:"5号楼-1单元-走廊", priority:"high", status:"done", worker:"李师傅", message:"走廊灯全灭了", created: daysAgo(22, 9, 0), finished: daysAgo(22, 12, 30)},
  {id:"WX8003", type:"repair", cat:"门窗", desc:"阳台推拉门脱轨无法关闭", loc:"1号楼-1单元-201室", priority:"normal", status:"done", worker:"王师傅", message:"推拉门脱轨了", created: daysAgo(20, 10, 0), finished: daysAgo(20, 15, 30)},
  {id:"WX8004", type:"repair", cat:"公共设施", desc:"健身区器材螺丝松动有安全隐患", loc:"小区中庭-健身区", priority:"high", status:"done", worker:"王师傅", message:"健身器材晃得厉害", created: daysAgo(18, 14, 0), finished: daysAgo(18, 17, 20)},
  {id:"WX8005", type:"repair", cat:"水暖", desc:"暖气片不热，室温过低", loc:"6号楼-2单元-803室", priority:"normal", status:"done", worker:"赵师傅", message:"暖气片不热", created: daysAgo(16, 9, 0), finished: daysAgo(15, 11, 0)},
  {id:"WX8006", type:"repair", cat:"电器", desc:"空调外机噪音大影响楼下住户", loc:"5号楼-2单元-705室", priority:"normal", status:"done", worker:"李师傅", message:"空调外机噪音太大了", created: daysAgo(14, 9, 0), finished: daysAgo(14, 13, 0)},
  {id:"WX8007", type:"repair", cat:"公共设施", desc:"南门车辆道闸抬杆失灵", loc:"小区南门-道闸", priority:"urgent", status:"done", worker:"孙师傅", message:"道闸抬不起来", created: daysAgo(12, 8, 0), finished: daysAgo(12, 10, 30)},
  {id:"WX8008", type:"repair", cat:"水暖", desc:"厨房水龙头漏水", loc:"2号楼-3单元-402室", priority:"normal", status:"done", worker:"张师傅", message:"水龙头一直滴水", created: daysAgo(10, 10, 20), finished: daysAgo(10, 12, 50)},
  {id:"WX8009", type:"repair", cat:"电路", desc:"配电箱跳闸导致整层断电", loc:"7号楼-2单元-6层", priority:"urgent", status:"done", worker:"李师傅", message:"整层都停电了！", created: daysAgo(8, 7, 30), finished: daysAgo(8, 9, 45)},
  {id:"WX8010", type:"repair", cat:"门窗", desc:"卧室窗户密封条老化漏风", loc:"3号楼-1单元-902室", priority:"low", status:"done", worker:"赵师傅", message:"窗户漏风", created: daysAgo(7, 9, 0), finished: daysAgo(7, 12, 30)},
  {id:"WX8011", type:"repair", cat:"电器", desc:"楼道声控灯损坏不亮", loc:"4号楼-2单元-楼道", priority:"normal", status:"done", worker:"李师傅", message:"声控灯坏了", created: daysAgo(5, 8, 0), finished: daysAgo(5, 10, 0)},
  {id:"WX8012", type:"repair", cat:"水暖", desc:"卫生间马桶下水堵塞", loc:"8号楼-1单元-301室", priority:"high", status:"done", worker:"张师傅", message:"马桶堵了", created: daysAgo(4, 11, 0), finished: daysAgo(4, 13, 30)},
  {id:"WX8013", type:"repair", cat:"公共设施", desc:"电梯按钮失灵部分楼层无法到达", loc:"6号楼-1单元-电梯", priority:"urgent", status:"done", worker:"孙师傅", message:"电梯按钮坏了", created: daysAgo(3, 9, 0), finished: daysAgo(3, 14, 0)},

  // ===== 处理中工单 =====
  {id:"WX8014", type:"repair", cat:"电路", desc:"客厅频繁跳闸断电", loc:"5号楼-1单元-302室", priority:"urgent", status:"doing", worker:"李师傅", message:"客厅老是跳闸", created: daysAgo(1, 9, 5)},
  {id:"WX8015", type:"repair", cat:"水暖", desc:"地下车库消防管道漏水", loc:"地下车库-B1层", priority:"urgent", status:"doing", worker:"张师傅", message:"车库地上全是水", created: daysAgo(1, 14, 30)},
  {id:"WX8016", type:"repair", cat:"门窗", desc:"防盗门锁芯卡死无法开门", loc:"2号楼-1单元-1001室", priority:"high", status:"doing", worker:"王师傅", message:"门锁卡死了", created: daysAgo(0, 9, 40)},
  {id:"WX8017", type:"repair", cat:"电器", desc:"油烟机异响严重", loc:"4号楼-1单元-603室", priority:"normal", status:"doing", worker:"张师傅", message:"油烟机响得厉害", created: daysAgo(0, 10, 30)},

  // ===== 待派单工单 =====
  {id:"WX8018", type:"repair", cat:"电器", desc:"燃气热水器不打火", loc:"2号楼-3单元-1102室", priority:"high", status:"wait", message:"热水器打不着火", created: daysAgo(0, 8, 40)},
  {id:"WX8019", type:"repair", cat:"水暖", desc:"小区主供水管水压异常低", loc:"小区中心-主管道", priority:"urgent", status:"wait", message:"水压好低", created: daysAgo(0, 11, 20)},
  {id:"WX8020", type:"repair", cat:"电路", desc:"入户门口照明灯不亮", loc:"7号楼-3单元-401室", priority:"low", status:"wait", message:"门口灯不亮了", created: daysAgo(0, 7, 55)},

  // ===== 投诉工单 =====
  {id:"TS8001", type:"complaint", cat:"物业服务", desc:"电梯卫生差长期未清洁", loc:"6号楼-1单元", priority:"high", status:"done", worker:"陈管家", message:"电梯太脏了", created: daysAgo(19, 10, 0), finished: daysAgo(19, 15, 0)},
  {id:"TS8002", type:"complaint", cat:"突发事件", desc:"大风刮倒树木挡住道路", loc:"小区东区-绿化带", priority:"urgent", status:"done", worker:"周管家", message:"树倒了挡路", created: daysAgo(15, 7, 0), finished: daysAgo(15, 9, 30)},
  {id:"TS8003", type:"complaint", cat:"物业服务", desc:"垃圾清运不及时满溢恶臭", loc:"8号楼-垃圾站", priority:"high", status:"done", worker:"陈管家", message:"垃圾桶满了好几天", created: daysAgo(11, 8, 50), finished: daysAgo(11, 14, 0)},
  {id:"TS8004", type:"complaint", cat:"突发事件", desc:"夜间施工噪音扰民", loc:"小区西区", priority:"high", status:"done", worker:"周管家", message:"晚上施工太吵了", created: daysAgo(6, 22, 0), finished: daysAgo(5, 16, 0)},
  {id:"TS8005", type:"complaint", cat:"物业服务", desc:"车位被外来车辆长期占用", loc:"4号楼-地面停车场", priority:"normal", status:"doing", worker:"周管家", message:"车位被占了", created: daysAgo(1, 8, 50)},
  {id:"TS8006", type:"complaint", cat:"物业服务", desc:"楼道堆物占用消防通道", loc:"7号楼-2单元", priority:"high", status:"wait", message:"楼道堆满东西", created: daysAgo(0, 9, 30)},

  // ===== 帮助工单 =====
  {id:"HLP8001", type:"help", cat:"生活帮助", desc:"独居老人需要帮助更换灯泡", loc:"1号楼-3单元-802室", priority:"low", status:"done", worker:"陈管家", message:"帮忙换个灯泡", created: daysAgo(13, 10, 0), finished: daysAgo(13, 11, 0)},
  {id:"HLP8002", type:"help", cat:"生活帮助", desc:"行动不便居民需要帮忙搬重物", loc:"3号楼-2单元-101室", priority:"low", status:"done", worker:"周管家", message:"能帮忙搬一下东西吗", created: daysAgo(9, 14, 0), finished: daysAgo(9, 15, 30)},
  {id:"HLP8003", type:"help", cat:"生活帮助", desc:"独居老人需要帮助安装晾衣架", loc:"5号楼-1单元-602室", priority:"low", status:"wait", message:"帮忙装个晾衣架", created: daysAgo(0, 10, 0)},
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
      if (data.success) {
        // 如果有finished时间，需要通过PATCH更新（因为POST不支持finished）
        if (t.finished) {
          await fetch(BASE + '/api/tickets/' + t.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ finished: t.finished })
          });
        }
        console.log('OK:', t.id, t.type, t.cat, t.status, t.worker || '-');
      } else {
        console.error('FAIL:', t.id, data.error);
      }
    } catch (e) {
      console.error('ERR:', t.id, e.message);
    }
  }
  console.log('\nDone! 共插入', tickets.length, '条测试工单');
  console.log('已完成:', tickets.filter(t=>t.status==='done').length);
  console.log('处理中:', tickets.filter(t=>t.status==='doing').length);
  console.log('待派单:', tickets.filter(t=>t.status==='wait').length);
}

seed();
