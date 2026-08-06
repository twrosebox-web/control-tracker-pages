(function(){
'use strict';

var DATA_KEY='creative_ops_v6_data';
var TIMER_KEY='creative_ops_v6_focus_timer';
var state={active:false,tab:'cash',kind:'all',status:'open',month:new Date().toISOString().slice(0,7),attendanceMonth:new Date().toISOString().slice(0,7),editAttendanceId:''};
var tickHandle=null;
var d=function(){return app.getData()};
var now=function(){return new Date().toISOString()};
var today=function(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10)};
var uid=function(prefix){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)};
var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var val=function(id){var el=document.getElementById(id);return el?String(el.value||'').trim():''};
var money=function(value){return 'NT$ '+Math.round(Number(value||0)).toLocaleString('zh-TW')};
var project=function(id){return(d().projects||[]).find(function(x){return x.id===id})};
var task=function(id){return(d().tasks||[]).find(function(x){return x.id===id})};
var safeUrl=function(value){value=String(value||'').trim();return /^https?:\/\//i.test(value)?value:''};

function ensure(){
  var db=d();
  ['financeRecords','attendanceRecords','focusSessions'].forEach(function(key){if(!Array.isArray(db[key]))db[key]=[]});
  db.settings=db.settings||{};
  db.settings.salaryConfig=Object.assign({standardHours:8,defaultBreakMinutes:60,hourlyRate:0,dailyRate:0,overtimeMultiplier:1,allowances:0,deductions:0},db.settings.salaryConfig||{});
  db.settings.focusConfig=Object.assign({focusMinutes:25,shortBreakMinutes:5,longBreakMinutes:15},db.settings.focusConfig||{});
}

function save(action){
  ensure();
  app.saveData(action);
  render();
}

function toast(message){
  var el=document.getElementById('toast');
  if(!el)return;
  el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);
  toast.timer=setTimeout(function(){el.classList.remove('show')},2200);
}

function modal(title,sub,body,wide){
  return app.openModal(title,sub,body,wide);
}

function projectOptions(selected){
  return '<option value="">不連結專案</option>'+(d().projects||[]).filter(function(p){return p.stage!=='closed'||p.id===selected}).map(function(p){return '<option value="'+esc(p.id)+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+'</option>'}).join('');
}

var typeLabels={income:'收入／應收',expense:'支出',advance:'代墊／請款'};
var statusLabels={pending:'待收款',received:'已收款／收回',planned:'預計支出',paid:'已支付',draft:'待整理',submitted:'已送出',approved:'已核准'};
var statusFlows={income:['pending','received'],expense:['planned','paid'],advance:['draft','submitted','approved','received']};

function statusOptions(type,current){
  return (statusFlows[type]||[]).map(function(s){return '<option value="'+s+'" '+(s===current?'selected':'')+'>'+statusLabels[s]+'</option>'}).join('');
}

function recordOpen(record){
  if(record.type==='income')return record.status!=='received';
  if(record.type==='expense')return record.status!=='paid';
  return record.status!=='received';
}

function statusFlow(record){
  var flow=statusFlows[record.type]||[],at=Math.max(0,flow.indexOf(record.status));
  return '<div class="ops-status-flow">'+flow.map(function(s,i){return '<span class="ops-status-step '+(i<at?'done':i===at?'current':'')+'">'+esc(statusLabels[s])+'</span>'}).join('')+'</div>';
}

function summaryFor(records){
  var month=state.month;
  var rows=records.filter(function(r){return !month||String(r.date||'').slice(0,7)===month});
  var income=rows.filter(function(r){return r.type==='income'&&r.status==='received'}).reduce(function(n,r){return n+Number(r.amount||0)},0);
  var expense=rows.filter(function(r){return r.type==='expense'&&r.status==='paid'}).reduce(function(n,r){return n+Number(r.amount||0)},0);
  var advance=records.filter(function(r){return r.type==='advance'&&r.status!=='received'}).reduce(function(n,r){return n+Number(r.amount||0)},0);
  var receivable=records.filter(function(r){return r.type==='income'&&r.status!=='received'}).reduce(function(n,r){return n+Number(r.amount||0)},0);
  return {income:income,expense:expense,balance:income-expense,advance:advance,receivable:receivable};
}

function cashView(){
  var all=(d().financeRecords||[]).slice(),s=summaryFor(all),month=state.month;
  var rows=all.filter(function(r){
    if(month&&String(r.date||'').slice(0,7)!==month)return false;
    if(state.kind!=='all'&&r.type!==state.kind)return false;
    if(state.status==='open'&&!recordOpen(r))return false;
    if(state.status==='done'&&recordOpen(r))return false;
    return true;
  }).sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))});
  var openAdvance=all.filter(function(r){return r.type==='advance'&&r.status!=='received'});
  var overdue=all.filter(function(r){return recordOpen(r)&&r.dueDate&&r.dueDate<today()});
  return '<div class="ops-finance-summary">'+
    '<div class="stat teal"><strong>'+money(s.income)+'</strong><span>本月已收收入</span></div>'+
    '<div class="stat rose"><strong>'+money(s.expense)+'</strong><span>本月已付支出</span></div>'+
    '<div class="stat '+(s.balance>=0?'blue':'rose')+'"><strong>'+money(s.balance)+'</strong><span>本月收支差額</span></div>'+
    '<div class="stat amber"><strong>'+money(s.advance)+'</strong><span>尚未收回代墊</span></div></div>'+
    '<div class="ops-finance-grid"><div><div class="ops-finance-toolbar">'+
      '<input type="month" id="financeMonth" value="'+esc(month)+'" onchange="financeApp.setMonth(this.value)">'+
      '<select onchange="financeApp.setKind(this.value)"><option value="all">全部類型</option><option value="advance" '+(state.kind==='advance'?'selected':'')+'>代墊／請款</option><option value="income" '+(state.kind==='income'?'selected':'')+'>收入／應收</option><option value="expense" '+(state.kind==='expense'?'selected':'')+'>支出</option></select>'+
      '<select onchange="financeApp.setStatus(this.value)"><option value="open" '+(state.status==='open'?'selected':'')+'>尚未完成</option><option value="done" '+(state.status==='done'?'selected':'')+'>已完成</option><option value="all" '+(state.status==='all'?'selected':'')+'>全部狀態</option></select>'+
      '<button class="btn primary" onclick="financeApp.openRecord()">＋ 新增紀錄</button></div>'+
      '<div class="list">'+(rows.map(recordRow).join('')||'<div class="empty">這個條件下還沒有紀錄。</div>')+'</div></div>'+
      '<div><div class="card"><h3>現在需要追的錢</h3><div class="list" style="margin-top:10px">'+
      (overdue.slice(0,5).map(function(r){return '<div class="item attention critical clickable" onclick="financeApp.openRecord(\''+esc(r.id)+'\')"><strong>'+esc(r.title)+'</strong><div class="meta">逾期 '+esc(r.dueDate)+' · '+money(r.amount)+'</div></div>'}).join('')||'<div class="meta">目前沒有逾期項目。</div>')+'</div></div>'+
      '<div class="card" style="margin-top:12px"><h3>代墊收回進度</h3><div class="meta" style="margin:5px 0 10px">不是勾「已請款」就結束，要一路追到款項實際收回。</div><div class="list">'+
      (openAdvance.slice(0,5).map(function(r){return '<div class="item clickable" onclick="financeApp.openRecord(\''+esc(r.id)+'\')"><strong>'+esc(r.title)+'</strong><div class="meta">'+money(r.amount)+' · '+esc(statusLabels[r.status]||r.status)+'</div>'+statusFlow(r)+'</div>'}).join('')||'<div class="meta">目前沒有尚未收回的代墊。</div>')+'</div></div></div></div>';
}

