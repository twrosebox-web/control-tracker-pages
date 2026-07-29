(function(){
'use strict';

var API_URL_KEY='creative_ops_print_api_url';
var API_TOKEN_KEY='creative_ops_print_api_token';
var PENDING_KEY='creative_ops_assistant_pending_request';
var state={busy:false,status:null,lastProposalId:'',lastPlan:null};
var d=function(){return app.getData()};
var now=function(){return new Date().toISOString()};
var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var safeId=function(value){return String(value==null?'':value).replace(/[^A-Za-z0-9_-]/g,'')};
var taipeiDay=function(value){var date=value?new Date(value):new Date();return isNaN(date.getTime())?'':new Date(date.getTime()+8*3600000).toISOString().slice(0,10)};
var apiUrl=function(){return String(localStorage.getItem(API_URL_KEY)||window.PRINT_API_URL||'').trim()};
var apiToken=function(){return String(localStorage.getItem(API_TOKEN_KEY)||window.PRINT_API_TOKEN||'').trim()};
var uid=function(prefix){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)};

function ensure(){
  var db=d();
  ['assistantMemory','assistantRuns','assistantSuggestions'].forEach(function(key){if(!Array.isArray(db[key]))db[key]=[]});
  db.settings=db.settings||{};
  db.settings.assistantConfig=Object.assign({autoApplySafe:true,proactiveDaily:true},db.settings.assistantConfig||{});
}

function toast(message,duration){
  var el=document.getElementById('toast');if(!el)return;
  el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);
  toast.timer=setTimeout(function(){el.classList.remove('show')},duration||2600);
}

function modal(title,sub,body,wide){
  var box=document.getElementById('modal');
  box.className='modal'+(wide?' wide':'');
  box.innerHTML='<div class="modal-head"><div><h2>'+esc(title)+'</h2><p>'+esc(sub||'')+'</p></div><button class="btn icon" onclick="app.requestCloseModal()">×</button></div>'+body;
  document.getElementById('modalBackdrop').classList.add('open');
}

function value(id){var el=document.getElementById(id);return el?String(el.value||'').trim():''}
function checked(id){var el=document.getElementById(id);return Boolean(el&&el.checked)}

function setBusy(busy,label){
  state.busy=busy;
  document.querySelectorAll('[data-assistant-submit]').forEach(function(button){button.disabled=busy;button.textContent=busy?(label||'處理中…'):button.dataset.idleLabel});
  var status=document.getElementById('assistantLiveStatus');if(status)status.textContent=busy?(label||'處理中…'):status.dataset.idleText||'';
}

function post(action,body,timeoutMs){
  var url=apiUrl(),token=apiToken();
  if(!url||!token)return Promise.reject(new Error('尚未設定全平台 Apps Script 網址與安全金鑰'));
  var controller=typeof AbortController!=='undefined'?new AbortController():null;
  var timer=controller?setTimeout(function(){controller.abort()},timeoutMs||90000):null;
  return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(Object.assign({action:action,token:token},body||{})),signal:controller&&controller.signal})
    .then(function(response){return response.json()})
    .then(function(result){if(!result||result.ok!==true)throw new Error(result&&result.error||'後端沒有回傳成功');return result})
    .catch(function(error){if(error&&error.name==='AbortError')throw new Error('AI 連線逾時；用相同內容重試會沿用同一請求，不會重複建立。');throw error})
    .finally(function(){if(timer)clearTimeout(timer)});
}

function syncFirst(){
  if(!window.v6Cloud)return Promise.reject(new Error('全平台同步尚未載入'));
  return v6Cloud.syncNow().then(function(result){if(!result||result.ok!==true)throw new Error(result&&result.error||'全平台資料尚未同步，已停止 AI 規劃');return result});
}

function syncAfter(){
  return window.v6Cloud?v6Cloud.syncNow().then(function(result){if(!result||result.ok!==true)throw new Error(result&&result.error||'Google 後台已處理，但前端同步失敗，請按全平台同步重試');return result}):Promise.resolve();
}

