(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KetimeData=api})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 var SCHEMA=1;
 function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)}
 function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;var d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value}
 function newer(data){
  if(data.schemaVersion!=null&&(!Number.isInteger(data.schemaVersion)||data.schemaVersion>SCHEMA||data.schemaVersion<0))return true;
  if(data.schemaVersion==null&&data.version!=null){var v=String(data.version).split('.').map(Number);if(v.some(function(n){return!Number.isFinite(n)})||v[0]>0||v[0]===0&&v[1]>5)return true}
  return false;
 }
 function records(items,path,visit){
  if(!Array.isArray(items))throw Error(path+' 必须是列表。');
  var ids=new Set();items.forEach(function(item,index){
   if(!object(item))throw Error(path+' 第 '+(index+1)+' 项损坏，原数据未覆盖。');
   if(item.id!=null&&item.id!==''){if(typeof item.id!=='string'&&typeof item.id!=='number')throw Error(path+' 含无效标识。');var id=String(item.id);if(ids.has(id))throw Error(path+' 含重复标识，原数据未覆盖。');ids.add(id)}
   if(visit)visit(item,path+'['+index+']');
  });
 }
 function prepare(raw,base){
  var data=raw;
  if(object(data)&&data.format==='ketime-protection-snapshots'){
   if(!Array.isArray(data.snapshots)||data.snapshots.length!==1||!object(data.snapshots[0])||typeof data.snapshots[0].raw!=='string')throw Error('请导入单份保护快照；多份历史集合不能自动选择。');
   data=JSON.parse(data.snapshots[0].raw);
  }
  if(object(data)&&data.format==='ketime-legacy-snapshot'){
   if(!Array.isArray(data.entries)||!data.entries.length||data.entries.length>2)throw Error('旧版快照格式无效。');
   var merged=Object.assign({},base||{projects:[],schedules:[],inbox:[]}),kinds=new Set();
   data.entries.forEach(function(entry){if(!object(entry)||['projects','schedules'].indexOf(entry.kind)<0||typeof entry.raw!=='string'||kinds.has(entry.kind))throw Error('旧版快照条目无效。');kinds.add(entry.kind);var item=JSON.parse(entry.raw);if(entry.kind==='projects'){if(!Array.isArray(item))throw Error('旧项目快照格式无效。');merged.projects=item}else{var old=prepare(item,merged);merged.schedules=old.schedules;if(old.dayStartHour!=null)merged.dayStartHour=old.dayStartHour}});data=merged;
  }
  if(Array.isArray(data))data=Object.assign({},base||{schedules:[],inbox:[]},{projects:data});
  else if(object(data)&&Array.isArray(data.events)&&data.schedules==null)data=Object.assign({},base||{projects:[],inbox:[]},{schedules:data.events,dayStartHour:data.dayStartHour==null?base&&base.dayStartHour:data.dayStartHour});
  if(!object(data)||!Array.isArray(data.projects)||!Array.isArray(data.schedules))throw Error('不是可识别的刻时数据，原记录未更改。');
  if(newer(data))throw Error('数据来自更新版本，请使用新版刻时打开；已阻止旧版覆盖。');
  var taskIds=new Set();
  records(data.projects,'项目',function(p,path){
   if(p.nodes!=null)records(p.nodes,path+'.nodes',function(n,nodePath){
    if(n.checklist!=null)records(n.checklist,nodePath+'.checklist',function(t){if(t.id!=null&&t.id!==''){var id=String(t.id);if(taskIds.has(id))throw Error('项目待办标识重复，关联记录需要检查。');taskIds.add(id)}});
   });
  });
  records(data.schedules,'日程',function(e,path){
   ['date','endDate'].forEach(function(key){if(e[key]!=null&&e[key]!==''&&!date(e[key]))throw Error(path+' 的日期无效。')});
   ['start','end'].forEach(function(key){if(e[key]!=null&&e[key]!==''&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e[key]))throw Error(path+' 的时间无效。')});
   if(e.repeat!=null&&['none','daily','weekly','monthly'].indexOf(e.repeat)<0)throw Error(path+' 的重复规则不能由当前版本读取。');
   if(e.occurrenceStates!=null)records(e.occurrenceStates,path+'.occurrenceStates',function(s){
    if(!date(s.date)||s.overrideDate!=null&&!date(s.overrideDate))throw Error('重复日程的发生日期无效。');
    ['start','end'].forEach(function(key){if(s[key]!=null&&s[key]!==''&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s[key]))throw Error('重复日程的时间无效。')});
   });
  });
  ['inbox','todos','reminders','importantDays','holidays'].forEach(function(key){
   if(data[key]!=null){
    if((key==='reminders'||key==='importantDays')&&data[key].length>5000||key==='holidays'&&data[key].length>200)throw Error(key+' 超出当前版本数量上限，原数据未截断。');
    records(data[key],key,function(item){if((key==='reminders'||key==='importantDays')&&(!date(item.date)||typeof item.name!=='string'||!item.name.trim()||item.name.length>200))throw Error(key+' 包含无效日期、空名称或超长名称。')});
   }
  });
  if(data.growth!=null){
   if(!object(data.growth))throw Error('成长记录格式无效。');
   if(data.growth.series!=null)records(data.growth.series,'成长曲线',function(series){['deletedOn','retiredAfter'].forEach(function(key){if(series[key]!=null&&!date(series[key]))throw Error('成长记录的状态日期无效。')});if(series.points!=null)records(series.points,'成长记录',function(p){if(!date(p.date)||!Number.isFinite(Number(p.completion))||Number(p.completion)<0||Number(p.completion)>100)throw Error('成长记录的日期或完成度无效。')})});
  }
  return data;
 }
 function create(storage,key){
  var expected=null,blocked='',loaded=false;
  var keys={lastGood:key+'-last-good',upgrade:key+'-before-schema-'+SCHEMA,restore:key+'-before-restore',protected:key+'-protected-original'};
  function parse(raw){return prepare(JSON.parse(raw))}
  function read(){
   var raw,data,warning='';
   try{expected=storage.getItem(key);loaded=true;raw=expected;if(raw==null)return{data:null,warning:''};data=parse(raw);return{data:data,warning:''}}
   catch(error){
    blocked=error.message||'无法读取本地数据。';warning=blocked+' 原始存储已保留，当前处于保护模式。请在设置中导出原始快照或恢复备份。';
    try{var backup=storage.getItem(keys.lastGood);if(backup!=null)data=parse(backup)}catch(ignore){}
    return{data:data||{projects:[],schedules:[],inbox:[],growth:{series:[],demoSeeded:true}},warning:warning,blocked:true};
   }
  }
  function assertWritable(options){
   if(blocked&&!(options&&options.replace))throw Error(blocked+' 请先在设置中恢复备份。');
   var actual=storage.getItem(key);
   if(loaded&&actual!==expected&&!(options&&options.replace))throw Error('另一页面已更新数据，请刷新后再修改；本次没有覆盖新记录。');
   var probe=key+'-storage-check';try{storage.setItem(probe,'1')}finally{storage.removeItem(probe)}
   return true;
  }
  function write(data,options){
   prepare(data);assertWritable(options);
   var actual=storage.getItem(key),next=JSON.stringify(data),previous=null;
   if(actual!=null){
    try{previous=parse(actual)}catch(error){if(!(options&&options.replace))throw error;storage.setItem(keys.protected,actual)}
    if(options&&options.replace)storage.setItem(keys.restore,actual);
    if(previous){
     if((previous.schemaVersion==null?0:previous.schemaVersion)<SCHEMA&&storage.getItem(keys.upgrade)==null)storage.setItem(keys.upgrade,actual);
     storage.setItem(keys.lastGood,actual);
    }
   }
   // The primary record is the final write; failed snapshots never replace it.
   storage.setItem(key,next);expected=next;loaded=true;blocked='';return true;
  }
  function snapshotLegacy(entries){if(entries.length&&storage.getItem(keys.upgrade)==null)storage.setItem(keys.upgrade,JSON.stringify({format:'ketime-legacy-snapshot',entries:entries}))}
  function snapshots(){var list=[];try{var current=storage.getItem(key);if(current!=null)list.push({kind:'current',raw:current})}catch(ignore){}Object.keys(keys).forEach(function(name){try{var raw=storage.getItem(keys[name]);if(raw!=null)list.push({kind:name,raw:raw})}catch(ignore){}});return list}
  function latest(){var raw=storage.getItem(keys.lastGood);if(raw==null)throw Error('尚无最近保存快照，请选择导出的备份文件。');return parse(raw)}
  return{read:read,write:write,assertWritable:assertWritable,snapshotLegacy:snapshotLegacy,snapshots:snapshots,latest:latest,block:function(message){blocked=message},isBlocked:function(){return Boolean(blocked)}};
 }
 return{SCHEMA:SCHEMA,prepare:prepare,create:create,validDate:date};
});
