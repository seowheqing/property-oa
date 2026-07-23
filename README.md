# 智慧物业 OA · 工单协同管理系统

> AI 驱动的物业工单全生命周期管理系统

**GitHub**：https://github.com/seowheqing/property-oa

---

## 系统架构

```
居民微信群
    ↓ 消息
句子秒懂 AI 智能体（意图识别 + 信息抽取）
    ↓ POST /api/tickets
┌─────────────────────────────────────────────┐
│  Node.js + Express + SQLite                  │
│  工单管理 · 派单 · 完结通知 · 定时提醒        │
└─────────────────────────────────────────────┘
    ↑ 管理网页                ↓ 触发事件
    主管/师傅/管家         句子秒懂 → 群内回复
```

---

## 核心功能

### 自动化流程
- 居民群消息 → 秒懂 AI 识别 → 自动创建工单
- 工单完成 → 自动推送完结通知到群
- 定时推送待派单提醒到预警群（间隔可配置）
- 工单号自动递增生成（WX0001, WX0002...）

### 运营看板（仅主管可见）
- KPI 卡片：总工单、报修、投诉、帮助/其他、紧急待处理、平均时长、按时完成率
- 近 30 天工单趋势（报修/投诉/帮助折线图）
- 各师傅处理量 & 平均处理时长
- 工单类型分布（三大类饼图）
- 工单状态分布
- 事件频率排行
- 师傅绩效表（点击查看详细档案）

### 工单管理
- **报修**：水暖/电路/电器/门窗/公共设施
- **投诉**：突发事件/物业服务/便民服务/其他
- **帮助**：生活帮助/咨询建议/邻里协调/其他
- **已完成**：独立页面归档
- 四级优先级：紧急(2h) / 高(8h) / 普通(24h) / 低(48h)
- 默认按最新创建排序

### 智能派单
- 日程冲突自动检测（弹窗提醒冲突时段）
- 师傅日程时间轴（日历选日期，单日视图，处理中工单实时拉长）
- 预计处理时长（基于历史平均或类别默认值）

### 登录系统
- 手机号 + 密码登录
- 滑动拼图验证码（防机器人）
- 登录后自动匹配角色权限（主管/维修工/管家）
- 主管在管理平台添加用户时设置手机号和密码

### 角色体系
| 角色 | 能力 | 可见范围 |
|------|------|---------|
| 主管 | 派单、确认完成、驳回 | 全部页面和数据 |
| 维修师傅 | 提交完成、上传照片、退回工单 | 仅自己的工单和日程 |
| 物业管家 | 处理投诉/帮助、退回工单 | 仅自己的工单和日程 |

### 人员档案
- 点击师傅行查看详细档案（绩效评分/SLA明细/擅长类型/工单历史）
- 绩效评分 = 按时完成率×70% + 速度加分(30分)

---

## 本地运行

```bash
cd server
npm install
node index.js
# 浏览器打开 http://localhost:3001
```

插入测试数据：
```bash
node seed-test.js
```

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tickets` | 获取全部工单 |
| POST | `/api/tickets` | 创建工单（id可选，自动生成） |
| PATCH | `/api/tickets/:id` | 更新工单（完成时自动触发通知） |
| DELETE | `/api/tickets/:id` | 删除工单 |
| POST | `/api/notify` | 手动触发完结通知 |
| GET | `/api/reminder/trigger` | 手动触发待派单提醒 |
| GET | `/api/settings/reminder` | 获取推送间隔 |
| POST | `/api/settings/reminder` | 修改推送间隔 |
| GET | `/api/sla/overdue` | 获取超时工单列表 |
| GET | `/api/sla/alert` | 触发超时告警推送到预警群 |
| GET | `/api/report?from=&to=` | 生成工单报告（月报） |
| POST | `/api/report/ai` | AI 智能分析报告（接秒懂/通义千问） |
| POST | `/api/tickets/:id/photos` | 上传工单照片（multipart文件） |
| GET | `/api/tickets/:id/photos` | 获取工单照片列表 |
| POST | `/api/jzm/trigger-event` | 触发秒懂流程事件 |

### 创建工单示例

```json
POST /api/tickets
{
  "type": "repair",
  "cat": "水暖",
  "desc": "3号楼停水",
  "loc": "3号楼-全栋",
  "priority": "urgent",
  "message": "3号楼停水了",
  "sessionId": "可选，用于完结回调"
}
```

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口（默认 3001） |
| `NOTIFY_WEBHOOK` | 通知回调URL |
| `JZMM_ACCESS_KEY_ID` | 句子秒懂 AccessKeyId |
| `JZMM_ACCESS_KEY_SECRET` | 句子秒懂 AccessKeySecret |
| `JZMM_BOT_ID` | 秒懂机器人ID |
| `JZMM_EVENT_ID` | 秒懂事件ID |
| `JZMM_SESSION_ID` | 默认会话ID |

---

## 技术栈

- **前端**：HTML5 + CSS3 + JavaScript ES6 + ECharts 5.x
- **后端**：Node.js + Express
- **数据库**：SQLite（sql.js，本地文件 data.db）
- **AI**：句子秒懂流程引擎
- **消息通道**：企业微信群 → 句子秒懂 → 系统 API
- **部署**：Render Web Service

---

## 文件结构

```
server/
├── index.js           # Express 后端
├── package.json       # 依赖
├── data.db            # SQLite 数据库
├── seed-test.js       # 测试数据脚本
├── .env               # 环境变量（不上传）
├── .gitignore
├── render.yaml        # Render 部署配置
└── public/
    ├── index.html     # 前端页面
    ├── app.js         # 前端逻辑
    ├── data.js        # 种子数据配置
    ├── styles.css     # 样式
    └── echarts.min.js # 图表库
```

---

## 更新日志

### 2026-07-23
- **修复**：工单详情抽屉现在从 `/api/tickets/:id/photos` 接口加载并展示真实照片（缩略图 + 点击放大预览），替代此前只显示 📷 emoji 占位符的问题
