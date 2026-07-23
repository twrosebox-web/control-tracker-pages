(function(){
'use strict';

var DATA_KEY='creative_ops_v6_data';
var API_URL_KEY='creative_ops_print_api_url';
var API_TOKEN_KEY='creative_ops_print_api_token';
var TOMBSTONE_KEY='creative_ops_v6_cloud_tombstones';
var STATE_KEY='creative_ops_v6_cloud_state';
var COLLECTIONS=[
  'projects','tasks','confirmations','routines','events','products','websites',
  'websiteChanges','knowledge','sops','files','workflowTemplates','closeouts',
  'inventoryRecords','activity'
];
var timer=null;
var syncing=false;
var pending=false;
var currentPromise=Promise.resolve({ok:false,skipped:true});
var lastHashes={};

function apiUrl(){return String(localStorage.getItem(API_URL_KEY)||window.PRINT_API_URL||'').trim()}
function apiToken(){return String(localStorage.getItem(API_TOKEN_KEY)||window.PRINT_API_TOKEN||'').trim()}
function now(){return new Date().toISOString()}
function millis(value){var t=new Date(value||0).getTime();return isNaN(t)?0:t}
function recordTime(record){return millis(record&&(record.updatedAt||record.createdAt||record.at||record.versionDate))}
function keyOf(collection,id){return collection+'\u0000'+id}

function signature(record){
  return JSON.stringify(record,function(key,value){return key==='updatedAt'?undefined:value});
}

function snapshotHashes(db){
  var hashes={};
  COLLECTIONS.forEach(function(collection){
    (Array.isArray(db[collection])?db[collection]:[]).forEach(function(record){
      if(record&&record.id)hashes[keyOf(collection,record.id)]=signature(record);
    });
  });
  return hashes;
}

function markChangedRecords(){
  var db=app.getData(),stamp=now(),changed=false;
  COLLECTIONS.forEach(function(collection){
    (Array.isArray(db[collection])?db[collection]:[]).forEach(function(record){
      if(!record||!record.id)return;
      var key=keyOf(collection,record.id),hash=signature(record);
      if(!Object.prototype.hasOwnProperty.call(lastHashes,key)||lastHashes[key]!==hash){
        record.updatedAt=stamp;
        changed=true;
      }
    });
  });
  lastHashes=snapshotHashes(db);
  if(changed)localStorage.setItem(DATA_KEY,JSON.stringify(db));
}

function shortState(text){
  text=String(text||'');
  if(text.indexOf('同步中')>=0)return '☁ 同步中';
  if(text.indexOf('已同步')>=0)return '☁ 已同步';
  if(text.indexOf('失敗')>=0||text.indexOf('錯誤')>=0)return '☁ 有異常';
  if(text.indexOf('僅本機')>=0)return '☁ 僅本機';
  return '☁ 同步狀態';
}

function setState(text){
  localStorage.setItem(STATE_KEY,text);
  var el=document.getElementById('v6CloudButton');
  if(el){el.textContent='☁ 全平台：'+text;el.dataset.mobileLabel=shortState(text)}
}

function addStatusButton(){
  var actions=document.querySelector('.top-actions');
  if(!actions||document.getElementById('v6CloudButton'))return;
  var state=String(localStorage.getItem(STATE_KEY)||'檢查中'),button=document.createElement('button');
  button.className='btn';button.id='v6CloudButton';button.type='button';button.title='首頁、專案、確認、活動、提醒、官網、檔案、SOP 與經驗的 Google 後台狀態';button.textContent='☁ 全平台：'+state;button.dataset.mobileLabel=shortState(state);button.onclick=function(){v6Cloud.syncNow()};
  actions.insertBefore(button,actions.firstChild);
}

function readTombstones(){
  try{return JSON.parse(localStorage.getItem(TOMBSTONE_KEY)||'[]')}catch(err){return[]}
}

function writeTombstones(list){
  localStorage.setItem(TOMBSTONE_KEY,JSON.stringify((list||[]).slice(-1000)));
}

function noteDeletion(collection,id,record){
  if(COLLECTIONS.indexOf(collection)<0||!id)return;
  var list=readTombstones(),deletedAt=now(),key=keyOf(collection,id),found=list.find(function(x){return keyOf(x.collection,x.id)===key});
  if(found)found.deletedAt=deletedAt;
  else list.push({collection:collection,id:id,deletedAt:deletedAt,lastKnownUpdatedAt:record&&(record.updatedAt||record.createdAt||'')});
  writeTombstones(list);
}

function apiJsonp(action){
  return new Promise(function(resolve,reject){
    var url=apiUrl(),token=apiToken();
    if(!url||!token){reject(new Error('尚未設定 Apps Script 網址與安全金鑰'));return}
    var callback='creativeOpsCloudCb_'+Date.now()+'_'+Math.random().toString(36).slice(2),script=document.createElement('script'),done=false;
    var timeout=setTimeout(function(){finish(new Error('全平台後台讀取逾時'))},30000);
    function finish(err,result){
      if(done)return;done=true;clearTimeout(timeout);
      try{delete window[callback]}catch(ignore){window[callback]=undefined}
      if(script.parentNode)script.parentNode.removeChild(script);
      if(err)reject(err);else if(!result||result.ok!==true)reject(new Error(result&&result.error||'後端沒有回傳成功'));else resolve(result);
    }
    window[callback]=function(result){finish(null,result)};
    script.onerror=function(){finish(new Error('無法連到全平台 Apps Script'))};
    script.src=url+'?action='+encodeURIComponent(action)+'&token='+encodeURIComponent(token)+'&callback='+encodeURIComponent(callback)+'&_='+Date.now();
    document.head.appendChild(script);
  });
}

function apiPost(action,body){
  var url=apiUrl(),token=apiToken();
  if(!url||!token)return Promise.reject(new Error('尚未設定 Apps Script 網址與安全金鑰'));
  return fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(Object.assign({action:action,token:token},body||{}))})
    .then(function(response){return response.json()})
    .then(function(result){if(!result||result.ok!==true)throw new Error(result&&result.error||'後端沒有回傳成功');return result});
}

