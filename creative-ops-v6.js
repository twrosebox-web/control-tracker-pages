(function(){
'use strict';
var DATA_KEY='creative_ops_v6_data';
var SNAP_KEY='creative_ops_v6_snapshots';
var API_KEY='creative_ops_print_api_url';
var d=()=>app.getData();
var now=()=>new Date().toISOString();
var today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
var uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
var esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
var val=id=>{var e=document.getElementById(id);return e?e.value.trim():''};
var checked=id=>{var e=document.getElementById(id);return !!(e&&e.checked)};
var dateAdd=(date,n)=>{var x=new Date((date||today())+'T12:00:00');x.setDate(x.getDate()+Number(n||0));return x.toISOString().slice(0,10)};
var age=date=>date?Math.max(0,Math.floor((new Date()-new Date(date))/86400000)):0;
var dayDiff=date=>date?Math.ceil((new Date(date+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000):9999;
var project=id=>(d().projects||[]).find(x=>x.id===id);
var item=id=>(d().printItems||[]).find(x=>x.id===id);
var order=id=>(d().printWorkOrders||[]).find(x=>x.id===id);
var option=(list,selected,label)=>list.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(label?label(x):x.name)+'</option>').join('');

function modal(title,sub,body,wide){
  if(app.isModalBusy&&app.isModalBusy()){toast('圖片上傳中，請稍候。');return false}
  return app.openModal(title,sub,body,wide);
}
function toast(text){if(app.lastSaveFailed&&app.lastSaveFailed())return;var e=document.getElementById('toast');e.textContent=text;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2200)}
function save(action){return app.saveData(action)}

function templateStep(id,title,kind,phase,trigger,extra){return Object.assign({id:id,title:title,kind:kind||'task',phase:phase||'make',trigger:trigger||'sequence',note:''},extra||{})}
var defaultTemplates=[
 {id:'tpl_booth',name:'擺攤／展售活動',type:'booth',builtIn:true,schemaVersion:2,steps:[
  templateStep('tpl_booth_s1','確認活動與攤位資訊','confirmation','review','countdown',{daysBefore:21,note:'確認日期、地點、攤位、進撤場與窗口'}),
  templateStep('tpl_booth_s2','確認促銷內容與商品','confirmation','review','countdown',{daysBefore:18,note:'促銷門檻、主推品項、贈品與數量'}),
  templateStep('tpl_booth_s3','製作官網 Banner 1700×730','task','make','countdown',{daysBefore:14}),
  templateStep('tpl_booth_s4','製作手機版 Banner','task','make','countdown',{daysBefore:10}),
  templateStep('tpl_booth_s5','製作 FB 貼文素材','task','make','countdown',{daysBefore:7}),
  templateStep('tpl_booth_s6','官網 A 上線並確認','task','publish','countdown',{daysBefore:5}),
  templateStep('tpl_booth_s7','官網 B 上線並確認','task','publish','countdown',{daysBefore:5}),
  templateStep('tpl_booth_s8','FB 發布並確認','task','publish','countdown',{daysBefore:2}),
  templateStep('tpl_booth_s9','活動後整理圖片與注意事項','task','closeout','countdown',{daysBefore:0,note:'活動結束後補促銷成效、現場問題與下次提醒'})
 ]},
 {id:'tpl_festival',name:'年度節慶 Banner',type:'festival',builtIn:true,schemaVersion:2,steps:[
  templateStep('tpl_festival_s1','確認主題與優惠','confirmation','review','countdown',{daysBefore:30}),
  templateStep('tpl_festival_s2','確認兩站規格與差異','task','review','countdown',{daysBefore:21}),
  templateStep('tpl_festival_s3','製作桌機 Banner','task','make','countdown',{daysBefore:14}),
  templateStep('tpl_festival_s4','製作手機 Banner','task','make','countdown',{daysBefore:10}),
  templateStep('tpl_festival_s5','主管校稿確認','confirmation','review','countdown',{daysBefore:7}),
  templateStep('tpl_festival_s6','官網 A 更新','task','publish','countdown',{daysBefore:5}),
  templateStep('tpl_festival_s7','官網 B 更新','task','publish','countdown',{daysBefore:5}),
  templateStep('tpl_festival_s8','FB 發布','task','publish','countdown',{daysBefore:2}),
  templateStep('tpl_festival_s9','留存完稿與成效','task','closeout','countdown',{daysBefore:0})
 ]},
 {id:'tpl_web',name:'雙官網定期維護',type:'website',builtIn:true,schemaVersion:2,steps:[
  templateStep('tpl_web_s1','盤點官網 A 待更新','task','review','weekly',{weekday:1,note:'每週一先盤點本週要處理的變更'}),
  templateStep('tpl_web_s2','盤點官網 B 待更新','task','review','sequence'),
  templateStep('tpl_web_s3','編輯 HTML','task','make','sequence'),
  templateStep('tpl_web_s4','分別預覽桌機與手機','task','review','sequence'),
  templateStep('tpl_web_s5','確認連結與文字','confirmation','review','sequence'),
  templateStep('tpl_web_s6','發布官網 A','task','publish','sequence'),
  templateStep('tpl_web_s7','發布官網 B','task','publish','sequence'),
  templateStep('tpl_web_s8','記錄兩站版本差異','task','closeout','sequence')
 ]},
 {id:'tpl_print',name:'印刷品補印',type:'print',builtIn:true,schemaVersion:2,steps:[
  templateStep('tpl_print_s1','盤點庫存與需求量','task','review','sequence'),
  templateStep('tpl_print_s2','確認規格與上次注意事項','task','review','sequence'),
  templateStep('tpl_print_s3','確認常用廠商、交期與現價；新品／改規格／急件再詢價','task','review','sequence',{note:'常用品沿用固定廠商；只有新品、規格變更或急件才比較報價'}),
  templateStep('tpl_print_s4','校稿確認','confirmation','review','sequence'),
  templateStep('tpl_print_s5','數量、價格與交期確認','confirmation','review','sequence'),
  templateStep('tpl_print_s6','送印','task','publish','sequence'),
  templateStep('tpl_print_s7','到貨驗收','task','review','sequence'),
  templateStep('tpl_print_s8','成品留樣','task','closeout','sequence'),
  templateStep('tpl_print_s9','版本圖片與問題歸檔','task','closeout','sequence')
 ]}
];
defaultTemplates.forEach(function(template){template.tasks=template.steps.map(function(step){return step.title})});
function defaultWorkflowTemplates(){return JSON.parse(JSON.stringify(defaultTemplates))}

function mergeSeedCollection(target,source){var existing=new Set(target.map(x=>x&&x.id));var added=0;(source||[]).forEach(x=>{if(x&&x.id&&!existing.has(x.id)){target.push(JSON.parse(JSON.stringify(x)));existing.add(x.id);added++}});return added}
var LEGACY_IMPORT_MONTH_IDS=['wo_legacy_0007','wo_legacy_0008','wo_legacy_0009','wo_legacy_0017','wo_legacy_0018','wo_legacy_0025','wo_legacy_0026','wo_legacy_0027','wo_legacy_0034','wo_legacy_0035','wo_legacy_0042','wo_legacy_0047','wo_legacy_0050','wo_legacy_0051','wo_legacy_0096'];
var LEGACY_IMPORT_OPEN_RULES={
  wo_legacy_0034:{title:'60G 小花醬 瓶身貼－2025/09 叫貨印製',resolution:'已自動分類為未完成工單：原文有叫貨印製，但沒有足夠資料證明已完成。'},
  wo_legacy_0094:{title:'24入花茶－2026 下半年預計',resolution:'已自動分類為未完成工單：保留 2026 下半年預計事項。'},
  wo_legacy_0095:{title:'面膜袋－叫貨事項（日期未定）',resolution:'已自動分類為未完成工單：保留叫貨內容，日期維持未定。'}
};
var LEGACY_QUANTITY_CORRECTIONS={
  wo_legacy_0030:{from:'3000張、18個',to:'3000張',reason:'排除保存期限 18 個月'},
  wo_legacy_0036:{from:'6000張、12個、18個',to:'6000張',reason:'排除保存期限 12／18 個月'},
  wo_legacy_0046:{from:'30本、3個',to:'30本',reason:'排除裝訂使用 3 個針'},
  wo_legacy_0051:{from:'2個、2000張',to:'2000張',reason:'排除 2 個特別色'},
  wo_legacy_0075:{from:'500張、2000張',to:'500張',reason:'2000 張是計價基準，實際印量為 500 張'}
};
function resolveLegacyImportReviews(){
  var x=d(),stamp=now(),changed=0,monthSet=new Set(LEGACY_IMPORT_MONTH_IDS),allIds=new Set(LEGACY_IMPORT_MONTH_IDS.concat(Object.keys(LEGACY_IMPORT_OPEN_RULES)));
  (x.printWorkOrders||[]).forEach(function(w){
    if(!allIds.has(w.id)||w.needsReview!==true)return;
    var before=JSON.stringify(w),openRule=LEGACY_IMPORT_OPEN_RULES[w.id];
    w.needsReview=false;
    if(monthSet.has(w.id))w.datePrecision='month';
    if(openRule){
      w.status='intake';
      w.title=openRule.title;
      w.importReviewResolution=openRule.resolution;
      if(!String(w.issue||'').includes(openRule.resolution))w.issue=[w.issue,openRule.resolution].filter(Boolean).join('\n');
    }else{
      w.status='closed';
      w.importReviewResolution='已自動處理：日期保留到年月，不補造確切日。';
    }
    if(w.id==='wo_legacy_0096'){
      w.requestDate='2026-01-01';
      w.title='餐廳餐墊紙－2026/01';
    }
    if(JSON.stringify(w)!==before){w.importReviewResolvedAt=w.importReviewResolvedAt||stamp;changed++}
  });
  if(!x.settings.legacyImportReviewAutoResolvedAt){x.settings.legacyImportReviewAutoResolvedAt=stamp;changed++}
  return changed;
}
function correctLegacyQuantities(touchTime){
  var changed=0,stamp=now();
  (d().printWorkOrders||[]).forEach(function(w){
    var rule=LEGACY_QUANTITY_CORRECTIONS[w.id];
    if(!rule||String(w.quantity||'')!==rule.from)return;
    w.quantity=rule.to;
    w.quantityCorrection='已修正舊檔數量：'+rule.reason;
    if(touchTime)w.updatedAt=stamp;
    changed++;
  });
  return changed;
}
function migrateLegacyImages(){var x=d(),added=0;(x.printItems||[]).forEach(it=>{var has=(x.printAssetVersions||[]).some(v=>v.itemId===it.id);if(!has&&Array.isArray(it.imageLinks)&&it.imageLinks.length){x.printAssetVersions.push({id:'pv_legacy_'+it.id,itemId:it.id,workOrderId:'',name:'舊檔匯入版本',versionDate:(it.updatedAt||it.createdAt||now()).slice(0,10),status:'legacy',note:'由舊 Excel 圖片轉入，可繼續新增新版並比較。',imageLinks:it.imageLinks.slice(),isCurrent:true,createdAt:it.createdAt||now(),updatedAt:it.updatedAt||now()});added++}});return added}
var FILE_STATUS_MAP={'草稿':'working','校稿':'working','已確認':'final','完稿':'final','已發布':'archived'};
function migrateFileFields(){var changed=0;(d().files||[]).forEach(function(file){if(file.type&&!file.kind){file.kind=file.type;delete file.type;changed++}if(FILE_STATUS_MAP[file.status]){file.status=FILE_STATUS_MAP[file.status];changed++}});return changed}
function migrate(autoSave=true){
  var x=d(),changed=false;
  ['printAssetVersions','inventoryRecords','quotes','workflowTemplates','closeouts'].forEach(k=>{if(!Array.isArray(x[k])){x[k]=[];changed=true}});
  x.settings=x.settings||{};
  var seed=window.CREATIVE_OPS_PRINT_SEED||{};
  var seedAdded=mergeSeedCollection(x.vendors,seed.vendors)+mergeSeedCollection(x.printItems,seed.printItems)+mergeSeedCollection(x.printWorkOrders,seed.printWorkOrders)+mergeSeedCollection(x.printInspections,seed.printInspections);if(seedAdded)changed=true;
  if(resolveLegacyImportReviews())changed=true;
  if(correctLegacyQuantities(false))changed=true;
  if(!x.workflowTemplates.length){x.workflowTemplates=defaultWorkflowTemplates();changed=true}
  (x.confirmations||[]).forEach(c=>{if(!c.askedAt&&c.status==='asked'){c.askedAt=c.updatedAt||c.createdAt||now();changed=true}if(!Array.isArray(c.evidenceLinks)){c.evidenceLinks=[];changed=true}if(c.changeCount==null){c.changeCount=0;changed=true}});
  (x.projects||[]).forEach(p=>{if(p.nextAction==null){p.nextAction='';changed=true}if(p.taskType==null){p.taskType='general';changed=true}});
  (x.printItems||[]).forEach(it=>{
    if(it.inventoryQty==null){it.inventoryQty='';it.monthlyUsage='';it.safetyStock='';changed=true}
  });
  if(migrateFileFields())changed=true;
  if(migrateLegacyImages())changed=true;
  if(x.version<6){x.version=6;changed=true}
  if(!x.settings.v6MigratedAt){x.settings.v6MigratedAt=now();changed=true}
  if(changed&&autoSave)save('升級至 V6 資料結構並保留舊資料');
  return changed;
}

window.v6BeforeSave=function(db,action){
  if(!db||String(action||'').indexOf('還原備份')>=0)return;
  var list=[];try{list=JSON.parse(localStorage.getItem(SNAP_KEY)||'[]')}catch(e){}
  var last=list[0]&&new Date(list[0].at).getTime()||0;
  var important=/刪除|結案|匯入|升級|版本|驗收/.test(action||'');
  if(!important&&Date.now()-last<10*60*1000)return;
  try{var previous=JSON.parse(localStorage.getItem(DATA_KEY)||'null')||db;list.unshift({id:uid('snap'),at:now(),action:'操作前：'+(action||'自動備份'),data:JSON.parse(JSON.stringify(previous))});localStorage.setItem(SNAP_KEY,JSON.stringify(list.slice(0,6)))}catch(e){}
};

function toggleMobileActions(force){
  var panel=document.getElementById('v6MobileActions'),button=document.getElementById('v6MobileMore');
  if(!panel||!button)return;
  var open=typeof force==='boolean'?force:!panel.classList.contains('open');
  panel.classList.toggle('open',open);
  button.setAttribute('aria-expanded',String(open));
  button.textContent=open?'✕ 收起':'☰ 更多';
}
function runMobileAction(name){
  toggleMobileActions(false);
  if(name==='capture')return app.openCapture();
  var action={search:openSearch,knowledge:openKnowledgeReview,file:openFileHelper,hub:openHub}[name];
  if(action)action();
}

function addChrome(){
  if(!document.querySelector('link[href="creative-ops-v6.css"]')){}
  var actions=document.querySelector('.top-actions');
  if(actions&&!document.getElementById('v6IntakeTop'))actions.insertAdjacentHTML('afterbegin','<button class="btn primary" id="v6IntakeTop" onclick="v6App.openAssistantIntake()">＋ 收到新任務</button><button class="btn" id="v6SearchTop" onclick="v6App.openSearch()">⌕ 全部搜尋</button>');
  if(actions&&!document.getElementById('v6KnowledgeTop'))actions.insertAdjacentHTML('beforeend','<button class="btn" id="v6KnowledgeTop" onclick="v6App.openKnowledgeReview()">整理經驗</button><button class="btn" id="v6FileTop" onclick="v6App.openFileHelper()">檔名助手</button><button class="btn" id="v6HubTop" onclick="v6App.openHub()">全部工具</button>');
  if(actions&&!document.getElementById('v6MobileMore'))actions.insertAdjacentHTML('beforeend','<button class="btn v6-mobile-more" id="v6MobileMore" onclick="v6App.toggleMobileActions()" aria-expanded="false" aria-controls="v6MobileActions">☰ 更多</button><div class="v6-mobile-actions-panel" id="v6MobileActions"><button class="btn" onclick="v6App.runMobileAction(\'search\')">⌕ 全部搜尋</button><button class="btn" onclick="v6App.runMobileAction(\'capture\')">＋ 隨手記錄</button><button class="btn" onclick="v6App.runMobileAction(\'knowledge\')">整理經驗</button><button class="btn" onclick="v6App.runMobileAction(\'file\')">檔名助手</button><button class="btn" onclick="v6App.runMobileAction(\'hub\')">全部工具</button></div>');
  var aside=document.querySelector('aside');
  if(aside&&!document.getElementById('v6Side'))aside.querySelector('.side-actions').insertAdjacentHTML('beforebegin','<div class="nav-group v6-side-group" id="v6Side"><div class="nav-label">V6 營運工具</div><button class="nav" onclick="v6App.openHub()">◎ 營運工具箱</button><button class="nav" onclick="v6App.openVersions()">▧ 印製版本圖庫</button><button class="nav" onclick="v6App.openInventory()">▤ 庫存與成本</button><button class="nav" onclick="v6App.openTemplates()">◫ 年度與節慶模板</button><button class="nav" onclick="v6App.openBackups()">↺ 備份與紀錄</button></div>');
}

function todayBoard(){
  var x=d(),openTasks=(x.tasks||[]).filter(t=>t.status!=='done'),taskDue=openTasks.filter(t=>{var p=project(t.projectId),active=p&&p.workflow&&p.workflow.activeRecord;return (t.dueDate&&dayDiff(t.dueDate)<=0)||(t.workflowGenerated&&active&&active.collection==='tasks'&&active.id===t.id)});
  var conf=(x.confirmations||[]).filter(c=>!['confirmed','cancelled'].includes(c.status));
  var confDue=conf.filter(c=>(c.nextFollowup&&dayDiff(c.nextFollowup)<=0)||age(c.askedAt||c.createdAt)>=3);
  var prints=(x.printWorkOrders||[]).filter(w=>w.status!=='closed'&&((w.kind==='urgent')||(w.dueDate&&dayDiff(w.dueDate)<=3)));
  var unclosed=(x.projects||[]).filter(p=>p.stage==='closed'&&!(x.closeouts||[]).some(c=>c.projectId===p.id&&c.completed));
  var knowledge=(x.knowledge||[]).filter(k=>k.status==='inbox'&&age(k.createdAt||k.updatedAt)>=7);
  function card(n,label,detail,kind,action){return '<div class="v6-today-card '+kind+'" onclick="'+action+'"><strong>'+n+'</strong><span>'+label+'</span><small>'+detail+'</small></div>'}
  return '<section class="v6-today" id="v6TodayBoard"><div class="v6-today-head"><div><div class="v6-kicker">TODAY</div><h2>今天只先掌握這些</h2><p>所有專案、確認、印製和經驗都集中成可處理的入口。</p></div><button class="btn small" onclick="v6App.openSearch()">搜尋全部資料</button></div><div class="v6-today-grid">'+
   card(taskDue.length,'到期工作',taskDue[0]?taskDue[0].name:'目前沒有逾期','urgent','v6App.showToday(\'tasks\')')+
   card(confDue.length,'要確認／追問',confDue[0]?confDue[0].question:'目前沒有待追問','warn','v6App.showToday(\'confirmations\')')+
   card(prints.length,'印製要盯',prints[0]?(prints[0].title||'印製工單'):'目前沒有急件',prints.length?'warn':'good','v6App.showToday(\'prints\')')+
   card(unclosed.length,'未完整收尾',unclosed[0]?unclosed[0].name:'已結案者都有紀錄',unclosed.length?'urgent':'good','v6App.showToday(\'closeouts\')')+
   card(knowledge.length,'經驗待整理',knowledge[0]?knowledge[0].title:'收集箱已整理',knowledge.length?'warn':'good','v6App.openKnowledgeReview()')+
   '</div></section>';
}
function enhanceDashboard(){
  var content=document.getElementById('content'),title=document.getElementById('pageTitle');
  if(!content)return;
  var old=document.getElementById('v6Quickbar');if(old)old.remove();
  if(title&&title.textContent.indexOf('首頁')>=0&&!document.getElementById('v6TodayBoard'))content.insertAdjacentHTML('afterbegin',todayBoard());
}
var obs=new MutationObserver(function(){setTimeout(enhanceDashboard,0)});

function openHub(){modal('V6 營運工具箱','日常工作、版本、提醒與知識整理都從這裡進入。','<div class="v6-tool-grid">'+[
 ['AI 收到新任務','先訪談與整理任務表，最後由你確認寫入。','openAssistantIntake'],['手動快速建案','不用 AI，直接分級並建立固定範本工作。','openIntake'],['全部搜尋','跨專案、印刷、官網、SOP、廠商與經驗一起找。','openSearch'],['印製版本圖庫','每版圖片、確認狀態、放大預覽與左右比較。','openVersions'],['庫存與成本','估算可用天數、補印日、歷史單價與廠商報價。','openInventory'],['年度／節慶模板','擺攤、節慶 Banner、雙官網與補印快速建案。','openTemplates'],['確認中心加強','看等待天數、追問日、證據和變更次數。','showTodayConfirm'],['結案檢查','強制檢查檔案、驗收、留樣與經驗回收。','openCloseouts'],['整理經驗','把收集箱補進 SOP、廠商，或兩邊連結。','openKnowledgeReview'],['檔名與路徑助手','產生統一資料夾及版本檔名，避免檔案亂丟。','openFileHelper'],['備份與修改紀錄','自動快照、JSON 備份、還原與操作紀錄。','openBackups']
 ].map(t=>'<button class="v6-tool" onclick="v6App.'+t[2]+'()"><b>'+t[0]+'</b><small>'+t[1]+'</small></button>').join('')+'</div>',true)}

function openAssistantIntake(){if(window.assistantApp&&assistantApp.openNew)return assistantApp.openNew();openIntake()}

function recommend(){
  var urgent=val('v6Urgency'),impact=val('v6Impact'),due=val('v6Due');
  var p=(urgent==='today'||impact==='high'||(due&&dayDiff(due)<=2))?'P1':(urgent==='week'||impact==='medium'?'P2':'P3');
  var e=document.getElementById('v6Recommendation');if(e)e.innerHTML='<span class="v6-priority '+p.toLowerCase()+'">'+p+'</span> '+(p==='P1'?'今天先確認方向並建立可交付下一步。':p==='P2'?'本週排進執行，先完成初步企劃。':'先留在收件匣，排定回看日。');
}
function openIntake(){modal('收到新任務：先分級','不用一開始就想完整；先判斷，再留下最小可執行的下一步。','<div class="form-grid"><div class="field full"><label>任務名稱 *</label><input id="v6TaskName" placeholder="例：中秋活動要做兩站 Banner 與 FB 貼文"></div><div class="field"><label>類型</label><select id="v6TaskType"><option value="print">印刷／包材</option><option value="website">官網維護</option><option value="social">FB／社群</option><option value="event">擺攤／展售</option><option value="festival">年度／節慶</option><option value="general">其他美編</option></select></div><div class="field"><label>期限</label><input id="v6Due" type="date" onchange="v6App.recommend()"></div><div class="field"><label>緊急度</label><select id="v6Urgency" onchange="v6App.recommend()"><option value="today">今天就要動</option><option value="week" selected>本週要推進</option><option value="later">可排程</option></select></div><div class="field"><label>影響程度</label><select id="v6Impact" onchange="v6App.recommend()"><option value="high">影響發布／印製／活動</option><option value="medium" selected>影響一般進度</option><option value="low">可延後優化</option></select></div><div class="field full"><label>現在有的構想／背景</label><textarea id="v6Idea" placeholder="先隨意寫，V6 會把它放在初步企劃，不要求一次整理好。"></textarea></div><div class="field"><label>第一個下一步 *</label><input id="v6Next" placeholder="例：先問活動促銷內容"></div><div class="field"><label>要找誰確認</label><input id="v6Who" placeholder="例：老闆／行銷／廠商"></div><div class="field"><label>是否例行</label><select id="v6Recurring"><option value="">單次任務</option><option value="weekly">每週</option><option value="monthly">每月</option><option value="quarterly">每季</option><option value="yearly">每年</option></select></div><div class="field"><label>提醒提前幾天</label><input id="v6Reminder" type="number" min="0" value="7"></div></div><div class="v6-banner" id="v6Recommendation"></div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" onclick="v6App.saveIntake()">建立專案與下一步</button></div>');recommend()}
function taskDefaults(type){return {print:['確認規格、數量與上次注意事項','詢價／確認交期','校稿與數量價格確認','到貨驗收與留樣','版本圖片和問題歸檔'],website:['確認兩站目前狀況與差異','編輯 HTML','預覽桌機與手機','發布網站 A 並確認','發布網站 B 並確認','記錄改版內容'],social:['確認文案與發布日','製作圖片規格','校稿確認','發布並核對','完稿歸檔'],event:['確認日期、攤位與促銷','製作桌機 Banner 1700×730','製作手機 Banner','官網 A／B 更新','FB 素材與發布','活動後記錄注意事項'],festival:['確認年度檔期與優惠','建立桌機與手機規格','兩站與 FB 發布','留存完稿與成效'],general:['確認需求與交付規格','製作初稿','校稿確認','交付與歸檔']}[type]||[]}
function saveIntake(){
  var name=val('v6TaskName'),next=val('v6Next');if(!name||!next)return alert('請填寫任務名稱與第一個下一步。');
  var x=d(),type=val('v6TaskType'),urg=val('v6Urgency'),impact=val('v6Impact'),due=val('v6Due'),reminderDays=Math.max(0,Number(val('v6Reminder')||0)),reminderOn=due?dateAdd(due,-reminderDays):today(),priority=(urg==='today'||impact==='high'||(due&&dayDiff(due)<=2))?'urgent':(urg==='week'||impact==='medium'?'high':'normal');
  if(dayDiff(reminderOn)<0)reminderOn=today();
  var recurring=val('v6Recurring'),who=val('v6Who');
  var p={id:uid('proj'),name:name,stage:'intake',priority:priority,dueDate:due,brief:val('v6Idea'),vendorIds:[],taskType:type,impact:impact,nextAction:next,recurring:recurring,reminderDays:reminderDays,reminderDate:reminderOn,createdAt:now(),updatedAt:now()};x.projects.unshift(p);
  var names=[next].concat(taskDefaults(type).filter(n=>n!==next)),span=due?Math.max(0,dayDiff(due)):0;names.forEach((n,i)=>x.tasks.push({id:uid('task'),name:n,projectId:p.id,eventId:'',dueDate:due?dateAdd(today(),Math.round(span*(i+1)/names.length)):(i===0?today():''),phase:/確認|校稿/.test(n)?'review':/發布|交付/.test(n)?'publish':i===names.length-1?'closeout':'make',status:'open',createdAt:now()}));
  if(who)x.confirmations.unshift({id:uid('confirm'),question:'確認「'+name+'」的需求與方向',person:who,projectId:p.id,status:'pending',nextFollowup:reminderOn,result:'',evidenceLinks:[],changeCount:0,createdAt:now(),updatedAt:now()});
  if(recurring)x.routines.unshift({id:uid('routine'),name:name,cycle:recurring,nextDate:reminderOn,active:true,projectId:p.id,createdAt:now()});
  else if(!who)x.routines.unshift({id:uid('routine'),name:'提醒：'+name,cycle:'once',nextDate:reminderOn,active:true,projectId:p.id,createdAt:now()});
  if(type==='event')x.events.unshift({id:uid('event'),name:name,type:'booth',startDate:due,endDate:due,place:'',itemsText:'',note:val('v6Idea'),projectId:p.id,reminderDays:Number(val('v6Reminder')||0),createdAt:now()});
  save('V6 收件分級並建立專案、下一步與提醒');app.closeModal();toast('已建立：先做「'+next+'」');
}

var originalOpenConfirmation=app.openConfirmation,originalSaveConfirmation=app.saveConfirmation;
function openConfirmation(id){var c=id?(d().confirmations||[]).find(x=>x.id===id):{};c=c||{};var waiting=age(c.askedAt||c.createdAt);modal(id?'處理確認事項':'新增確認事項','累積很多也不會失控：留下提出日、追問日、證據與變更次數。','<input id="v6ConfirmId" type="hidden" value="'+esc(c.id||'')+'"><div class="form-grid"><div class="field full"><label>要確認什麼 *</label><input id="v6ConfirmQuestion" value="'+esc(c.question||'')+'"></div><div class="field"><label>找誰確認</label><input id="v6ConfirmPerson" value="'+esc(c.person||'')+'"></div><div class="field"><label>關聯專案</label><select id="v6ConfirmProject"><option value="">未連結</option>'+option(d().projects||[],c.projectId)+'</select></div><div class="field"><label>狀態</label><select id="v6ConfirmStatus"><option value="pending">待提出</option><option value="asked">等回覆</option><option value="confirmed">已確認</option><option value="changed">有變更</option><option value="cancelled">不需要</option></select></div><div class="field"><label>提出／詢問日</label><input id="v6AskedAt" type="date" value="'+esc((c.askedAt||'').slice(0,10))+'"></div><div class="field"><label>下次追問日</label><input id="v6Follow" type="date" value="'+esc(c.nextFollowup||'')+'"></div><div class="field"><label>最後追問日</label><input id="v6LastFollow" type="date" value="'+esc((c.lastFollowupAt||'').slice(0,10))+'"></div><div class="field"><label>變更次數</label><input id="v6ChangeCount" type="number" min="0" value="'+Number(c.changeCount||0)+'"></div><div class="field full"><label>確認結果</label><textarea id="v6ConfirmResult">'+esc(c.result||'')+'</textarea></div><div class="field full"><label>證據連結（截圖／信件／Drive，一行一筆）</label><textarea id="v6Evidence">'+esc((c.evidenceLinks||[]).join('\n'))+'</textarea></div></div>'+(id?'<div class="v6-banner">目前已等待 <span class="v6-aging '+(waiting>=7?'bad':'')+'">'+waiting+' 天</span>。可直接延後追問： <button class="btn small" onclick="v6App.snoozeConfirm(1)">明天</button> <button class="btn small" onclick="v6App.snoozeConfirm(3)">＋3 天</button> <button class="btn small" onclick="v6App.snoozeConfirm(7)">＋7 天</button></div>':'')+'<div class="modal-foot">'+(id?'<button class="btn danger" onclick="app.remove(\'confirmations\',\''+esc(id)+'\')">刪除</button>':'')+'<button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" onclick="v6App.saveConfirmation()">儲存</button></div>');document.getElementById('v6ConfirmStatus').value=c.status||'pending'}
function saveConfirmation(){var q=val('v6ConfirmQuestion');if(!q)return alert('請填寫確認事項。');var id=val('v6ConfirmId'),list=d().confirmations||[],c=list.find(x=>x.id===id),oldStatus=c&&c.status,obj={question:q,person:val('v6ConfirmPerson'),projectId:val('v6ConfirmProject'),status:val('v6ConfirmStatus'),askedAt:val('v6AskedAt')?val('v6AskedAt')+'T12:00:00':'',nextFollowup:val('v6Follow'),lastFollowupAt:val('v6LastFollow')?val('v6LastFollow')+'T12:00:00':'',changeCount:Number(val('v6ChangeCount')||0),result:val('v6ConfirmResult'),evidenceLinks:val('v6Evidence').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),updatedAt:now()};if(obj.status==='asked'&&!obj.askedAt)obj.askedAt=now();if(obj.status==='changed'&&oldStatus!=='changed')obj.changeCount++;if(c)Object.assign(c,obj);else{obj.id=uid('confirm');obj.createdAt=now();list.unshift(obj)}save('V6 儲存確認事項');app.closeModal();toast('確認事項已更新')}
function snoozeConfirm(days){document.getElementById('v6Follow').value=dateAdd(today(),days);document.getElementById('v6LastFollow').value=today();document.getElementById('v6ConfirmStatus').value='asked'}

var originalOpenProject=app.openProject,originalSaveProject=app.saveProject;
app.openProject=function(id){originalOpenProject(id);var marker=document.getElementById('projectId');if(!marker||marker.value!==String(id||''))return false;var foot=document.querySelector('#modal .modal-foot');if(!foot)return false;var p=id?project(id):null;var done=p&&(d().closeouts||[]).some(c=>c.projectId===p.id&&c.completed);foot.insertAdjacentHTML('beforebegin','<div class="form-grid"><div class="field"><label>工作類型</label><select id="v6ProjectType"><option value="general">一般美編</option><option value="print">印刷／包材</option><option value="website">官網</option><option value="social">FB／社群</option><option value="event">擺攤</option><option value="festival">年度／節慶</option></select></div><div class="field"><label>明確的下一步</label><input id="v6ProjectNext" value="'+esc(p&&p.nextAction||'')+'" placeholder="例：今天先問數量"></div></div>'+(p?'<div class="v6-banner">結案檢查：<strong>'+(done?'已完成':'尚未完成')+'</strong> <button class="btn small" onclick="v6App.openCloseout(\''+esc(p.id)+'\')">'+(done?'查看／重做':'開始檢查')+'</button></div>':''));var sel=document.getElementById('v6ProjectType');if(sel)sel.value=p&&p.taskType||'general';return true};
app.saveProject=function(){var pid=val('projectId'),target=val('projectStage'),name=val('projectName'),type=val('v6ProjectType'),next=val('v6ProjectNext');if(pid&&target==='closed'&&!(d().closeouts||[]).some(c=>c.projectId===pid&&c.completed)){openCloseout(pid);return}originalSaveProject();var p=pid?project(pid):(d().projects||[]).filter(x=>x.name===name).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];if(p&&(type||next)){p.taskType=type||p.taskType;p.nextAction=next||p.nextAction;p.updatedAt=now();save('V6 更新專案類型與下一步')}};