function pendingRequest(text,mode,minutes){
  var signature=[text,mode,minutes||0].join('\u0000'),saved=null;
  try{saved=JSON.parse(localStorage.getItem(PENDING_KEY)||'null')}catch(ignore){}
  if(saved&&saved.signature===signature&&Date.now()-Number(saved.at||0)<20*60*1000)return saved.id;
  var id=uid('aireq');
  localStorage.setItem(PENDING_KEY,JSON.stringify({id:id,signature:signature,at:Date.now()}));
  return id;
}

function clearPending(requestId){
  try{var saved=JSON.parse(localStorage.getItem(PENDING_KEY)||'null');if(saved&&saved.id===requestId)localStorage.removeItem(PENDING_KEY)}catch(ignore){}
}

function actionLabel(type){return({create_project:'建立專案',update_project:'更新專案',create_task:'建立工作',update_task:'更新工作',create_confirmation:'建立確認',update_confirmation:'更新確認',create_routine:'建立提醒',update_routine:'更新提醒',remember_preference:'記住偏好',suggest_focus:'空檔建議'})[type]||type}
function isMutation(action){return action&&action.type!=='suggest_focus'}
function safeAutomatic(action){return isMutation(action)&&!action.requiresConfirmation&&Number(action.confidence)>=.72&&action.type.indexOf('update_')!==0}
function incompleteAction(action){return !action||(['create_project','create_task','create_confirmation','create_routine'].indexOf(action.type)>=0&&!action.title)||(action.type==='create_routine'&&!/^\d{4}-\d{2}-\d{2}$/.test(action.date||''))||(action.type.indexOf('update_')===0&&(!action.targetId||!action.baseUpdatedAt))}
function automaticActions(actions){
  var safe=(actions||[]).filter(function(action){return safeAutomatic(action)&&!incompleteAction(action)}),ids=new Set(safe.map(function(action){return action.actionId}));
  return safe.filter(function(action){var ref=String(action.projectId||'');return ref.charAt(0)!=='@'||ids.has(ref.slice(1))});
}
function proposal(id){return(d().assistantSuggestions||[]).find(function(item){return item.id===id})}
function run(id){return(d().assistantRuns||[]).find(function(item){return item.id===id})}
function task(id){return(d().tasks||[]).find(function(item){return item.id===id})}

function ask(text,mode,minutes){
  ensure();
  text=String(text||'').trim();mode=mode||'command';minutes=Math.max(0,Math.min(480,Number(minutes)||0));
  if(state.busy)return Promise.resolve();
  if(!text&&mode!=='daily_review'){toast('請先告訴助理要處理什麼');return Promise.resolve()}
  if(!apiUrl()||!apiToken()){openSetup();return Promise.resolve()}
  var requestId=pendingRequest(text,mode,minutes);
  setBusy(true,'先同步資料…');
  return syncFirst().then(function(){
    setBusy(true,'AI 正在規劃…');
    return post('assistantPlan',{requestId:requestId,mode:mode,userText:text,availableMinutes:minutes},120000);
  }).then(function(result){
    state.lastProposalId=result.proposalId;state.lastPlan=result.plan;
    setBusy(true,'讀回 Google 後台…');
    return syncAfter().then(function(){return result});
  }).then(function(result){
    var cfg=d().settings.assistantConfig||{},safe=automaticActions(result.plan.actions||[]);
    if(mode==='command'&&cfg.autoApplySafe&&safe.length){
      setBusy(true,'正在安全套用…');
      return applyActions(result.proposalId,safe.map(function(action){return action.actionId}),true,false).then(function(){return result}).catch(function(error){result.autoApplyError=error.message;return result});
    }
    return result;
  }).then(function(result){
    if(!result.autoApplyError)clearPending(requestId);
    setBusy(false);openProposal(result.proposalId,result.plan);
    if(result.autoApplyError)toast('已保留提案，但自動套用未完成：'+result.autoApplyError,7000);
  }).catch(function(error){
    setBusy(false);toast('AI 助理：'+error.message,7000);
  });
}

