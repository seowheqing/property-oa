/* ============================================================
   物业 OA 工单审批系统 —— 应用逻辑
   后端 API 模式（飞书多维表格）+ localStorage 人员管理
   ============================================================ */

const LS_KEY = 'juzi_oa_demo_v1';
const LS_ROLE = 'juzi_oa_role_v1';
const API_BASE = ''; // 同域，留空即可；部署到 Render 后改为实际 URL

/* ---------- 状态映射 ---------- */
const STATUS_LABEL = { wait: '待派单', doing: '处理中', confirm: '待确认', done: '已完成' };
const STATUS_CLASS = { wait: 'wait', doing: 'doing', confirm: 'confirm', done: 'done' };

/* ---------- 全局 state ---------- */
let state = { tickets: [], staff: [] };
let currentRole = 'eng_lead';
let charts = {};   // echarts 实例缓存
let useApi = true; // 是否使用后端 API

/* ============================================================
   数据加载与持久化
   ============================================================ */
async function load() {
  // 人员仍用 localStorage
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { var parsed = JSON.parse(raw); state.staff = parsed.staff || JSON.parse(JSON.stringify(SEED.staff)); } catch(e) { state.staff = JSON.parse(JSON.stringify(SEED.staff)); }
  } else { state.staff = JSON.parse(JSON.stringify(SEED.staff)); }
  currentRole = localStorage.getItem(LS_ROLE) || 'eng_lead';

  // 工单从 API 加载
  if (useApi) {
    try {
      var resp = await fetch(API_BASE + '/api/tickets');
      var json = await resp.json();
      if (json.data) {
        state.tickets = json.data.filter(t => t.id && t.type);
        saveLocal();
        return;
      }
    } catch(e) { console.warn('API 不可用，回退到本地数据', e); }
  }
  // 回退：使用本地数据
  var localRaw = localStorage.getItem(LS_KEY);
  if (localRaw) { try { state.tickets = JSON.parse(localRaw).tickets || []; } catch(e) { state.tickets = []; } }
  else { state.tickets = []; }
}

function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function save() { saveLocal(); }

