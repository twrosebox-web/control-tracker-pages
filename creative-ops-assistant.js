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
  ['assistantMemory','assistantRuns','assistantSuggestions','assistantPlanningSessions'].forEach(function(key){if(!Array.isArray(db[key]))db[key]=[]});
  db.settings=db.settings||{};
  db.settings.assistantConfig=Object.assign({autoApplySafe:false,proactiveDaily:true},db.settings.assistantConfig||{});
  db.settings.assistantConfig.autoApplySafe=false;
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
function incompleteAction(action){return !action||(['create_project','create_task','create_confirmation','create_routine'].indexOf(action.type)>=0&&!action.title)||(action.type==='create_routine'&&!/^\d{4}-\d{2}-\d{2}$/.test(action.date||''))||(action.type.indexOf('update_')===0&&(!action.targetId||!action.baseUpdatedAt))}
function proposal(id){return(d().assistantSuggestions||[]).find(function(item){return item.id===id})}
function run(id){return(d().assistantRuns||[]).find(function(item){return item.id===id})}
function task(id){return(d().tasks||[]).find(function(item){return item.id===id})}
function project(id){return(d().projects||[]).find(function(item){return item.id===id})}
function planningSession(id){return(d().assistantPlanningSessions||[]).find(function(item){return item.id===id})}
function sessionForProposal(item){return item&&item.planningSessionId?planningSession(item.planningSessionId):null}
function phaseLabel(value){return({make:'製作',review:'確認／校稿',publish:'發布／交付',closeout:'收尾'})[value]||'製作'}
function questionPrompt(question){return typeof question==='string'?question:String(question&&question.prompt||'')}

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
    clearPending(requestId);
    setBusy(false);openProposal(result.proposalId,result.plan);
  }).catch(function(error){
    setBusy(false);toast('AI 助理：'+error.message,7000);
  });
}

function interview(text,targetMode,targetProjectId,planningSessionId,answerText){
  ensure();
  text=String(text||'').trim();answerText=String(answerText||'').trim();targetMode=targetMode||'new_project';targetProjectId=String(targetProjectId||'');
  var currentSession=planningSessionId?planningSession(planningSessionId):null;
  if(state.busy)return Promise.resolve();
  if(!planningSessionId&&!text){toast('請先描述剛收到的任務');return Promise.resolve()}
  if(planningSessionId&&!answerText&&!text){toast('請先補充答案或修改要求');return Promise.resolve()}
  if(targetMode==='existing_project'&&!targetProjectId){openExisting();return Promise.resolve()}
  if(!apiUrl()||!apiToken()){openSetup();return Promise.resolve()}
  var signature=[planningSessionId||'',targetMode,targetProjectId,text,answerText].join('\u0000');
  var requestId=pendingRequest(signature,'interview',0),turnId=requestId;
  setBusy(true,'先同步最新資料…');
  return syncFirst().then(function(){
    if(planningSessionId)currentSession=planningSession(planningSessionId);
    setBusy(true,planningSessionId?'助理正在重排任務表…':'助理正在理解任務…');
    return post('assistantPlan',{requestId:requestId,turnId:turnId,mode:'interview',planningSessionId:planningSessionId||'',expectedSessionVersion:Number(currentSession&&currentSession.version||0),targetMode:targetMode,targetProjectId:targetProjectId,userText:text,answerText:answerText},120000);
  }).then(function(result){
    state.lastProposalId=result.proposalId;state.lastPlan=result.plan;
    return syncAfter().then(function(){return result});
  }).then(function(result){
    clearPending(requestId);setBusy(false);openProposal(result.proposalId,result.plan);
  }).catch(function(error){setBusy(false);toast('AI 訪談：'+error.message,7000)});
}

function applyActions(proposalId,actionIds,automatic,confirmed,expectedSessionVersion){
  if(!actionIds.length)return Promise.resolve({ok:true,applied:0});
  setBusy(true,automatic?'正在安全套用…':'正在套用…');
  return post('assistantApply',{proposalId:proposalId,actionIds:actionIds,autoApply:automatic===true,confirmed:confirmed===true,expectedSessionVersion:Number(expectedSessionVersion||0)},90000)
    .then(function(result){return syncAfter().then(function(){var message=result.alreadyApplied?'這些動作先前已處理':Number(result.applied||0)>0?'已寫入 Google 後台：'+Number(result.applied||0)+' 筆':(result.summaries||[]).join('；')||'沒有重複新增資料';toast(message);return result})})
    .finally(function(){setBusy(false)});
}