function applyActions(proposalId,actionIds,automatic,confirmed){
  if(!actionIds.length)return Promise.resolve({ok:true,applied:0});
  setBusy(true,automatic?'正在安全套用…':'正在套用…');
  return post('assistantApply',{proposalId:proposalId,actionIds:actionIds,autoApply:automatic===true,confirmed:confirmed===true},90000)
    .then(function(result){return syncAfter().then(function(){var message=result.alreadyApplied?'這些動作先前已處理':Number(result.applied||0)>0?'已寫入 Google 後台：'+Number(result.applied||0)+' 筆':(result.summaries||[]).join('；')||'沒有重複新增資料';toast(message);return result})})
    .finally(function(){setBusy(false)});
}

function submit(sourceId){
  var text=value(sourceId||'assistantHomeInput');if(!text)return toast('請先輸入一句話');
  var match=text.match(/(\d{1,3})\s*(?:分(?:鐘)?|分鐘)/),freeIntent=/(?:有空|空檔|現在有|我有|還有|可以做|做什麼|幫我排|安排一下)/.test(text),minutes=match&&freeIntent?Number(match[1]||0):0;
  ask(text,minutes?'free_time':'command',minutes);
}

function freeTime(minutes){ask('我現在有 '+minutes+' 分鐘空檔，請直接告訴我最適合推進哪一項。','free_time',minutes)}
function dailyReview(){ask('請整理今天最值得推進的三件事，只做推薦，不修改資料。','daily_review',0)}

function actionHtml(action,item){
  var applied=new Set(item&&item.appliedActionIds||[]),undone=new Set(item&&item.undoneActionIds||[]),done=applied.has(action.actionId),restored=undone.has(action.actionId),incomplete=incompleteAction(action),target=action.type==='suggest_focus'?task(action.targetId):null;
  var meta=[action.date?action.date:'',action.minutes?action.minutes+' 分鐘':'',Math.round(Number(action.confidence||0)*100)+'% 信心'].filter(Boolean).join(' · ');
  var button='';
  if(action.type==='suggest_focus')button=target?'<button class="btn small primary" onclick="assistantApp.startFocus(\''+safeId(target.id)+'\','+Number(action.minutes||0)+')">開始專注</button>':'<span class="tag gray">工作已不存在</span>';
  else if(restored)button='<span class="tag gray">已復原</span>';
  else if(done)button='<span class="tag teal">已處理</span>';
  else if(incomplete)button='<button class="btn small" onclick="assistantApp.focusFollowup()">先補資料</button>';
  else button='<button class="btn small '+(action.requiresConfirmation?'':'primary')+'" onclick="assistantApp.applyOne(\''+safeId(item.id)+'\',\''+safeId(action.actionId)+'\')">'+(action.requiresConfirmation?'確認後套用':'套用')+'</button>';
  return '<div class="assistant-action '+(done?'done':'')+'"><div><div class="row"><span class="tag '+(action.requiresConfirmation?'amber':'blue')+'">'+esc(actionLabel(action.type))+'</span>'+(action.requiresConfirmation?'<span class="tag rose">需本人確認</span>':'')+'</div><strong>'+esc(action.title||(target&&target.name)||actionLabel(action.type))+'</strong><div class="meta">'+esc(meta)+'</div>'+(action.reason?'<p>'+esc(action.reason)+'</p>':'')+'</div>'+button+'</div>';
}

