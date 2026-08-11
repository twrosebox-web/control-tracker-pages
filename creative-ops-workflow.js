(function(){
'use strict';

var v6=window.v6App;
if(typeof app==='undefined'||!v6)return;

var TYPES={general:'一般美編',booth:'擺攤／展售',festival:'年度／節慶',website:'官網維護',print:'印刷／包材',social:'FB／社群'};
var KINDS={task:'工作',confirmation:'待確認',routine:'提醒',event:'活動紀錄'};
var PHASES={make:'製作',review:'確認',publish:'發布／交付',closeout:'收尾／留存'};
var TRIGGERS={sequence:'接續上一步',weekly:'每週指定日',interval:'距上次完成 N 個月',countdown:'活動前 N 天'};
var WEEKDAYS=['週日','週一','週二','週三','週四','週五','週六'];
var TERMINAL_CONFIRM=new Set(['confirmed','cancelled']);
var draft=null;

function db(){return app.getData()}
function now(){return new Date().toISOString()}
function today(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10)}
function uid(prefix){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function clone(value){return JSON.parse(JSON.stringify(value))}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function val(id){var el=document.getElementById(id);return el?el.value.trim():''}
function dayDiff(date){return date?Math.ceil((new Date(date+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000):9999}
function dateAdd(date,days){var x=new Date((date||today())+'T12:00:00');x.setDate(x.getDate()+Number(days||0));return x.toISOString().slice(0,10)}
function monthAddClamped(date,months){
  var source=new Date((date||today())+'T12:00:00'),day=source.getDate();
  source.setDate(1);source.setMonth(source.getMonth()+Number(months||0));
  var last=new Date(source.getFullYear(),source.getMonth()+1,0).getDate();
  source.setDate(Math.min(day,last));
  return source.toISOString().slice(0,10);
}
function nextWeekday(date,weekday){
  var source=new Date((date||today())+'T12:00:00'),wanted=Math.max(0,Math.min(6,Number(weekday)||0));
  source.setDate(source.getDate()+(wanted-source.getDay()+7)%7);
  return source.toISOString().slice(0,10);
}
function save(action){return app.saveData(action)}
function toast(text){var el=document.getElementById('toast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('show')},2600)}

function defaults(){return typeof v6.defaultWorkflowTemplates==='function'?v6.defaultWorkflowTemplates():[]}
function defaultById(id){return defaults().find(function(t){return t.id===id})}
function projection(template){return (template.steps||[]).map(function(step){return step.title})}
function normalizedStep(step,index,templateId){
  step=step||{};
  var trigger=TRIGGERS[step.trigger]?step.trigger:'sequence';
  return {
    id:String(step.id||templateId+'_s'+(index+1)),
    title:String(step.title||'').trim(),
    kind:KINDS[step.kind]?step.kind:'task',
    phase:PHASES[step.phase]?step.phase:'make',
    trigger:trigger,
    weekday:Math.max(0,Math.min(6,Number(step.weekday)==step.weekday?Number(step.weekday):1)),
    intervalMonths:Math.max(1,Number(step.intervalMonths)||1),
    daysBefore:Math.max(0,Number(step.daysBefore)||0),
    note:String(step.note||'').trim()
  };
}
function normalizeTemplate(template,index){
  template=template||{};
  var id=String(template.id||uid('tpl')),built=defaultById(id),source=built&&Number(template.schemaVersion||0)<2?built.steps:(Array.isArray(template.steps)&&template.steps.length?template.steps:(Array.isArray(template.tasks)?template.tasks.map(function(title,i){return {id:id+'_s'+(i+1),title:title,kind:'task',phase:i===0?'review':'make',trigger:'sequence'}}):[]));
  var out={
    id:id,
    name:String(template.name||('未命名模板 '+(index+1))).trim(),
    type:TYPES[template.type]?template.type:'general',
    builtIn:Boolean(template.builtIn||built),
    schemaVersion:2,
    steps:source.map(function(step,i){return normalizedStep(step,i,id)}),
    updatedAt:template.updatedAt||''
  };
  out.tasks=projection(out);
  return out;
}
function migrateTemplates(persist){
  var data=db();data.workflowTemplates=Array.isArray(data.workflowTemplates)?data.workflowTemplates:[];
  if(!data.workflowTemplates.length)data.workflowTemplates=defaults();
  var before=JSON.stringify(data.workflowTemplates),seen=new Set();
  data.workflowTemplates=data.workflowTemplates.map(normalizeTemplate).filter(function(template){if(seen.has(template.id))return false;seen.add(template.id);return true});
  var changed=before!==JSON.stringify(data.workflowTemplates);
  if(changed&&persist!==false)save('升級可編輯流程模板並保留 AI 投影');
  return changed;
}

function triggerText(step){
  if(step.trigger==='weekly')return '每週 '+WEEKDAYS[step.weekday];
  if(step.trigger==='interval')return '距上次完成 '+step.intervalMonths+' 個月';
  if(step.trigger==='countdown')return '活動前 '+step.daysBefore+' 天';
  return '完成上一步後接續';
}
function templateSummary(template){return (template.steps||[]).map(function(step){return step.title+'｜'+triggerText(step)}).join('\n')}

function openTemplates(){
  migrateTemplates(false);
  var list=db().workflowTemplates||[],missing=defaults().filter(function(def){return !list.some(function(t){return t.id===def.id})});
  var cards=list.map(function(t){return '<article class="v6-template-card"><div class="row between"><div><strong>'+esc(t.name)+'</strong><div class="meta">'+esc(TYPES[t.type]||t.type)+' · '+t.steps.length+' 個步驟'+(t.builtIn?' · 內建':' · 自訂')+'</div></div><div class="row"><button class="btn small" onclick="v6Workflow.copyTemplate(\''+esc(t.id)+'\')">複製</button><button class="btn small" onclick="v6Workflow.openTemplateEditor(\''+esc(t.id)+'\')">編輯</button><button class="btn small primary" onclick="v6Workflow.applyTemplate(\''+esc(t.id)+'\')">套用</button></div></div><ol class="v6-template-preview">'+t.steps.slice(0,6).map(function(step){return '<li><span>'+esc(step.title)+'</span><small>'+esc(triggerText(step))+'</small></li>'}).join('')+(t.steps.length>6?'<li class="meta">還有 '+(t.steps.length-6)+' 步</li>':'')+'</ol></article>'}).join('');
  app.openModal('流程模板','模板可以新增、複製、排序與自由修改；套用後只建立目前這一步，不會一次塞滿整批工作。','<div class="v6-template-toolbar"><button class="btn primary" onclick="v6Workflow.openTemplateEditor()">＋ 新增模板</button><button class="btn" onclick="v6Workflow.resetBuiltIns()">還原內建模板</button></div>'+(missing.length?'<div class="notice">有 '+missing.length+' 個內建模板目前被刪除，可用「還原內建模板」找回。</div>':'')+'<div class="v6-template-list">'+(cards||'<div class="empty">目前沒有模板。</div>')+'</div><div class="modal-foot"><button class="btn" onclick="app.closeModal()">關閉</button></div>',true);
}
function readDraft(){
  if(!draft)return;
  draft.name=val('v6TplName');draft.type=val('v6TplType')||draft.type;
  draft.steps.forEach(function(step,index){
    step.title=val('v6TplTitle_'+index);step.kind=val('v6TplKind_'+index)||step.kind;step.phase=val('v6TplPhase_'+index)||step.phase;step.trigger=val('v6TplTrigger_'+index)||step.trigger;step.weekday=Number(val('v6TplWeekday_'+index)||0);step.intervalMonths=Math.max(1,Number(val('v6TplInterval_'+index)||1));step.daysBefore=Math.max(0,Number(val('v6TplCountdown_'+index)||0));step.note=val('v6TplNote_'+index);
  });
}
function selectOptions(values,selected){return Object.keys(values).map(function(key){return '<option value="'+key+'" '+(key===selected?'selected':'')+'>'+esc(values[key])+'</option>'}).join('')}
function stepEditor(step,index){
  return '<article class="v6-step-editor" data-step-index="'+index+'"><div class="v6-step-number">'+(index+1)+'</div><div class="v6-step-fields"><div class="field full"><label>步驟名稱 *</label><input id="v6TplTitle_'+index+'" maxlength="160" value="'+esc(step.title)+'" placeholder="例：確認規格與上次注意事項"></div><div class="v6-step-grid"><div class="field"><label>紀錄類型</label><select id="v6TplKind_'+index+'">'+selectOptions(KINDS,step.kind)+'</select></div><div class="field"><label>工作階段</label><select id="v6TplPhase_'+index+'">'+selectOptions(PHASES,step.phase)+'</select></div><div class="field"><label>觸發方式</label><select id="v6TplTrigger_'+index+'" onchange="v6Workflow.updateTriggerFields('+index+')">'+selectOptions(TRIGGERS,step.trigger)+'</select></div></div><div class="v6-trigger-config" id="v6TplConfig_'+index+'"><div class="field v6-weekly-field"><label>星期</label><select id="v6TplWeekday_'+index+'">'+WEEKDAYS.map(function(label,i){return '<option value="'+i+'" '+(i===step.weekday?'selected':'')+'>'+label+'</option>'}).join('')+'</select></div><div class="field v6-interval-field"><label>間隔月數</label><input id="v6TplInterval_'+index+'" type="number" min="1" max="120" value="'+step.intervalMonths+'"></div><div class="field v6-countdown-field"><label>活動前幾天</label><input id="v6TplCountdown_'+index+'" type="number" min="0" max="730" value="'+step.daysBefore+'"></div></div><div class="field full"><label>注意事項</label><textarea id="v6TplNote_'+index+'" maxlength="500" placeholder="執行這一步時要注意什麼">'+esc(step.note)+'</textarea></div></div><div class="v6-step-actions"><button class="btn small" onclick="v6Workflow.moveStep('+index+',-1)" '+(index===0?'disabled':'')+'>↑</button><button class="btn small" onclick="v6Workflow.moveStep('+index+',1)" '+(index===draft.steps.length-1?'disabled':'')+'>↓</button><button class="btn small danger" onclick="v6Workflow.removeStep('+index+')">刪除</button></div></article>';
}
function renderTemplateEditor(markDirty){
  var existing=(db().workflowTemplates||[]).some(function(t){return t.id===draft.id});
  var body='<input id="v6TemplateDirty" type="hidden" value=""><div class="form-grid"><div class="field"><label>模板名稱 *</label><input id="v6TplName" maxlength="100" value="'+esc(draft.name)+'"></div><div class="field"><label>用途</label><select id="v6TplType">'+selectOptions(TYPES,draft.type)+'</select></div></div><div class="v6-editor-help">每個專案只會啟動目前一步；完成後才產生下一筆。週期或倒數尚未到期時，只顯示預定日期。</div><div class="v6-step-list">'+draft.steps.map(stepEditor).join('')+'</div><button class="btn" onclick="v6Workflow.addStep()">＋ 新增步驟</button><div class="modal-foot">'+(existing?'<button class="btn danger" onclick="v6Workflow.deleteTemplate(\''+esc(draft.id)+'\')">刪除模板</button>':'')+'<button class="btn" onclick="v6Workflow.returnToTemplates()">返回</button><button class="btn primary" onclick="v6Workflow.saveTemplate()">儲存模板</button></div>';
  app.openModal(existing?'編輯模板':'新增模板','觸發方式可混用：接續、每週、間隔月數或活動倒數。',body,true);
  draft.steps.forEach(function(_,index){updateTriggerFields(index)});
  if(markDirty){var marker=document.getElementById('v6TemplateDirty');if(marker)marker.value='changed'}
}
function openTemplateEditor(id){
  var source=id?(db().workflowTemplates||[]).find(function(t){return t.id===id}):null;
  draft=source?clone(source):normalizeTemplate({id:uid('tpl'),name:'新流程模板',type:'general',steps:[{title:'第一個可執行步驟',kind:'task',phase:'make',trigger:'sequence'}]},0);
  renderTemplateEditor(false);
}
function updateTriggerFields(index){
  var trigger=val('v6TplTrigger_'+index),box=document.getElementById('v6TplConfig_'+index);if(!box)return;
  box.querySelector('.v6-weekly-field').hidden=trigger!=='weekly';box.querySelector('.v6-interval-field').hidden=trigger!=='interval';box.querySelector('.v6-countdown-field').hidden=trigger!=='countdown';
}
function rerenderTemplateEditor(){app.closeModal(true);renderTemplateEditor(true)}
function addStep(){readDraft();if(draft.steps.length>=30)return alert('每個模板最多 30 個步驟，避免專案與雲端紀錄過大。');draft.steps.push(normalizedStep({id:uid('step'),title:'',kind:'task',phase:'make',trigger:'sequence'},draft.steps.length,draft.id));rerenderTemplateEditor()}
function moveStep(index,direction){readDraft();var target=index+direction;if(target<0||target>=draft.steps.length)return;var moved=draft.steps.splice(index,1)[0];draft.steps.splice(target,0,moved);rerenderTemplateEditor()}
function removeStep(index){readDraft();if(draft.steps.length===1)return alert('模板至少要保留一個步驟。');draft.steps.splice(index,1);rerenderTemplateEditor()}
function validateTemplate(template){
  if(!template.name)return '請填寫模板名稱。';if(template.name.length>100)return '模板名稱不可超過 100 字。';if(!template.steps.length)return '模板至少要有一個步驟。';if(template.steps.length>30)return '每個模板最多 30 個步驟。';
  for(var i=0;i<template.steps.length;i++){var step=template.steps[i];if(!step.title)return '第 '+(i+1)+' 步缺少步驟名稱。';if(step.title.length>160)return '第 '+(i+1)+' 步名稱不可超過 160 字。';if(step.note.length>500)return '第 '+(i+1)+' 步注意事項不可超過 500 字。';if(step.trigger==='interval'&&step.intervalMonths<1)return '第 '+(i+1)+' 步的間隔月數至少為 1。';if(step.trigger==='countdown'&&step.daysBefore<0)return '第 '+(i+1)+' 步的倒數天數不可小於 0。'}
  if(JSON.stringify(template).length>30000)return '模板內容過大；請縮短注意事項或減少步驟。';
  return '';
}
function saveTemplate(){
  readDraft();draft=normalizeTemplate(draft,0);var error=validateTemplate(draft);if(error)return alert(error);
  draft.tasks=projection(draft);draft.updatedAt=now();var list=db().workflowTemplates||[],existing=list.find(function(t){return t.id===draft.id});if(existing)Object.assign(existing,clone(draft));else list.unshift(clone(draft));
  if(save('儲存可編輯流程模板')===false)return;if(window.v6Cloud&&v6Cloud.clearDeletion)v6Cloud.clearDeletion('workflowTemplates',draft.id);app.closeModal(true);openTemplates();toast('模板已儲存；既有專案仍保留原本流程。');
}
function copyTemplate(id){var source=(db().workflowTemplates||[]).find(function(t){return t.id===id});if(!source)return;draft=clone(source);draft.id=uid('tpl');draft.name=source.name+'（副本）';draft.builtIn=false;draft.steps.forEach(function(step){step.id=uid('step')});draft.tasks=projection(draft);renderTemplateEditor(true)}
function deleteTemplate(id){var template=(db().workflowTemplates||[]).find(function(t){return t.id===id});if(!template||!confirm('確定刪除「'+template.name+'」？已套用的專案會保留自己的流程副本，不受影響。'))return;if(window.v6Cloud)v6Cloud.noteDeletion('workflowTemplates',id,template);db().workflowTemplates=db().workflowTemplates.filter(function(t){return t.id!==id});if(save('刪除流程模板')===false)return;draft=null;app.closeModal(true);openTemplates()}
function resetBuiltIns(){
  if(!confirm('要把四個內建模板還原成系統預設嗎？你對內建模板的修改會被覆蓋；自訂模板不受影響。'))return;
  var builtIds=new Set(defaults().map(function(t){return t.id}));db().workflowTemplates=(db().workflowTemplates||[]).filter(function(t){return !builtIds.has(t.id)}).concat(defaults());
  if(save('還原四個內建流程模板')===false)return;if(window.v6Cloud&&v6Cloud.clearDeletion)builtIds.forEach(function(id){v6Cloud.clearDeletion('workflowTemplates',id)});app.closeModal(true);openTemplates();toast('內建模板已還原。');
}
function returnToTemplates(){return app.requestModalTransition(openTemplates)}

function workflowProject(projectId){return (db().projects||[]).find(function(p){return p.id===projectId&&p.workflow&&Array.isArray(p.workflow.steps)})}
function collectionForKind(kind){return {task:'tasks',confirmation:'confirmations',routine:'routines',event:'events'}[kind]||'tasks'}
function recordByRef(ref){return ref&&((db()[ref.collection]||[]).find(function(row){return row.id===ref.id}))}
function currentStep(project){return project&&project.workflow&&!project.workflow.completed?project.workflow.steps[project.workflow.currentIndex]:null}
function triggerDate(project,step){
  var workflow=project.workflow||{},base=workflow.lastCompletedDate||workflow.startedDate||today();
  if(step.trigger==='weekly')return nextWeekday(base,step.weekday);
  if(step.trigger==='interval')return monthAddClamped(base,step.intervalMonths);
  if(step.trigger==='countdown'){
    var event=(db().events||[]).find(function(e){return e.id===workflow.eventId}),target=event&&event.startDate||project.dueDate;
    return target?dateAdd(target,-step.daysBefore):'';
  }
  return '';
}
function createStepRecord(project,step,dueDate){
  var data=db(),stamp=now(),common={projectId:project.id,workflowProjectId:project.id,workflowStepId:step.id,workflowGenerated:true,createdAt:stamp,updatedAt:stamp},record,collection=collectionForKind(step.kind),created=true;
  if(step.kind==='confirmation'){record=Object.assign({id:uid('confirm'),question:step.title,person:'',status:'pending',nextFollowup:dueDate||today(),result:'',evidenceLinks:[],changeCount:0},common);data.confirmations.unshift(record)}
  else if(step.kind==='routine'){record=Object.assign({id:uid('routine'),name:step.title,cycle:'once',nextDate:dueDate||today(),active:true},common);data.routines.unshift(record)}
  else if(step.kind==='event'){
    record=(data.events||[]).find(function(e){return e.id===project.workflow.eventId});created=!record;
    if(!record){record=Object.assign({id:uid('event'),name:project.name,type:project.taskType==='festival'?'festival':'booth',startDate:project.dueDate||today(),endDate:project.dueDate||today(),place:'',itemsText:'',note:'由流程模板建立'},common);data.events.unshift(record);project.workflow.eventId=record.id}
    record.workflowProjectId=project.id;record.workflowStepId=step.id;record.workflowGenerated=true;record.updatedAt=stamp;
  }else{record=Object.assign({id:uid('task'),name:step.title,eventId:project.workflow.eventId||'',dueDate:dueDate||'',phase:step.phase||'make',status:'open'},common);data.tasks.unshift(record)}
  project.workflow.activeRecord={collection:collection,id:record.id,stepId:step.id,created:created,createdUpdatedAt:record.updatedAt||''};
  return record;
}
function activateCurrent(project,force){
  var step=currentStep(project);if(!step){project.workflow.completed=true;project.workflow.activeRecord=null;project.workflow.nextDueDate='';project.nextAction='流程已全部完成';return false}
  var existing=recordByRef(project.workflow.activeRecord);if(existing){project.nextAction=step.title;return false}
  var due=triggerDate(project,step);project.workflow.nextDueDate=due;
  if(!force&&due&&dayDiff(due)>0){project.workflow.activeRecord=null;project.nextAction=step.title+'（'+due+' 啟動）';return false}
  createStepRecord(project,step,due);project.nextAction=step.title;project.workflow.nextDueDate=due||'';project.updatedAt=now();return true;
}
function activeForRecord(collection,id){return (db().projects||[]).find(function(p){return p.workflow&&p.workflow.activeRecord&&p.workflow.activeRecord.collection===collection&&p.workflow.activeRecord.id===id})}
function isCurrentTask(task){var project=task&&workflowProject(task.projectId),active=project&&project.workflow.activeRecord;return Boolean(task&&task.status!=='done'&&task.workflowGenerated&&active&&active.collection==='tasks'&&active.id===task.id)}
function markComplete(collection,record){
  if(!record)return;if(collection==='tasks'){record.status='done';record.completedAt=now()}else if(collection==='confirmations'){record.status='confirmed';record.result=record.result||'由流程步驟確認完成'}else if(collection==='routines'){record.active=false;record.lastCompleted=today();record.completedAt=now()}else if(collection==='events'){record.workflowCompletedAt=now()}record.updatedAt=now();
}
function advance(project,recordBefore,alreadyCompleted){
  var workflow=project.workflow,step=currentStep(project),ref=workflow.activeRecord,record=recordByRef(ref),entry={stepIndex:workflow.currentIndex,stepId:step&&step.id,collection:ref&&ref.collection||'',recordId:ref&&ref.id||'',recordCreated:ref&&ref.created!==false,recordCreatedUpdatedAt:ref&&ref.createdUpdatedAt||'',recordBefore:recordBefore||clone(record||{}),previousLastCompletedDate:workflow.lastCompletedDate||'',completedAt:now()};
  if(record&&!alreadyCompleted)markComplete(ref.collection,record);
  workflow.history=Array.isArray(workflow.history)?workflow.history:[];workflow.history.push(entry);workflow.currentIndex++;workflow.activeRecord=null;workflow.lastCompletedDate=today();workflow.nextDueDate='';activateCurrent(project,false);project.updatedAt=now();
}
function complete(projectId){
  var project=workflowProject(projectId),step=currentStep(project);if(!project||!step)return;
  if(!project.workflow.activeRecord)return alert('這一步預定於 '+(project.workflow.nextDueDate||'指定日期')+' 啟動；可按「提前開始」後再完成。');
  if(!confirm('確定完成「'+step.title+'」並前進到下一步？完成後仍可在專案頁按「撤銷上一步」。'))return;
  var record=recordByRef(project.workflow.activeRecord),before=clone(record||{});advance(project,before,false);if(save('完成流程目前步驟並啟動下一步')===false)return;app.openProject(project.id);toast('已完成；下一步已更新，可隨時撤銷。');
}
function removeRecord(ref){
  if(!ref)return;var list=db()[ref.collection]||[],record=list.find(function(row){return row.id===ref.id});if(ref.created===false){if(record){delete record.workflowStepId;record.updatedAt=now()}return}if(record&&window.v6Cloud)v6Cloud.noteDeletion(ref.collection,ref.id,record);db()[ref.collection]=list.filter(function(row){return row.id!==ref.id});
}
function undo(projectId){
  var project=workflowProject(projectId),workflow=project&&project.workflow,history=workflow&&workflow.history;if(!project||!history||!history.length)return;
  var entry=history[history.length-1],step=workflow.steps[entry.stepIndex],nextRecord=recordByRef(workflow.activeRecord);if(nextRecord&&workflow.activeRecord.created!==false&&workflow.activeRecord.createdUpdatedAt&&nextRecord.updatedAt!==workflow.activeRecord.createdUpdatedAt)return alert('下一步已經被修改，為避免刪除你填過的內容，請先另存或手動處理後再撤銷。');if(!confirm('撤銷「'+(step&&step.title||'上一步')+'」的完成狀態，並移除剛產生的下一步？'))return;
  removeRecord(workflow.activeRecord);history.pop();workflow.currentIndex=entry.stepIndex;workflow.completed=false;workflow.lastCompletedDate=entry.previousLastCompletedDate||'';workflow.nextDueDate='';
  var restored=clone(entry.recordBefore||{}),list=db()[entry.collection]||[];if(restored.id){var existing=list.find(function(row){return row.id===restored.id});if(existing)Object.assign(existing,restored);else list.unshift(restored);workflow.activeRecord={collection:entry.collection,id:restored.id,stepId:entry.stepId,created:entry.recordCreated!==false,createdUpdatedAt:restored.updatedAt||entry.recordCreatedUpdatedAt||''}}
  else workflow.activeRecord=null;
  project.nextAction=step&&step.title||'';project.updatedAt=now();if(save('撤銷流程上一步')===false)return;if(restored.id&&window.v6Cloud&&v6Cloud.clearDeletion)v6Cloud.clearDeletion(entry.collection,restored.id);app.openProject(project.id);toast('已撤銷，上一個步驟已恢復。');
}
function startNow(projectId){var project=workflowProject(projectId),step=currentStep(project);if(!project||!step||project.workflow.activeRecord)return;if(!confirm('要提前開始「'+step.title+'」嗎？'))return;activateCurrent(project,true);if(save('提前啟動流程目前步驟')===false)return;app.openProject(project.id)}
function refreshSchedules(persist){var changed=false;(db().projects||[]).forEach(function(project){if(project.workflow&&!project.workflow.completed&&!project.workflow.activeRecord){var before=JSON.stringify(project.workflow);activateCurrent(project,false);if(before!==JSON.stringify(project.workflow))changed=true}});if(changed&&persist!==false)save('依日期啟動流程目前步驟');return changed}

function workflowPanel(project){
  var workflow=project.workflow,step=currentStep(project),done=(workflow.history||[]).length,total=workflow.steps.length,ref=workflow.activeRecord,record=recordByRef(ref),progress=total?Math.round(done/total*100):0;
  var status=workflow.completed?'全部完成':ref?'目前可執行':'預定 '+(workflow.nextDueDate||'待日期');
  var action='';
  if(workflow.completed)action='<span class="tag teal">流程完成</span>';
  else if(ref)action='<button class="btn small" onclick="v6Workflow.openActive(\''+esc(project.id)+'\')">開啟紀錄</button><button class="btn small primary" onclick="v6Workflow.complete(\''+esc(project.id)+'\')">完成這一步</button>';
  else action='<button class="btn small" onclick="v6Workflow.startNow(\''+esc(project.id)+'\')">提前開始</button>';
  var history=(workflow.history||[]).length?'<button class="btn small" onclick="v6Workflow.undo(\''+esc(project.id)+'\')">↶ 撤銷上一步</button>':'';
  return '<section class="v6-workflow-panel"><div class="row between"><div><strong>流程：'+esc(workflow.templateName||'自訂流程')+'</strong><div class="meta">'+done+' / '+total+' 步 · '+esc(status)+'</div></div><div class="row">'+history+'<button class="btn small" onclick="v6Workflow.openProgress(\''+esc(project.id)+'\')">查看全部步驟</button></div></div><div class="progress"><i style="width:'+progress+'%"></i></div>'+(step?'<div class="v6-current-step"><div><span class="tag brand">目前</span> <strong>'+esc(step.title)+'</strong><div class="meta">'+esc(triggerText(step))+(step.note?' · '+esc(step.note):'')+'</div></div><div class="row">'+action+'</div></div>':'')+(record&&record.workflowGenerated?'':'')+'</section>';
}
function injectProjectPanel(projectId){var project=workflowProject(projectId),foot=document.querySelector('#modal .modal-foot');if(!project||!foot||document.getElementById('v6WorkflowPanel'))return;var holder=document.createElement('div');holder.id='v6WorkflowPanel';holder.innerHTML=workflowPanel(project);foot.parentNode.insertBefore(holder,foot)}
function openActive(projectId){var project=workflowProject(projectId),ref=project&&project.workflow.activeRecord;if(!ref)return;var record=recordByRef(ref);if(!record)return;if(ref.collection==='tasks')return app.requestModalTransition(function(){app.openTask('',record.id)});if(ref.collection==='confirmations')return app.requestModalTransition(function(){app.openConfirmation(record.id)});if(ref.collection==='routines')return app.requestModalTransition(function(){app.openRoutine(record.id)});if(ref.collection==='events')return app.requestModalTransition(function(){app.openEvent(record.id)})}
function openProgress(projectId){var project=workflowProject(projectId);if(!project)return;var workflow=project.workflow,current=workflow.currentIndex;app.openModal('流程進度：'+project.name,'已完成的步驟保留在專案歷史；未到期的步驟不會提前建立工作。','<div class="v6-progress-list">'+workflow.steps.map(function(step,index){var state=index<current?'done':index===current?'current':'future';return '<div class="v6-progress-step '+state+'"><span>'+(index<current?'✓':index===current?'●':'○')+'</span><div><strong>'+esc(step.title)+'</strong><div class="meta">'+esc(KINDS[step.kind])+' · '+esc(triggerText(step))+(step.note?' · '+esc(step.note):'')+'</div></div></div>'}).join('')+'</div><div class="modal-foot"><button class="btn" onclick="v6Workflow.returnToProject(\''+esc(project.id)+'\')">返回專案</button></div>',true)}
function returnToProject(projectId){return app.requestModalTransition(function(){app.openProject(projectId)})}

function externalAdvance(collection,id,before){var project=activeForRecord(collection,id);if(!project)return false;advance(project,before,true);save('從紀錄完成流程步驟並啟動下一步');return true}
function wrapCompletionHandlers(){
  var oldToggle=app.toggleTask;app.toggleTask=function(id){var project=activeForRecord('tasks',id),record=(db().tasks||[]).find(function(t){return t.id===id});if(project&&record&&record.status!=='done'){if(!confirm('確定完成「'+record.name+'」並前進到下一步？之後可從專案撤銷。'))return;var before=clone(record);oldToggle(id);if(app.lastSaveFailed&&app.lastSaveFailed())return;externalAdvance('tasks',id,before);return}if(record&&record.status==='done'){var owner=(db().projects||[]).find(function(p){var h=p.workflow&&p.workflow.history||[],last=h[h.length-1];return last&&last.collection==='tasks'&&last.recordId===id});if(owner)return undo(owner.id)}return oldToggle(id)};
  var oldSaveTask=app.saveTask;app.saveTask=function(){var id=val('taskId'),record=(db().tasks||[]).find(function(t){return t.id===id}),project=activeForRecord('tasks',id),done=val('taskStatus')==='done',before=record&&clone(record),title=val('taskName');if(project&&val('taskProject')!==project.id)return alert('流程目前工作不能移到其他專案；請從專案頁調整流程。');if(project&&done&&record.status!=='done'&&!confirm('確定完成這個流程步驟並前進？之後可從專案撤銷。'))return;var result=oldSaveTask();if(app.lastSaveFailed&&app.lastSaveFailed())return result;if(project&&done&&before)externalAdvance('tasks',id,before);else if(project&&title){var step=currentStep(project),saved=(db().tasks||[]).find(function(t){return t.id===id});if(step){step.title=title;project.nextAction=title;project.updatedAt=now();if(saved)saved.updatedAt=now();save('同步流程目前工作名稱')}}return result};
  var oldRoutine=app.completeRoutine;app.completeRoutine=function(id){var project=activeForRecord('routines',id),record=(db().routines||[]).find(function(r){return r.id===id});if(project&&record){if(!confirm('確定完成「'+record.name+'」並前進到下一步？'))return;var before=clone(record);oldRoutine(id);if(app.lastSaveFailed&&app.lastSaveFailed())return;externalAdvance('routines',id,before);return}return oldRoutine(id)};
  var oldConfirm=v6.saveConfirmation;function saveConfirmation(){var id=val('v6ConfirmId'),record=(db().confirmations||[]).find(function(c){return c.id===id}),project=activeForRecord('confirmations',id),terminal=TERMINAL_CONFIRM.has(val('v6ConfirmStatus')),before=record&&clone(record),question=val('v6ConfirmQuestion');if(project&&val('v6ConfirmProject')!==project.id)return alert('流程目前確認不能移到其他專案；請從專案頁調整流程。');if(project&&terminal&&!TERMINAL_CONFIRM.has(record.status)&&!confirm('確定完成這個確認步驟並前進？'))return;var result=oldConfirm();if(app.lastSaveFailed&&app.lastSaveFailed())return result;if(project&&terminal&&before)externalAdvance('confirmations',id,before);else if(project&&question){var step=currentStep(project);if(step){step.title=question;project.nextAction=question;project.updatedAt=now();save('同步流程目前確認名稱')}}return result}v6.saveConfirmation=saveConfirmation;app.saveConfirmation=saveConfirmation;
}
function wrapProjectPage(){
  var oldOpen=app.openProject;app.openProject=function(id){var result=oldOpen(id);injectProjectPanel(id);return result};
  var oldSave=app.saveProject;app.saveProject=function(){var projectId=val('projectId'),project=workflowProject(projectId),next=val('v6ProjectNext'),result=oldSave();if(project&&next){var step=currentStep(project),record=recordByRef(project.workflow.activeRecord);if(step&&step.title!==next){step.title=next;if(record){if(project.workflow.activeRecord.collection==='confirmations')record.question=next;else record.name=next;record.updatedAt=now()}project.nextAction=next;project.updatedAt=now();save('更新專案目前流程步驟')}}return result};
}

function applyTemplate(id){
  var template=(db().workflowTemplates||[]).find(function(t){return t.id===id});if(!template)return;
  var needsDate=template.steps.some(function(step){return step.trigger==='countdown'});
  app.openModal('套用模板：'+template.name,'會複製一份流程到新專案，之後修改模板不會改動既有專案。','<input id="v6ApplyTemplate" type="hidden" value="'+esc(id)+'"><div class="form-grid"><div class="field full"><label>專案名稱 *</label><input id="v6ApplyName" value="'+esc(template.name)+'"></div><div class="field"><label>流程開始日</label><input id="v6ApplyStart" type="date" value="'+today()+'"></div><div class="field"><label>活動／交付日期'+(needsDate?' *':'')+'</label><input id="v6ApplyDate" type="date"><div class="meta">倒數步驟會以這個日期回推。</div></div></div><div class="notice">建立後只會出現第一個到期／可執行步驟；完成後才產生下一筆。</div><div class="modal-foot"><button class="btn" onclick="v6Workflow.returnToTemplates()">返回</button><button class="btn primary" onclick="v6Workflow.createFromTemplate()">建立專案流程</button></div>');
}
function createFromTemplate(){
  var template=(db().workflowTemplates||[]).find(function(t){return t.id===val('v6ApplyTemplate')}),name=val('v6ApplyName'),start=val('v6ApplyStart')||today(),date=val('v6ApplyDate');if(!template||!name)return alert('請填寫專案名稱。');if(template.steps.some(function(step){return step.trigger==='countdown'})&&!date)return alert('這個模板含活動倒數步驟，請填寫活動／交付日期。');
  var stamp=now(),project={id:uid('proj'),name:name,stage:'planning',priority:'high',dueDate:date,brief:'由「'+template.name+'」模板建立；每次只顯示目前可執行步驟。',vendorIds:[],taskType:template.type,nextAction:'',templateId:template.id,createdAt:stamp,updatedAt:stamp,workflow:{schemaVersion:2,templateId:template.id,templateName:template.name,steps:clone(template.steps),currentIndex:0,activeRecord:null,eventId:'',history:[],startedDate:start,lastCompletedDate:'',nextDueDate:'',completed:false}};
  db().projects.unshift(project);
  if(template.type==='booth'||template.type==='festival'){var event={id:uid('event'),name:name,type:template.type==='festival'?'festival':'booth',startDate:date,endDate:date,place:'',itemsText:'',note:'由流程模板建立；素材由流程逐步啟動。',projectId:project.id,workflowProjectId:project.id,createdAt:stamp,updatedAt:stamp};db().events.unshift(event);project.workflow.eventId=event.id}
  activateCurrent(project,false);if(save('套用流程模板建立專案與目前一步')===false)return;app.closeModal();toast('專案已建立；只啟動目前這一步。');setTimeout(function(){app.openProject(project.id)},0);
}

function expose(){
  window.v6Workflow={openTemplates:openTemplates,openTemplateEditor:openTemplateEditor,updateTriggerFields:updateTriggerFields,addStep:addStep,moveStep:moveStep,removeStep:removeStep,saveTemplate:saveTemplate,copyTemplate:copyTemplate,deleteTemplate:deleteTemplate,resetBuiltIns:resetBuiltIns,returnToTemplates:returnToTemplates,applyTemplate:applyTemplate,createFromTemplate:createFromTemplate,complete:complete,undo:undo,startNow:startNow,openActive:openActive,openProgress:openProgress,returnToProject:returnToProject,refreshSchedules:refreshSchedules,isCurrentTask:isCurrentTask,monthAddClamped:monthAddClamped,nextWeekday:nextWeekday,normalizeTemplate:normalizeTemplate,triggerDate:triggerDate};
  v6.openTemplates=openTemplates;v6.applyTemplate=applyTemplate;v6.createFromTemplate=createFromTemplate;
}

migrateTemplates(true);expose();wrapCompletionHandlers();wrapProjectPage();refreshSchedules(true);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')refreshSchedules(true)});
app.render();
})();