async function apiPatch(recordId, updates) {
  if (!useApi || !recordId) return;
  try {
    await fetch(API_BASE + '/api/tickets/' + recordId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch(e) { console.warn('写回飞书失败', e); }
}

function seed() {
  state = {
    tickets: JSON.parse(JSON.stringify(SEED.tickets)),
    staff: JSON.parse(JSON.stringify(SEED.staff)),
  };
  saveLocal();
}
function resetDemo() {
  if (confirm('确定清空全部工单数据？')) {
    fetch(API_BASE + '/api/tickets', {method:'DELETE'}).then(function(){
      localStorage.removeItem(LS_KEY);
      location.reload();
    }).catch(function(){ localStorage.removeItem(LS_KEY); location.reload(); });
  }
}

/* ============================================================
   小工具
   ============================================================ */
function $(s, root = document) { return root.querySelector(s); }
function $$(s, root = document) { return [...root.querySelectorAll(s)]; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtTime(iso) {
  if (!iso) return '—';
  const t = new Date(iso); const p = n => String(n).padStart(2, '0');
  return `${t.getMonth() + 1}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}
function durHours(a, b) { if (!a || !b) return null; return +((new Date(b) - new Date(a)) / 3600000).toFixed(1); }
function durLabel(t) {
  if (t.status !== 'done' || !t.finished) {
    // 进行中：从创建到现在
    const h = durHours(t.created, new Date().toISOString());
    return h == null ? '—' : `进行中 ${h}h`;
  }
  const h = durHours(t.created, t.finished);
  return h == null ? '—' : `${h}h`;
}

let toastTimer;
function toast(msg) {
  let el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* 头像 */
function avatar(name, color) {
  const c = color || '#1677ff';
  const ch = name ? name[0] : '?';
  return `<span class="avatar" style="background:${c}">${esc(ch)}</span>`;
}
function staffColor(name) {
  const palette = { '张师傅': '#13c2c2', '李师傅': '#52c41a', '王师傅': '#fa8c16', '赵师傅': '#eb2f96', '孙师傅': '#1677ff', '陈管家': '#08979c', '周管家': '#722ed1' };
  return palette[name] || '#1677ff';
}

/* ============================================================
   导航
   ============================================================ */
function initNav() {
  $$('.nav button').forEach(b => {
    b.onclick = () => {
      $$('.nav button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      $$('.page').forEach(p => p.classList.remove('active'));
      $('#page-' + b.dataset.page).classList.add('active');
      if (b.dataset.page === 'dashboard') setTimeout(renderDashboard, 30);
      if (b.dataset.page === 'schedule') setTimeout(renderSchedule, 30);
    };
  });
}

function navTo(page) {
  var btn = $$('.nav button').find(b => b.dataset.page === page);
  if (btn) btn.click();
}

/* ============================================================
   角色切换
   ============================================================ */
function initRole() {
  const sel = $('#roleSelect');
  // 管理角色（合并为一个主管）
  var html = '<optgroup label="管理层">';
  html += '<option value="eng_lead">主管</option>';
  html += '</optgroup>';
  // 维修工（从 state.staff 动态读取）
  var workers = state.staff.filter(s => s.role === '维修工');
  if (workers.length) {
    html += '<optgroup label="维修工">';
    workers.forEach(s => { html += `<option value="worker_${esc(s.name)}">${esc(s.name)} · ${esc(s.skill)}</option>`; });
    html += '</optgroup>';
  }
  // 管家（从 state.staff 动态读取）
  var keepers = state.staff.filter(s => s.role === '物业管家');
  if (keepers.length) {
    html += '<optgroup label="物业管家">';
    keepers.forEach(s => { html += `<option value="pm_keeper_${esc(s.name)}">${esc(s.name)} · ${esc(s.skill)}</option>`; });
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  // 恢复上次选中的角色
  if (sel.querySelector(`option[value="${currentRole}"]`)) sel.value = currentRole;
  else { currentRole = 'eng_lead'; sel.value = currentRole; }
  sel.onchange = () => {
    currentRole = sel.value;
    localStorage.setItem(LS_ROLE, currentRole);
    toast('已切换角色：' + sel.options[sel.selectedIndex].text);
    applyRoleView();
  };
}
function roleObj() {
  if (currentRole === 'eng_lead') return { id: 'eng_lead', name: '主管', kind: '管理' };
  // 动态角色
  var name = currentRole.replace(/^worker_|^pm_keeper_/, '');
  var s = state.staff.find(x => x.name === name);
  if (s) return { id: currentRole, name: s.name, kind: s.role };
  return { id: currentRole, name: currentRole, kind: '未知' };
}
function roleWorkerName() {
  if (currentRole.startsWith('worker_')) return currentRole.replace('worker_', '');
  return null;
}
function applyRoleView() {
  var isWorker = currentRole.startsWith('worker_');
  var isKeeper = currentRole.startsWith('pm_keeper_');
  // 师傅/管家视图：隐藏管理平台和看板
  $$('.nav button').forEach(b => {
    if (b.dataset.page === 'admin') b.style.display = (isWorker || isKeeper) ? 'none' : '';
    if (b.dataset.page === 'dashboard') b.style.display = (isWorker || isKeeper) ? 'none' : '';
  });
  // 师傅日程页面：自动筛选为只看自己
  if (isWorker || isKeeper) {
    var myName = roleWorkerName() || currentRole.replace('pm_keeper_','');
    setTimeout(function(){
      var sel = $('#schedule-worker');
      if (sel) { sel.value = myName; renderSchedule(); }
    }, 50);
  }
  // 切换到师傅视图时默认显示工单页
  if (isWorker) { navTo('repair'); }
  else if (isKeeper) { navTo('complaint'); }
  renderAll();
  if (openTicketId) openDrawer(openTicketId);
}
/* ============================================================
   工单列表渲染
   ============================================================ */
function renderTickets(type) {
  const tbody = $(`#tbody-${type}`);
  const fStatus = $(`#filter-status-${type}`).value;
  const fCat = $(`#filter-cat-${type}`).value;
  let rows = state.tickets.filter(t => t.type === type);
  if (fStatus) rows = rows.filter(t => t.status === fStatus);
  if (fCat) rows = rows.filter(t => t.cat === fCat);
  rows.sort((a, b) => new Date(b.created) - new Date(a.created));

  $(`#count-${type}`).textContent = `共 ${rows.length} 张工单`;

  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9" class="empty">暂无符合条件的工单</td></tr>`; return; }

  tbody.innerHTML = rows.map(t => {
    const src = t.source === 'ai'
      ? `<span class="src-ai">微信群·句子秒懂AI</span>${t.aggregated && t.aggregated.length > 1 ? ` <span class="tag ai">聚合${t.aggregated.length}</span>` : ''}`
      : `<span class="src-manual">手动录入</span>`;
    return `<tr onclick="openDrawer('${t.id}')">
      <td class="mono">${esc(t.id)}</td>
      <td>${esc(t.loc)}</td>
      <td><span class="tag cat">${esc(t.cat)}</span></td>
      <td><span class="tag ${STATUS_CLASS[t.status]}">${STATUS_LABEL[t.status]}</span></td>
      <td>${t.worker ? avatar(t.worker, staffColor(t.worker)) + esc(t.worker) : '<span style="color:#aaa">待指派</span>'}</td>
      <td>${src}</td>
      <td class="mono">${fmtTime(t.created)}</td>
      <td>${durLabel(t)}</td>
    </tr>`;
  }).join('');
}

function initFilters(type) {
  const cats = type === 'repair' ? SEED.repairCats : SEED.complaintCats;
  $(`#filter-cat-${type}`).innerHTML = `<option value="">全部类型</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  $(`#filter-status-${type}`).innerHTML = `<option value="">全部状态</option>` +
    Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $(`#filter-status-${type}`).onchange = () => renderTickets(type);
  $(`#filter-cat-${type}`).onchange = () => renderTickets(type);
}

/* ============================================================
   详情抽屉
   ============================================================ */
let openTicketId = null;

function openDrawer(id) {
  const t = state.tickets.find(x => x.id === id);
  if (!t) return;
  openTicketId = id;
  const steps = t.type === 'repair' ? SEED.repairSteps : SEED.complaintSteps;

  $('#drawer-title').textContent = `${t.id} · ${t.cat}`;
  $('#drawer-sub').textContent = `${t.loc}　|　${STATUS_LABEL[t.status]}`;

  // —— 三要素 ——
  const el = t.elements || {};
  const elementsHtml = `
    <div class="elements">
      <div class="elem"><div class="k">事件类型</div><div class="v">${esc(el.event || t.cat)}</div></div>
      <div class="elem"><div class="k">地点</div><div class="v">${esc(el.place || t.loc)}</div></div>
      <div class="elem full"><div class="k">时间</div><div class="v">${esc(el.time || fmtTime(t.created))}</div></div>
    </div>`;

  // —— 聚合反馈 ——
  let aggHtml = '';
  if (t.aggregated && t.aggregated.length) {
    aggHtml = `<div class="drawer-section">
      <h4>居民反馈（句子秒懂聚合 ${t.aggregated.length} 条 → 1 张工单）</h4>
      <ul class="agg-list">${t.aggregated.map(a =>
        `<li><span class="av">${esc(a.who[0])}</span><div><b>${esc(a.who)}</b>：${esc(a.msg)}<div style="color:#aaa;font-size:11px">${fmtTime(a.t)}</div></div></li>`).join('')}</ul>
    </div>`;
  }

  // —— 时间线 ——
  const doneCount = t.steps.length;
  const tlHtml = steps.map((label, i) => {
    const s = t.steps[i];
    let cls = 'todo';
    if (i < doneCount - 1) cls = 'done';
    else if (i === doneCount - 1) cls = (t.status === 'done') ? 'done' : 'current';
    return `<div class="tl-item ${cls}">
      <div class="dot"></div>
      <div class="tl-title">${s ? esc(s.title) : esc(label)}</div>
      ${s ? `<div class="tl-meta">${esc(s.who)} · ${fmtTime(s.time)}</div>` : `<div class="tl-meta">待处理</div>`}
    </div>`;
  }).join('');

  // —— 照片 ——
  let photoHtml;
  if (t.photos && t.photos.length) {
    photoHtml = `<div class="photos">${t.photos.map((p, i) =>
      `<div class="photo">${p}<small>现场照片${i + 1}</small></div>`).join('')}</div>`;
  } else {
    photoHtml = `<div style="color:#aaa;font-size:13px">暂无现场照片</div>`;
  }

  // —— 操作按钮（按角色 + 状态） ——
  const actHtml = buildActions(t);

  $('#drawer-body').innerHTML = `
    <div class="drawer-section">
      <h4>AI 识别三要素（句子秒懂）</h4>
      ${elementsHtml}
      <div style="margin-top:12px;color:#5e6573;font-size:13px">问题描述：${esc(t.desc)}</div>
      <div style="margin-top:6px;font-size:13px">来源：${t.source === 'ai' ? '<span class="tag ai">微信群·句子秒懂AI</span>' : '<span class="tag manual">手动录入</span>'}</div>
    </div>
    ${aggHtml}
    <div class="drawer-section">
      <h4>流转时间线</h4>
      <div class="timeline">${tlHtml}</div>
    </div>
    <div class="drawer-section">
      <h4>处理照片（师傅现场上传）</h4>
      ${photoHtml}
    </div>
    <div class="drawer-section">
      <h4>操作（当前角色：${esc(roleObj().name)}）</h4>
      <div class="actions">${actHtml}</div>
    </div>
  `;

  $('#drawerMask').classList.add('open');
  $('#drawer').classList.add('open');
}
function closeDrawer() {
  $('#drawerMask').classList.remove('open');
  $('#drawer').classList.remove('open');
  openTicketId = null;
}

/* 根据角色和状态生成操作按钮 */
function buildActions(t) {
  const role = currentRole;
  const isRepair = t.type === 'repair';
  const myWorker = roleWorkerName();          // 维修工角色对应的师傅名
  const btns = [];

  if (isRepair) {
    // 报修流程
    if (t.status === 'wait') {
      if (role === 'eng_lead') {
        const opts = SEED.workers.map(w => `<option value="${w}">${w}</option>`).join('');
        btns.push(`<select id="assignWorker" class="toolbar" style="padding:6px 10px;border:1px solid #e6eaf0;border-radius:8px">${opts}</select>`);
        btns.push(`<button class="btn" onclick="assignTicket('${t.id}')">派单给该师傅</button>`);
      } else {
        return hint('当前角色无操作权限。请切换为「工程部主管」进行派单。');
      }
    } else if (t.status === 'doing') {
      // 已派单，处理中：师傅上传照片 / 完成
      if (role.startsWith('worker_') && t.worker === myWorker) {
        btns.push(`<button class="btn teal" onclick="uploadPhoto('${t.id}')">上传现场照片</button>`);
        btns.push(`<button class="btn green" onclick="workerFinish('${t.id}', 'once')">维修·一次完成</button>`);
        btns.push(`<button class="btn ghost" onclick="workerFinish('${t.id}', 'twice')">需二次上门</button>`);
      } else if (role === 'eng_lead') {
        return hint(`已派单给 ${t.worker}，等待维修工现场处理。可切换为该维修工角色操作。`);
      } else {
        return hint(`该工单已派给 ${t.worker}。请切换为对应维修工角色操作。`);
      }
    } else if (t.status === 'confirm') {
      if (role === 'eng_lead') {
        btns.push(`<button class="btn green" onclick="confirmDone('${t.id}')">确认完成并回复微信群</button>`);
        btns.push(`<button class="btn gray" onclick="reject('${t.id}')">退回重处理</button>`);
      } else {
        return hint('维修已上报，等待「工程部主管」结果确认。');
      }
    } else { // done
      return hint('工单已完成，已在微信群回复「已处理完毕」。流程结束。');
    }
  } else {
    // 投诉流程
    if (t.status === 'wait') {
      if (role === 'pm_lead') {
        const opts = SEED.keepers.map(w => `<option value="${w}">${w}</option>`).join('');
        btns.push(`<select id="assignWorker" style="padding:6px 10px;border:1px solid #e6eaf0;border-radius:8px">${opts}</select>`);
        btns.push(`<button class="btn" onclick="assignTicket('${t.id}')">指派给该管家</button>`);
      } else {
        return hint('当前角色无操作权限。请切换为「物业主管」进行指派。');
      }
    } else if (t.status === 'doing') {
      if (role === 'pm_keeper' && t.worker) {
        btns.push(`<button class="btn green" onclick="workerFinish('${t.id}', 'once')">处理完成·提交结果</button>`);
      } else if (role === 'pm_lead') {
        return hint(`已指派给 ${t.worker}，等待物业管家处理。`);
      } else {
        return hint(`该投诉已指派给 ${t.worker}。请切换为「物业管家」操作。`);
      }
    } else if (t.status === 'confirm') {
      if (role === 'pm_lead') {
        btns.push(`<button class="btn green" onclick="confirmDone('${t.id}')">确认完成并回复微信群</button>`);
        btns.push(`<button class="btn gray" onclick="reject('${t.id}')">退回重处理</button>`);
      } else {
        return hint('已上报处理结果，等待「物业主管」结果确认。');
      }
    } else {
      return hint('投诉已完成，已在微信群回复居民。流程结束。');
    }
  }
  return btns.join(' ');
}
function hint(text) { return `<div class="hint">ℹ️ ${esc(text)}</div>`; }

/* ============================================================
   工单操作（状态机推进）
   ============================================================ */
function pushStep(t, title, who) { t.steps.push({ title, who, time: new Date().toISOString() }); }

function assignTicket(id) {
  const t = state.tickets.find(x => x.id === id);
  const w = $('#assignWorker').value;
  t.worker = w;
  t.status = 'doing';
  if (t.type === 'repair') pushStep(t, '工单分配', roleObj().name);
  else pushStep(t, '指派', roleObj().name);
  save(); afterAction(id, `已${t.type === 'repair' ? '派单' : '指派'}给 ${w}`);
}

function uploadPhoto(id) {
  const t = state.tickets.find(x => x.id === id);
  const pool = ['📷', '🔧', '🛠️', '🚿', '⚡', '🪟', '🚪', '🌡️', '💡'];
  t.photos = t.photos || [];
  t.photos.push(pool[Math.floor(Math.random() * pool.length)]);
  // 若尚未有"现场确认"节点则补上
  if (!t.steps.some(s => s.title.includes('现场确认'))) pushStep(t, '现场确认', t.worker);
  save(); afterAction(id, '已上传一张现场照片');
}

function workerFinish(id, mode) {
  const t = state.tickets.find(x => x.id === id);
  if (t.type === 'repair') {
    if (!t.steps.some(s => s.title.includes('现场确认'))) pushStep(t, '现场确认', t.worker);
    if (mode === 'once') {
      pushStep(t, '现场维修·一次完成', t.worker);
      t.status = 'confirm';
      afterAction(id, '已标记一次完成，等待主管确认');
    } else {
      pushStep(t, '现场维修·需二次上门', t.worker);
      // 仍为处理中，等待二次上门；这里演示直接生成二次完成
      pushStep(t, '二次上门·完成', t.worker);
      t.status = 'confirm';
      afterAction(id, '已记录需二次上门并完成，等待主管确认');
    }
  } else {
    pushStep(t, '处理完成', t.worker);
    t.status = 'confirm';
    afterAction(id, '已提交处理结果，等待主管确认');
  }
  save();
}

function confirmDone(id) {
  const t = state.tickets.find(x => x.id === id);
  pushStep(t, '结果确认', roleObj().name);
  pushStep(t, '处理完成·已确认', roleObj().name);
  t.status = 'done';
  t.finished = new Date().toISOString();
  const st = state.staff.find(s => s.name === t.worker);
  if (st) st.done += 1;
  save(); apiPatch(t.id, {status:'done', finished:t.finished});
  // 自动通知群
  fetch(API_BASE + '/api/notify', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticketId:t.id,event:'completed'})}).catch(function(){});
  afterAction(id, '工单已完成');
}