function proposalBody(item,planOverride){
  var plan=item&&item.plan||planOverride||state.lastPlan||{actions:[],questions:[],assumptions:[]},actions=plan.actions||[],undone=new Set(item&&item.undoneActionIds||[]),pending=actions.filter(function(action){return isMutation(action)&&(item&&item.appliedActionIds||[]).indexOf(action.actionId)<0&&!undone.has(action.actionId)&&!incompleteAction(action)}),questions=(plan.questions||[]).slice(),needsDetails=actions.some(incompleteAction);
  if(!questions.length&&needsDetails)questions.push('請補充缺少的名稱、日期或原資料資訊。');
  return '<div class="assistant-reply"><strong>'+esc(plan.summary||'助理規劃')+'</strong><p>'+esc(plan.reply||'')+'</p></div>'+
    ((plan.assumptions||[]).length?'<div class="assistant-note"><b>這次採用的假設</b><ul>'+plan.assumptions.map(function(text){return'<li>'+esc(text)+'</li>'}).join('')+'</ul></div>':'')+
    '<div class="assistant-actions">'+(actions.map(function(action){return actionHtml(action,item||{id:state.lastProposalId,appliedActionIds:[]})}).join('')||'<div class="empty">這次沒有需要新增或修改的資料。</div>')+'</div>'+
    ((questions.length||needsDetails)?'<div class="assistant-questions"><b>真的會卡住才需要補充</b>'+questions.map(function(text){return'<div>• '+esc(text)+'</div>'}).join('')+'<textarea id="assistantFollowupInput" placeholder="直接補充答案，助理會接著這份規劃重排"></textarea><button class="btn primary" onclick="assistantApp.followUp(\''+safeId(item&&item.id||state.lastProposalId)+'\')">補充後重新規劃</button></div>':'')+
    '<div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">規劃／執行紀錄</button><button class="btn" onclick="assistantApp.openMemory()">助理記憶</button>'+(pending.length?'<button class="btn primary" onclick="assistantApp.applyAllPending(\''+safeId(item&&item.id||state.lastProposalId)+'\')">確認並套用剩餘 '+pending.length+' 項</button>':'')+'<button class="btn" onclick="app.closeModal()">關閉</button></div>';
}

function openProposal(id,planOverride){
  var item=proposal(id)||{id:id,plan:planOverride,appliedActionIds:[]};
  modal('AI 工作助理','已做、待確認、建議與假設分開顯示；資料修改只會走 Google 後台交易。',proposalBody(item,planOverride),true);
}

function applyOne(proposalId,actionId){
  var item=proposal(proposalId),action=item&&item.plan&&item.plan.actions.find(function(row){return row.actionId===actionId});
  if(!action)return toast('找不到這個動作');
  if(incompleteAction(action))return focusFollowup();
  var applied=new Set(item.appliedActionIds||[]),ids=[actionId],needsConfirm=Boolean(action.requiresConfirmation),ref=String(action.projectId||'');
  if(ref.charAt(0)==='@'&&!applied.has(ref.slice(1))){var parent=item.plan.actions.find(function(row){return row.actionId===ref.slice(1)&&row.type==='create_project'});if(!parent)return toast('找不到這項工作的父專案');ids.unshift(parent.actionId);needsConfirm=needsConfirm||parent.requiresConfirmation}
  if(needsConfirm&&!confirm('這項會修改既有資料或使用了推論。確認套用「'+(action.title||actionLabel(action.type))+'」及必要的父專案？'))return;
  applyActions(proposalId,ids,false,needsConfirm).then(function(){openProposal(proposalId)}).catch(function(error){toast(error.message,7000)});
}

function applyAllPending(proposalId){
  var item=proposal(proposalId);if(!item||!item.plan)return;
  var applied=new Set(item.appliedActionIds||[]),undone=new Set(item.undoneActionIds||[]),ids=item.plan.actions.filter(function(action){return isMutation(action)&&!applied.has(action.actionId)&&!undone.has(action.actionId)&&!incompleteAction(action)}).map(function(action){return action.actionId});
  if(!ids.length)return toast('沒有待套用動作');
  if(!confirm('確認一次套用剩餘 '+ids.length+' 項？若資料已被人工修改，整批會停止，不會只做一半。'))return;
  applyActions(proposalId,ids,false,true).then(function(){openProposal(proposalId)}).catch(function(error){toast(error.message,7000)});
}

function startFocus(taskId,minutes){
  var target=task(taskId);if(!target)return toast('這項工作已不存在');
  app.closeModal();
  if(window.financeApp&&financeApp.startTask)financeApp.startTask(taskId,minutes);else app.openTask('',taskId);
}