var closeChecks=[['files','完稿原始檔與輸出檔已放到正確資料夾'],['name','檔名、版本號與日期符合規則'],['confirm','所有確認事項已有結果或明確取消'],['inspection','印製／發布／連結已完成最後檢查'],['sample','需要的印刷成品已留樣並記錄位置'],['version','本次版本圖片或畫面已留存'],['learning','問題與下次注意事項已回收到經驗／SOP']];
function openCloseout(pid){var p=project(pid);if(!p)return;var old=(d().closeouts||[]).find(c=>c.projectId===pid)||{};modal('專案結案檢查：'+p.name,'這些項目完成後才會正式結案，避免檔案、驗收或經驗沒有收尾。','<input id="v6CloseProject" type="hidden" value="'+esc(pid)+'"><div class="v6-checklist">'+closeChecks.map(c=>'<label class="v6-checkline"><input id="close_'+c[0]+'" type="checkbox" '+(old.checks&&old.checks[c[0]]?'checked':'')+'><span>'+c[1]+'</span></label>').join('')+'</div><div class="field" style="margin-top:12px"><label>檔案／留樣位置</label><input id="v6CloseLocation" value="'+esc(old.location||'')+'" placeholder="例：E:\\大花農場\\2026\\活動名稱\\完稿"></div><div class="field"><label>這次學到什麼／下次提醒</label><textarea id="v6CloseLearning">'+esc(old.learning||'')+'</textarea></div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">稍後</button><button class="btn primary" onclick="v6App.completeCloseout()">全部確認並結案</button></div>')}
function completeCloseout(){var pid=val('v6CloseProject'),openTasks=(d().tasks||[]).filter(t=>t.projectId===pid&&t.status!=='done'),openConf=(d().confirmations||[]).filter(c=>c.projectId===pid&&!['confirmed','cancelled'].includes(c.status));if(openTasks.length||openConf.length)return alert('尚不能結案：有 '+openTasks.length+' 項未完成工作、'+openConf.length+' 項待確認。請先處理後再結案。');var missing=closeChecks.filter(c=>!checked('close_'+c[0]));if(missing.length)return alert('還有 '+missing.length+' 項未確認，完成後才能結案。');if(!val('v6CloseLocation'))return alert('請填寫完稿檔案或留樣位置。');var p=project(pid),list=d().closeouts||[],c=list.find(x=>x.projectId===pid),obj={projectId:pid,checks:Object.fromEntries(closeChecks.map(x=>[x[0],true])),location:val('v6CloseLocation'),learning:val('v6CloseLearning'),completed:true,completedAt:now(),updatedAt:now()};if(c)Object.assign(c,obj);else{obj.id=uid('close');obj.createdAt=now();list.unshift(obj)}if(p){p.stage='closed';p.closedAt=now();p.updatedAt=now()}if(obj.learning&&!d().knowledge.some(k=>k.projectId===pid&&k.title==='結案經驗：'+p.name))d().knowledge.unshift({id:uid('know'),title:'結案經驗：'+p.name,text:obj.learning,tags:['結案','下次注意'],status:'inbox',priority:2,reliability:'single',projectId:pid,links:{projectIds:[pid],vendorIds:[],sopIds:[]},createdAt:now(),updatedAt:now()});save('完成專案強制結案與經驗回收');app.closeModal();toast('專案已完整結案')}