function submit(sourceId){
  var text=value(sourceId||'assistantHomeInput');if(!text)return toast('請先輸入一句話');
  var match=text.match(/(\d{1,3})\s*(?:分(?:鐘)?|分鐘)/),freeIntent=/(?:有空|空檔|現在有|我有|還有|可以做|做什麼|幫我排|安排一下)/.test(text),minutes=match&&freeIntent?Number(match[1]||0):0;
  if(minutes)ask(text,'free_time',minutes);else interview(text,'new_project','');
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

function interviewQuestionHtml(question,index){
  question=question&&typeof question==='object'?question:{prompt:question};
  var options=(question.options||[]).map(function(option){return'<button type="button" class="btn small" data-value="'+esc(option)+'" onclick="assistantApp.pickAnswer(this)">'+esc(option)+'</button>'}).join('');
  return '<div class="assistant-question-card"><div><span class="tag '+(question.required?'rose':'gray')+'">'+(question.required?'關鍵問題':'可稍後補')+'</span><b>'+(index+1)+'. '+esc(question.prompt||'')+'</b></div>'+(question.reason?'<p>'+esc(question.reason)+'</p>':'')+(options?'<div class="assistant-question-options">'+options+'</div>':'')+'</div>';
}

function draftTaskRowHtml(action,index,readOnly){
  action=action||{actionId:'',type:'create_task',title:'',detail:'',date:'',phase:'make',minutes:0};
  var current=action.type==='update_task'?task(action.targetId):null;
  var disabled=readOnly?' disabled':'';
  var before=current?'<div class="assistant-before">目前：'+esc(current.name||'未命名')+(current.dueDate?' · '+esc(current.dueDate):'')+(current.phase?' · '+esc(phaseLabel(current.phase)):'')+'</div>':'';
  return '<div class="assistant-task-row" data-action-id="'+esc(action.actionId||'')+'"><div class="assistant-task-kind"><span class="tag '+(action.type==='update_task'?'amber':'blue')+'">'+(action.type==='update_task'?'更新':'新增')+'</span><span>'+(index+1)+'</span></div><label>工作<input class="assistant-task-title" value="'+esc(action.title||'')+'" placeholder="要完成的工作"'+disabled+'></label><label>階段<select class="assistant-task-phase"'+disabled+'><option value="make" '+(action.phase==='make'?'selected':'')+'>製作</option><option value="review" '+(action.phase==='review'?'selected':'')+'>確認／校稿</option><option value="publish" '+(action.phase==='publish'?'selected':'')+'>發布／交付</option><option value="closeout" '+(action.phase==='closeout'?'selected':'')+'>收尾</option></select></label><label>日期<input class="assistant-task-date" type="date" value="'+esc(action.date||'')+'"'+disabled+'></label><label>分鐘<input class="assistant-task-minutes" type="number" min="0" max="480" step="5" value="'+Number(action.minutes||0)+'"'+disabled+'></label><label class="assistant-task-detail-label">交付內容／注意事項<input class="assistant-task-detail" value="'+esc(action.detail||'')+'" placeholder="規格、確認點或完成標準"'+disabled+'></label>'+(readOnly?'<span class="tag gray">已寫入</span>':'<button type="button" class="btn small danger" onclick="assistantApp.removeDraftRow(this)">移除草稿列</button>')+before+'</div>';
}

function interviewOtherActionHtml(action){
  var current=action.type==='update_project'?project(action.targetId):action.type==='update_confirmation'?(d().confirmations||[]).find(function(item){return item.id===action.targetId}):action.type==='update_routine'?(d().routines||[]).find(function(item){return item.id===action.targetId}):null;
  var before=current?'<div class="assistant-before">目前：'+esc(current.name||current.question||'')+(current.dueDate||current.nextDate||current.nextFollowup?' · '+esc(current.dueDate||current.nextDate||current.nextFollowup):'')+'</div>':'';
  var detail=action.detail?'<div class="assistant-action-detail">'+(action.type==='remember_preference'?'<b>記憶內容：</b> ':'')+esc(action.detail)+'</div>':'';
  return '<div class="assistant-other-action"><span class="tag '+(action.type.indexOf('update_')===0?'amber':'blue')+'">'+esc(actionLabel(action.type))+'</span><div><strong>'+esc(action.title||actionLabel(action.type))+'</strong><div class="meta">'+esc([action.date,action.person,action.reason].filter(Boolean).join(' · '))+'</div>'+detail+before+'</div></div>';
}

function interviewProposalBody(item,plan){
  var session=sessionForProposal(item)||{},questions=plan.questions||[],isCurrent=!session.currentProposalId||session.currentProposalId===item.id,status=isCurrent?(session.status||item.status||''):'superseded',version=Number(item.sessionVersion||session.version||1);
  var memoryNames=(plan.usedMemoryIds||[]).map(function(id){var memory=(d().assistantMemory||[]).find(function(row){return row.id===id});return memory&&memory.key}).filter(Boolean);
  var statusLabel=status==='gathering'?'訪談中':status==='applied'?'已寫入':status==='superseded'?'舊版':status==='discarded'?'已放棄':status==='no_action'||plan.decision==='no_action'?'不需變更':'任務表草稿';
  var intro='<div class="assistant-reply"><div class="row between"><strong>'+esc(plan.summary||'任務訪談')+'</strong><span class="tag '+(status==='gathering'?'amber':status==='applied'?'teal':statusLabel==='不需變更'||status==='superseded'||status==='discarded'?'gray':'blue')+'">第 '+version+' 版 · '+statusLabel+'</span></div><p>'+esc(plan.reply||'')+'</p></div>'+
    ((plan.assumptions||[]).length?'<div class="assistant-note"><b>目前先採用的假設</b><ul>'+plan.assumptions.map(function(text){return'<li>'+esc(text)+'</li>'}).join('')+'</ul></div>':'')+
    (memoryNames.length?'<div class="assistant-memory-used"><b>本次採用 '+memoryNames.length+' 條已核准記憶：</b> '+memoryNames.map(esc).join('、')+'</div>':'');
  if(!isCurrent&&(plan.decision==='ask'||questions.length))return intro+'<div class="assistant-question-list">'+questions.map(interviewQuestionHtml).join('')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">返回紀錄</button><button class="btn primary" onclick="assistantApp.openProposal(\''+safeId(session.currentProposalId||'')+'\')">查看最新版</button></div>';
  if(plan.decision==='ask'||questions.length){
    return intro+'<div class="assistant-interview-step"><h3>先確認這些，再替你排任務</h3><p class="meta">不知道也可以寫「不知道／之後補」，助理會改成待確認，不會一直卡住。</p><div class="assistant-question-list">'+questions.map(interviewQuestionHtml).join('')+'</div><textarea id="assistantFollowupInput" placeholder="依序回答即可，也可以補充新的要求"></textarea><div class="assistant-question-actions"><button class="btn" onclick="assistantApp.pauseInterview(\''+safeId(item.id)+'\')">稍後再繼續</button><button class="btn primary" data-assistant-submit data-idle-label="送出答案" onclick="assistantApp.continueInterview(\''+safeId(item.id)+'\')">送出答案</button></div></div><div class="modal-foot assistant-modal-foot"><button class="btn danger" onclick="assistantApp.discardInterview(\''+safeId(item.id)+'\')">放棄這份訪談</button><button class="btn" onclick="assistantApp.openHistory()">訪談／任務表紀錄</button><button class="btn" onclick="assistantApp.closeInterview(\''+safeId(item.id)+'\')">關閉</button></div>';
  }
  var taskActions=(plan.actions||[]).filter(function(action){return action.type==='create_task'||action.type==='update_task'}),otherActions=(plan.actions||[]).filter(function(action){return action.type!=='create_task'&&action.type!=='update_task'&&action.type!=='suggest_focus'});
  var projectAction=otherActions.find(function(action){return action.type==='create_project'||action.type==='update_project'}),targetProject=projectAction&&projectAction.type==='update_project'?project(projectAction.targetId):project(session.targetProjectId);
  var changedTaskIds=new Set(taskActions.filter(function(action){return action.type==='update_task'}).map(function(action){return action.targetId}));
  var unchangedTasks=session.targetMode==='existing_project'?(d().tasks||[]).filter(function(row){return row.projectId===session.targetProjectId&&row.status!=='done'&&!changedTaskIds.has(row.id)}):[];
  var counts={create:0,update:0,keep:unchangedTasks.length};(plan.actions||[]).forEach(function(action){if(action.type.indexOf('create_')===0||action.type==='remember_preference')counts.create++;if(action.type.indexOf('update_')===0)counts.update++});
  var readOnly=status==='applied'||!isCurrent;
  var taskTable='<div class="assistant-draft-head"><div><h3>'+(status==='applied'?'已寫入任務表':!isCurrent?'舊版任務表':'可編輯任務表')+'</h3><p class="meta">'+(status==='applied'?'這是當時確認並寫入的內容。':!isCurrent?'這一版只供追溯，請到最新版修改。':'先修改草稿；儲存新版本後，最後確認才會寫進正式專案。')+'</p></div>'+(readOnly?'':'<button class="btn small" onclick="assistantApp.addDraftRow()">＋新增工作列</button>')+'</div><div class="assistant-task-table" id="assistantDraftTable">'+taskActions.map(function(action,index){return draftTaskRowHtml(action,index,readOnly)}).join('')+'</div>';
  var projectSummary='<div class="assistant-project-summary"><span class="tag brand">'+(session.targetMode==='existing_project'?'更新既有專案':'建立新專案')+'</span><div><strong>'+esc(projectAction&&projectAction.title||targetProject&&targetProject.name||'待建立專案')+'</strong><div class="meta">'+esc([projectAction&&projectAction.date,projectAction&&projectAction.nextAction].filter(Boolean).join(' · '))+'</div></div><div class="assistant-change-count"><b>'+counts.create+'</b> 新增　<b>'+counts.update+'</b> 更新'+(session.targetMode==='existing_project'?'　<b>'+counts.keep+'</b> 保持不變':'')+'</div></div>';
  var unchangedHtml=unchangedTasks.length?'<div class="assistant-unchanged"><h3>保持不變的現有工作</h3><div class="tags">'+unchangedTasks.slice(0,8).map(function(row){return'<span class="tag gray">'+esc(row.name||'未命名工作')+'</span>'}).join('')+(unchangedTasks.length>8?'<span class="tag gray">另 '+(unchangedTasks.length-8)+' 項</span>':'')+'</div></div>':'';
  var others=otherActions.filter(function(action){return action!==projectAction}).map(interviewOtherActionHtml).join('');
  if(!isCurrent)return intro+projectSummary+taskTable+unchangedHtml+(others?'<div class="assistant-related-actions"><h3>當時的確認、提醒與專案變更</h3>'+others+'</div>':'')+'<div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">返回紀錄</button><button class="btn primary" onclick="assistantApp.openProposal(\''+safeId(session.currentProposalId||'')+'\')">查看最新版</button></div>';
  var replan='<div class="assistant-replan"><label>'+(plan.decision==='no_action'?'如果仍要調整，請補充變更':'還要怎麼調整？')+'</label><textarea id="assistantFollowupInput" placeholder="例：兩個官網拆開、FB 提前兩天、手機版先取消"></textarea><button class="btn" data-assistant-submit data-idle-label="請助理重新整理" onclick="assistantApp.continueInterview(\''+safeId(item.id)+'\')">請助理重新整理</button></div>';
  if(plan.decision==='no_action')return intro+projectSummary+unchangedHtml+'<div class="empty">這次沒有需要新增或更新的正式資料。</div>'+replan+'<div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">返回紀錄</button><button class="btn" onclick="app.closeModal()">關閉</button></div>';
  return intro+projectSummary+taskTable+unchangedHtml+(others?'<div class="assistant-related-actions"><h3>確認、提醒與專案變更</h3>'+others+'</div>':'')+(status==='applied'?'':replan)+'<div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">稍後再繼續</button>'+(status==='applied'?'<button class="btn" onclick="assistantApp.openRun(\''+safeId(session.appliedRunId||'')+'\')">查看寫入結果</button>':'<button class="btn" data-assistant-submit data-idle-label="儲存草稿修改" onclick="assistantApp.saveDraft(\''+safeId(item.id)+'\')">儲存草稿修改</button><button class="btn primary" data-assistant-submit data-idle-label="確認這份任務表" onclick="assistantApp.confirmInterview(\''+safeId(item.id)+'\')">確認這份任務表</button>')+'<button class="btn" onclick="app.closeModal()">關閉</button></div>';
}

function proposalBody(item,planOverride){
  var plan=item&&item.plan||planOverride||state.lastPlan||{actions:[],questions:[],assumptions:[]},actions=plan.actions||[],undone=new Set(item&&item.undoneActionIds||[]),pending=actions.filter(function(action){return isMutation(action)&&(item&&item.appliedActionIds||[]).indexOf(action.actionId)<0&&!undone.has(action.actionId)&&!incompleteAction(action)}),questions=(plan.questions||[]).slice(),needsDetails=actions.some(incompleteAction);
  if(Number(item&&item.schemaVersion||plan.schemaVersion||1)>=2)return interviewProposalBody(item,plan);
  if(!questions.length&&needsDetails)questions.push('請補充缺少的名稱、日期或原資料資訊。');
  return '<div class="assistant-reply"><strong>'+esc(plan.summary||'助理規劃')+'</strong><p>'+esc(plan.reply||'')+'</p></div>'+
    ((plan.assumptions||[]).length?'<div class="assistant-note"><b>這次採用的假設</b><ul>'+plan.assumptions.map(function(text){return'<li>'+esc(text)+'</li>'}).join('')+'</ul></div>':'')+
    '<div class="assistant-actions">'+(actions.map(function(action){return actionHtml(action,item||{id:state.lastProposalId,appliedActionIds:[]})}).join('')||'<div class="empty">這次沒有需要新增或修改的資料。</div>')+'</div>'+
    ((questions.length||needsDetails)?'<div class="assistant-questions"><b>真的會卡住才需要補充</b>'+questions.map(function(text){return'<div>• '+esc(text)+'</div>'}).join('')+'<textarea id="assistantFollowupInput" placeholder="直接補充答案，助理會接著這份規劃重排"></textarea><button class="btn primary" onclick="assistantApp.followUp(\''+safeId(item&&item.id||state.lastProposalId)+'\')">補充後重新規劃</button></div>':'')+
    '<div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">規劃／執行紀錄</button><button class="btn" onclick="assistantApp.openMemory()">助理記憶</button>'+(pending.length?'<button class="btn primary" onclick="assistantApp.applyAllPending(\''+safeId(item&&item.id||state.lastProposalId)+'\')">確認並套用剩餘 '+pending.length+' 項</button>':'')+'<button class="btn" onclick="app.closeModal()">關閉</button></div>';
}

function openProposal(id,planOverride){
  var item=proposal(id)||{id:id,plan:planOverride,appliedActionIds:[]};
  var isInterview=Number(item.schemaVersion||item.plan&&item.plan.schemaVersion||1)>=2;
  modal(isInterview?'AI 專案訪談與任務表':'AI 工作助理',isInterview?'先理解、再共同調整；只有最後確認才會寫入 Google 後台。':'已做、待確認、建議與假設分開顯示；資料修改只會走 Google 後台交易。',proposalBody(item,planOverride),true);
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

function pickAnswer(button){var field=document.getElementById('assistantFollowupInput'),answer=button&&button.dataset&&button.dataset.value||'';if(!field||!answer)return;field.value=[field.value.trim(),answer].filter(Boolean).join('；');field.focus()}
function continueInterview(proposalId){
  var item=proposal(proposalId),session=sessionForProposal(item),answer=value('assistantFollowupInput');
  if(!item||!session)return toast('找不到這場訪談，請從紀錄重新開啟');
  if(!answer)return toast('請先輸入答案或修改要求');
  interview('',session.targetMode,session.targetProjectId,session.id,answer);
}
function removeDraftRow(button){var row=button&&button.closest('.assistant-task-row');if(row)row.remove()}
function addDraftRow(){var table=document.getElementById('assistantDraftTable');if(!table)return;var count=table.querySelectorAll('.assistant-task-row').length;table.insertAdjacentHTML('beforeend',draftTaskRowHtml(null,count))}
function collectDraftRows(){return Array.from(document.querySelectorAll('#assistantDraftTable .assistant-task-row')).map(function(row){return{actionId:row.dataset.actionId||'',include:true,title:String((row.querySelector('.assistant-task-title')||{}).value||'').trim(),detail:String((row.querySelector('.assistant-task-detail')||{}).value||'').trim(),date:(row.querySelector('.assistant-task-date')||{}).value||'',phase:(row.querySelector('.assistant-task-phase')||{}).value||'make',minutes:Number((row.querySelector('.assistant-task-minutes')||{}).value||0)}})}
function proposalTaskRows(item){return(item&&item.plan&&item.plan.actions||[]).filter(function(action){return action.type==='create_task'||action.type==='update_task'}).map(function(action){return{actionId:action.actionId||'',include:true,title:String(action.title||'').trim(),detail:String(action.detail||'').trim(),date:action.date||'',phase:action.phase||'make',minutes:Number(action.minutes||0)}})}
function draftRowsChanged(item){return Boolean(document.getElementById('assistantDraftTable'))&&JSON.stringify(collectDraftRows())!==JSON.stringify(proposalTaskRows(item))}
function saveDraft(proposalId,afterSave){
  var item=proposal(proposalId),session=sessionForProposal(item),taskRows=collectDraftRows();
  if(!item||!session)return toast('找不到這份任務表');
  if(!taskRows.length&&!confirm('這會移除草稿中的所有工作列；專案、確認或提醒仍會保留。確定？'))return;
  setBusy(true,'正在驗證任務表…');
  return post('assistantRevise',{proposalId:proposalId,expectedSessionVersion:Number(session.version||0),taskRows:taskRows},60000).then(function(result){return syncAfter().then(function(){return result})}).then(function(result){setBusy(false);if(afterSave==='history')openHistory();else openProposal(result.proposalId,result.plan);toast('任務表已儲存為第 '+Number(result.planningSession&&result.planningSession.version||0)+' 版');return result}).catch(function(error){setBusy(false);toast(error.message,7000)});
}
function pauseInterview(proposalId){var item=proposal(proposalId),answer=value('assistantFollowupInput');if(item&&draftRowsChanged(item)){if(confirm('這份任務表有尚未儲存的修改。按「確定」先儲存新版並稍後繼續；按「取消」留在這裡。'))saveDraft(proposalId,'history');return}if(answer&&!confirm('剛輸入但尚未送出的文字不會保留。確定先離開？'))return;openHistory()}
function closeInterview(proposalId){var item=proposal(proposalId),answer=value('assistantFollowupInput');if((item&&draftRowsChanged(item)||answer)&&!confirm('這個畫面有尚未儲存或送出的內容。確定放棄這些輸入並關閉？'))return;app.closeModal()}
function discardInterview(proposalId){var item=proposal(proposalId),session=sessionForProposal(item);if(!item||!session)return toast('找不到這份訪談');if(!confirm('確定放棄這份訪談？正式專案資料不會被刪除，訪談紀錄仍留在歷史中。'))return;setBusy(true,'正在放棄訪談…');post('assistantSessionDiscard',{planningSessionId:session.id,expectedSessionVersion:Number(session.version||0)},45000).then(function(){return syncAfter()}).then(function(){setBusy(false);openHistory();toast('已放棄這份訪談')}).catch(function(error){setBusy(false);toast(error.message,7000)})}
function confirmInterview(proposalId){
  var item=proposal(proposalId),session=sessionForProposal(item),actions=item&&item.plan&&item.plan.actions||[],ids=actions.filter(isMutation).map(function(action){return action.actionId});
  if(!item||!session)return toast('找不到這份任務表');
  if(session.status==='applied')return toast('這份任務表已經寫入');
  if(draftRowsChanged(item)){toast('你剛修改了任務表；請先按「儲存草稿修改」，查看新版本後再確認。',6000);return}
  if(!ids.length)return toast('這份草稿沒有可寫入的工作');
  var creates=actions.filter(function(action){return action.type.indexOf('create_')===0||action.type==='remember_preference'}).length,updates=actions.filter(function(action){return action.type.indexOf('update_')===0}).length;
  if(!confirm('確認正式寫入這份任務表？\n新增 '+creates+' 項、更新 '+updates+' 項。若任何既有資料已被人工修改，整批會停止。'))return;
  applyActions(proposalId,ids,false,true,session.version).then(function(result){if(result.runId)openRun(result.runId);else openProposal(proposalId)}).catch(function(error){toast(error.message,7000)});
}

function openNew(){
  ensure();
  modal('收到新任務','先把原話貼進來。助理會先讀 SOP 與既有資料、詢問關鍵問題，再和你共同整理任務表。','<div class="assistant-new-task"><label>剛收到什麼任務？</label><textarea id="assistantNewInput" placeholder="例：中秋活動要做兩個官網 Banner、FB，促銷內容還沒確認。"></textarea><div class="notice">這一步只建立可續接的訪談紀錄；正式專案與工作仍是 0 寫入。</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" data-assistant-submit data-idle-label="開始整理" onclick="assistantApp.startNew()">開始整理</button></div></div>',true);
}
function startNew(){var text=value('assistantNewInput')||value('assistantHomeInput');if(!text)return toast('請先描述剛收到的任務');interview(text,'new_project','')}
function activeProjects(){return(d().projects||[]).filter(function(item){return item&&item.stage!=='closed'}).sort(function(a,b){return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))})}
function renderProjectChoices(query){
  var list=document.getElementById('assistantProjectChoices'),selected=document.getElementById('assistantSelectedProject');if(!list)return;
  query=String(query==null?value('assistantProjectSearch'):query).trim().toLocaleLowerCase();
  var choices=activeProjects().filter(function(item){return !query||String(item.name||'').toLocaleLowerCase().indexOf(query)>=0||String(item.brief||'').toLocaleLowerCase().indexOf(query)>=0}).slice(0,12);
  list.innerHTML=choices.map(function(item){return'<button type="button" class="assistant-project-choice '+(state.selectedProjectId===item.id?'selected':'')+'" onclick="assistantApp.selectProject(\''+safeId(item.id)+'\')"><strong>'+esc(item.name||'未命名專案')+'</strong><span>'+esc([item.stage,item.dueDate,item.nextAction].filter(Boolean).join(' · ')||'尚未填下一步')+'</span></button>'}).join('')||'<div class="empty">找不到符合的進行中專案。</div>';
  var target=project(state.selectedProjectId);if(selected)selected.innerHTML=target?'<span class="tag teal">已選定</span><strong>'+esc(target.name)+'</strong><span class="meta">'+esc(target.nextAction||target.brief||'')+'</span>':'<span class="meta">請先選一個專案，助理不會依相似名稱自行猜。</span>';
}
function selectProject(id){state.selectedProjectId=id;renderProjectChoices()}
function openExisting(projectId){
  ensure();state.selectedProjectId=projectId&&project(projectId)?projectId:'';
  modal('更新既有專案','先精確選定專案，再說這次需求改了什麼；助理會顯示新增、更新與保持不變。','<div class="assistant-project-picker"><label>搜尋進行中的專案</label><input id="assistantProjectSearch" placeholder="輸入專案名稱" oninput="assistantApp.renderProjectChoices(this.value)"><div id="assistantSelectedProject" class="assistant-selected-project"></div><div id="assistantProjectChoices" class="assistant-project-choices"></div><label>這次有哪些新增或變更？</label><textarea id="assistantExistingInput" placeholder="例：追加 DM；兩站上線日期改到 8/20，其他工作保持不變。"></textarea><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="app.closeModal()">取消</button><button class="btn primary" data-assistant-submit data-idle-label="開始整理變更" onclick="assistantApp.startExisting()">開始整理變更</button></div></div>',true);
  setTimeout(function(){renderProjectChoices('')},0);
}
function startExisting(){var target=project(state.selectedProjectId),text=value('assistantExistingInput');if(!target)return toast('請先精確選定一個專案');if(!text)return toast('請描述這次新增或變更的需求');interview(text,'existing_project',target.id)}
function openExistingFromProject(id){if(app.requestCloseModal&&app.requestCloseModal()===false)return;openExisting(id)}
function openFreeTime(){modal('我有空檔','只推薦現有、未完成且現在能開始的工作；不修改任何專案資料。','<div class="assistant-free-time-grid"><button class="btn" onclick="assistantApp.freeTime(15)">15 分鐘</button><button class="btn" onclick="assistantApp.freeTime(30)">30 分鐘</button><button class="btn" onclick="assistantApp.freeTime(60)">60 分鐘</button><button class="btn" onclick="assistantApp.freeTime(90)">90 分鐘</button></div><div class="modal-foot"><button class="btn" onclick="assistantApp.dailyReview()">整理今天三件事</button><button class="btn" onclick="app.closeModal()">關閉</button></div>',true)}
function open(){
  ensure();
  modal('AI 專案規劃助理','先選你現在要做的事。新任務與既有專案都會先訪談、共同整理任務表，再由你確認寫入。','<div class="assistant-intent-grid"><button onclick="assistantApp.openNew()"><b>＋ 收到新任務</b><span>先理解與詢問，再建立任務表</span></button><button onclick="assistantApp.openExisting()"><b>↻ 更新既有專案</b><span>選定專案後顯示修改差異</span></button><button onclick="assistantApp.openFreeTime()"><b>◷ 我有空檔</b><span>從現有工作推薦可立即執行項目</span></button></div><div class="assistant-open-links"><button class="btn" onclick="assistantApp.openHistory()">訪談／任務表紀錄</button><button class="btn" onclick="assistantApp.openMemory()">助理記憶</button><button class="btn" onclick="assistantApp.openSetup()">設定與用量</button></div><div class="meta" id="assistantLiveStatus" data-idle-text="訪談未確認前，正式專案資料不會被修改。">訪談未確認前，正式專案資料不會被修改。</div>',true);
}

function latestDaily(){var day=taipeiDay();return(d().assistantSuggestions||[]).filter(function(item){return item.mode==='daily_review'&&item.status!=='dismissed'&&taipeiDay(item.createdAt)===day}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''))})[0]}
function latestRun(){return(d().assistantRuns||[]).filter(function(item){return item.mode!=='undo'}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''))})[0]}