function focusFollowup(){var field=document.getElementById('assistantFollowupInput');if(field){field.scrollIntoView({behavior:'smooth',block:'center'});field.focus()}else toast('請在提案下方補充缺少的資料')}
function followUp(proposalId){var item=proposal(proposalId),answer=value('assistantFollowupInput');if(!item||!answer)return toast('請先輸入補充答案');var questions=(item.plan&&item.plan.questions||[]).join('；')||'缺少的名稱、日期或原資料資訊',text='原始要求：'+String(item.userText||'')+'\n助理剛才需要補充：'+questions+'\n我的補充：'+answer+'\n請依補充重新規劃，沿用仍正確的部分，避免重複建立。';ask(text,'command',0)}

function open(){
  ensure();
  modal('AI 工作助理','直接說新任務、要規劃的事，或說「我有 30 分鐘」。安全新增可自動寫入；修改既有資料仍會問你。','<div class="assistant-compose"><textarea id="assistantModalInput" placeholder="例：收到中秋擺攤任務，要做兩站 Banner、手機版、FB，促銷內容要問主管，請幫我建立專案與提醒。"></textarea><button class="btn primary" data-assistant-submit data-idle-label="規劃並執行" onclick="assistantApp.submit(\'assistantModalInput\')">規劃並執行</button></div><div class="assistant-quick-times"><span>我現在有空：</span><button class="btn small" onclick="assistantApp.freeTime(15)">15 分</button><button class="btn small" onclick="assistantApp.freeTime(30)">30 分</button><button class="btn small" onclick="assistantApp.freeTime(60)">60 分</button><button class="btn small" onclick="assistantApp.freeTime(90)">90 分</button></div><div class="assistant-open-links"><button class="btn" onclick="assistantApp.dailyReview()">整理今天</button><button class="btn" onclick="assistantApp.openHistory()">執行紀錄</button><button class="btn" onclick="assistantApp.openMemory()">助理記憶</button><button class="btn" onclick="assistantApp.openSetup()">設定與用量</button></div><div class="meta" id="assistantLiveStatus" data-idle-text="API 失敗時不會修改任何資料。">API 失敗時不會修改任何資料。</div>',true);
}

function latestDaily(){var day=taipeiDay();return(d().assistantSuggestions||[]).filter(function(item){return item.mode==='daily_review'&&item.status!=='dismissed'&&taipeiDay(item.createdAt)===day}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''))})[0]}
function latestRun(){return(d().assistantRuns||[]).filter(function(item){return item.mode!=='undo'}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''))})[0]}

function cardHtml(){
  var daily=latestDaily(),last=latestRun(),status=state.status,configured=status&&status.configured;
  var latest=daily?'<button class="assistant-latest" onclick="assistantApp.openProposal(\''+safeId(daily.id)+'\')"><span class="tag brand">今日建議</span><b>'+esc(daily.plan&&daily.plan.summary||daily.reply||'查看今天建議')+'</b><span>查看 ›</span></button>':last?'<button class="assistant-latest" onclick="assistantApp.openRun(\''+safeId(last.id)+'\')"><span class="tag gray">上次執行</span><b>'+esc(last.summary||last.reply||'查看執行結果')+'</b><span>查看 ›</span></button>':'<div class="meta">第一次可以直接貼上剛收到的新任務。</div>';
  return '<section class="assistant-home" id="assistantHome"><div class="assistant-home-head"><div><div class="v6-kicker">EXECUTABLE ASSISTANT</div><h2>AI 執行助理</h2><p>讀現有專案後規劃，安全動作直接寫入 Google 後台；每次都有紀錄與復原。</p></div><button class="btn small" id="assistantStatusButton" onclick="assistantApp.openSetup()">'+(status?(configured?'● 已接 API':'○ 待設 API'):'… 檢查 API')+'</button></div><div class="assistant-home-compose"><input id="assistantHomeInput" placeholder="說新任務，或輸入：我有 30 分鐘"><button class="btn primary" data-assistant-submit data-idle-label="規劃並執行" onclick="assistantApp.submit(\'assistantHomeInput\')">規劃並執行</button></div><div class="assistant-home-shortcuts"><span>空檔：</span><button onclick="assistantApp.freeTime(15)">15 分</button><button onclick="assistantApp.freeTime(30)">30 分</button><button onclick="assistantApp.freeTime(60)">60 分</button><button onclick="assistantApp.dailyReview()">整理今天</button><button onclick="assistantApp.open()">更多</button></div>'+latest+'</section>';
}