function openCloseouts(){var list=(d().projects||[]).filter(p=>p.stage!=='closed'||!(d().closeouts||[]).some(c=>c.projectId===p.id&&c.completed));modal('結案與收尾','只列出還沒完成結案檢查的專案。','<div class="list">'+(list.map(p=>'<div class="item"><div class="row between"><div><strong>'+esc(p.name)+'</strong><div class="meta">'+esc(p.nextAction||'尚未填寫下一步')+'</div></div><button class="btn" onclick="v6App.openCloseout(\''+esc(p.id)+'\')">結案檢查</button></div></div>').join('')||'<div class="empty">目前沒有待收尾專案。</div>')+'</div>',true)}

function searchable(){var x=d();return [
 ['專案',x.projects,'name','brief','project'],['工作',x.tasks,'name','phase','task'],['確認',x.confirmations,'question','result','confirmation'],['活動',x.events,'name','note','event'],['官網',x.websites,'name','note','website'],['官網改版',x.websiteChanges,'title','note','webchange'],['檔案',x.files,'name','path','file'],['SOP',x.sops,'title','content','sop'],['經驗',x.knowledge,'title','text','knowledge'],['廠商',x.vendors,'name','note','vendor'],['印製品',x.printItems,'name','notes','printitem'],['印製工單',x.printWorkOrders,'title','issue','printorder'],['印製版本',x.printAssetVersions,'name','note','version']
 ].map(a=>({label:a[0],rows:a[1]||[],title:a[2],body:a[3],type:a[4]}))}