function cardHtml(){
  var daily=latestDaily(),last=latestRun(),status=state.status,configured=status&&status.configured;
  var sessions=(d().assistantPlanningSessions||[]).filter(function(item){return['gathering','draft_ready'].indexOf(item.status)>=0&&item.currentProposalId}).sort(function(a,b){return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))});
  var resume=sessions.length?'<button class="assistant-latest" onclick="assistantApp.openProposal(\''+safeId(sessions[0].currentProposalId)+'\')"><span class="tag '+(sessions[0].status==='gathering'?'amber':'blue')+'">'+(sessions[0].status==='gathering'?'待繼續訪談':'任務表待確認')+'</span><b>'+esc(sessions[0].originalInput||'繼續上一份任務表')+'</b><span>共 '+sessions.length+' 份 ›</span></button>':'';
  var latest=!resume?(daily?'<button class="assistant-latest" onclick="assistantApp.openProposal(\''+safeId(daily.id)+'\')"><span class="tag brand">今日建議</span><b>'+esc(daily.plan&&daily.plan.summary||daily.reply||'查看今天建議')+'</b><span>查看 ›</span></button>':last?'<button class="assistant-latest" onclick="assistantApp.openRun(\''+safeId(last.id)+'\')"><span class="tag gray">上次執行</span><b>'+esc(last.summary||last.reply||'查看執行結果')+'</b><span>查看 ›</span></button>':''):'';
  return '<section class="assistant-home" id="assistantHome"><div class="assistant-home-head"><div><div class="v6-kicker">PROJECT INTERVIEW ASSISTANT</div><h2>AI 專案規劃助理</h2><p>先理解與詢問，再共同整理任務表；最後由你確認才寫入。</p></div><button class="btn small" id="assistantStatusButton" onclick="assistantApp.openSetup()">'+(status?(configured?'● 已接 API':'○ 待設 API'):'… 檢查 API')+'</button></div><div class="assistant-home-intents"><button onclick="assistantApp.openNew()"><b>＋ 收到新任務</b><span>建立訪談</span></button><button onclick="assistantApp.openExisting()"><b>↻ 更新既有專案</b><span>顯示差異</span></button><button onclick="assistantApp.openFreeTime()"><b>◷ 我有空檔</b><span>推薦工作</span></button></div><div class="assistant-home-compose"><input id="assistantHomeInput" placeholder="也可以直接貼上剛收到的任務"><button class="btn primary" data-assistant-submit data-idle-label="開始整理" onclick="assistantApp.submit(\'assistantHomeInput\')">開始整理</button></div>'+resume+latest+'<div class="assistant-home-shortcuts"><button onclick="assistantApp.openHistory()">全部訪談／任務表</button><button onclick="assistantApp.openMemory()">助理記憶</button><button onclick="assistantApp.open()">更多</button></div></section>';
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
  ensure();var s=state.status,connected=s&&s.configured;
  modal('AI 助理設定與真實狀態','OpenAI 金鑰只存在 Apps Script Script Properties；本頁與 GitHub 都看不到金鑰。','<div class="assistant-status-grid"><div class="stat '+(connected?'teal':'amber')+'"><strong>'+(connected?'已設定':'待設定')+'</strong><span>OpenAI API</span></div><div class="stat blue"><strong>'+esc(s&&s.model||'尚未讀取')+'</strong><span>使用模型</span></div><div class="stat"><strong>'+Number(s&&s.callsToday||0)+' / '+Number(s&&s.dailyCallLimit||40)+'</strong><span>今日呼叫</span></div><div class="stat '+(s&&s.dailyTriggerEnabled?'teal':'')+'"><strong>'+(s&&s.dailyTriggerEnabled?'已啟用':'未啟用')+'</strong><span>每日主動整理</span></div></div>'+(!connected?'<div class="notice" style="margin-top:14px"><b>只差一個設定：</b>在 Apps Script 左側「專案設定」→「指令碼屬性」新增 <code>OPENAI_API_KEY</code>，值貼你的 API key；儲存後回本頁按「重新檢查」。若剛更新過 Code.gs，才需要把 Web App 管理部署更新為新版本。</div>':'')+'<div class="assistant-setting-list"><b>訪談保護：已固定啟用</b><div class="meta">訪談與草稿階段正式資料一律 0 寫入；只有按「確認這份任務表」才會整批套用。刪除、結案、發布、財務、送印與對外通知永遠不交給 AI。</div></div><div class="assistant-setting-list"><b>每日主動整理</b><div class="meta">約每天 08:00（台北時間）產生三項工作建議，使用 1 次 API；不寄 Email、不對外發布。</div><button class="btn" onclick="assistantApp.toggleDaily('+(s&&s.dailyTriggerEnabled?'false':'true')+')">'+(s&&s.dailyTriggerEnabled?'停用每日整理':'啟用每日整理')+'</button></div><div class="modal-foot"><button class="btn" onclick="printApp.configureApi(false)">全平台連線設定</button><button class="btn" onclick="assistantApp.loadStatus(true)">重新檢查</button><button class="btn primary" onclick="app.closeModal()">完成</button></div>',true);
  var setupFoot=document.querySelector('#modal .modal-foot');
  if(setupFoot)setupFoot.classList.add('assistant-modal-foot');
}