function metaRecord(db){
  return {collection:'__meta__',id:'workspace',updatedAt:db.updatedAt||now(),record:{
    id:'workspace',version:db.version||6,settings:db.settings||{},deletedSeeds:db.deletedSeeds||[],updatedAt:db.updatedAt||now()
  }};
}

function flattenLocal(db){
  var fallback=db.updatedAt||now(),records=[];
  COLLECTIONS.forEach(function(collection){
    var list=Array.isArray(db[collection])?db[collection]:[];
    list.forEach(function(record){
      if(!record||!record.id)return;
      if(!record.updatedAt)record.updatedAt=record.createdAt||record.at||fallback;
      records.push({collection:collection,id:String(record.id),updatedAt:record.updatedAt,record:record});
    });
  });
  records.push(metaRecord(db));
  return records;
}

function applyRemote(result){
  var db=app.getData(),changed=false,localDeletes={};
  readTombstones().forEach(function(t){localDeletes[keyOf(t.collection,t.id)]=millis(t.deletedAt)});
  (result.tombstones||[]).forEach(function(t){
    if(COLLECTIONS.indexOf(t.collection)<0)return;
    var list=Array.isArray(db[t.collection])?db[t.collection]:[],found=list.find(function(x){return String(x.id)===String(t.id)});
    if(found&&millis(t.deletedAt)>=recordTime(found)){
      db[t.collection]=list.filter(function(x){return String(x.id)!==String(t.id)});
      changed=true;
    }
  });
  (result.records||[]).forEach(function(item){
    if(item.collection==='__meta__'){
      var remote=item.record||{};
      db.settings=Object.assign({},remote.settings||{},db.settings||{});
      db.deletedSeeds=Array.from(new Set([].concat(remote.deletedSeeds||[],db.deletedSeeds||[])));
      db.version=Math.max(Number(db.version||0),Number(remote.version||0));
      return;
    }
    if(COLLECTIONS.indexOf(item.collection)<0||!item.record)return;
    var remoteTime=millis(item.updatedAt||item.record.updatedAt||item.record.createdAt||item.record.at);
    if((localDeletes[keyOf(item.collection,item.id)]||0)>=remoteTime)return;
    var list=Array.isArray(db[item.collection])?db[item.collection]:(db[item.collection]=[]),index=list.findIndex(function(x){return String(x.id)===String(item.id)});
    if(index<0){list.push(item.record);changed=true;return}
    if(remoteTime>recordTime(list[index])){list[index]=item.record;changed=true}
  });
  if(changed){
    localStorage.setItem(DATA_KEY,JSON.stringify(db));
    app.render();
  }
  lastHashes=snapshotHashes(db);
  return changed;
}

function syncOnce(){
  if(!apiUrl()||!apiToken()){
    setState('僅本機');
    return Promise.resolve({ok:false,skipped:true});
  }
  setState('同步中…');
  return apiJsonp('listWorkspace').then(function(remote){
    applyRemote(remote);
    var db=app.getData(),records=flattenLocal(db),tombstones=readTombstones();
    localStorage.setItem(DATA_KEY,JSON.stringify(db));
    return apiPost('syncWorkspace',{records:records,tombstones:tombstones});
  }).then(function(result){
    writeTombstones([]);
    lastHashes=snapshotHashes(app.getData());
    setState('已同步 '+new Date().toLocaleTimeString());
    return result;
  }).catch(function(err){
    var message=String(err&&err.message||err);
    setState(message.indexOf('未知的 action')>=0?'後台待更新':'失敗');
    console.warn('全平台同步失敗：',message);
    return {ok:false,error:message};
  });
}

function syncNow(){
  if(syncing){pending=true;return currentPromise}
  syncing=true;
  currentPromise=syncOnce().finally(function(){
    syncing=false;
    if(pending){pending=false;scheduleSync('同步期間有新修改',300)}
  });
  return currentPromise;
}

function scheduleSync(action,delay){
  markChangedRecords();
  if(!apiUrl()||!apiToken()){setState('僅本機');return}
  clearTimeout(timer);
  timer=setTimeout(syncNow,delay==null?1500:delay);
}

function start(){
  addStatusButton();
  lastHashes=snapshotHashes(app.getData());
  if(apiUrl()&&apiToken())syncNow();else setState('僅本機');
}

window.v6Cloud={start:start,syncNow:syncNow,scheduleSync:scheduleSync,noteDeletion:noteDeletion,getState:function(){return localStorage.getItem(STATE_KEY)||''}};
setTimeout(start,600);
})();