function recordRow(r){
  var p=project(r.projectId),done=!recordOpen(r),link=safeUrl(r.receiptUrl),next=(statusFlows[r.type]||[])[(statusFlows[r.type]||[]).indexOf(r.status)+1];
  return '<div class="item '+(r.dueDate&&r.dueDate<today()&&recordOpen(r)?'attention critical':'')+'"><div class="title-line"><div><strong>'+esc(r.title)+'</strong><div class="tags"><span class="tag '+(r.type==='income'?'teal':r.type==='expense'?'rose':'amber')+'">'+esc(typeLabels[r.type])+'</span><span class="tag '+(done?'teal':'gray')+'">'+esc(statusLabels[r.status]||r.status)+'</span>'+(p?'<span class="tag brand">'+esc(p.name)+'</span>':'')+'</div><div class="meta">'+esc(r.date||'未填日期')+(r.dueDate?' · 預計完成 '+esc(r.dueDate):'')+(r.category?' · '+esc(r.category):'')+(link?' · <a href="'+esc(link)+'" target="_blank" rel="noopener">查看憑證</a>':'')+'</div>'+statusFlow(r)+'</div><div style="text-align:right"><div class="'+(r.type==='income'?'ops-money-in':'ops-money-out')+'">'+(r.type==='income'?'+':'−')+money(r.amount)+'</div><div class="row" style="justify-content:flex-end;margin-top:7px">'+(next?'<button class="btn small primary" onclick="financeApp.advanceRecord(\''+esc(r.id)+'\')">→ '+esc(statusLabels[next])+'</button>':'')+'<button class="btn small" onclick="financeApp.openRecord(\''+esc(r.id)+'\')">編輯</button><button class="btn small danger" onclick="financeApp.removeRecord(\''+esc(r.id)+'\')">刪除</button></div></div></div></div>';
}

function openRecord(id){
  ensure();
  var r=id?(d().financeRecords||[]).find(function(x){return x.id===id}):null,type=r?r.type:(state.kind==='all'?'advance':state.kind),status=r?r.status:(type==='income'?'pending':type==='expense'?'planned':'draft');
  modal(r?'編輯財務紀錄':'新增財務紀錄','代墊要追到實際收回；收入與支出則分清楚預計和已完成。','<input id="finId" type="hidden" value="'+esc(r&&r.id||'')+'"><div class="form-grid">'+
    '<div class="field"><label>類型</label><select id="finType" onchange="financeApp.refreshRecordStatus()"><option value="advance" '+(type==='advance'?'selected':'')+'>代墊／請款</option><option value="income" '+(type==='income'?'selected':'')+'>收入／應收</option><option value="expense" '+(type==='expense'?'selected':'')+'>支出</option></select></div>'+
    '<div class="field"><label>目前狀態</label><select id="finStatus" data-current="'+esc(status)+'">'+statusOptions(type,status)+'</select></div>'+
    '<div class="field full"><label>項目名稱 *</label><input id="finTitle" value="'+esc(r&&r.title||'')+'" placeholder="例：替公司購買展場延長線"></div>'+
    '<div class="field"><label>金額 *</label><input id="finAmount" type="number" min="0" step="1" value="'+esc(r&&r.amount||'')+'"></div>'+
    '<div class="field"><label>分類</label><input id="finCategory" value="'+esc(r&&r.category||'')+'" placeholder="交通、耗材、設計收入…"></div>'+
    '<div class="field"><label>發生日</label><input id="finDate" type="date" value="'+esc(r&&r.date||today())+'"></div>'+
    '<div class="field"><label>預計收／付款日</label><input id="finDue" type="date" value="'+esc(r&&r.dueDate||'')+'"></div>'+
    '<div class="field full"><label>連結專案</label><select id="finProject">'+projectOptions(r&&r.projectId||'')+'</select></div>'+
    '<div class="field full"><label>發票／收據／憑證連結</label><input id="finReceipt" value="'+esc(r&&r.receiptUrl||'')+'" placeholder="貼 Google Drive 或其他 https 連結"></div>'+
    '<div class="field full"><label>備註</label><textarea id="finNote" placeholder="記下請款對象、付款方式、尚缺資料…">'+esc(r&&r.note||'')+'</textarea></div></div>'+
    '<div class="notice">這裡是工作追蹤紀錄，不是正式會計帳。薪資與收支金額只做個人工作參考。</div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" onclick="financeApp.saveRecord()">儲存</button></div>');
}

function refreshRecordStatus(){
  var type=val('finType'),select=document.getElementById('finStatus');if(!select)return;
  var current=select.value||select.dataset.current||'';if((statusFlows[type]||[]).indexOf(current)<0)current=(statusFlows[type]||[])[0];
  select.innerHTML=statusOptions(type,current);
}

function saveRecord(){
  var title=val('finTitle'),amount=Number(val('finAmount'));if(!title||!isFinite(amount)||amount<0)return alert('請填寫項目名稱與正確金額。');
  var id=val('finId'),stamp=now(),data={type:val('finType'),status:val('finStatus'),title:title,amount:amount,category:val('finCategory'),date:val('finDate')||today(),dueDate:val('finDue'),projectId:val('finProject'),receiptUrl:val('finReceipt'),note:val('finNote'),updatedAt:stamp};
  if(id){var old=d().financeRecords.find(function(x){return x.id===id});Object.assign(old,data)}else d().financeRecords.unshift(Object.assign({id:uid('fin'),createdAt:stamp},data));
  app.closeModal();save('儲存收支／代墊紀錄');toast('財務紀錄已儲存');
}

function advanceRecord(id){
  var r=(d().financeRecords||[]).find(function(x){return x.id===id});if(!r)return;
  var flow=statusFlows[r.type]||[],index=flow.indexOf(r.status);if(index<0||index>=flow.length-1)return;
  r.status=flow[index+1];r.updatedAt=now();
  if(r.status==='submitted')r.submittedAt=today();if(r.status==='approved')r.approvedAt=today();if(r.status==='received')r.receivedAt=today();if(r.status==='paid')r.paidAt=today();
  save('更新財務收款／付款進度');toast('已更新為「'+statusLabels[r.status]+'」');
}

function removeRecord(id){
  var r=(d().financeRecords||[]).find(function(x){return x.id===id});if(!r||!confirm('確定刪除「'+r.title+'」？'))return;
  if(window.v6Cloud)v6Cloud.noteDeletion('financeRecords',id,r);
  d().financeRecords=d().financeRecords.filter(function(x){return x.id!==id});save('刪除財務紀錄');toast('已刪除');
}

function timeMinutes(value){var parts=String(value||'').split(':').map(Number);return parts.length===2&&isFinite(parts[0])&&isFinite(parts[1])?parts[0]*60+parts[1]:0}
function workHours(start,end,breakMinutes){var minutes=timeMinutes(end)-timeMinutes(start)-Number(breakMinutes||0);return Math.max(0,Math.round(minutes/30)*.5)}
function workPay(hours){var c=d().settings.salaryConfig,standard=Number(c.standardHours||8),regular=Math.min(hours,standard),extra=Math.max(0,hours-standard);if(hours>=standard&&Number(c.dailyRate)>0)return Number(c.dailyRate)+extra*Number(c.hourlyRate||0)*Number(c.overtimeMultiplier||1);return regular*Number(c.hourlyRate||0)+extra*Number(c.hourlyRate||0)*Number(c.overtimeMultiplier||1)}
function hoursLabel(value){var h=Math.floor(Number(value||0)),m=Math.round((Number(value||0)-h)*60);return h+' 小時'+(m?' '+m+' 分':'')}