function saveConfig(){d().settings.assistantConfig.autoApplySafe=false;app.saveData('維持 AI 訪談確認保護');app.closeModal();toast('訪談確認保護已啟用')}
function toggleDaily(enabled){
  if(enabled&&!confirm('啟用後，Apps Script 每天約 08:00 會自動使用 1 次 OpenAI API，產生站內工作建議。確定啟用？'))return;
  setBusy(true,'更新排程…');post('assistantDailyTrigger',{enabled:enabled},45000).then(function(result){state.status=result;return syncAfter()}).then(function(){setBusy(false);openSetup();toast(enabled?'每日主動整理已啟用':'每日主動整理已停用')}).catch(function(error){setBusy(false);toast(error.message,7000)});
}

function openHistory(){
  var currentProposalIds=new Set((d().assistantPlanningSessions||[]).map(function(session){return session.currentProposalId}).filter(Boolean));
  var runs=(d().assistantRuns||[]).slice(0,80).map(function(item){return{kind:'run',item:item,at:item.createdAt||''}}),proposals=(d().assistantSuggestions||[]).filter(function(item){var total=item.plan&&item.plan.actions&&item.plan.actions.length||0;if(Number(item.schemaVersion||1)>=2)return currentProposalIds.has(item.id);return !item.runIds||!item.runIds.length||(item.appliedActionIds||[]).length<total}).slice(0,80).map(function(item){return{kind:'proposal',item:item,at:item.updatedAt||item.createdAt||''}}),entries=runs.concat(proposals).sort(function(a,b){return String(b.at).localeCompare(String(a.at))}).slice(0,60);
  modal('AI 訪談、任務表與執行紀錄','訪談中、任務表待確認與實際寫入分開保存，可隨時回來繼續。','<div class="list">'+(entries.map(function(entry){var item=entry.item,count=Number(item.appliedCount||0),isProposal=entry.kind==='proposal',session=isProposal?sessionForProposal(item):null,title=isProposal?(item.plan&&item.plan.summary||item.userText||'AI 規劃'):(item.mode==='undo'?'復原 AI 修改':item.summary||item.userText||'AI 執行'),meta=isProposal?(Number(item.schemaVersion||1)>=2?'任務表第 '+Number(session&&session.version||item.sessionVersion||1)+' 版':'規劃 · '+Number(item.plan&&item.plan.actions&&item.plan.actions.length||0)+' 個動作'):'執行 · '+count+' 筆寫入 · '+String(item.model||''),label=isProposal?(session&&session.status==='gathering'?'待繼續訪談':session&&session.status==='draft_ready'?'任務表待確認':session&&session.status==='applied'?'已寫入':item.status==='undone'?'已復原':'待續處理'):(item.status==='undone'?'已復原':item.feedback&&item.feedback.rating==='helpful'?'有幫助':'查看'),fn=isProposal?'openProposal':'openRun';return'<button class="item assistant-history" onclick="assistantApp.'+fn+'(\''+safeId(item.id)+'\')"><div><strong>'+esc(title)+'</strong><div class="meta">'+esc(new Date(item.updatedAt||item.createdAt||Date.now()).toLocaleString('zh-TW'))+' · '+esc(meta)+'</div></div><span class="tag '+(label==='已復原'?'gray':label==='有幫助'||label==='已寫入'?'teal':label==='待繼續訪談'?'amber':'blue')+'">'+esc(label)+'</span></button>'}).join('')||'<div class="empty">尚無 AI 訪談或執行紀錄。</div>')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.open()">返回助理</button></div>',true);
}

function openRun(id){
  var item=run(id);if(!item)return toast('找不到執行紀錄');
  var changes=item.changes||[];
  modal('AI 執行紀錄','這是實際寫入 Google 後台的結果，不是聊天紀錄。','<div class="assistant-reply"><strong>'+esc(item.summary||item.userText||'AI 執行')+'</strong><p>'+esc(item.reply||'')+'</p></div><div class="assistant-run-meta"><span>時間：'+esc(new Date(item.createdAt||Date.now()).toLocaleString('zh-TW'))+'</span><span>模型：'+esc(item.model||'—')+'</span><span>Token：'+Number(item.usage&&item.usage.totalTokens||0)+'</span><span>狀態：'+esc(item.status||'—')+'</span></div><div class="list">'+(changes.map(function(change){var after=change.after||{};return'<div class="item"><strong>'+esc(actionLabel((item.actions||[]).find(function(a){return a.actionId===change.actionId})?.type||change.collection))+'：'+esc(after.name||after.question||after.key||change.id)+'</strong><div class="meta">'+esc(change.collection)+' / '+esc(change.id)+'</div></div>'}).join('')||(item.summaries||[]).map(function(text){return'<div class="item"><strong>'+esc(text)+'</strong></div>'}).join('')||'<div class="empty">這次只有建議，沒有修改資料。</div>')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.openHistory()">返回紀錄</button>'+(item.mode!=='undo'?'<button class="btn" onclick="assistantApp.feedback(\''+safeId(item.id)+'\',\'helpful\')">有幫助</button><button class="btn" onclick="assistantApp.feedback(\''+safeId(item.id)+'\',\'not_helpful\')">不適合（說原因）</button>':'')+(item.status==='applied'&&changes.length?'<button class="btn danger" onclick="assistantApp.undo(\''+safeId(item.id)+'\')">復原這次修改</button>':'')+'</div>',true);
}

function feedback(runId,rating){var note='';if(rating==='not_helpful'){note=prompt('哪裡不適合？寫一句就好；若本次用了某條記憶，會先暫停並改回候選。','') ;if(note===null)return}post('assistantFeedback',{runId:runId,rating:rating,note:note},45000).then(function(){return syncAfter()}).then(function(){openRun(runId);toast(rating==='helpful'?'已記錄這份規劃有幫助':'已記錄原因並檢查本次使用的記憶')}).catch(function(error){toast(error.message,7000)})}
function undo(runId){
  if(!confirm('只復原這次 AI 改過的資料。若之後曾人工修改同一筆，系統會衝突停止。確定復原？'))return;
  setBusy(true,'正在安全復原…');post('assistantUndo',{runId:runId},90000).then(function(result){return syncAfter().then(function(){return result})}).then(function(result){setBusy(false);openRun(runId);toast('已復原 '+Number(result.restored||0)+' 筆 AI 修改')}).catch(function(error){setBusy(false);toast(error.message,7000)});
}

function openMemory(){
  var memories=(d().assistantMemory||[]).slice().sort(function(a,b){return Number(b.active)-Number(a.active)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))});
  modal('助理記憶','「學習」是可管理的流程偏好，不是 AI 自行改程式。每條都有適用範圍、來源與停用開關。','<div class="list">'+(memories.map(function(memory){var scope=memory.scopeKind||memory.scope||'global',scopeLabel=scope==='project'?'專案：'+((project(memory.scopeId)||{}).name||memory.scopeId):scope==='website'?'指定官網':scope==='vendor'?'指定廠商':scope==='project_type'?'工作類型':'全平台';return'<div class="item"><div class="row between"><div><strong>'+esc(memory.key)+'</strong><div class="meta">'+esc(memory.value)+'</div><div class="tags"><span class="tag '+(memory.active?'teal':memory.status==='candidate'?'amber':'gray')+'">'+(memory.active?'使用中':memory.status==='candidate'?'候選':'已停用')+'</span><span class="tag gray">'+esc(scopeLabel)+'</span><span class="tag gray">'+(memory.sourceKind==='explicit'?'你明確交代':'從回饋整理')+'</span><span class="tag gray">證據 '+Number(memory.supportCount||memory.evidenceCount||1)+' 次</span></div></div><button class="btn small" onclick="assistantApp.toggleMemory(\''+safeId(memory.id)+'\','+(!memory.active)+')">'+(memory.active?'停用':'啟用')+'</button></div></div>'}).join('')||'<div class="empty">尚無長期偏好。你可以在訪談中說「記住：活動 Banner 要提前 14 天開始」。</div>')+'</div><div class="modal-foot assistant-modal-foot"><button class="btn" onclick="assistantApp.open()">返回助理</button></div>',true);
}