function openSearch(q){if(modal('全部資料搜尋','專案、官網、SOP、廠商、印製與版本圖片一起搜尋。','<div class="row"><input class="v6-search" id="v6SearchInput" data-modal-ephemeral placeholder="輸入關鍵字、廠商、規格、活動…" value="'+esc(q||'')+'" oninput="v6App.runSearch(this.value)"><button class="btn" onclick="v6App.runSearch(document.getElementById(\'v6SearchInput\').value)">搜尋</button></div><div id="v6SearchResults"></div>',true)===false)return false;app.scheduleModalCallback(()=>{const input=document.getElementById('v6SearchInput');if(input)input.focus();runSearch(q||'')},0);return true}
function runSearch(q){var out=document.getElementById('v6SearchResults');if(!out)return;q=String(q||'').trim().toLowerCase();if(q.length<1){out.innerHTML='<div class="empty" style="margin-top:14px">輸入一個字就可以搜尋所有資料。</div>';return}var html='';searchable().forEach(g=>{var rows=g.rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)).slice(0,20);if(rows.length)html+='<div class="v6-result-group"><h3>'+g.label+'（'+rows.length+'）</h3>'+rows.map(r=>'<div class="v6-result" onclick="v6App.openResult(\''+g.type+'\',\''+esc(r.id)+'\')"><div><strong>'+esc(r[g.title]||'(未命名)')+'</strong><div class="meta">'+esc(String(r[g.body]||'').slice(0,110))+'</div></div><em>開啟 ›</em></div>').join('')+'</div>'});out.innerHTML=html||'<div class="empty" style="margin-top:14px">找不到符合資料。</div>'}
function openResult(type,id){var map={project:()=>app.openProject(id),confirmation:()=>openConfirmation(id),event:()=>app.openEvent(id),website:()=>app.openWebsite(id),webchange:()=>app.openWebChange(id),file:()=>app.openFile(id),sop:()=>app.openSop(id),knowledge:()=>app.openKnowledge(id),vendor:()=>app.openVendor(id),printitem:()=>openVersions(id),printorder:()=>printApp.openOrder(id),version:()=>openVersions((d().printAssetVersions.find(v=>v.id===id)||{}).itemId)};if(map[type])return app.requestModalTransition(map[type]);toast('這筆資料請從原功能頁處理');return false}