function reject(id) {
  const t = state.tickets.find(x => x.id === id);
  pushStep(t, '主管退回·需重新处理', roleObj().name);
  t.status = 'doing';
  save(); afterAction(id, '已退回，重新处理');
}

function afterAction(id, msg) {
  toast(msg);
  openDrawer(id);
  renderTickets('repair');
  renderTickets('complaint');
}

/* ============================================================
   看板 Dashboard
   ============================================================ */
function renderDashboard() {
  const ts = state.tickets;
  const repairs = ts.filter(t => t.type === 'repair');
  const complaints = ts.filter(t => t.type === 'complaint');
  const done = ts.filter(t => t.status === 'done');

  // KPI
  $('#kpi-total').innerHTML = ts.length + ' <small>张</small>';
  $('#kpi-repair').innerHTML = repairs.length + ' <small>张</small>';
  $('#kpi-complaint').innerHTML = complaints.length + ' <small>张</small>';

  const durs = done.map(t => durHours(t.created, t.finished)).filter(x => x != null);
  const avg = durs.length ? (durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1) : '—';
  $('#kpi-avg').innerHTML = avg + ' <small>小时</small>';

  // 按时完成率（设阈值 24h 内完成为按时）
  const onTime = done.filter(t => { const h = durHours(t.created, t.finished); return h != null && h <= 24; }).length;
  const rate = done.length ? Math.round(onTime / done.length * 100) : 0;
  $('#kpi-rate').innerHTML = rate + ' <small>%</small>';

  drawCharts();
}

function getChart(id) {
  if (charts[id]) return charts[id];
  charts[id] = echarts.init($('#' + id));
  return charts[id];
}

function drawCharts() {
  const teal = '#13c2c2', blue = '#1677ff', purple = '#722ed1', green = '#52c41a', orange = '#faad14', pink = '#eb2f96';

  /* 近30天趋势（折线，数据密集） */
  const days = [], repairArr = [], complaintArr = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date('2026-06-29'); d.setDate(d.getDate() - i);
    days.push((d.getMonth() + 1) + '/' + d.getDate());
    // 用确定性伪随机让柱子多且密集
    const base = 6 + Math.round(4 * Math.sin(i / 2.3) + 3 * Math.cos(i / 1.7));
    repairArr.push(Math.max(2, base + (i % 3)));
    complaintArr.push(Math.max(1, Math.round(base * 0.55 + (i % 4) - 1)));
  }
  getChart('chart-trend').setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['报修', '投诉'], right: 10 },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: days, axisLabel: { fontSize: 10, interval: 1 } },
    yAxis: { type: 'value' },
    series: [
      { name: '报修', type: 'line', smooth: true, data: repairArr, areaStyle: { opacity: .15 }, itemStyle: { color: blue }, symbolSize: 4 },
      { name: '投诉', type: 'line', smooth: true, data: complaintArr, areaStyle: { opacity: .15 }, itemStyle: { color: orange }, symbolSize: 4 },
    ],
  });

  /* 各师傅处理量（柱状） */
  const workers = state.staff.filter(s => s.role === '维修工');
  getChart('chart-worker-count').setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: workers.map(w => w.name) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar', data: workers.map(w => w.done), barWidth: '50%',
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: teal }, { offset: 1, color: blue }]), borderRadius: [6, 6, 0, 0] },
      label: { show: true, position: 'top' },
    }],
  });

  /* 各师傅平均处理时长（柱状，演示数据） */
  const avgDur = { '张师傅': 3.2, '李师傅': 3.8, '王师傅': 4.5, '赵师傅': 5.1, '孙师傅': 4.0 };
  getChart('chart-worker-dur').setOption({
    tooltip: { trigger: 'axis', formatter: '{b}: {c} 小时' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: workers.map(w => w.name) },
    yAxis: { type: 'value', name: '小时' },
    series: [{
      type: 'bar', data: workers.map(w => avgDur[w.name] || 4), barWidth: '50%',
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: purple }, { offset: 1, color: pink }]), borderRadius: [6, 6, 0, 0] },
      label: { show: true, position: 'top', formatter: '{c}h' },
    }],
  });

  /* 报修类型分布（饼） */
  const catCount = {};
  SEED.repairCats.forEach(c => catCount[c] = 0);
  state.tickets.filter(t => t.type === 'repair').forEach(t => catCount[t.cat] = (catCount[t.cat] || 0) + 1);
  getChart('chart-cat').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    color: [blue, teal, green, orange, purple],
    series: [{
      type: 'pie', radius: ['38%', '65%'], center: ['50%', '45%'],
      data: Object.entries(catCount).map(([n, v]) => ({ name: n, value: v })),
      label: { formatter: '{b}\n{c}' },
    }],
  });

  /* 工单状态分布（环形） */
  const stCount = { wait: 0, doing: 0, confirm: 0, done: 0 };
  state.tickets.forEach(t => stCount[t.status]++);
  getChart('chart-status').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    color: [orange, blue, purple, green],
    series: [{
      type: 'pie', radius: ['45%', '68%'], center: ['50%', '45%'],
      data: [
        { name: '待派单', value: stCount.wait },
        { name: '处理中', value: stCount.doing },
        { name: '待确认', value: stCount.confirm },
        { name: '已完成', value: stCount.done },
      ],
      label: { formatter: '{b}\n{c}' },
    }],
  });
}

window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));

/* ============================================================
   管理平台（师傅 CRUD）
   ============================================================ */