function salaryView(){
  var records=(d().attendanceRecords||[]).filter(function(r){return String(r.date||'').slice(0,7)===state.attendanceMonth}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))}),c=d().settings.salaryConfig,edit=state.editAttendanceId?records.find(function(r){return r.id===state.editAttendanceId}):null;
  var totalHours=records.reduce(function(n,r){return n+Number(r.hours||0)},0),workTotal=records.reduce(function(n,r){return n+workPay(Number(r.hours||0))},0),estimated=workTotal+Number(c.allowances||0)-Number(c.deductions||0);
  return '<div class="card"><div class="row between"><div><h3>出勤與預估薪資</h3><div class="meta">薪資設定不預填公司數字，由你自行設定；結果僅供核對。</div></div><button class="btn" onclick="financeApp.openSalarySettings()">⚙ 薪資設定</button></div><div class="ops-salary-form" style="margin-top:14px">'+
    '<input id="attId" type="hidden" value="'+esc(edit&&edit.id||'')+'"><div class="field"><label>日期</label><input id="attDate" type="date" value="'+esc(edit&&edit.date||today())+'"></div><div class="field"><label>上班</label><input id="attStart" type="time" value="'+esc(edit&&edit.startTime||'08:00')+'"></div><div class="field"><label>下班</label><input id="attEnd" type="time" value="'+esc(edit&&edit.endTime||'17:00')+'"></div><div class="field"><label>休息分鐘</label><input id="attBreak" type="number" min="0" step="5" value="'+esc(edit&&edit.breakMinutes!=null?edit.breakMinutes:c.defaultBreakMinutes)+'"></div><button class="btn primary" onclick="financeApp.saveAttendance()">'+(edit?'更新':'記錄')+'出勤</button></div>'+
    '<div class="field" style="margin-top:10px"><label>備註</label><input id="attNote" value="'+esc(edit&&edit.note||'')+'" placeholder="請假、外出、加班原因…"></div></div>'+
    '<div class="ops-finance-summary" style="margin-top:14px"><div class="stat blue"><strong>'+records.length+' 天</strong><span>本月出勤紀錄</span></div><div class="stat teal"><strong>'+hoursLabel(totalHours)+'</strong><span>本月累計工時</span></div><div class="stat amber"><strong>'+money(workTotal)+'</strong><span>依出勤估算</span></div><div class="stat '+(estimated>=0?'teal':'rose')+'"><strong>'+money(estimated)+'</strong><span>加津貼、扣款後預估</span></div></div>'+
    '<div class="row between" style="margin-bottom:10px"><input type="month" value="'+esc(state.attendanceMonth)+'" onchange="financeApp.setAttendanceMonth(this.value)"><span class="meta">目前設定：時薪 '+money(c.hourlyRate)+' ／ 日薪 '+money(c.dailyRate)+'</span></div><div class="table-wrap"><table class="table"><thead><tr><th>日期</th><th>時間</th><th>工時</th><th>預估</th><th>備註</th><th></th></tr></thead><tbody>'+records.map(function(r){return '<tr><td>'+esc(r.date)+'</td><td>'+esc(r.startTime)+'–'+esc(r.endTime)+'<div class="meta">休 '+Number(r.breakMinutes||0)+' 分</div></td><td>'+hoursLabel(r.hours)+'</td><td>'+money(workPay(Number(r.hours||0)))+'</td><td>'+esc(r.note||'')+'</td><td><button class="btn small" onclick="financeApp.editAttendance(\''+esc(r.id)+'\')">編輯</button> <button class="btn small danger" onclick="financeApp.removeAttendance(\''+esc(r.id)+'\')">刪除</button></td></tr>'}).join('')+(records.length?'':'<tr><td colspan="6"><div class="empty">這個月尚無出勤紀錄。</div></td></tr>')+'</tbody></table></div><div class="notice" style="margin-top:12px">「預估薪資」不代表正式薪資單；加班費、請假、勞健保與公司規則仍以正式核算為準。</div>';
}

function saveAttendance(){
  var date=val('attDate'),start=val('attStart'),end=val('attEnd'),breakMinutes=Math.max(0,Number(val('attBreak')||0)),hours=workHours(start,end,breakMinutes);if(!date||!start||!end||hours<=0)return alert('請確認日期、上下班時間與休息分鐘。');
  var id=val('attId'),stamp=now(),data={date:date,startTime:start,endTime:end,breakMinutes:breakMinutes,hours:hours,note:val('attNote'),updatedAt:stamp};
  if(id){var old=d().attendanceRecords.find(function(x){return x.id===id});Object.assign(old,data)}else d().attendanceRecords.unshift(Object.assign({id:uid('att'),createdAt:stamp},data));
  state.editAttendanceId='';save('儲存出勤紀錄');toast('已記錄 '+hoursLabel(hours));
}

function editAttendance(id){state.editAttendanceId=id;render();window.scrollTo({top:0,behavior:'smooth'})}
function removeAttendance(id){var r=d().attendanceRecords.find(function(x){return x.id===id});if(!r||!confirm('刪除 '+r.date+' 的出勤紀錄？'))return;if(window.v6Cloud)v6Cloud.noteDeletion('attendanceRecords',id,r);d().attendanceRecords=d().attendanceRecords.filter(function(x){return x.id!==id});save('刪除出勤紀錄')}

function openSalarySettings(){
  var c=d().settings.salaryConfig;
  modal('薪資估算設定','不帶入舊版寫死的金額；請依自己的正式條件填寫。','<div class="form-grid"><div class="field"><label>標準每日工時</label><input id="salStd" type="number" min="1" step="0.5" value="'+esc(c.standardHours)+'"></div><div class="field"><label>預設休息分鐘</label><input id="salBreak" type="number" min="0" step="5" value="'+esc(c.defaultBreakMinutes)+'"></div><div class="field"><label>時薪</label><input id="salHourly" type="number" min="0" value="'+esc(c.hourlyRate)+'"></div><div class="field"><label>滿標準工時的日薪</label><input id="salDaily" type="number" min="0" value="'+esc(c.dailyRate)+'"></div><div class="field"><label>超時倍率</label><input id="salOvertime" type="number" min="0" step="0.1" value="'+esc(c.overtimeMultiplier)+'"></div><div class="field"><label>每月津貼／獎金</label><input id="salAllowance" type="number" value="'+esc(c.allowances)+'"></div><div class="field"><label>每月固定扣款</label><input id="salDeduction" type="number" value="'+esc(c.deductions)+'"></div></div><div class="notice">這是核對工具，不處理勞基法與正式薪資規則。若公司算法不同，請以正式薪資單為準。</div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" onclick="financeApp.saveSalarySettings()">儲存設定</button></div>');
}

function saveSalarySettings(){
  d().settings.salaryConfig={standardHours:Math.max(.5,Number(val('salStd')||8)),defaultBreakMinutes:Math.max(0,Number(val('salBreak')||0)),hourlyRate:Math.max(0,Number(val('salHourly')||0)),dailyRate:Math.max(0,Number(val('salDaily')||0)),overtimeMultiplier:Math.max(0,Number(val('salOvertime')||1)),allowances:Number(val('salAllowance')||0),deductions:Number(val('salDeduction')||0),updatedAt:now()};
  app.closeModal();save('更新薪資估算設定');toast('薪資設定已儲存');
}

function loadTimer(){try{return Object.assign({totalSeconds:1500,elapsedSeconds:0,running:false,startedAt:null,taskId:'',projectId:'',label:'',interruptions:0,note:''},JSON.parse(localStorage.getItem(TIMER_KEY)||'{}'))}catch(e){return{totalSeconds:1500,elapsedSeconds:0,running:false,startedAt:null,taskId:'',projectId:'',label:'',interruptions:0,note:''}}}
function saveTimer(timer){localStorage.setItem(TIMER_KEY,JSON.stringify(timer))}
function timerElapsed(timer){return Number(timer.elapsedSeconds||0)+(timer.running&&timer.startedAt?Math.max(0,(Date.now()-timer.startedAt)/1000):0)}
function timerRemaining(timer){return Math.max(0,Number(timer.totalSeconds||0)-timerElapsed(timer))}
function clock(seconds){seconds=Math.max(0,Math.ceil(seconds));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}