function imgSrc(url,size){var s=String(url||''),m=s.match(/[-\w]{25,}/),width=Math.max(32,Math.min(2000,Math.round(Number(size)||1600)));return s.includes('drive.google.com')&&m?'https://drive.google.com/thumbnail?id='+m[0]+'&sz=w'+width:s}
function openVersions(itemId){var its=d().printItems||[],selected=itemId||its[0]&&its[0].id||'';modal('印製版本圖片庫','每個版本都保留圖片、日期、狀態與變更內容；點圖片可放大。','<div class="row between"><div class="field" style="margin:0;min-width:260px"><select id="v6VersionItem" onchange="v6App.renderVersions(this.value)">'+option(its,selected)+'</select></div><div class="row"><button class="btn" onclick="v6App.compareVersions()">左右比較</button><button class="btn primary" onclick="v6App.addVersion()">＋ 新版本</button></div></div><div id="v6VersionBody" style="margin-top:14px"></div>',true);renderVersions(selected)}
function renderVersions(itemId){var body=document.getElementById('v6VersionBody');if(!body)return;var versions=(d().printAssetVersions||[]).filter(v=>v.itemId===itemId).sort((a,b)=>String(b.versionDate||b.updatedAt).localeCompare(String(a.versionDate||a.updatedAt)));body.innerHTML=versions.length?'<div class="v6-version-grid">'+versions.map(v=>'<article class="v6-version-card '+(v.isCurrent?'v6-current':'')+'"><div class="v6-version-images '+((v.imageLinks||[]).length===1?'one':'')+'">'+((v.imageLinks||[]).map((url,i)=>'<img class="v6-thumb" src="'+esc(imgSrc(url))+'" loading="lazy" onclick="v6App.lightbox(\''+esc(v.id)+'\','+i+')" onerror="this.alt=\'圖片需登入 Drive 或檢查分享權限\'">').join('')||'<div class="empty">尚無圖片</div>')+'</div><div class="v6-version-info"><div class="row between"><strong>'+esc(v.name||'未命名版本')+'</strong>'+(v.isCurrent?'<span class="tag teal">目前版本</span>':'')+'</div><div class="tags"><span class="tag gray">'+esc(v.versionDate||'未填日期')+'</span><span class="tag brand">'+esc(v.status||'draft')+'</span></div><div class="meta">'+esc(v.note||'未記錄變更')+'</div><div class="row" style="margin-top:8px"><button class="btn small" onclick="v6App.addVersion(\''+esc(v.id)+'\')">編輯</button><button class="btn small danger" onclick="v6App.removeVersion(\''+esc(v.id)+'\')">刪除</button></div></div></article>').join('')+'</div>':'<div class="empty">這個印製品尚無版本；可建立第一版並上傳多張圖片。</div>'}
function addVersion(id){var v=id?(d().printAssetVersions||[]).find(x=>x.id===id):{},itemId=v&&v.itemId||val('v6VersionItem')||(d().printItems[0]&&d().printItems[0].id)||'';v=v||{};modal(id?'編輯印製版本':'新增印製版本','同一版本可放正面、背面、刀模、到貨照等多張圖片。','<input id="v6VersionId" type="hidden" value="'+esc(v.id||'')+'"><div class="form-grid"><div class="field"><label>印製品 *</label><select id="v6VersionItemEdit">'+option(d().printItems||[],itemId)+'</select></div><div class="field"><label>關聯工單</label><select id="v6VersionOrder"><option value="">未連結</option>'+option(d().printWorkOrders||[],v.workOrderId,x=>x.title||x.id)+'</select></div><div class="field"><label>版本名稱 *</label><input id="v6VersionName" value="'+esc(v.name||'')+'" placeholder="例：V3 文字修正版"></div><div class="field"><label>版本日期</label><input id="v6VersionDate" type="date" value="'+esc(v.versionDate||today())+'"></div><div class="field"><label>狀態</label><select id="v6VersionStatus"><option value="draft">草稿</option><option value="proof">校稿版</option><option value="approved">已確認</option><option value="printed">已印製</option><option value="legacy">舊檔匯入</option></select></div><div class="field"><label class="check"><input id="v6VersionCurrent" type="checkbox" '+(v.isCurrent?'checked':'')+'> 設為目前版本</label></div><div class="field full"><label>變更內容／確認資訊</label><textarea id="v6VersionNote">'+esc(v.note||'')+'</textarea></div><div class="field full"><label>圖片連結（一行一筆）</label><textarea id="v6VersionLinks">'+esc((v.imageLinks||[]).join('\n'))+'</textarea></div><div class="field full"><label>從電腦上傳圖片</label><input id="v6VersionUpload" type="file" accept="image/*" multiple><div class="meta">需先在印製中心設定 Apps Script API；圖片會進同一個 Google Drive 圖片資料夾。</div></div></div><div class="modal-foot"><button class="btn" onclick="v6App.openVersions(\''+esc(itemId)+'\')">返回</button><button class="btn primary" onclick="v6App.saveVersion()">儲存版本</button></div>');document.getElementById('v6VersionStatus').value=v.status||'draft'}
function apiPost(action,body){var url=String(localStorage.getItem(API_KEY)||window.PRINT_API_URL||'').trim(),token=String(localStorage.getItem('creative_ops_print_api_token')||'').trim();if(app.lastSaveFailed&&app.lastSaveFailed())return Promise.resolve({ok:false,localSaveFailed:true,error:'本機資料未儲存，已停止雲端寫入'});if(!url)return Promise.resolve({ok:false,skipped:true});return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(Object.assign({action:action,token:token},body||{}))}).then(r=>r.json()).catch(err=>({ok:false,error:err.message}))}
function fileData(file){return new Promise((res,rej)=>{var r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
async function saveVersion(){var name=val('v6VersionName'),itemId=val('v6VersionItemEdit');if(!name||!itemId)return alert('請選印製品並填寫版本名稱。');var id=val('v6VersionId')||uid('pv'),files=Array.from((document.getElementById('v6VersionUpload')||{}).files||[]),draft={id:id,itemId:itemId,workOrderId:val('v6VersionOrder'),name:name,versionDate:val('v6VersionDate'),status:val('v6VersionStatus'),note:val('v6VersionNote'),imageLinks:val('v6VersionLinks').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),isCurrent:checked('v6VersionCurrent')},operationId=0;if(files.length&&!String(localStorage.getItem(API_KEY)||window.PRINT_API_URL||'').trim())return alert('請先到印製中心設定 Apps Script API 網址，再上傳圖片。');try{if(files.length)operationId=app.setModalBusy('圖片上傳中，請勿關閉或切換表單。');for(var f of files){toast('正在上傳 '+f.name);var result=await apiPost('uploadImage',{payload:{dataUrl:await fileData(f),fileName:f.name,recordId:id}});if(!result.ok)throw new Error(result.error||'圖片上傳失敗');draft.imageLinks.push(result.viewUrl)}if(files.length&&!app.isModalInstance(operationId))throw new Error('上傳期間表單已變更，已停止儲存。')}catch(err){alert(err.message);return}finally{if(files.length)app.setModalBusy('')}var list=d().printAssetVersions||[],v=list.find(x=>x.id===id),changed=[],obj=Object.assign({},draft,{imageLinks:Array.from(new Set(draft.imageLinks)),updatedAt:now()});if(obj.isCurrent)list.forEach(x=>{if(x.itemId===itemId&&x.id!==id&&x.isCurrent){x.isCurrent=false;x.updatedAt=now();changed.push(x)}});if(v)Object.assign(v,obj);else{obj.createdAt=now();list.unshift(obj)}if(save('儲存印製版本與圖片')===false)return;apiPost('syncAll',{versions:[obj].concat(changed)});openVersions(itemId);toast('版本已儲存')}
function removeVersion(id){var v=(d().printAssetVersions||[]).find(x=>x.id===id);if(!v||!confirm('確定刪除這個版本紀錄？Drive 原始圖片不會被刪除。'))return;d().printAssetVersions=d().printAssetVersions.filter(x=>x.id!==id);save('刪除印製版本紀錄');apiPost('deleteVersion',{id:id});renderVersions(v.itemId)}
var light={zoom:1,index:0,version:null};
function ensureLightbox(){if(document.getElementById('v6Lightbox'))return;document.body.insertAdjacentHTML('beforeend','<div class="v6-lightbox" id="v6Lightbox"><div class="v6-lightbox-tools"><span class="v6-lightbox-title" id="v6LightTitle"></span><button class="btn small" onclick="v6App.lightStep(-1)">‹ 前一張</button><button class="btn small" onclick="v6App.zoom(-.25)">－</button><span id="v6Zoom">100%</span><button class="btn small" onclick="v6App.zoom(.25)">＋</button><button class="btn small" onclick="v6App.zoom(0,true)">符合畫面</button><a class="btn small" id="v6Original" target="_blank" rel="noopener">開原圖</a><button class="btn small" onclick="v6App.closeLightbox()">×</button></div><div class="v6-lightbox-stage" id="v6LightStage"><img id="v6LightImage"></div></div>')}
function lightbox(id,index){ensureLightbox();light.version=(d().printAssetVersions||[]).find(v=>v.id===id);light.index=index||0;light.zoom=1;drawLight();document.getElementById('v6Lightbox').classList.add('open')}
function drawLight(){if(!light.version)return;var links=light.version.imageLinks||[],url=links[light.index]||links[0];document.getElementById('v6LightTitle').textContent=light.version.name+'（'+(light.index+1)+' / '+links.length+'）';document.getElementById('v6LightImage').src=imgSrc(url);document.getElementById('v6Original').href=url;document.getElementById('v6LightImage').style.transform='scale('+light.zoom+')';document.getElementById('v6Zoom').textContent=Math.round(light.zoom*100)+'%'}
function zoom(n,fit){light.zoom=fit?Math.min(.9,(window.innerWidth-50)/(document.getElementById('v6LightImage').naturalWidth||window.innerWidth)):Math.min(4,Math.max(.25,light.zoom+n));drawLight()}
function lightStep(n){var links=light.version&&light.version.imageLinks||[];if(!links.length)return;light.index=(light.index+n+links.length)%links.length;light.zoom=1;drawLight()}
function closeLightbox(){document.getElementById('v6Lightbox').classList.remove('open')}
function compareVersions(){var itemId=val('v6VersionItem'),vs=(d().printAssetVersions||[]).filter(v=>v.itemId===itemId);if(vs.length<2)return alert('至少要有兩個版本才能比較。');modal('左右比較版本','選擇兩版並對照圖片、日期與變更內容。','<div class="row"><select id="v6CompareA" onchange="v6App.drawCompare()">'+option(vs,vs[0].id,x=>x.name)+'</select><select id="v6CompareB" onchange="v6App.drawCompare()">'+option(vs,vs[1].id,x=>x.name)+'</select></div><div id="v6CompareBody" style="margin-top:12px"></div><div class="modal-foot"><button class="btn" onclick="v6App.openVersions(\''+esc(itemId)+'\')">返回版本庫</button></div>',true);drawCompare()}
function drawCompare(){var a=(d().printAssetVersions||[]).find(v=>v.id===val('v6CompareA')),b=(d().printAssetVersions||[]).find(v=>v.id===val('v6CompareB')),body=document.getElementById('v6CompareBody');if(!a||!b||!body)return;body.innerHTML='<div class="v6-compare">'+[a,b].map(v=>'<div class="v6-compare-pane"><h3>'+esc(v.name)+'</h3><div class="meta">'+esc(v.versionDate)+' · '+esc(v.status)+'</div><img src="'+esc(imgSrc((v.imageLinks||[])[0]))+'"><p>'+esc(v.note||'未記錄變更')+'</p></div>').join('')+'</div>'}

function inventoryCalc(it){var qty=Number(it.inventoryQty||0),use=Number(it.monthlyUsage||0),safe=Number(it.safetyStock||0),usable=Math.max(0,qty-safe),days=use>0?Math.floor(usable/use*30):9999,lead=Number(it.leadDays||0),reorder=use>0?dateAdd(today(),Math.max(0,days-lead)):'';return{days:days,reorder:reorder,percent:qty?Math.min(100,Math.round(usable/Math.max(qty,1)*100)):0}}
function openInventory(){var its=d().printItems||[];modal('印製庫存與成本','輸入目前庫存、每月用量與安全庫存，系統估算補印時間；也可記錄多家報價。','<div class="table-wrap"><table class="table"><thead><tr><th>印製品</th><th>庫存／月用量／安全量</th><th>預估</th><th>成本</th><th></th></tr></thead><tbody>'+its.map(it=>{var c=inventoryCalc(it),hist=(d().printWorkOrders||[]).filter(w=>w.itemId===it.id&&Number(w.totalPrice)&&Number(w.quantity)),last=hist.sort((a,b)=>String(b.requestDate).localeCompare(String(a.requestDate)))[0],unit=last?Number(last.totalPrice)/Number(last.quantity):0;return '<tr><td><strong>'+esc(it.name)+'</strong><div class="meta">交期 '+esc(it.leadDays||0)+' 天</div></td><td><input class="v6-table-input" id="stock_'+esc(it.id)+'" type="number" value="'+esc(it.inventoryQty)+'" placeholder="庫存"> / <input class="v6-table-input" id="usage_'+esc(it.id)+'" type="number" value="'+esc(it.monthlyUsage)+'" placeholder="月用量"> / <input class="v6-table-input" id="safe_'+esc(it.id)+'" type="number" value="'+esc(it.safetyStock)+'" placeholder="安全量"></td><td><span class="v6-priority '+(c.days<=Number(it.leadDays||0)?'p1':c.days<=30?'p2':'p3')+'">'+(c.days===9999?'未估算':c.days+' 天')+'</span><div class="meta">'+(c.reorder?'建議 '+c.reorder+' 前補印':'請填每月用量')+'</div></td><td>'+(unit?'最近單價 $'+unit.toFixed(2):'尚無可算成本')+'</td><td><button class="btn small" onclick="v6App.openQuotes(\''+esc(it.id)+'\')">報價比較</button></td></tr>'}).join('')+'</tbody></table></div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">關閉</button><button class="btn primary" onclick="v6App.saveInventory()">儲存庫存設定</button></div>',true)}
function saveInventory(){var items=d().printItems||[];items.forEach(it=>{it.inventoryQty=val('stock_'+it.id);it.monthlyUsage=val('usage_'+it.id);it.safetyStock=val('safe_'+it.id);it.updatedAt=now()});save('更新印製庫存與補印預測');apiPost('syncAll',{items:items});openInventory();toast('庫存預測已更新')}
function openQuotes(itemId){var it=item(itemId),qs=(d().quotes||[]).filter(q=>q.itemId===itemId).sort((a,b)=>String(b.quoteDate).localeCompare(String(a.quoteDate)));modal('報價與成本比較：'+(it?it.name:''),'同一規格留下不同廠商、數量、總價、單價與工作天。','<input id="v6QuoteItem" type="hidden" value="'+esc(itemId)+'"><div class="form-grid"><div class="field"><label>廠商</label><select id="v6QuoteVendor"><option value="">請選擇</option>'+option(d().vendors||[],'')+'</select></div><div class="field"><label>報價日</label><input id="v6QuoteDate" type="date" value="'+today()+'"></div><div class="field"><label>數量</label><input id="v6QuoteQty" type="number"></div><div class="field"><label>總價</label><input id="v6QuoteTotal" type="number"></div><div class="field"><label>工作天</label><input id="v6QuoteLead" type="number"></div><div class="field"><label>備註</label><input id="v6QuoteNote"></div></div><button class="btn primary" onclick="v6App.saveQuote()">＋ 加入報價</button><div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>日期</th><th>廠商</th><th>數量</th><th>總價</th><th>單價</th><th>工作天</th></tr></thead><tbody>'+qs.map(q=>'<tr><td>'+esc(q.quoteDate)+'</td><td>'+esc(q.vendorName)+'</td><td>'+esc(q.quantity)+'</td><td>$'+esc(q.totalPrice)+'</td><td>$'+(Number(q.quantity)?(Number(q.totalPrice)/Number(q.quantity)).toFixed(2):'-')+'</td><td>'+esc(q.leadDays)+'</td></tr>').join('')+'</tbody></table></div><div class="modal-foot"><button class="btn" onclick="v6App.openInventory()">返回庫存</button></div>',true)}
function saveQuote(){var vid=val('v6QuoteVendor'),v=(d().vendors||[]).find(x=>x.id===vid);if(!vid||!val('v6QuoteQty')||!val('v6QuoteTotal'))return alert('請選廠商並填寫數量與總價。');var q={id:uid('quote'),itemId:val('v6QuoteItem'),vendorId:vid,vendorName:v&&v.name||'',quoteDate:val('v6QuoteDate'),quantity:Number(val('v6QuoteQty')),totalPrice:Number(val('v6QuoteTotal')),leadDays:Number(val('v6QuoteLead')||0),note:val('v6QuoteNote'),createdAt:now(),updatedAt:now()};d().quotes.unshift(q);save('新增印製廠商報價');apiPost('saveQuote',{record:q});openQuotes(q.itemId)}

function openTemplates(){var list=d().workflowTemplates||[];modal('年度、節慶與例行模板','提前提醒天數可直接改；套用時會建立專案與整套任務。','<div class="list">'+list.map(t=>'<div class="item"><div class="row between"><div><strong>'+esc(t.name)+'</strong><div class="meta">'+t.tasks.length+' 個步驟 · 提前 <input class="v6-table-input" id="tpldays_'+esc(t.id)+'" type="number" value="'+Number(t.reminderDays||0)+'"> 天提醒</div></div><button class="btn primary" onclick="v6App.applyTemplate(\''+esc(t.id)+'\')">套用</button></div><div class="tags">'+t.tasks.slice(0,5).map(x=>'<span class="tag gray">'+esc(x)+'</span>').join('')+(t.tasks.length>5?'<span class="tag brand">＋'+(t.tasks.length-5)+'</span>':'')+'</div></div>').join('')+'</div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">關閉</button><button class="btn primary" onclick="v6App.saveTemplateSettings()">儲存提醒天數</button></div>',true)}
function saveTemplateSettings(){(d().workflowTemplates||[]).forEach(t=>t.reminderDays=Number(val('tpldays_'+t.id)||0));save('更新年度與節慶模板提醒天數');openTemplates();toast('提醒天數已儲存')}
function applyTemplate(id){var t=(d().workflowTemplates||[]).find(x=>x.id===id);if(!t)return;modal('套用模板：'+t.name,'選活動／交付日期，系統會依提前天數建立提醒與工作。','<input id="v6ApplyTemplate" type="hidden" value="'+esc(id)+'"><div class="field"><label>專案／活動名稱</label><input id="v6ApplyName" value="'+esc(t.name)+'"></div><div class="field"><label>活動／交付日期 *</label><input id="v6ApplyDate" type="date"></div><div class="field"><label>提前提醒天數</label><input id="v6ApplyDays" type="number" value="'+Number(t.reminderDays||0)+'"></div><div class="modal-foot"><button class="btn" onclick="v6App.openTemplates()">返回</button><button class="btn primary" onclick="v6App.createFromTemplate()">建立年度工作</button></div>')}
function createFromTemplate(){var t=(d().workflowTemplates||[]).find(x=>x.id===val('v6ApplyTemplate')),date=val('v6ApplyDate'),name=val('v6ApplyName');if(!t||!date||!name)return alert('請填寫名稱與日期。');var days=Number(val('v6ApplyDays')||0),start=dateAdd(date,-days),p={id:uid('proj'),name:name,stage:'planning',priority:'high',dueDate:date,brief:'由「'+t.name+'」模板建立；預計 '+start+' 開始提醒。',vendorIds:[],taskType:t.type,nextAction:t.tasks[0],reminderDays:days,templateId:t.id,createdAt:now(),updatedAt:now()};d().projects.unshift(p);t.tasks.forEach((n,i)=>d().tasks.push({id:uid('task'),name:n,projectId:p.id,eventId:'',dueDate:dateAdd(start,Math.round(days*i/Math.max(1,t.tasks.length-1))),phase:i<2?'planning':'active',status:'open',createdAt:now()}));d().routines.unshift({id:uid('routine'),name:'啟動：'+name,cycle:'once',nextDate:start,active:true,projectId:p.id,createdAt:now()});if(t.type==='booth'||t.type==='festival')d().events.unshift({id:uid('event'),name:name,type:t.type==='booth'?'booth':'festival',startDate:date,endDate:date,place:'',itemsText:'',note:'由 V6 模板建立',projectId:p.id,reminderDays:days,createdAt:now()});save('套用年度／節慶模板建立專案與提醒');app.closeModal();toast('已建立，'+start+' 開始提醒')}

function openKnowledgeReview(){var list=(d().knowledge||[]).filter(k=>k.status==='inbox').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));modal('整理經驗收集箱','可補進 SOP、廠商，或同時連結；整理後仍保留原始紀錄。','<div class="v6-banner">建議每週固定整理一次。現在有 <strong>'+list.length+'</strong> 筆待整理。</div><div class="list">'+(list.map(k=>'<div class="item"><div class="row between"><div><strong>'+esc(k.title)+'</strong><div class="meta">已放 '+age(k.createdAt||k.updatedAt)+' 天 · '+esc(String(k.text||'').slice(0,100))+'</div></div><div class="row"><button class="btn small" onclick="app.openKnowledge(\''+esc(k.id)+'\')">編輯／連結</button><button class="btn small primary" onclick="v6App.markKnowledgeSorted(\''+esc(k.id)+'\')">標為已整理</button></div></div></div>').join('')||'<div class="empty">收集箱目前已整理完成。</div>')+'</div>',true)}
function markKnowledgeSorted(id){var k=(d().knowledge||[]).find(x=>x.id===id);if(!k)return;var links=k.links||{},linked=(links.vendorIds||[]).length+(links.projectIds||[]).length+(links.sopIds||[]).length;if(!linked&&!(k.tags||[]).length)return alert('請先編輯這筆經驗，至少加入 Tag 或連結 SOP／廠商／專案，再標為已整理。');k.status='sorted';k.sortedAt=now();k.updatedAt=now();save('整理經驗收集箱');openKnowledgeReview()}