function renderStaff() {
  const tbody = $('#tbody-staff');
  tbody.innerHTML = state.staff.map(s => {
    const dotCls = s.status === 'on' ? 'on' : (s.status === 'busy' ? 'busy' : 'off');
    const stLabel = s.status === 'on' ? '在岗' : (s.status === 'busy' ? '忙碌' : '休息');
    return `<tr style="cursor:default">
      <td>${avatar(s.name, staffColor(s.name))}${esc(s.name)}</td>
      <td><span class="tag ${s.role === '维修工' ? 'cat' : 'ai'}">${esc(s.role)}</span></td>
      <td>${esc(s.skill)}</td>
      <td class="mono">${esc(s.phone)}</td>
      <td><span class="staff-status"><span class="status-dot ${dotCls}"></span>${stLabel}</span></td>
      <td><b>${s.done}</b></td>
      <td>
        <button class="btn sm ghost" onclick="openStaffModal('${s.id}')">编辑</button>
        <button class="btn sm danger" onclick="deleteStaff('${s.id}')">删除</button>
      </td>
    </tr>`;
  }).join('');
}

let editingStaffId = null;
function openStaffModal(id) {
  editingStaffId = id || null;
  const s = id ? state.staff.find(x => x.id === id) : { name: '', role: '维修工', skill: '', phone: '', status: 'on', done: 0 };
  $('#modal-title').textContent = id ? '编辑人员' : '新增人员';
  $('#f-name').value = s.name;
  $('#f-role').value = s.role;
  // 技能标签多选
  var skills = (s.skill || '').split('/').map(x => x.trim());
  $$('#f-skill-tags input[type=checkbox]').forEach(cb => { cb.checked = skills.includes(cb.value); });
  $('#f-phone').value = s.phone;
  $('#f-status').value = s.status;
  $('#f-done').value = s.done;
  $('#staffModal').classList.add('open');
}
function closeStaffModal() { $('#staffModal').classList.remove('open'); }

function getSelectedSkills() {
  return $$('#f-skill-tags input[type=checkbox]:checked').map(cb => cb.value).join('/') || '—';
}

function saveStaff() {
  const name = $('#f-name').value.trim();
  if (!name) { toast('请填写姓名'); return; }
  const data = {
    name,
    role: $('#f-role').value,
    skill: getSelectedSkills(),
    phone: $('#f-phone').value.trim() || '—',
    status: $('#f-status').value,
    done: parseInt($('#f-done').value) || 0,
  };
  if (editingStaffId) {
    Object.assign(state.staff.find(s => s.id === editingStaffId), data);
    toast('已更新人员信息');
  } else {
    data.id = 's' + Date.now();
    state.staff.push(data);
    toast('已新增人员');
  }
  save(); renderStaff(); closeStaffModal();
}
function deleteStaff(id) {
  const s = state.staff.find(x => x.id === id);
  if (confirm(`确定删除「${s.name}」？`)) {
    state.staff = state.staff.filter(x => x.id !== id);
    save(); renderStaff(); toast('已删除');
  }
}

/* ============================================================
   渲染入口
   ============================================================ */
function renderAll() {
  renderTickets('repair');
  renderTickets('complaint');
  renderStaff();
  if ($('#page-dashboard').classList.contains('active')) renderDashboard();
}

/* ---------- 启动 ---------- */
window.onload = function () {
  load();
  initNav();
  initRole();
  initFilters('repair');
  initFilters('complaint');
  renderAll();
  renderDashboard();      // 首屏即看板
  initAI();               // 句子秒懂面板（见 ai.js）
  $('#drawerClose').onclick = closeDrawer;
  $('#drawerMask').onclick = closeDrawer;
};


/* ============================================================
   工单优先级 / 帮助工单 / 真实数据看板增强
   ============================================================ */
var PRIORITY_LABEL = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
var PRIORITY_ORDER = { urgent: 4, high: 3, normal: 2, low: 1 };
var HELP_CATS = ['生活帮助', '咨询建议', '邻里协调', '其他'];

function inferPriority(t) {
  var text = [t.cat, t.desc, t.elements && t.elements.event].join('');
  if (/爆裂|燃气|消防|积水|挡路|跳闸|断电|卡死|危险|突发/.test(text)) return 'urgent';
  if (/漏水|占用|损坏|噪音|投诉|卫生差|堵塞/.test(text)) return 'high';
  if (/建议|咨询|代收|座椅/.test(text)) return 'low';
  return 'normal';
}
function typeLabel(t) { return t.type === 'repair' ? '报修' : (t.type === 'complaint' ? '投诉' : '帮助/其他'); }
function typeCats(type) { return type === 'repair' ? SEED.repairCats : (type === 'complaint' ? SEED.complaintCats : HELP_CATS); }
function leadFor(t) { return 'eng_lead'; }
function isLead(t) { return currentRole === 'eng_lead'; }
function priorityHtml(p) { p = p || 'normal'; return `<span class="priority-tag ${p}"><i class="priority-dot ${p}"></i>${PRIORITY_LABEL[p]}</span>`; }
function ageLabel(t) {
  var end = t.finished || new Date().toISOString();
  var h = Math.max(0, durHours(t.created, end) || 0);
  if (h < 1) return Math.round(h * 60) + '分钟';
  if (h < 24) return h.toFixed(1) + '小时';
  return Math.floor(h / 24) + '天' + Math.round(h % 24) + '小时';
}
function ticketSla(t) { return t.priority === 'urgent' ? 2 : (t.priority === 'high' ? 8 : (t.priority === 'normal' ? 24 : 48)); }
function isOnTime(t) { var h = durHours(t.created, t.finished); return h != null && h <= ticketSla(t); }
function activeStaff(role) { return state.staff.filter(s => s.role === role && s.status !== 'off'); }

function enhanceState() {
  state.tickets.forEach(t => { t.priority = t.priority || inferPriority(t); t.rejectHistory = t.rejectHistory || []; t.steps = t.steps || []; t.photos = t.photos || []; t.aggregated = t.aggregated || []; });
}

function setupEnhancedUI() {
  var dash = $('#page-dashboard');
  dash.querySelector('.page-sub').textContent = '实时统计报修 / 投诉 / 帮助工单；所有图表均由当前工单数据计算';
  var kpis = dash.querySelector('.kpi-grid');
  if (!$('#kpi-help')) kpis.insertAdjacentHTML('beforeend', '<div class="kpi teal"><div class="label">帮助/其他</div><div class="value" id="kpi-help">—</div><div class="trend">生活帮助/咨询/协调/其他</div></div><div class="kpi orange"><div class="label">紧急待处理</div><div class="value" id="kpi-urgent">—</div><div class="trend">按紧急度与等待时间排序</div></div>');
  var grid = dash.querySelector('.chart-grid');
  if (!$('#chart-event-frequency')) grid.insertAdjacentHTML('beforeend', '<div class="chart-card chart-full"><h3>事件发生频率（全部工单）</h3><div class="chart-box" id="chart-event-frequency"></div></div><div class="chart-card performance-card"><h3>师傅 / 管家处理明细与表现</h3><div class="table-wrap"><table class="performance-table"><thead><tr><th>人员</th><th>处理过什么</th><th>总工单</th><th>已完成</th><th>处理中</th><th>平均时长</th><th>按时率</th><th>表现</th></tr></thead><tbody id="tbody-performance"></tbody></table></div></div>');
  if (!$('#page-help')) $('#page-admin').insertAdjacentHTML('beforebegin', `<section class="page" id="page-help"><div class="page-title">帮助 / 其他工单</div><div class="page-sub">生活帮助、咨询建议、邻里协调及无法归入报修/投诉的事项 · 物业主管指派，管家处理</div><div class="card"><div class="priority-legend"><b>优先级：</b><span><i class="priority-dot urgent"></i>紧急</span><span><i class="priority-dot high"></i>高</span><span><i class="priority-dot normal"></i>普通</span><span><i class="priority-dot low"></i>低</span><span>默认同级按等待时间从长到短</span></div><div class="toolbar"><select id="filter-status-help"></select><select id="filter-cat-help"></select><select id="filter-priority-help"></select><select id="sort-help"><option value="priority">紧急度优先</option><option value="newest">最新创建</option><option value="oldest">等待最久</option></select><span class="spacer"></span><span class="count" id="count-help"></span></div><div class="table-wrap"><table><thead><tr><th>优先级</th><th>工单号</th><th>位置</th><th>类型</th><th>状态</th><th>负责人</th><th>创建时间</th><th>已等待/处理时长</th></tr></thead><tbody id="tbody-help"></tbody></table></div></div></section>`);
  ['repair','complaint'].forEach(type => {
    var page = $('#page-' + type), toolbar = page.querySelector('.toolbar');
    if (!$('#filter-priority-' + type)) toolbar.querySelector('.spacer').insertAdjacentHTML('beforebegin', `<select id="filter-priority-${type}"></select><select id="sort-${type}"><option value="priority">紧急度优先</option><option value="newest">最新创建</option><option value="oldest">等待最久</option></select>`);
    if (!page.querySelector('.priority-legend')) page.querySelector('.card').insertAdjacentHTML('afterbegin', '<div class="priority-legend"><b>优先级：</b><span><i class="priority-dot urgent"></i>紧急</span><span><i class="priority-dot high"></i>高</span><span><i class="priority-dot normal"></i>普通</span><span><i class="priority-dot low"></i>低</span><span>同级按等待时间排序</span></div>');
    page.querySelector('thead tr').innerHTML = '<th>优先级</th><th>工单号</th><th>位置</th><th>类型</th><th>状态</th><th>负责人</th><th>创建时间</th><th>已等待/处理时长</th>';
  });
}