function toggleMemory(id,active){setBusy(true,'更新助理記憶…');post('assistantMemorySet',{memoryId:id,active:active},45000).then(function(){return syncAfter()}).then(function(){setBusy(false);openMemory();toast(active?'這項偏好會用於之後規劃':'這項偏好已停用')}).catch(function(error){setBusy(false);toast(error.message,7000)})}

function addChrome(){
  var side=document.querySelector('aside .side-actions');if(!side||document.getElementById('assistantSide'))return;
  side.insertAdjacentHTML('beforebegin','<div class="nav-group" id="assistantSide"><div class="nav-label">智慧協作</div><button class="nav" onclick="assistantApp.open()">✦　AI 專案規劃助理</button></div>');
}

var priorOpenProject=app.openProject;
app.openProject=function(id){
  priorOpenProject(id);
  setTimeout(function(){
    if(!id||document.getElementById('assistantProjectEntry'))return;
    var form=document.querySelector('#modal > .form-grid');if(!form)return;
    form.insertAdjacentHTML('afterend','<div class="assistant-project-entry" id="assistantProjectEntry"><div><b>需求有變？讓 AI 重新整理這個專案的任務表</b><span>會先顯示新增／更新差異，不會直接改資料。</span></div><button type="button" class="btn" onclick="assistantApp.openExistingFromProject(\''+safeId(id)+'\')">✦ 更新任務表</button></div>');
  },0);
};

window.assistantApp={open:open,openNew:openNew,startNew:startNew,openExisting:openExisting,startExisting:startExisting,openExistingFromProject:openExistingFromProject,renderProjectChoices:renderProjectChoices,selectProject:selectProject,openFreeTime:openFreeTime,submit:submit,ask:ask,interview:interview,freeTime:freeTime,dailyReview:dailyReview,openProposal:openProposal,applyOne:applyOne,applyAllPending:applyAllPending,startFocus:startFocus,focusFollowup:focusFollowup,followUp:followUp,pickAnswer:pickAnswer,continueInterview:continueInterview,removeDraftRow:removeDraftRow,addDraftRow:addDraftRow,saveDraft:saveDraft,confirmInterview:confirmInterview,openSetup:openSetup,saveConfig:saveConfig,toggleDaily:toggleDaily,loadStatus:loadStatus,openHistory:openHistory,openRun:openRun,feedback:feedback,undo:undo,openMemory:openMemory,toggleMemory:toggleMemory};
ensure();addChrome();
var observer=new MutationObserver(function(){setTimeout(enhanceDashboard,0)});observer.observe(document.getElementById('content'),{childList:true,subtree:false});
setTimeout(function(){enhanceDashboard();loadStatus(false)},1200);
})();