function focusStats(projectId,taskId){
  var rows=(d().focusSessions||[]).filter(function(s){return(!projectId||s.projectId===projectId)&&(!taskId||s.taskId===taskId)}),minutes=rows.reduce(function(n,s){return n+Number(s.actualMinutes||0)},0);
  return {rows:rows,minutes:minutes,count:rows.length,latest:rows.slice().sort(function(a,b){return String(b.completedAt||'').localeCompare(String(a.completedAt||''))}).slice(0,3)};
}

function focusQuickHtml(){
  var timer=loadTimer(),remaining=timerRemaining(timer),linked=task(timer.taskId),label=timer.label||(linked&&linked.name)||'',pickerLabel=linked&&linked.status!=='done'?((project(linked.projectId)?project(linked.projectId).name+'｜':'')+linked.name):(timer.label||'搜尋今天要推進的工作');
  return '<section class="ops-focus-quick" id="opsFocusQuick"><div class="ops-focus-quick-title"><span>🍅</span><span>快速專注</span></div><div class="ops-focus-picker"><input id="homeFocusTask" type="hidden" value="'+esc(linked&&linked.status!=='done'?linked.id:'')+'"><button type="button" class="ops-focus-picker-button" id="homeFocusPickerButton" onclick="financeApp.openQuickTaskPicker()"><span id="homeFocusPickerLabel">'+esc(pickerLabel)+'</span><small>搜尋／更換</small></button></div><div class="ops-focus-quick-time" id="homeFocusClock">'+clock(remaining)+'</div><button class="btn primary" id="homeFocusToggle" onclick="financeApp.quickToggle()">'+(timer.running?'暫停':'開始')+'</button><button class="btn ops-focus-detail" onclick="financeApp.open(\'focus\')">詳細</button><div class="meta ops-focus-detail" id="homeFocusDetail">'+esc(label?(timer.running?'正在：'+label:'已選擇：'+label):linked&&linked.status==='done'?'原工作已完成，請重新選擇。':'從專案工作直接開始，完成後會留下成果與下一步。')+'</div></section>';
}

function quickTaskUrgency(t){
  var due=String(t.dueDate||'');
  if(!due)return 4;
  if(due<today())return 0;
  if(due===today())return 1;
  return 2;
}

function quickTaskDueLabel(t){
  var due=String(t.dueDate||'');
  if(!due)return '未排期限';
  if(due<today())return '逾期 · '+due;
  if(due===today())return '今天到期';
  return due;
}

function quickTaskMatches(query){
  var terms=String(query||'').toLocaleLowerCase('zh-TW').split(/\s+/).filter(Boolean),timer=loadTimer(),priority={urgent:0,high:1,medium:2,normal:2,low:3},projects={};
  (d().projects||[]).forEach(function(p){projects[p.id]=p});
  return (d().tasks||[]).filter(function(t){return t.status!=='done'}).map(function(t){
    var p=projects[t.projectId],search=((p&&p.name||'')+' '+(t.name||'')).toLocaleLowerCase('zh-TW');
    return {task:t,project:p,search:search,match:terms.reduce(function(n,term){var at=search.indexOf(term);return n+(at<0?9999:at)},0)};
  }).filter(function(row){return terms.every(function(term){return row.search.indexOf(term)>=0})}).sort(function(a,b){
    if(!terms.length){var ac=a.task.id===timer.taskId?0:1,bc=b.task.id===timer.taskId?0:1;if(ac!==bc)return ac-bc}
    if(a.match!==b.match)return a.match-b.match;
    var au=quickTaskUrgency(a.task),bu=quickTaskUrgency(b.task);if(au!==bu)return au-bu;
    var ap=priority[a.task.priority]===undefined?2:priority[a.task.priority],bp=priority[b.task.priority]===undefined?2:priority[b.task.priority];if(ap!==bp)return ap-bp;
    return String(a.task.dueDate||'9999').localeCompare(String(b.task.dueDate||'9999'))||String(b.task.updatedAt||'').localeCompare(String(a.task.updatedAt||''));
  });
}

function renderQuickTaskResults(){
  var box=document.getElementById('quickTaskResults');if(!box)return;
  var query=val('quickTaskSearch'),all=quickTaskMatches(query),rows=all.slice(0,12),timer=loadTimer();
  box.innerHTML=rows.length?'<div class="ops-focus-choice-list">'+rows.map(function(row){var t=row.task,p=row.project;return '<button type="button" class="ops-focus-choice '+(t.id===timer.taskId?'selected':'')+'" data-focus-task-id="'+esc(t.id)+'" onclick="financeApp.selectQuickTask(this.dataset.focusTaskId)"><span><strong>'+esc(t.name||'未命名工作')+'</strong><small>'+esc((p&&p.name)||'未連結專案')+'</small></span><em>'+esc(quickTaskDueLabel(t))+'</em></button>'}).join('')+'</div>'+(all.length>rows.length?'<div class="meta ops-focus-more">另有 '+(all.length-rows.length)+' 筆，請再多輸入一個關鍵字縮小範圍。</div>':''):'<div class="empty">找不到符合的未完成工作，請換工作名稱或專案名稱。</div>';
}

function openQuickTaskPicker(){
  var timer=loadTimer(),linked=task(timer.taskId);
  if(modal('搜尋要專注的工作','可輸入工作名稱或專案名稱；一開始只列出最急的 12 筆。','<div class="field"><label>搜尋工作／專案</label><input id="quickTaskSearch" data-modal-ephemeral autocomplete="off" placeholder="例：檸檬、Banner、官網" oninput="financeApp.searchQuickTasks()" onkeydown="financeApp.quickTaskSearchKey(event)"></div><div id="quickTaskResults"></div><div class="modal-foot"><button class="btn" onclick="financeApp.clearQuickTask()" '+(linked?'':'disabled')+'>清除選擇</button><button class="btn" onclick="financeApp.closeQuickTaskPicker()">取消</button></div>',true)===false)return false;
  var closeButton=document.querySelector('#modal .modal-head .btn.icon');if(closeButton)closeButton.onclick=closeQuickTaskPicker;
  renderQuickTaskResults();
  app.scheduleModalCallback(function(){var input=document.getElementById('quickTaskSearch');if(input)input.focus()},0);
  return true;
}

function searchQuickTasks(){renderQuickTaskResults()}
function closeQuickTaskPicker(){if(app.requestModalTransition()===false)return false;setTimeout(function(){var button=document.getElementById('homeFocusPickerButton');if(button)button.focus()},0);return true}
function quickTaskSearchKey(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeQuickTaskPicker();return}if(event.key==='Enter'){var first=document.querySelector('#quickTaskResults [data-focus-task-id]');if(first){event.preventDefault();selectQuickTask(first.dataset.focusTaskId)}}}
function selectQuickTask(taskId){if(quickTargetChanged(taskId)){closeQuickTaskPicker();toast('已選擇工作，可直接開始專注')}}
function clearQuickTask(){if(quickTargetChanged('')){closeQuickTaskPicker();toast('已清除快速專注工作')}}

function quickFinanceHtml(){
  var advances=(d().financeRecords||[]).filter(function(r){return r.type==='advance'&&r.status!=='received'}),total=advances.reduce(function(n,r){return n+Number(r.amount||0)},0);
  return '<section class="ops-finance-quick" id="opsFinanceQuick"><div class="ops-finance-quick-head"><div><strong>💳 快速記帳</strong><div class="meta">突然發生的支出，先記下來再補收據。</div></div><button class="btn small" onclick="financeApp.open(\'cash\',\'advance\')">查看</button></div><button class="ops-finance-quick-summary" onclick="financeApp.open(\'cash\',\'advance\')"><strong>'+advances.length+'</strong><span>筆代墊未收回<br>'+money(total)+'</span></button><div class="ops-finance-quick-actions"><button class="btn primary" onclick="financeApp.openQuickRecord(\'advance\')">＋ 記代墊</button><button class="btn" onclick="financeApp.openQuickRecord(\'expense\')">＋ 記突發支出</button></div></section>';
}