function initFilters(type) {
  $(`#filter-cat-${type}`).innerHTML = '<option value="">全部类型</option>' + typeCats(type).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $(`#filter-status-${type}`).innerHTML = '<option value="">全部状态</option>' + Object.entries(STATUS_LABEL).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
  $(`#filter-priority-${type}`).innerHTML = '<option value="">全部优先级</option>' + Object.entries(PRIORITY_LABEL).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
  [`filter-cat-${type}`,`filter-status-${type}`,`filter-priority-${type}`,`sort-${type}`].forEach(id => $('#' + id).onchange = () => renderTickets(type));
}
function renderTickets(type) {
  var tbody = $(`#tbody-${type}`); if (!tbody) return;
  var rows = state.tickets.filter(t => t.type === type);
  // 师傅/管家视图：只看自己负责的工单
  var myName = roleWorkerName();
  if (currentRole.startsWith('worker_') && myName) rows = rows.filter(t => t.worker === myName);
  if (currentRole.startsWith('pm_keeper_')) { var keeperName = currentRole.replace('pm_keeper_',''); rows = rows.filter(t => t.worker === keeperName); }
  var fs=$(`#filter-status-${type}`).value, fc=$(`#filter-cat-${type}`).value, fp=$(`#filter-priority-${type}`).value, sort=$(`#sort-${type}`).value;
  if(fs) rows=rows.filter(t=>t.status===fs); if(fc) rows=rows.filter(t=>t.cat===fc); if(fp) rows=rows.filter(t=>t.priority===fp);
  rows.sort((a,b) => sort==='newest' ? new Date(b.created)-new Date(a.created) : sort==='oldest' ? new Date(a.created)-new Date(b.created) : (PRIORITY_ORDER[b.priority]-PRIORITY_ORDER[a.priority] || new Date(a.created)-new Date(b.created)));
  $(`#count-${type}`).textContent=`共 ${rows.length} 张工单`;
  if(!rows.length){tbody.innerHTML='<tr><td colspan="8" class="empty">暂无符合条件的工单</td></tr>';return;}
  tbody.innerHTML=rows.map(t=>{var h=durHours(t.created,t.finished||new Date().toISOString())||0;return `<tr class="ticket-row-${t.priority}" onclick="openDrawer('${t.id}')"><td>${priorityHtml(t.priority)}</td><td class="mono">${esc(t.id)}</td><td>${esc(t.loc)}</td><td><span class="tag cat">${esc(t.cat)}</span></td><td><span class="tag ${STATUS_CLASS[t.status]}">${STATUS_LABEL[t.status]}</span></td><td>${t.worker?avatar(t.worker,staffColor(t.worker))+esc(t.worker):'<span style="color:#aaa">待指派</span>'}</td><td class="mono">${fmtTime(t.created)}</td><td><span class="wait-age ${t.status!=='done'&&h>ticketSla(t)?'overdue':''}">${t.status==='done'?'处理用时':'已等待'} ${ageLabel(t)}</span></td></tr>`}).join('');
}

function openDrawer(id) {
  var t=state.tickets.find(x=>x.id===id); if(!t)return; openTicketId=id;
  $('#drawer-title').textContent=`${t.id} · ${t.cat}`; $('#drawer-sub').textContent=`${t.loc}　|　${STATUS_LABEL[t.status]}`;
  var rejects=(t.rejectHistory||[]).map(r=>`<div class="reject-history"><b>驳回：</b>${esc(r.reason)} · ${esc(r.who)} · ${fmtTime(r.time)}</div>`).join('');
  var timeline=(t.steps||[]).map((s,i)=>`<div class="tl-item ${i===t.steps.length-1&&t.status!=='done'?'current':'done'}"><div class="dot"></div><div class="tl-title">${esc(s.title)}</div><div class="tl-meta">${esc(s.who)} · ${fmtTime(s.time)}</div></div>`).join('');
  var photos=t.photos&&t.photos.length?`<div class="photos">${t.photos.map((p,i)=>`<div class="photo">${p}<small>现场照片${i+1}</small></div>`).join('')}</div>`:'<span style="color:#aaa">暂无现场照片</span>';
  $('#drawer-body').innerHTML=`<div class="drawer-section"><h4>工单信息</h4><div class="elements"><div class="elem"><div class="k">优先级</div><div class="v">${priorityHtml(t.priority)}</div></div><div class="elem"><div class="k">事件类别</div><div class="v">${esc(typeLabel(t))} · ${esc(t.cat)}</div></div><div class="elem"><div class="k">地点</div><div class="v">${esc(t.loc)}</div></div><div class="elem"><div class="k">已等待/处理</div><div class="v">${ageLabel(t)}</div></div><div class="elem full"><div class="k">问题描述</div><div class="v">${esc(t.desc)}</div></div></div>${rejects}</div><div class="drawer-section"><h4>流转时间线</h4><div class="timeline">${timeline}</div></div><div class="drawer-section"><h4>现场材料</h4>${photos}</div><div class="drawer-section"><h4>操作（当前角色：${esc(roleObj().name)}）</h4><div class="actions">${buildActions(t)}</div></div>`;
  $('#drawerMask').classList.add('open'); $('#drawer').classList.add('open');
}
function buildActions(t) {
  var repair=t.type==='repair', keeper=!repair, mine=repair&&currentRole.startsWith('worker_')&&t.worker===roleWorkerName();
  if(t.status==='wait'){
    if(!isLead(t)) return hint(`仅${repair?'工程部':'物业'}主管可指派。`);
    var people=activeStaff(repair?'维修工':'物业管家'); if(!people.length)return hint('暂无在岗处理人。');
    var defHrs = CAT_DEFAULT_HOURS[t.cat] || 2;
    var timeOpts = [0.5,1,1.5,2,2.5,3,4,5,6,8].map(h => `<option value="${h}"${h===defHrs?' selected':''}>${h}小时</option>`).join('');
    return `<select id="assignWorker">${people.map(s=>`<option value="${esc(s.name)}">${esc(s.name)} · ${esc(s.skill)}</option>`).join('')}</select><select id="assignDuration" title="预计处理时间">${timeOpts}</select><button class="btn" onclick="assignTicket('${t.id}')">确认指派</button>`;
  }
  if(t.status==='doing'){
    if(mine) return `<button class="btn teal" onclick="uploadPhoto('${t.id}')">上传现场照片</button><button class="btn green" onclick="workerFinish('${t.id}','once')">处理完成·提交</button><button class="btn danger" onclick="workerReject('${t.id}')">无法处理·退回</button>`;
    if(keeper&&currentRole.startsWith('pm_keeper_')) return `<button class="btn green" onclick="workerFinish('${t.id}','once')">处理完成·提交</button><button class="btn danger" onclick="workerReject('${t.id}')">无法处理·退回</button>`;
    return hint(`已指派给 ${esc(t.worker||'处理人')}。处理人之间禁止转单，如需调整须由主管驳回后重新派单。`);
  }
  if(t.status==='confirm') return isLead(t)?`<button class="btn green" onclick="confirmDone('${t.id}')">确认完成</button><button class="btn danger" onclick="reject('${t.id}')">驳回工单</button>`:hint('等待主管审核；处理人不可转单。');
  return hint('工单已完成，流程结束。');
}
function assignTicket(id){
  var t=state.tickets.find(x=>x.id===id);
  if(!t||t.status!=='wait'||!isLead(t)){toast('无权指派该工单');return;}
  var el=$('#assignWorker');if(!el)return;
  var workerName=el.value;
  var durEl=$('#assignDuration');
  var estHours=durEl?parseFloat(durEl.value)||2:2;

  // 日程冲突检测：检查该师傅当前是否有时间重叠
  var conflicts=checkAssignConflicts(workerName, t, estHours);
  if(conflicts.length){
    var msg='⚠️ 日程冲突提醒：\n\n'+workerName+' 在以下时段已有工单：\n\n';
    conflicts.forEach(function(c){
      msg+='• '+c.ticketId+'（'+c.cat+'）\n  时间：'+c.startTime+' ~ '+c.endTime+'\n  重叠：'+c.overlap+'小时\n\n';
    });
    msg+='当前工单预计时段：'+conflicts[0].newStart+' ~ '+conflicts[0].newEnd+'\n\n确定仍要派单给该师傅吗？';
    if(!confirm(msg))return;
  }

  t.worker=workerName;
  t.status='doing';
  t.estimatedHours=estHours;
  pushStep(t,t.type==='repair'?'工单分配':'主管指派',roleObj().name);
  save();apiPatch(t.id,{status:'doing',worker:t.worker});
  afterAction(id,'已指派给 '+t.worker+'，预计 '+(t.estimatedHours||2)+'h');
}