function enhanceDashboard(){
  ensure();var title=document.getElementById('pageTitle'),content=document.getElementById('content');
  if(!title||!content||title.textContent.indexOf('首頁')<0||document.getElementById('assistantHome'))return;
  var today=document.getElementById('v6TodayBoard');
  if(today)today.insertAdjacentHTML('afterend',cardHtml());else content.insertAdjacentHTML('afterbegin',cardHtml());
}

function updateStatusDom(){
  var button=document.getElementById('assistantStatusButton');if(!button||!state.status)return;
  button.textContent=state.status.configured?'● 已接 API':'○ 待設 API';
}

function loadStatus(showToast){
  if(!apiUrl()||!apiToken()){state.status={configured:false};updateStatusDom();return Promise.resolve(state.status)}
  return post('assistantStatus',{},30000).then(function(status){state.status=status;updateStatusDom();if(showToast)toast(status.configured?'AI API 已設定：'+status.model:'Apps Script 已連線，但還沒放 OPENAI_API_KEY');return status}).catch(function(error){state.status=null;if(showToast)toast(error.message,6500);return null});
}

function openSetup(){
  ensure();var s=state.status,cfg=d().settings.assistantConfig||{},connected=s&&s.configured;
  modal('AI 助理設定與真實狀態','OpenAI 金鑰只存在 Apps Script Script Properties；本頁與 GitHub 都看不到金鑰。','<div class="assistant-status-grid"><div class="stat '+(connected?'teal':'amber')+'"><strong>'+(connected?'已設定':'待設定')+'</strong><span>OpenAI API</span></div><div class="stat blue"><strong>'+esc(s&&s.model||'尚未讀取')+'</strong><span>使用模型</span></div><div class="stat"><strong>'+Number(s&&s.callsToday||0)+' / '+Number(s&&s.dailyCallLimit||40)+'</strong><span>今日呼叫</span></div><div class="stat '+(s&&s.dailyTriggerEnabled?'teal':'')+'"><strong>'+(s&&s.dailyTriggerEnabled?'已啟用':'未啟用')+'</strong><span>每日主動整理</span></div></div>'+(!connected?'<div class="notice" style="margin-top:14px"><b>只差一個設定：</b>在 Apps Script 左側「專案設定」→「指令碼屬性」新增 <code>OPENAI_API_KEY</code>，值貼你的 API key；儲存後回本頁按「重新檢查」。若剛更新過 Code.gs，才需要把 Web App 管理部署更新為新版本。</div>':'')+'<div class="assistant-setting-list"><label class="check"><input id="assistantAutoSafe" type="checkbox" '+(cfg.autoApplySafe?'checked':'')+'>安全的「新增專案／工作／確認／提醒」可自動套用</label><div class="meta">更新既有資料、低信心內容仍一定要你確認；刪除、結案、發布、財務、送印永遠不交給 AI。</div></div><div class="assistant-setting-list"><b>每日主動整理</b><div class="meta">約每天 08:00（台北時間）產生三項工作建議，使用 1 次 API；不寄 Email、不對外發布。</div><button class="btn" onclick="assistantApp.toggleDaily('+(s&&s.dailyTriggerEnabled?'false':'true')+')">'+(s&&s.dailyTriggerEnabled?'停用每日整理':'啟用每日整理')+'</button></div><div class="modal-foot"><button class="btn" onclick="printApp.configureApi(false)">全平台連線設定</button><button class="btn" onclick="assistantApp.loadStatus(true)">重新檢查</button><button class="btn primary" onclick="assistantApp.saveConfig()">儲存設定</button></div>',true);
  var setupFoot=document.querySelector('#modal .modal-foot');
  if(setupFoot)setupFoot.classList.add('assistant-modal-foot');
}