function openQuickRecord(type){
  type=type==='expense'?'expense':'advance';
  var expense=type==='expense';
  modal(expense?'記突發支出':'記一筆代墊',expense?'已經支付的臨時支出，會直接記為已支付。':'先記下來，之後從財務中心一路追到實際收回。','<input id="quickFinType" type="hidden" value="'+type+'"><div class="form-grid"><div class="field full"><label>用途／項目 *</label><input id="quickFinTitle" placeholder="'+(expense?'例：臨時購買展場耗材':'例：代墊官網續費')+'"></div><div class="field"><label>金額 *</label><input id="quickFinAmount" type="number" min="0" step="1" inputmode="decimal"></div><div class="field"><label>發生日</label><input id="quickFinDate" type="date" value="'+today()+'"></div><div class="field full"><label>連結專案（選填）</label><select id="quickFinProject">'+projectOptions('')+'</select></div><div class="field full"><label>簡短備註（選填）</label><input id="quickFinNote" placeholder="請款對象、付款方式或先記下要補的資料"></div></div><div class="notice">收據、分類和完整請款資料可以稍後到「收支與代墊」補齊。</div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" onclick="financeApp.saveQuickRecord()">儲存</button></div>');
}

function saveQuickRecord(){
  var type=val('quickFinType')==='expense'?'expense':'advance',title=val('quickFinTitle'),amount=Number(val('quickFinAmount'));
  if(!title||!isFinite(amount)||amount<0)return alert('請填寫用途與正確金額。');
  var stamp=now(),date=val('quickFinDate')||today(),record={id:uid('fin'),type:type,status:type==='expense'?'paid':'draft',title:title,amount:amount,category:type==='expense'?'突發支出':'代墊',date:date,dueDate:'',projectId:val('quickFinProject'),receiptUrl:'',note:val('quickFinNote'),createdAt:stamp,updatedAt:stamp};
  if(type==='expense')record.paidAt=date;
  d().financeRecords.unshift(record);
  app.closeModal();app.saveData(type==='expense'?'快速記錄突發支出':'快速記錄代墊');toast(type==='expense'?'突發支出已記下':'代墊已記下，之後記得追到收回');
}

function focusView(){
  var timer=loadTimer(),openTasks=(d().tasks||[]).filter(function(t){return t.status!=='done'}),sessions=(d().focusSessions||[]).slice().sort(function(a,b){return String(b.completedAt||'').localeCompare(String(a.completedAt||''))}).slice(0,30),selectedTask=task(timer.taskId),label=timer.label||(selectedTask&&selectedTask.name)||'';
  var remaining=timerRemaining(timer),pct=Math.min(100,Math.max(0,(1-remaining/Math.max(1,timer.totalSeconds))*100));
  return '<div class="ops-focus-layout"><div class="ops-focus-clock"><div><div class="meta">'+(timer.running?'正在專注':'準備開始')+'</div><div class="ops-focus-time" id="focusClock">'+clock(remaining)+'</div><div class="ops-focus-progress"><i id="focusProgress" style="width:'+pct+'%"></i></div><strong id="focusLabel">'+esc(label||'尚未選擇工作')+'</strong><div class="meta" id="focusInterruptCount">中斷 '+Number(timer.interruptions||0)+' 次</div><div class="row" style="justify-content:center;margin-top:15px"><button class="btn primary" onclick="financeApp.focusToggle()">'+(timer.running?'暫停':'開始')+'</button><button class="btn" onclick="financeApp.focusInterrupt()">記錄中斷</button><button class="btn" onclick="financeApp.finishFocus(true)">完成本段</button><button class="btn danger" onclick="financeApp.focusReset()">重設</button></div></div></div><div><div class="card"><h3>這次要專注什麼</h3><div class="field" style="margin-top:10px"><label>連結 V6 工作</label><select id="focusTask" onchange="financeApp.focusTargetChanged()"><option value="">不連結工作</option>'+openTasks.map(function(t){return '<option value="'+esc(t.id)+'" '+(t.id===timer.taskId?'selected':'')+'>'+esc((project(t.projectId)?project(t.projectId).name+'｜':'')+t.name)+'</option>'}).join('')+'</select></div><div class="field"><label>或自行輸入名稱</label><input id="focusCustom" value="'+esc(timer.label||'')+'" placeholder="例：整理本週代墊" onchange="financeApp.focusTargetChanged()"></div><div class="form-grid"><div class="field"><label>專注分鐘</label><input id="focusMinutes" type="number" min="1" max="180" value="'+Math.round(Number(timer.totalSeconds||1500)/60)+'" onchange="financeApp.focusMinutesChanged()"></div><div class="field"><label>完成備註</label><input id="focusNote" value="'+esc(timer.note||'')+'" placeholder="完成了什麼／下一步"></div></div></div><div class="card" style="margin-top:12px"><div class="row between"><div><h3>最近專注紀錄</h3><div class="meta">完成後會連到原本的專案與工作。</div></div><button class="btn" onclick="financeApp.openFocusSettings()">⚙ 設定</button></div><div class="list" style="margin-top:10px">'+(sessions.map(function(s){var p=project(s.projectId);return '<div class="item"><div class="title-line"><div><strong>'+esc(s.label||'未命名專注')+'</strong><div class="meta">'+new Date(s.completedAt).toLocaleString('zh-TW')+(p?' · '+esc(p.name):'')+' · 中斷 '+Number(s.interruptions||0)+' 次</div>'+(s.outcome?'<div class="ops-focus-result">'+esc(s.outcome)+(s.nextAction?'<small>下一步：'+esc(s.nextAction)+'</small>':'')+'</div>':'')+'</div><span class="tag brand">'+Number(s.actualMinutes||0).toFixed(1)+' 分</span></div></div>'}).join('')||'<div class="empty">完成第一段專注後，紀錄會出現在這裡。</div>')+'</div></div></div></div>';
}