function checkAssignConflicts(workerName, newTicket, estHours){
  var newStart=new Date(newTicket.created||new Date().toISOString());
  var newEnd=new Date(newStart.getTime()+estHours*3600000);
  var results=[];

  state.tickets.forEach(function(t){
    if(t.id===newTicket.id)return;
    if(t.worker!==workerName)return;
    if(t.status==='done'||t.status==='wait')return;
    // 计算已有工单的时间块
    var tStart=new Date(t.created);
    var tHours=estimateDuration(t);
    var tEnd=new Date(tStart.getTime()+tHours*3600000);
    // 判断是否重叠
    if(newStart<tEnd&&newEnd>tStart){
      var overlapStart=Math.max(newStart.getTime(),tStart.getTime());
      var overlapEnd=Math.min(newEnd.getTime(),tEnd.getTime());
      var overlapH=((overlapEnd-overlapStart)/3600000).toFixed(1);
      results.push({
        ticketId:t.id,
        cat:t.cat||'',
        startTime:fmtHM(tStart),
        endTime:fmtHM(tEnd),
        overlap:overlapH,
        newStart:fmtHM(newStart),
        newEnd:fmtHM(newEnd)
      });
    }
  });
  return results;
}
function workerFinish(id,mode){var t=state.tickets.find(x=>x.id===id);if(!t||t.status!=='doing'){toast('当前状态不可提交');return;}var allowed=t.type==='repair'?(t.worker===roleWorkerName()):(currentRole.startsWith('pm_keeper_'));if(!allowed){toast('仅当前负责人可提交，且不可转单');return;}if(t.type==='repair'&&!t.steps.some(s=>s.title.includes('现场确认')))pushStep(t,'现场确认',t.worker);pushStep(t,t.type==='repair'?'维修完成·提交结果':'处理完成·提交结果',t.worker);t.status='confirm';save();apiPatch(t.id,{status:'confirm'});afterAction(id,'已提交结果，等待主管审核');}
function reject(id){var t=state.tickets.find(x=>x.id===id);if(!t||t.status!=='confirm'||!isLead(t)){toast('仅主管可驳回待确认工单');return;}var reason=prompt('请输入驳回原因（必填）：','现场材料不完整，请补充后重新提交');if(reason===null)return;reason=reason.trim();if(!reason){toast('驳回原因不能为空');return;}t.rejectHistory=t.rejectHistory||[];t.rejectHistory.push({reason:reason,who:roleObj().name,time:new Date().toISOString()});pushStep(t,'主管驳回：'+reason,roleObj().name);t.status='doing';save();apiPatch(t.id,{status:'doing',rejectReason:reason});afterAction(id,'工单已驳回给原负责人，不允许转单');}
function workerReject(id){var t=state.tickets.find(x=>x.id===id);if(!t||t.status!=='doing'){toast('当前状态不可退回');return;}var allowed=t.type==='repair'?(t.worker===roleWorkerName()):(currentRole.startsWith('pm_keeper_'));if(!allowed){toast('仅当前负责人可退回工单');return;}var reason=prompt('请输入无法处理的原因（必填）：','现场条件不满足/需要其他工种配合/非本人技能范围');if(reason===null)return;reason=reason.trim();if(!reason){toast('退回原因不能为空');return;}t.rejectHistory=t.rejectHistory||[];t.rejectHistory.push({reason:reason,who:roleObj().name,time:new Date().toISOString()});pushStep(t,'维修人员退回：'+reason,roleObj().name);t.worker='';t.status='wait';save();apiPatch(t.id,{status:'wait',worker:'',rejectReason:reason});afterAction(id,'工单已退回，等待主管重新派单');}
function afterAction(id,msg){toast(msg);renderAll();renderDashboard();if(id)openDrawer(id);}

function staffMetrics(name){var all=state.tickets.filter(t=>t.worker===name),done=all.filter(t=>t.status==='done'),active=all.filter(t=>t.status==='doing'||t.status==='confirm'),d=done.map(t=>durHours(t.created,t.finished)).filter(x=>x!=null),avg=d.length?(d.reduce((a,b)=>a+b,0)/d.length):null,on=done.filter(isOnTime).length,cats=[...new Set(all.map(t=>t.cat))];return{all,done,active,avg,onRate:done.length?Math.round(on/done.length*100):0,cats};}
function performanceScore(m){if(!m.done.length)return 60;return Math.max(0,Math.min(100,Math.round(m.onRate*.7+Math.max(0,30-(m.avg||0)))));}
function renderPerformance(){var body=$('#tbody-performance');if(!body)return;body.innerHTML=state.staff.map(s=>{var m=staffMetrics(s.name),score=performanceScore(m),cls=score>=85?'good':score<70?'warn':'';return `<tr style="cursor:pointer" onclick="openStaffProfile('${s.id}')"><td>${avatar(s.name,staffColor(s.name))}<b>${esc(s.name)}</b><br><small>${esc(s.role)} · ${esc(s.skill)}</small></td><td class="type-list">${m.cats.length?m.cats.map(c=>`<span class="tag cat">${esc(c)}</span>`).join(' '):'暂无工单'}</td><td>${m.all.length}</td><td>${m.done.length}</td><td>${m.active.length}</td><td>${m.avg==null?'—':m.avg.toFixed(1)+'h'}</td><td>${m.done.length?m.onRate+'%':'—'}</td><td><span class="performance-score ${cls}">${score}</span><small>/100</small></td></tr>`}).join('');}
function renderStaff(){var tbody=$('#tbody-staff');tbody.innerHTML=state.staff.map(s=>{var m=staffMetrics(s.name),st=s.status==='on'?'在岗':s.status==='busy'?'忙碌':'休息',dot=s.status==='on'?'on':s.status==='busy'?'busy':'off';return `<tr style="cursor:pointer" onclick="openStaffProfile('${s.id}')"><td>${avatar(s.name,staffColor(s.name))}${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.skill)}</td><td class="mono">${esc(s.phone)}</td><td><span class="staff-status"><span class="status-dot ${dot}"></span>${st}</span></td><td><b>${m.done.length}</b> / 共${m.all.length}</td><td><button class="btn sm ghost" onclick="event.stopPropagation();openStaffModal('${s.id}')">编辑</button> <button class="btn sm danger" onclick="event.stopPropagation();deleteStaff('${s.id}')">删除</button></td></tr>`}).join('');}