function sanitizeName(s){return String(s||'').trim().replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_')}
function openFileHelper(){modal('檔名與資料夾助手','產生一致的年度／專案／類型／版本名稱，也能直接登記到檔案中心。','<div class="form-grid"><div class="field"><label>專案</label><select id="v6FileProject" onchange="v6App.makeFileName()"><option value="">未連結</option>'+option(d().projects||[],'')+'</select></div><div class="field"><label>檔案類型</label><select id="v6FileType" onchange="v6App.makeFileName()"><option>Banner</option><option>DM</option><option>印刷完稿</option><option>官網HTML</option><option>FB貼文</option><option>照片</option><option>其他</option></select></div><div class="field"><label>版本</label><input id="v6FileVersion" value="V1" oninput="v6App.makeFileName()"></div><div class="field"><label>狀態</label><select id="v6FileStatus" onchange="v6App.makeFileName()"><option>草稿</option><option>校稿</option><option>已確認</option><option>完稿</option><option>已發布</option></select></div><div class="field"><label>副檔名</label><input id="v6FileExt" value="ai" oninput="v6App.makeFileName()"></div><div class="field"><label>存放根目錄</label><input id="v6FileRoot" value="E:\\大花農場" oninput="v6App.makeFileName()"></div></div><label>建議資料夾</label><div class="v6-code" id="v6FolderResult"></div><label>建議檔名</label><div class="v6-code" id="v6NameResult"></div><div class="modal-foot"><button class="btn" onclick="v6App.copyFileResult()">複製路徑與檔名</button><button class="btn primary" onclick="v6App.registerFile()">登記到檔案中心</button></div>');makeFileName()}
function makeFileName(){var p=project(val('v6FileProject')),name=sanitizeName(p&&p.name||'未分類'),type=sanitizeName(val('v6FileType')),version=sanitizeName(val('v6FileVersion')),status=sanitizeName(val('v6FileStatus')),ext=sanitizeName(val('v6FileExt')).replace(/^\./,''),root=val('v6FileRoot').replace(/[\\/]+$/,'');var folder=root+'\\'+today().slice(0,4)+'\\'+name+'\\'+type;var file=today().replace(/-/g,'')+'_'+name+'_'+type+'_'+version+'_'+status+'.'+ext;document.getElementById('v6FolderResult').textContent=folder;document.getElementById('v6NameResult').textContent=file}
function copyFileResult(){var text=document.getElementById('v6FolderResult').textContent+'\\'+document.getElementById('v6NameResult').textContent;navigator.clipboard&&navigator.clipboard.writeText(text);toast('已複製完整路徑')}
function registerFile(){var path=document.getElementById('v6FolderResult').textContent+'\\'+document.getElementById('v6NameResult').textContent,status=FILE_STATUS_MAP[val('v6FileStatus')]||'working';d().files.unshift({id:uid('file'),name:document.getElementById('v6NameResult').textContent,path:path,projectId:val('v6FileProject'),kind:val('v6FileType'),version:val('v6FileVersion'),status:status,note:'由 V6 檔名助手建立',createdAt:now(),updatedAt:now()});save('由檔名助手登記檔案');app.closeModal();toast('已登記到檔案中心')}

function snapshots(){try{return JSON.parse(localStorage.getItem(SNAP_KEY)||'[]')}catch(e){return[]}}
function openBackups(){var ss=snapshots(),logs=(d().activity||[]).slice(0,40);modal('備份、還原與修改紀錄','重要操作前自動保留最多 6 份本機快照；JSON 備份仍可另外下載。','<div class="row"><button class="btn primary" onclick="v6App.makeSnapshot()">立即建立快照</button><button class="btn" onclick="app.exportData()">下載完整 JSON</button><button class="btn" onclick="app.openImport()">匯入 JSON</button></div><div class="grid two" style="margin-top:14px"><div><h3>可還原快照</h3><div class="list" style="margin-top:8px">'+(ss.map((s,i)=>'<div class="item"><div class="row between"><div><strong>'+new Date(s.at).toLocaleString()+'</strong><div class="meta">'+esc(s.action)+'</div></div><button class="btn small" onclick="v6App.restoreSnapshot('+i+')">還原</button></div></div>').join('')||'<div class="empty">尚無快照。</div>')+'</div></div><div><h3>最近修改紀錄</h3><div class="list" style="margin-top:8px;max-height:460px;overflow:auto">'+logs.map(l=>'<div class="item"><strong>'+esc(l.action)+'</strong><div class="meta">'+new Date(l.at).toLocaleString()+'</div></div>').join('')+'</div></div></div>',true)}
function makeSnapshot(){var list=snapshots();list.unshift({id:uid('snap'),at:now(),action:'手動建立快照',data:JSON.parse(JSON.stringify(d()))});try{localStorage.setItem(SNAP_KEY,JSON.stringify(list.slice(0,6)));toast('快照已建立');openBackups()}catch(e){alert('本機空間不足，請先下載 JSON 備份。')}}
function restoreSnapshot(index){var s=snapshots()[index];if(!s||!confirm('確定還原到 '+new Date(s.at).toLocaleString()+'？目前資料會先被自動保留。'))return;window.v6BeforeSave(d(),'還原前自動備份');localStorage.setItem(DATA_KEY,JSON.stringify(s.data));location.reload()}

function showToday(type){var x=d(),list=[],title='';if(type==='tasks'){title='今天要處理的工作';list=(x.tasks||[]).filter(t=>{var p=project(t.projectId),active=p&&p.workflow&&p.workflow.activeRecord;return t.status!=='done'&&((t.dueDate&&dayDiff(t.dueDate)<=0)||(t.workflowGenerated&&active&&active.collection==='tasks'&&active.id===t.id))}).map(t=>({name:t.name,meta:(project(t.projectId)||{}).name||'未連結專案',action:'app.openTask(\'\',\''+esc(t.id)+'\')'}))}if(type==='confirmations'){return showTodayConfirm()}if(type==='prints'){title='需要盯的印製工單';list=(x.printWorkOrders||[]).filter(w=>w.status!=='closed'&&(w.kind==='urgent'||(w.dueDate&&dayDiff(w.dueDate)<=3))).map(w=>({name:w.title,meta:w.dueDate||'',action:'printApp.openOrder(\''+esc(w.id)+'\')'}))}if(type==='closeouts')return openCloseouts();modal(title,'從首頁直接處理，不用再逐頁尋找。','<div class="list">'+(list.map(i=>'<div class="item"><div class="row between"><div><strong>'+esc(i.name)+'</strong><div class="meta">'+esc(i.meta)+'</div></div><button class="btn" onclick="'+i.action+'">處理</button></div></div>').join('')||'<div class="empty">目前沒有項目。</div>')+'</div>',true)}
function showTodayConfirm(){var list=(d().confirmations||[]).filter(c=>!['confirmed','cancelled'].includes(c.status)).sort((a,b)=>age(b.askedAt||b.createdAt)-age(a.askedAt||a.createdAt));modal('加強版確認中心','依等待時間排序；不要讓很多「待確認」混成一團。','<div class="list">'+(list.map(c=>'<div class="item attention '+(age(c.askedAt||c.createdAt)>=7?'critical':'')+'"><div class="row between"><div><strong>'+esc(c.question)+'</strong><div class="meta">'+esc(c.person||'未指定')+' · 已等待 '+age(c.askedAt||c.createdAt)+' 天 · '+(c.nextFollowup?'下次追問 '+c.nextFollowup:'未設追問日')+'</div><div class="tags"><span class="tag gray">變更 '+Number(c.changeCount||0)+' 次</span><span class="tag blue">證據 '+(c.evidenceLinks||[]).length+' 筆</span></div></div><button class="btn" onclick="v6App.openConfirmation(\''+esc(c.id)+'\')">處理</button></div></div>').join('')||'<div class="empty">目前沒有待確認事項。</div>')+'</div>',true)}

window.v6App={migrateData:migrate,migrateLegacyImages:migrateLegacyImages,resolveLegacyImportReviews:resolveLegacyImportReviews,correctLegacyQuantities:correctLegacyQuantities,defaultWorkflowTemplates:defaultWorkflowTemplates,toggleMobileActions:toggleMobileActions,runMobileAction:runMobileAction,openHub:openHub,openAssistantIntake:openAssistantIntake,openIntake:openIntake,recommend:recommend,saveIntake:saveIntake,openConfirmation:openConfirmation,saveConfirmation:saveConfirmation,snoozeConfirm:snoozeConfirm,openCloseout:openCloseout,completeCloseout:completeCloseout,openCloseouts:openCloseouts,openSearch:openSearch,runSearch:runSearch,openResult:openResult,imgSrc:imgSrc,openVersions:openVersions,renderVersions:renderVersions,addVersion:addVersion,saveVersion:saveVersion,removeVersion:removeVersion,lightbox:lightbox,zoom:zoom,lightStep:lightStep,closeLightbox:closeLightbox,compareVersions:compareVersions,drawCompare:drawCompare,openInventory:openInventory,saveInventory:saveInventory,openQuotes:openQuotes,saveQuote:saveQuote,openTemplates:openTemplates,saveTemplateSettings:saveTemplateSettings,applyTemplate:applyTemplate,createFromTemplate:createFromTemplate,openKnowledgeReview:openKnowledgeReview,markKnowledgeSorted:markKnowledgeSorted,openFileHelper:openFileHelper,makeFileName:makeFileName,copyFileResult:copyFileResult,registerFile:registerFile,openBackups:openBackups,makeSnapshot:makeSnapshot,restoreSnapshot:restoreSnapshot,showToday:showToday,showTodayConfirm:showTodayConfirm};
app.openConfirmation=openConfirmation;app.saveConfirmation=saveConfirmation;
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();app.openCapture()}});
addChrome();migrate();obs.observe(document.getElementById('content'),{childList:true,subtree:true});enhanceDashboard();ensureLightbox();
})();