function focusTargetChanged(){var timer=loadTimer();timer.taskId=val('focusTask');timer.label=val('focusCustom');var t=task(timer.taskId);timer.projectId=t&&t.projectId||'';timer.note=val('focusNote');saveTimer(timer);drawTimer()}
function focusMinutesChanged(){var timer=loadTimer();if(timer.running||timerElapsed(timer)>0)return toast('計時進行中，請先重設再改分鐘');timer.totalSeconds=Math.max(60,Number(val('focusMinutes')||25)*60);saveTimer(timer);drawTimer()}
function focusToggle(){var timer=loadTimer(),t=task(val('focusTask')||timer.taskId),label=val('focusCustom')||timer.label||(t&&t.name)||'';if(!label)return alert('請先選擇工作或輸入專注名稱。');timer.taskId=val('focusTask')||timer.taskId;timer.projectId=t&&t.projectId||timer.projectId||'';timer.label=val('focusCustom')||timer.label;timer.note=val('focusNote')||timer.note;if(timer.running){timer.elapsedSeconds=timerElapsed(timer);timer.running=false;timer.startedAt=null}else{if(timerRemaining(timer)<=0){timer.elapsedSeconds=0}timer.running=true;timer.startedAt=Date.now()}saveTimer(timer);render();startTick()}
function focusInterrupt(){var timer=loadTimer();if(timerElapsed(timer)<=0)return toast('開始計時後才能記錄中斷');if(timer.running){timer.elapsedSeconds=timerElapsed(timer);timer.running=false;timer.startedAt=null}timer.interruptions=Number(timer.interruptions||0)+1;saveTimer(timer);render();toast('已記錄中斷，計時已暫停')}
function focusReset(){var timer=loadTimer();if(timerElapsed(timer)>30&&!confirm('目前計時會清除，確定重設？'))return;var config=d().settings.focusConfig||{};saveTimer({totalSeconds:Number(config.focusMinutes||25)*60,elapsedSeconds:0,running:false,startedAt:null,taskId:timer.taskId||'',projectId:timer.projectId||'',label:timer.label||'',interruptions:0,note:''});render()}
function quickTargetChanged(selected){var timer=loadTimer();if(selected===undefined)selected=val('homeFocusTask');var linked=task(selected);if(selected&&(!linked||linked.status==='done')){toast('這項工作已完成或不存在，請重新搜尋');return false}if(timer.running&&selected!==timer.taskId){toast('計時中請先暫停，再切換工作');return false}if(selected!==timer.taskId&&timerElapsed(timer)>0){toast('目前還有已累計的專注時間，請先到「詳細」完成本段或重設。');return false}timer.taskId=selected;timer.projectId=linked&&linked.projectId||'';timer.label='';saveTimer(timer);drawTimer();return true}
function quickToggle(){var timer=loadTimer(),selected=val('homeFocusTask')||timer.taskId,linked=task(selected),label=timer.label||(linked&&linked.name)||'';if(timer.running){timer.elapsedSeconds=timerElapsed(timer);timer.running=false;timer.startedAt=null;saveTimer(timer);drawTimer();return}if(selected&&(!linked||linked.status==='done'))return alert('原工作已完成或不存在，請重新搜尋一項工作。');if(!label)return alert('請先搜尋並選擇一項工作。');timer.taskId=selected;timer.projectId=linked&&linked.projectId||timer.projectId||'';if(timerRemaining(timer)<=0)timer.elapsedSeconds=0;timer.running=true;timer.startedAt=Date.now();saveTimer(timer);drawTimer();startTick()}
function startTask(taskId,minutes){var timer=loadTimer(),linked=task(taskId),elapsed=timerElapsed(timer),suggested=Math.max(0,Math.min(180,Number(minutes)||0));if(!linked)return;if(timer.taskId===taskId){if(!timer.running){if(elapsed<=0&&suggested)timer.totalSeconds=suggested*60;if(timerRemaining(timer)<=0)timer.elapsedSeconds=0;timer.running=true;timer.startedAt=Date.now();saveTimer(timer)}app.closeModal();open('focus');toast((elapsed>0?'已繼續':'已開始')+'專注：'+linked.name+(elapsed<=0&&suggested?'（'+suggested+' 分鐘）':''));startTick();return}if(elapsed>0&&!confirm('目前已有 '+clock(elapsed)+' 的計時，確定切換到「'+linked.name+'」並開始新的一段？'))return;timer.taskId=taskId;timer.projectId=linked.projectId||'';timer.label='';timer.elapsedSeconds=0;timer.running=true;timer.startedAt=Date.now();timer.interruptions=0;timer.note='';if(suggested)timer.totalSeconds=suggested*60;saveTimer(timer);app.closeModal();open('focus');toast('已開始專注：'+linked.name+(suggested?'（'+suggested+' 分鐘）':''));startTick()}
function finishFocus(early){var timer=loadTimer(),elapsed=timerElapsed(timer),linked=task(timer.taskId);if(elapsed<1)return toast('還沒有可保存的專注時間');if(timer.running){timer.elapsedSeconds=elapsed;timer.running=false;timer.startedAt=null;saveTimer(timer)}modal('完成這段專注','留下成果與下一步，之後回到專案就不必重新回想。','<div class="stat brand"><strong>'+clock(elapsed)+'</strong><span>'+esc(timer.label||(linked&&linked.name)||'未命名專注')+'</span></div><div class="field" style="margin-top:14px"><label>這段完成了什麼 *</label><textarea id="focusOutcome" placeholder="例：完成 Banner 第一版，已整理兩個網站的尺寸差異">'+esc(timer.note||'')+'</textarea></div><div class="field"><label>下一個最小步驟</label><input id="focusNextAction" placeholder="例：明早請主管確認文案"></div>'+(linked?'<label class="check"><input id="focusMarkDone" type="checkbox">這項工作已全部完成，直接標記完成</label>':'')+'<input id="focusEndedEarly" type="hidden" value="'+(early?'1':'0')+'"><div class="modal-foot"><button class="btn" onclick="app.closeModal()">稍後再填</button><button class="btn primary" onclick="financeApp.focusComplete()">保存成果</button></div>')}
function focusComplete(){var timer=loadTimer(),elapsed=timerElapsed(timer);if(elapsed<1)return toast('還沒有可保存的專注時間');var linked=task(timer.taskId),label=timer.label||(linked&&linked.name)||'未命名專注',outcome=val('focusOutcome')||val('focusNote')||timer.note||'',nextAction=val('focusNextAction'),endedEarly=val('focusEndedEarly')==='1',markDone=Boolean(document.getElementById('focusMarkDone')&&document.getElementById('focusMarkDone').checked),stamp=now();if(document.getElementById('focusOutcome')&&!outcome)return alert('請先簡短寫下這段完成了什麼。');d().focusSessions.unshift({id:uid('focus'),label:label,taskId:timer.taskId||'',projectId:timer.projectId||(linked&&linked.projectId)||'',plannedMinutes:Math.round(Number(timer.totalSeconds||0)/60),actualMinutes:Math.round(elapsed/6)/10,interruptions:Number(timer.interruptions||0),note:outcome,outcome:outcome,nextAction:nextAction,completed:true,endedEarly:endedEarly,completedAt:stamp,createdAt:stamp,updatedAt:stamp});if(linked){linked.lastFocusAt=stamp;linked.focusNextAction=nextAction;linked.updatedAt=stamp;if(markDone){linked.status='done';linked.completedAt=stamp}var p=project(linked.projectId);if(p&&nextAction){p.nextAction=nextAction;p.updatedAt=stamp}}var config=d().settings.focusConfig||{};saveTimer({totalSeconds:Number(config.focusMinutes||25)*60,elapsedSeconds:0,running:false,startedAt:null,taskId:timer.taskId||'',projectId:timer.projectId||'',label:timer.label||'',interruptions:0,note:''});app.closeModal();save('儲存番茄專注成果與下一步');toast(markDone?'專注成果已保存，工作已完成':'專注成果與下一步已保存')}
function drawTimer(){var timer=loadTimer(),remaining=timerRemaining(timer),clockEl=document.getElementById('focusClock'),homeClock=document.getElementById('homeFocusClock'),progress=document.getElementById('focusProgress'),label=document.getElementById('focusLabel'),homeDetail=document.getElementById('homeFocusDetail'),homeToggle=document.getElementById('homeFocusToggle'),homeTask=document.getElementById('homeFocusTask'),pickerLabel=document.getElementById('homeFocusPickerLabel'),linked=task(timer.taskId),usable=linked&&linked.status!=='done',name=timer.label||(linked&&linked.name)||'',display=usable?((project(linked.projectId)?project(linked.projectId).name+'｜':'')+linked.name):(timer.label||'搜尋今天要推進的工作');if(clockEl)clockEl.textContent=clock(remaining);if(homeClock)homeClock.textContent=clock(remaining);if(progress)progress.style.width=Math.min(100,Math.max(0,(1-remaining/Math.max(1,timer.totalSeconds))*100))+'%';if(label)label.textContent=name||'尚未選擇工作';if(homeTask)homeTask.value=usable?linked.id:'';if(pickerLabel)pickerLabel.textContent=display;if(homeDetail)homeDetail.textContent=name?(timer.running?'正在：'+name:usable?'已選擇：'+name:'原工作已完成，請重新選擇。'):'從專案工作直接開始，完成後會留下成果與下一步。';if(homeToggle)homeToggle.textContent=timer.running?'暫停':'開始';if(remaining<=0&&timer.running)finishFocus(false)}
function startTick(){clearInterval(tickHandle);tickHandle=setInterval(drawTimer,500)}
function openFocusSettings(){var c=d().settings.focusConfig;modal('番茄鐘設定','設定預設專注與休息長度。休息時間先保留為提示，不會自動寫成工時。','<div class="form-grid"><div class="field"><label>專注分鐘</label><input id="focusCfgMinutes" type="number" min="1" max="180" value="'+esc(c.focusMinutes)+'"></div><div class="field"><label>短休息分鐘</label><input id="focusCfgShort" type="number" min="1" max="60" value="'+esc(c.shortBreakMinutes)+'"></div><div class="field"><label>長休息分鐘</label><input id="focusCfgLong" type="number" min="1" max="120" value="'+esc(c.longBreakMinutes)+'"></div></div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" onclick="financeApp.saveFocusSettings()">儲存設定</button></div>')}
function saveFocusSettings(){var c={focusMinutes:Math.max(1,Number(val('focusCfgMinutes')||25)),shortBreakMinutes:Math.max(1,Number(val('focusCfgShort')||5)),longBreakMinutes:Math.max(1,Number(val('focusCfgLong')||15)),updatedAt:now()};d().settings.focusConfig=c;var timer=loadTimer();if(!timer.running&&timerElapsed(timer)===0)timer.totalSeconds=c.focusMinutes*60;saveTimer(timer);app.closeModal();save('更新番茄鐘設定')}