function openStaffProfile(id){
  var s=state.staff.find(x=>x.id===id);if(!s)return;
  var m=staffMetrics(s.name);
  var score=performanceScore(m);
  var cls=score>=85?'good':score<70?'warn':'';
  var st=s.status==='on'?'在岗':s.status==='busy'?'忙碌':'休息';
  // 最近工单列表
  var recentTickets=state.tickets.filter(t=>t.worker===s.name).sort((a,b)=>new Date(b.created)-new Date(a.created)).slice(0,10);
  var ticketRows=recentTickets.map(t=>`<tr onclick="openDrawer('${t.id}')"><td class="mono">${esc(t.id)}</td><td><span class="tag cat">${esc(t.cat)}</span></td><td>${esc(t.loc)}</td><td><span class="tag ${STATUS_CLASS[t.status]}">${STATUS_LABEL[t.status]}</span></td><td>${fmtTime(t.created)}</td><td>${t.status==='done'&&t.finished?durHours(t.created,t.finished)+'h':'—'}</td></tr>`).join('');
  // SLA详情
  var slaDetail='';
  if(m.done.length){
    var urgent=m.done.filter(t=>t.priority==='urgent'),high=m.done.filter(t=>t.priority==='high'),normal=m.done.filter(t=>t.priority==='normal');
    slaDetail=`<div style="margin-top:12px;font-size:13px;color:#5e6573">SLA明细：紧急(2h内) ${urgent.filter(isOnTime).length}/${urgent.length} · 高(8h内) ${high.filter(isOnTime).length}/${high.length} · 普通(24h内) ${normal.filter(isOnTime).length}/${normal.length}</div>`;
  }

  $('#drawer-title').textContent=s.name+' · 人员档案';
  $('#drawer-sub').textContent=s.role+' · '+s.skill;
  $('#drawer-body').innerHTML=`
    <div class="drawer-section">
      <h4>基本信息</h4>
      <div class="elements">
        <div class="elem"><div class="k">姓名</div><div class="v">${esc(s.name)}</div></div>
        <div class="elem"><div class="k">角色</div><div class="v">${esc(s.role)}</div></div>
        <div class="elem"><div class="k">技能</div><div class="v">${esc(s.skill)}</div></div>
        <div class="elem"><div class="k">电话</div><div class="v">${esc(s.phone)}</div></div>
        <div class="elem"><div class="k">状态</div><div class="v">${st}</div></div>
      </div>
    </div>
    <div class="drawer-section">
      <h4>绩效概览</h4>
      <div class="elements">
        <div class="elem"><div class="k">综合评分</div><div class="v"><span class="performance-score ${cls}">${score}</span> / 100</div></div>
        <div class="elem"><div class="k">总工单</div><div class="v">${m.all.length} 张</div></div>
        <div class="elem"><div class="k">已完成</div><div class="v">${m.done.length} 张</div></div>
        <div class="elem"><div class="k">处理中</div><div class="v">${m.active.length} 张</div></div>
        <div class="elem"><div class="k">平均处理时长</div><div class="v">${m.avg==null?'暂无数据':m.avg.toFixed(1)+' 小时'}</div></div>
        <div class="elem"><div class="k">按时完成率</div><div class="v">${m.done.length?m.onRate+'%':'暂无数据'}</div></div>
      </div>
      ${slaDetail}
    </div>
    <div class="drawer-section">
      <h4>擅长处理</h4>
      <div class="type-list">${m.cats.length?m.cats.map(c=>'<span class="tag cat">'+esc(c)+'</span>').join(' '):'<span style="color:#aaa">暂无工单记录</span>'}</div>
    </div>
    <div class="drawer-section">
      <h4>最近工单（最多10条）</h4>
      ${recentTickets.length?'<div class="table-wrap"><table><thead><tr><th>工单号</th><th>类型</th><th>位置</th><th>状态</th><th>创建时间</th><th>耗时</th></tr></thead><tbody>'+ticketRows+'</tbody></table></div>':'<span style="color:#aaa">暂无工单记录</span>'}
    </div>
  `;
  $('#drawerMask').classList.add('open');$('#drawer').classList.add('open');
}

function renderDashboard(){var ts=state.tickets,done=ts.filter(t=>t.status==='done');$('#kpi-total').innerHTML=ts.length+' <small>张</small>';$('#kpi-repair').innerHTML=ts.filter(t=>t.type==='repair').length+' <small>张</small>';$('#kpi-complaint').innerHTML=ts.filter(t=>t.type==='complaint').length+' <small>张</small>';$('#kpi-help').innerHTML=ts.filter(t=>t.type==='help').length+' <small>张</small>';$('#kpi-urgent').innerHTML=ts.filter(t=>t.priority==='urgent'&&t.status!=='done').length+' <small>张</small>';var d=done.map(t=>durHours(t.created,t.finished)).filter(x=>x!=null);$('#kpi-avg').innerHTML=(d.length?(d.reduce((a,b)=>a+b,0)/d.length).toFixed(1):'—')+' <small>小时</small>';$('#kpi-rate').innerHTML=(done.length?Math.round(done.filter(isOnTime).length/done.length*100):0)+' <small>%</small>';drawCharts();renderPerformance();}
function drawCharts(){var blue='#1677ff',teal='#13c2c2',orange='#fa8c16',purple='#722ed1',green='#52c41a';var today=new Date(),days=[],keys=[];for(var i=29;i>=0;i--){var d=new Date(today);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);keys.push(d.toISOString().slice(0,10));days.push((d.getMonth()+1)+'/'+d.getDate());}var series=['repair','complaint','help'].map(type=>keys.map(k=>state.tickets.filter(t=>t.type===type&&new Date(t.created).toISOString().slice(0,10)===k).length));getChart('chart-trend').setOption({tooltip:{trigger:'axis'},legend:{data:['报修','投诉','帮助/其他']},grid:{left:40,right:20,top:40,bottom:30},xAxis:{type:'category',data:days},yAxis:{type:'value',minInterval:1},series:[{name:'报修',type:'line',smooth:true,data:series[0],itemStyle:{color:blue}},{name:'投诉',type:'line',smooth:true,data:series[1],itemStyle:{color:orange}},{name:'帮助/其他',type:'line',smooth:true,data:series[2],itemStyle:{color:teal}}]});var people=state.staff,metrics=people.map(s=>staffMetrics(s.name));getChart('chart-worker-count').setOption({tooltip:{trigger:'axis'},grid:{left:40,right:20,top:20,bottom:45},xAxis:{type:'category',data:people.map(s=>s.name),axisLabel:{rotate:25}},yAxis:{type:'value',minInterval:1},series:[{type:'bar',data:metrics.map(m=>m.done.length),itemStyle:{color:teal,borderRadius:[5,5,0,0]},label:{show:true,position:'top'}}]});getChart('chart-worker-dur').setOption({tooltip:{trigger:'axis',formatter:'{b}: {c} 小时'},grid:{left:45,right:20,top:20,bottom:45},xAxis:{type:'category',data:people.map(s=>s.name),axisLabel:{rotate:25}},yAxis:{type:'value',name:'小时'},series:[{type:'bar',data:metrics.map(m=>m.avg==null?0:+m.avg.toFixed(1)),itemStyle:{color:purple,borderRadius:[5,5,0,0]},label:{show:true,position:'top',formatter:'{c}h'}}]});var cats={};state.tickets.forEach(t=>cats[t.cat]=(cats[t.cat]||0)+1);getChart('chart-cat').setOption({tooltip:{trigger:'item'},legend:{bottom:0},color:[blue,orange,teal],series:[{type:'pie',radius:['38%','65%'],center:['50%','44%'],data:[{name:'报修',value:state.tickets.filter(t=>t.type==='repair').length},{name:'投诉',value:state.tickets.filter(t=>t.type==='complaint').length},{name:'帮助/其他',value:state.tickets.filter(t=>t.type==='help').length}],label:{formatter:'{b}\n{c}张 ({d}%)'}}]});var statuses={wait:0,doing:0,confirm:0,done:0};state.tickets.forEach(t=>statuses[t.status]++);getChart('chart-status').setOption({tooltip:{trigger:'item'},legend:{bottom:0},color:[orange,blue,purple,green],series:[{type:'pie',radius:['45%','68%'],center:['50%','44%'],data:Object.entries(statuses).map(([k,value])=>({name:STATUS_LABEL[k],value}))}]});var events=Object.entries(cats).sort((a,b)=>b[1]-a[1]);getChart('chart-event-frequency').setOption({tooltip:{trigger:'axis'},grid:{left:90,right:30,top:15,bottom:25},xAxis:{type:'value',minInterval:1},yAxis:{type:'category',inverse:true,data:events.map(x=>x[0])},series:[{type:'bar',data:events.map(x=>x[1]),itemStyle:{color:blue,borderRadius:[0,5,5,0]},label:{show:true,position:'right'}}]});}
function renderAll(){['repair','complaint','help'].forEach(renderTickets);renderStaff();if($('#page-dashboard').classList.contains('active'))renderDashboard();}

window.onload=async function(){await load();enhanceState();setupEnhancedUI();initNav();initRole();['repair','complaint','help'].forEach(initFilters);initSchedule();renderAll();renderDashboard();applyRoleView();$('#drawerClose').onclick=closeDrawer;$('#drawerMask').onclick=closeDrawer;startAutoSync();};

function startAutoSync(){setInterval(async function(){try{var resp=await fetch(API_BASE+'/api/tickets');var json=await resp.json();if(json.data&&json.data.length){state.tickets=json.data.filter(t=>t.id&&t.type);state.tickets.forEach(t=>{t.priority=t.priority||inferPriority(t);t.rejectHistory=t.rejectHistory||[];t.steps=t.steps||[];t.photos=t.photos||[];t.aggregated=t.aggregated||[];});saveLocal();renderAll();if($('#page-dashboard').classList.contains('active'))renderDashboard();}}catch(e){}},10000);}

/* ============================================================
   师傅日程 · 时间轴排班与冲突检测
   按小时刻度展示，工单占位 = 创建时间 + 预估耗时
   预估耗时 = 该师傅已完成工单平均时长，无数据时按类别默认值
   ============================================================ */