function saveConfig(){d().settings.assistantConfig.autoApplySafe=checked('assistantAutoSafe');app.saveData('更新 AI 助理安全自動設定');app.closeModal();toast('AI 助理設定已儲存')}
function toggleDaily(enabled){
  if(enabled&&!confirm('啟用後，Apps Script 每天約 08:00 會自動使用 1 次 OpenAI API，產生站內工作建議。確定啟用？'))return;
  setBusy(true,'更新排程…');post('assistantDailyTrigger',{enabled:enabled},45000).then(function(result){state.status=result;return syncAfter()}).then(function(){setBusy(false);openSetup();toast(enabled?'每日主動整理已啟用':'每日主動整理已停用')}).catch(function(error){setBusy(false);toast(error.message,7000)});
}

function openHistory(){
  var runs=(d().assistantRuns||[]).slice(0,80).map(function(item){return{kind:'run',item:item,at:item.createdAt||''}}),proposals=(d().assistantSuggestions||[]).filter(function(item){var total=item.plan&&item.plan.actions&&item.plan.actions.length||0;return !item.runIds||!item.runIds.length||(item.appliedActionIds||[]).length<total}).slice(0,80).map(function(item){return{kind:'proposal',item:item,at:item.createdAt||''}}),entries=runs.concat(proposals).sort(function(a,b){return String(b.at).localeCompare(String(a.at))}).slice(0,60);
  modal('AI 規劃與執行紀錄','只有建議、尚待補充、部分套用與實際寫入都能回來繼續。','<div class="list">'+(entries.map(function(entry){var item=entry.item,count=Number(item.appliedCount||0),isProposal=entry.kind==='proposal',title=isProposal?(item.plan&&item.plan.summary||item.userText||'AI 規劃'):(item.mode==='undo'?'復原 AI 修改':item.summary||item.userText||'AI 執行'),meta=isProposal?'規劃 · '+Number(item.plan&&item.plan.actions&&item.plan.actions.length||0)+' 個動作':'執行 · '+count+' 筆寫入 · '+String(item.model||''),label=isProposal?(item.status==='undone'?'已復原':'待續處理'):(item.status==='undone'?'已復原':item.feedback&&item.feedback.rating==='helpful'?'有幫助':'查看'),fn=isProposal?'openProposal':'openRun';return'<button class="item assistant-history" onclick="assistantApp.'+fn+'(\''+safeId(item.id)+'\')"><div><strong>'+esc(title)+'</strong><div class="meta">'+esc(new Date(item.createdAt||Date.now()).toLocaleString('zh-TW'))+' · '+esc(meta)+'</div></div><span class="tag '+(label==='已復原'?'gray':label==='有幫助'?'teal':'blue')+'">'+esc(label)+'</span></button>'}).join('')||'<div class="empty">尚無 AI 規劃或執行紀錄。</div>')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.open()">返回助理</button></div>',true);
}

function openRun(id){
  var item=run(id);if(!item)return toast('找不到執行紀錄');
  var changes=item.changes||[];
  modal('AI 執行紀錄','這是實際寫入 Google 後台的結果，不是聊天紀錄。','<div class="assistant-reply"><strong>'+esc(item.summary||item.userText||'AI 執行')+'</strong><p>'+esc(item.reply||'')+'</p></div><div class="assistant-run-meta"><span>時間：'+esc(new Date(item.createdAt||Date.now()).toLocaleString('zh-TW'))+'</span><span>模型：'+esc(item.model||'—')+'</span><span>Token：'+Number(item.usage&&item.usage.totalTokens||0)+'</span><span>狀態：'+esc(item.status||'—')+'</span></div><div class="list">'+(changes.map(function(change){var after=change.after||{};return'<div class="item"><strong>'+esc(actionLabel((item.actions||[]).find(function(a){return a.actionId===change.actionId})?.type||change.collection))+'：'+esc(after.name||after.question||after.key||change.id)+'</strong><div class="meta">'+esc(change.collection)+' / '+esc(change.id)+'</div></div>'}).join('')||(item.summaries||[]).map(function(text){return'<div class="item"><strong>'+esc(text)+'</strong></div>'}).join('')||'<div class="empty">這次只有建議，沒有修改資料。</div>')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">返回紀錄</button>'+(item.mode!=='undo'?'<button class="btn" onclick="assistantApp.feedback(\''+safeId(item.id)+'\',\'helpful\')">有幫助</button><button class="btn" onclick="assistantApp.feedback(\''+safeId(item.id)+'\',\'not_helpful\')">不適合（說原因）</button>':'')+(item.status==='applied'&&changes.length?'<button class="btn danger" onclick="assistantApp.undo(\''+safeId(item.id)+'\')">復原這次修改</button>':'')+'</div>',true);
}

function feedback(runId,rating){var note='';if(rating==='not_helpful'){note=prompt('哪裡不適合？寫一句就好，之後助理會把這個修正帶入規劃。','') ;if(note===null)return}post('assistantFeedback',{runId:runId,rating:rating,note:note},45000).then(function(){return syncAfter()}).then(function(){openRun(runId);toast(rating==='helpful'?'已記住這次做法有幫助':'已記錄不適合的原因')}).catch(function(error){toast(error.message,7000)})}
function undo(runId){
  if(!confirm('只復原這次 AI 改過的資料。若之後曾人工修改同一筆，系統會衝突停止。確定復原？'))return;
  setBusy(true,'正在安全復原…');post('assistantUndo',{runId:runId},90000).then(function(result){return syncAfter().then(function(){return result})}).then(function(result){setBusy(false);openRun(runId);toast('已復原 '+Number(result.restored||0)+' 筆 AI 修改')}).catch(function(error){setBusy(false);toast(error.message,7000)});
}

function openMemory(){
  var memories=(d().assistantMemory||[]).slice().sort(function(a,b){return Number(b.active)-Number(a.active)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))});
  modal('助理記憶','這不是 AI 自己改程式；只是每次規劃前讀取你核准的長期偏好。可隨時啟用或停用。','<div class="list">'+(memories.map(function(memory){return'<div class="item"><div class="row between"><div><strong>'+esc(memory.key)+'</strong><div class="meta">'+esc(memory.value)+'</div><div class="tags"><span class="tag '+(memory.active?'teal':'gray')+'">'+(memory.active?'使用中':memory.status==='candidate'?'候選':'已停用')+'</span><span class="tag gray">信心 '+Math.round(Number(memory.confidence||0)*100)+'%</span></div></div><button class="btn small" onclick="assistantApp.toggleMemory(\''+safeId(memory.id)+'\','+(!memory.active)+')">'+(memory.active?'停用':'啟用')+'</button></div></div>'}).join('')||'<div class="empty">尚無長期偏好。你可以對助理說「記住：活動 Banner 要提前 14 天開始」。</div>')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.open()">返回助理</button></div>',true);
}