function legacyCounts(){var old={},salary=[],pom={};try{old=JSON.parse(localStorage.getItem('ctrl_v4')||'{}')}catch(e){}try{salary=JSON.parse(localStorage.getItem('ctrl_salary_v1')||'[]')}catch(e){}try{pom=JSON.parse(localStorage.getItem('pom_ct')||'{}')}catch(e){}var pomos=(pom.history||[]).reduce(function(n,h){return n+(Array.isArray(h.pomos)?h.pomos.length:1)},0);return {claims:Array.isArray(old.claims)?old.claims:[],salary:Array.isArray(salary)?salary:[],pom:pom,pomos:pomos}}
function openLegacyImport(){var old=legacyCounts();modal('匯入舊版財務與工時紀錄','只讀取這個瀏覽器中舊工具留下的資料；不會刪除舊資料，也不會重複匯入同一筆。','<div class="grid three"><div class="stat amber"><strong>'+old.claims.length+'</strong><span>舊代墊紀錄</span></div><div class="stat blue"><strong>'+old.salary.length+'</strong><span>舊出勤紀錄</span></div><div class="stat teal"><strong>'+old.pomos+'</strong><span>舊番茄紀錄</span></div></div><div class="notice" style="margin-top:14px">為避免誤判，舊版「已請款」會轉成「已送出」，不會直接標成已收回。匯入後請再確認款項是否真的入帳。</div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" '+(old.claims.length+old.salary.length+old.pomos?'':'disabled')+' onclick="financeApp.importLegacy()">開始匯入</button></div>')}
function normalizeDate(value){var m=String(value||'').match(/(20\d{2})[^0-9]?(\d{1,2})?[^0-9]?(\d{1,2})?/);if(!m)return today();return m[1]+'-'+String(Number(m[2]||1)).padStart(2,'0')+'-'+String(Number(m[3]||1)).padStart(2,'0')}
function importLegacy(){var old=legacyCounts(),stamp=now(),added={claims:0,salary:0,pomos:0};old.claims.forEach(function(c,i){var id='legacy_fin_'+String(c.id||i),exists=d().financeRecords.some(function(x){return x.id===id});if(exists)return;d().financeRecords.push({id:id,type:'advance',status:c.claimed?'submitted':'draft',title:String(c.name||'舊版代墊'),amount:Number(c.amount||0),category:c.type==='overtime'?'取件／加班':c.isMonthly?'每月固定':'代墊',date:normalizeDate(c.date),dueDate:'',projectId:'',receiptUrl:'',note:[c.note,c.hours?'舊紀錄時數：'+c.hours+'h':'',c.claimedDate?'舊版標記已請款：'+c.claimedDate:''].filter(Boolean).join('；'),submittedAt:c.claimed?normalizeDate(c.claimedDate):'',legacySource:'ctrl_v4.claims',createdAt:stamp,updatedAt:stamp});added.claims++});old.salary.forEach(function(r,i){var id='legacy_att_'+String(r.id||i),exists=d().attendanceRecords.some(function(x){return x.id===id});if(exists)return;var breakMinutes=Math.max(0,timeMinutes(r.timeOut)-timeMinutes(r.timeIn)-Number(r.hours||0)*60);d().attendanceRecords.push({id:id,date:normalizeDate(r.date),startTime:r.timeIn||'08:00',endTime:r.timeOut||'17:00',breakMinutes:breakMinutes,hours:Number(r.hours||workHours(r.timeIn,r.timeOut,breakMinutes)),note:r.note||'',legacyPay:Number(r.pay||0),legacySource:'ctrl_salary_v1',createdAt:stamp,updatedAt:stamp});added.salary++});(old.pom.history||[]).forEach(function(h,hi){var pomos=Array.isArray(h.pomos)?h.pomos:[h];pomos.forEach(function(p,pi){var id='legacy_focus_'+hi+'_'+pi+'_'+String(h.taskId||'none'),exists=d().focusSessions.some(function(x){return x.id===id});if(exists)return;d().focusSessions.push({id:id,label:h.name||'舊版番茄',taskId:'',projectId:'',plannedMinutes:Number((old.pom.cfg||{}).focus||25),actualMinutes:Number((old.pom.cfg||{}).focus||25),interruptions:(p.ints||[]).length,note:p.note||h.lastNote||'',completed:!p.early,completedAt:normalizeDate(h.date)+'T12:00:00.000Z',legacySource:'pom_ct',createdAt:stamp,updatedAt:stamp});added.pomos++})});d().settings.financeLegacyImportedAt=stamp;app.closeModal();save('匯入舊版財務、出勤與番茄紀錄');toast('已匯入：代墊 '+added.claims+'、出勤 '+added.salary+'、番茄 '+added.pomos)}