var CAT_DEFAULT_HOURS = { '水暖':2.5, '电路':2, '电器':2, '门窗':1.5, '公共设施':3, '物业服务':1, '生活帮助':1, '咨询建议':0.5, '邻里协调':1, '其他':1.5 };

function workerAvgHours(name) {
  var done = state.tickets.filter(t => t.worker === name && t.status === 'done' && t.finished);
  if (!done.length) return null;
  var sum = done.reduce((a, t) => a + (durHours(t.created, t.finished) || 0), 0);
  return sum / done.length;
}

function estimateDuration(t) {
  // 优先用派单时手动设定的预计时间
  if (t.estimatedHours) return t.estimatedHours;
  // 其次用该师傅的平均时长，上限 8h
  var avg = workerAvgHours(t.worker);
  if (avg != null) return Math.min(8, Math.max(0.5, avg));
  return CAT_DEFAULT_HOURS[t.cat] || 2;
}

function initSchedule() {
  var sel = $('#schedule-worker');
  sel.innerHTML = '<option value="">全部人员</option>' + state.staff.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
  sel.onchange = renderSchedule;
  $('#schedule-range').onchange = renderSchedule;
}

function renderSchedule() {
  var worker = $('#schedule-worker').value;
  var range = $('#schedule-range').value;
  var now = new Date(), startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
  var rangeStart, rangeEnd, dayList = [];

  if (range === 'today') {
    rangeStart = new Date(startOfDay); rangeEnd = new Date(startOfDay); rangeEnd.setDate(rangeEnd.getDate() + 1);
    dayList = [new Date(startOfDay)];
  } else if (range === 'week') {
    var dow = now.getDay() || 7;
    rangeStart = new Date(startOfDay); rangeStart.setDate(rangeStart.getDate() - dow + 1);
    rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeEnd.getDate() + 7);
    for (var i = 0; i < 7; i++) { var d = new Date(rangeStart); d.setDate(d.getDate() + i); dayList.push(d); }
  } else {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    var cnt = (rangeEnd - rangeStart) / 86400000;
    for (var i = 0; i < cnt; i++) { var d = new Date(rangeStart); d.setDate(d.getDate() + i); dayList.push(d); }
  }

  var tickets = state.tickets.filter(t => {
    if (!t.worker) return false;
    if (worker && t.worker !== worker) return false;
    var cr = new Date(t.created);
    return cr >= rangeStart && cr < rangeEnd;
  });

  var people = worker ? [worker] : [...new Set(tickets.map(t => t.worker))];
  if (!people.length) people = state.staff.filter(s => s.role === '维修工' || s.role === '物业管家').map(s => s.name);

  // 计算时间块
  var blocks = tickets.map(t => {
    var start = new Date(t.created);
    var hrs = estimateDuration(t);
    var end = new Date(start.getTime() + hrs * 3600000);
    return { ticket: t, start, end, hours: hrs, worker: t.worker };
  });

  var grid = $('#schedule-grid');
  var HOUR_START = 7, HOUR_END = 22, TOTAL_HOURS = HOUR_END - HOUR_START;

  if (range === 'today') {
    // 今天：左侧人员行，列跨时间轴
    grid.innerHTML = renderTimelineDay(people, blocks, dayList[0], HOUR_START, HOUR_END);
  } else if (range === 'week') {
    // 周视图：每天一个时间轴面板
    grid.innerHTML = dayList.map(day => {
      var label = formatDayLabel(day);
      var dayBlocks = blocks.filter(b => sameDay(b.start, day));
      if (!dayBlocks.length && people.length > 3) return '';
      return `<div style="margin-bottom:18px"><div style="font-weight:600;font-size:13px;margin-bottom:6px">${esc(label)}</div>${renderTimelineDay(people, dayBlocks, day, HOUR_START, HOUR_END)}</div>`;
    }).join('') || '<span style="color:#aaa">本周暂无已指派工单</span>';
  } else {
    // 月视图：简化为每天统计条
    grid.innerHTML = `<div class="month-timeline">${dayList.map(day => {
      var label = (day.getMonth()+1)+'/'+day.getDate();
      var dayBlocks = blocks.filter(b => sameDay(b.start, day));
      var conf = countDayConflicts(dayBlocks);
      return `<div class="month-day${conf?' conflict':''}"><div class="md-label">${label}</div><div class="md-bar">${dayBlocks.length} 单${conf?` · <span style="color:#cf1322">${conf}冲突</span>`:''}</div></div>`;
    }).join('')}</div>`;
  }

  // 冲突检测
  var conflicts = detectTimeConflicts(blocks);
  var conflictEl = $('#schedule-conflicts');
  if (conflicts.length) {
    conflictEl.innerHTML = conflicts.map(c => `<div class="conflict-alert">⚠️ <b>${esc(c.worker)}</b>：${esc(c.t1.ticket.id)}（${fmtHM(c.t1.start)}~${fmtHM(c.t1.end)}）与 ${esc(c.t2.ticket.id)}（${fmtHM(c.t2.start)}~${fmtHM(c.t2.end)}）时段重叠 ${c.overlap.toFixed(1)}h</div>`).join('');
  } else {
    conflictEl.innerHTML = '<span style="color:#389e0d">✓ 当前无时段重叠冲突</span>';
  }

  // 摘要
  var avgAll = people.map(p => { var a = workerAvgHours(p); return a ? a.toFixed(1) + 'h' : '无数据'; });
  $('#schedule-summary').textContent = `共 ${tickets.length} 条工单 · ${people.length} 名人员`;
}

function renderTimelineDay(people, blocks, day, hStart, hEnd) {
  var totalH = hEnd - hStart;
  // 时间刻度
  var ruler = '<div class="tl-ruler"><div class="tl-name-col"></div>';
  for (var h = hStart; h <= hEnd; h++) ruler += `<div class="tl-hour">${h}:00</div>`;
  ruler += '</div>';

  var rows = people.map(p => {
    var pBlocks = blocks.filter(b => b.worker === p && sameDay(b.start, day));
    var items = pBlocks.map(b => {
      var startH = b.start.getHours() + b.start.getMinutes() / 60;
      var left = Math.max(0, ((startH - hStart) / totalH) * 100);
      var width = Math.min(100 - left, (b.hours / totalH) * 100);
      var isConflict = pBlocks.some(o => o !== b && o.start < b.end && o.end > b.start);
      return `<div class="tl-block ${b.ticket.priority||'normal'}${isConflict?' conflict':''}" style="left:${left.toFixed(2)}%;width:${Math.max(2,width).toFixed(2)}%" onclick="openDrawer('${b.ticket.id}')" title="${esc(b.ticket.id)} ${esc(b.ticket.cat)}\n${fmtHM(b.start)}~${fmtHM(b.end)} (预估${b.hours.toFixed(1)}h)\n${esc(b.ticket.loc)}"><span class="tl-block-text">${esc(b.ticket.id)} ${esc(b.ticket.cat)}</span></div>`;
    }).join('');
    var avgH = workerAvgHours(p);
    return `<div class="tl-row"><div class="tl-name-col"><b>${esc(p)}</b><br><small style="color:var(--text-3)">均${avgH!=null?avgH.toFixed(1)+'h/单':'无数据'}</small></div><div class="tl-track">${items||''}</div></div>`;
  }).join('');

  return `<div class="timeline-chart">${ruler}${rows}</div>`;
}

function detectTimeConflicts(blocks) {
  var results = [];
  var byWorker = {};
  blocks.forEach(b => { if (!byWorker[b.worker]) byWorker[b.worker] = []; byWorker[b.worker].push(b); });
  Object.entries(byWorker).forEach(([w, list]) => {
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b2 = list[j];
        if (a.start < b2.end && a.end > b2.start) {
          var overlapStart = Math.max(a.start.getTime(), b2.start.getTime());
          var overlapEnd = Math.min(a.end.getTime(), b2.end.getTime());
          results.push({ worker: w, t1: a, t2: b2, overlap: (overlapEnd - overlapStart) / 3600000 });
        }
      }
    }
  });
  return results;
}

function countDayConflicts(dayBlocks) {
  var count = 0;
  var byW = {};
  dayBlocks.forEach(b => { if (!byW[b.worker]) byW[b.worker] = []; byW[b.worker].push(b); });
  Object.values(byW).forEach(list => { for (var i = 0; i < list.length; i++) for (var j = i+1; j < list.length; j++) if (list[i].start < list[j].end && list[i].end > list[j].start) count++; });
  return count;
}

function sameDay(d1, d2) { return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); }
function fmtHM(d) { return d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0'); }
function formatDayLabel(d) { var w = ['周日','周一','周二','周三','周四','周五','周六']; return (d.getMonth()+1)+'/'+d.getDate()+' '+w[d.getDay()]; }