function toggleMemory(id,active){setBusy(true,'更新助理記憶…');post('assistantMemorySet',{memoryId:id,active:active},45000).then(function(){return syncAfter()}).then(function(){setBusy(false);openMemory();toast(active?'這項偏好會用於之後規劃':'這項偏好已停用')}).catch(function(error){setBusy(false);toast(error.message,7000)})}

function addChrome(){
  var side=document.querySelector('aside .side-actions');if(!side||document.getElementById('assistantSide'))return;
  side.insertAdjacentHTML('beforebegin','<div class="nav-group" id="assistantSide"><div class="nav-label">智慧協作</div><button class="nav" onclick="assistantApp.open()">✦　AI 執行助理</button></div>');
}

window.assistantApp={open:open,submit:submit,ask:ask,freeTime:freeTime,dailyReview:dailyReview,openProposal:openProposal,applyOne:applyOne,applyAllPending:applyAllPending,startFocus:startFocus,focusFollowup:focusFollowup,followUp:followUp,openSetup:openSetup,saveConfig:saveConfig,toggleDaily:toggleDaily,loadStatus:loadStatus,openHistory:openHistory,openRun:openRun,feedback:feedback,undo:undo,openMemory:openMemory,toggleMemory:toggleMemory};
ensure();addChrome();
var observer=new MutationObserver(function(){setTimeout(enhanceDashboard,0)});observer.observe(document.getElementById('content'),{childList:true,subtree:false});
setTimeout(function(){enhanceDashboard();loadStatus(false)},1200);
})();