function alertsHtml(){var all=d().financeRecords||[],adv=all.filter(function(r){return r.type==='advance'&&r.status!=='received'}),income=all.filter(function(r){return r.type==='income'&&r.status!=='received'}),overdue=all.filter(function(r){return recordOpen(r)&&r.dueDate&&r.dueDate<today()});return '<section class="ops-finance-alerts" id="opsFinanceAlerts"><div class="section-head"><div><h2>收支與代墊提醒</h2><small>錢有沒有真的收回，也要像專案一樣追到收尾。</small></div><button class="btn small" onclick="financeApp.open(\'cash\')">查看財務與工時</button></div><div class="ops-finance-alert-grid"><div class="ops-finance-alert '+(adv.length?'warn':'')+'" onclick="financeApp.open(\'cash\',\'advance\')"><strong>'+adv.length+'</strong><span>筆代墊尚未收回 · '+money(adv.reduce(function(n,r){return n+Number(r.amount||0)},0))+'</span></div><div class="ops-finance-alert '+(income.length?'warn':'')+'" onclick="financeApp.open(\'cash\',\'income\')"><strong>'+income.length+'</strong><span>筆收入仍待收款 · '+money(income.reduce(function(n,r){return n+Number(r.amount||0)},0))+'</span></div><div class="ops-finance-alert '+(overdue.length?'bad':'')+'" onclick="financeApp.open(\'cash\')"><strong>'+overdue.length+'</strong><span>筆款項已超過預計日期</span></div></div></section>'}
function projectFocusHtml(projectId){var stats=focusStats(projectId,''),tasks=(d().tasks||[]).filter(function(t){return t.projectId===projectId&&t.status!=='done'}).slice(0,5);return '<div class="ops-focus-project" id="opsProjectFocus"><div class="row between"><div><h3>🍅 專案專注助手</h3><div class="meta">每次專注都會留下成果與下一步，不只累計時間。</div></div><button class="btn" onclick="financeApp.open(\'focus\')">完整紀錄</button></div><div class="ops-focus-project-stats"><span class="tag brand">'+stats.count+' 段專注</span><span class="tag teal">'+stats.minutes.toFixed(1)+' 分鐘</span></div><div class="list">'+(tasks.map(function(t){var ts=focusStats('',t.id);return '<div class="item"><div class="row between"><div><strong>'+esc(t.name)+'</strong><div class="meta">已專注 '+ts.minutes.toFixed(1)+' 分'+(t.focusNextAction?' · 下一步：'+esc(t.focusNextAction):'')+'</div></div><button class="btn small primary" onclick="financeApp.startTask(\''+esc(t.id)+'\')">▶ 專注</button></div></div>'}).join('')||'<div class="meta">目前沒有未完成工作。</div>')+'</div>'+stats.latest.map(function(s){return s.outcome?'<div class="ops-focus-result">'+esc(s.outcome)+(s.nextAction?'<small>下一步：'+esc(s.nextAction)+'</small>':'')+'</div>':''}).join('')+'</div>'}
function enhanceProjectModal(projectId){var foot=document.querySelector('#modal .modal-foot');if(!foot||document.getElementById('opsProjectFocus'))return;foot.insertAdjacentHTML('beforebegin',projectFocusHtml(projectId))}
function enhanceTaskModal(taskId){var foot=document.querySelector('#modal .modal-foot');if(!foot||document.getElementById('opsTaskFocusButton'))return;var stats=focusStats('',taskId),button=document.createElement('button');button.className='btn';button.id='opsTaskFocusButton';button.textContent='▶ 專注這項（'+stats.minutes.toFixed(0)+' 分）';button.onclick=function(){startTask(taskId)};foot.insertBefore(button,foot.firstChild)}
function enhanceDashboard(){var title=document.getElementById('pageTitle'),content=document.getElementById('content');if(!title||!content||title.textContent.indexOf('首頁')<0)return;var todayTasks=document.getElementById('dashboardTodayTasks'),todayBoard=document.getElementById('v6TodayBoard'),quickGrid=document.getElementById('opsDashboardQuick');if(!quickGrid){var quickHtml='<div class="ops-dashboard-quick-grid" id="opsDashboardQuick">'+focusQuickHtml()+quickFinanceHtml()+'</div>';if(todayTasks)todayTasks.insertAdjacentHTML('afterend',quickHtml);else if(todayBoard)todayBoard.insertAdjacentHTML('afterend',quickHtml);else content.insertAdjacentHTML('afterbegin',quickHtml)}var alerts=document.getElementById('opsFinanceAlerts');if(!alerts){quickGrid=document.getElementById('opsDashboardQuick');if(quickGrid)quickGrid.insertAdjacentHTML('afterend',alertsHtml());else if(todayTasks)todayTasks.insertAdjacentHTML('afterend',alertsHtml());else content.insertAdjacentHTML('afterbegin',alertsHtml())}drawTimer()}

function tabs(){return '<div class="ops-finance-tabs"><button class="ops-finance-tab '+(state.tab==='cash'?'active':'')+'" onclick="financeApp.open(\'cash\')">收支／代墊收款</button><button class="ops-finance-tab '+(state.tab==='salary'?'active':'')+'" onclick="financeApp.open(\'salary\')">薪資／出勤</button><button class="ops-finance-tab" onclick="financeApp.openLegacyImport()">匯入舊版紀錄</button></div>'}
function render(){ensure();var content=document.getElementById('content');if(!content)return;document.querySelectorAll('.nav').forEach(function(n){n.classList.remove('active')});var isFocus=state.tab==='focus',nav=document.getElementById('financeNav');if(nav&&!isFocus)nav.classList.add('active');document.getElementById('pageTitle').textContent=isFocus?'專注助手':'財務與工時中心';document.getElementById('pageSub').textContent=isFocus?'從專案或首頁開始專注，完成後留下成果與下一步。':'收支、代墊收款與出勤薪資集中管理。';content.innerHTML=isFocus?focusView():tabs()+(state.tab==='salary'?salaryView():cashView());if(isFocus)startTick()}
function open(tab,kind){state.active=true;state.tab=tab||state.tab;if(kind){state.kind=kind;state.status='open'}app.toggleMobileNav(false);render()}
function setMonth(value){state.month=value;render()}function setKind(value){state.kind=value;render()}function setStatus(value){state.status=value;render()}function setAttendanceMonth(value){state.attendanceMonth=value;state.editAttendanceId='';render()}

function addChrome(){var aside=document.querySelector('aside'),side=aside&&aside.querySelector('.side-actions');if(side&&!document.getElementById('financeNav'))side.insertAdjacentHTML('beforebegin','<div class="nav-group" id="financeSide"><div class="nav-label">財務與工時</div><button class="nav" id="financeNav" onclick="financeApp.open(\'cash\')">＄　收支／薪資</button></div>')}

window.financeApp={open:open,render:render,setMonth:setMonth,setKind:setKind,setStatus:setStatus,openRecord:openRecord,openQuickRecord:openQuickRecord,saveQuickRecord:saveQuickRecord,refreshRecordStatus:refreshRecordStatus,saveRecord:saveRecord,advanceRecord:advanceRecord,removeRecord:removeRecord,setAttendanceMonth:setAttendanceMonth,saveAttendance:saveAttendance,editAttendance:editAttendance,removeAttendance:removeAttendance,openSalarySettings:openSalarySettings,saveSalarySettings:saveSalarySettings,focusTargetChanged:focusTargetChanged,focusMinutesChanged:focusMinutesChanged,focusToggle:focusToggle,focusInterrupt:focusInterrupt,focusReset:focusReset,openQuickTaskPicker:openQuickTaskPicker,searchQuickTasks:searchQuickTasks,quickTaskSearchKey:quickTaskSearchKey,closeQuickTaskPicker:closeQuickTaskPicker,selectQuickTask:selectQuickTask,clearQuickTask:clearQuickTask,quickTargetChanged:quickTargetChanged,quickToggle:quickToggle,startTask:startTask,finishFocus:finishFocus,focusComplete:focusComplete,openFocusSettings:openFocusSettings,saveFocusSettings:saveFocusSettings,openLegacyImport:openLegacyImport,importLegacy:importLegacy};
ensure();addChrome();var baseRender=app.render,baseOpenProject=app.openProject,baseOpenTask=app.openTask;app.render=function(){if(state.active)render();else baseRender()};app.openProject=function(projectId){state.active=false;var opened=baseOpenProject(projectId),marker=document.getElementById('projectId');if(opened===false||!marker||marker.value!==String(projectId||''))return false;if(projectId)enhanceProjectModal(projectId);return true};app.openTask=function(projectId,taskId){state.active=false;var opened=baseOpenTask(projectId,taskId),marker=document.getElementById('taskId');if(opened===false||!marker||marker.value!==String(taskId||''))return false;if(taskId)enhanceTaskModal(taskId);return true};document.getElementById('mainNav').addEventListener('click',function(event){var button=event.target.closest('.nav');if(button&&button.id!=='financeNav')state.active=false});document.addEventListener('keydown',function(event){if(event.key==='Escape'&&document.getElementById('modalBackdrop').classList.contains('open')&&document.getElementById('quickTaskResults'))setTimeout(function(){var button=document.getElementById('homeFocusPickerButton');if(button)button.focus()},0)},true);var observer=new MutationObserver(function(){setTimeout(enhanceDashboard,0)});observer.observe(document.getElementById('content'),{childList:true,subtree:false});setTimeout(enhanceDashboard,100);if(loadTimer().running)startTick();
})();
