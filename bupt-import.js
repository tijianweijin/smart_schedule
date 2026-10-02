/* Independent, dependency-free timetable merge. Never accepts credentials. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KetimeBupt=api})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  var fields=['name','date','start','end'];
  var colors=['#8fbaa5','#b0a6d2','#e0b78f','#9bbbd4','#d7a5ae','#b9c69b'];
  function clone(x){return JSON.parse(JSON.stringify(x))}
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;var d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
  function snapshot(e){var out={};fields.forEach(function(k){out[k]=e[k]});return out}
  function source(e,data){return{provider:'bupt',accountKey:data.accountKey,termId:data.termId,sourceId:e.sourceId,courseId:e.courseId,teacher:e.teacher||'',location:e.location||'',week:e.week,sections:e.sections||'',snapshot:snapshot(e),cancelled:false}}
  function validate(data){
    if(!data||data.provider!=='bupt'||!/^[a-f0-9]{24}$/.test(data.accountKey)||!/^\d{4}-\d{4}-[12]$/.test(data.termId)||!validDate(data.termStart)||!Array.isArray(data.events)||data.events.length>50000||!Array.isArray(data.courses)||typeof data.complete!=='boolean')throw Error('课表数据格式不正确，未导入任何数据。');
    var ids=new Set();data.events.forEach(function(e){if(!e||!/^[a-f0-9]{32}$/.test(e.sourceId)||ids.has(e.sourceId)||typeof e.name!=='string'||!e.name.trim()||e.name.length>200||!validDate(e.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.end)||typeof e.courseId!=='string'||typeof e.teacher!=='string'||typeof e.location!=='string')throw Error('存在重复或不完整的课程，未导入任何数据。');ids.add(e.sourceId)});return data
  }
  function belongs(e,data){var s=e.source;return s&&s.provider==='bupt'&&s.accountKey===data.accountKey&&s.termId===data.termId}
  function edited(e){var s=e.source;return !s||!s.snapshot||e.repeat!=='none'||fields.some(function(k){return e[k]!==s.snapshot[k]})}
  function color(id){var h=0;for(var i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return colors[h%colors.length]}
  function plan(existing,data,options){
    validate(data);options=options||{};var schedules=clone(existing||[]),found=new Map(),incoming=new Set(),added=0,updated=0,unchanged=0,keptEdits=0,cancelled=0,removed=0,removedIds=[];
    schedules.forEach(function(e){if(belongs(e,data)){if(found.has(e.source.sourceId))throw Error('本地课表存在重复编号，请先备份并检查。');found.set(e.source.sourceId,e)}});
    data.events.forEach(function(raw){incoming.add(raw.sourceId);var old=found.get(raw.sourceId);if(old){var before=JSON.stringify(old),personal=edited(old);fields.forEach(function(k){if(old.source.snapshot&&old[k]===old.source.snapshot[k]&&old.repeat==='none')old[k]=raw[k]});old.source=source(raw,data);if(personal)keptEdits++;if(before!==JSON.stringify(old))updated++;else unchanged++}else{
      var id='bupt_'+data.accountKey+'_'+data.termId+'_'+raw.sourceId;if(schedules.some(function(e){return e.id===id}))throw Error('本地日程编号冲突，未导入任何数据。');
      schedules.push(Object.assign({id:id,repeat:'none',color:color(raw.courseId),done:false,endDate:null,occurrenceStates:[],groupId:null,projectId:null,nodeId:null,taskId:null,source:source(raw,data)},snapshot(raw)));added++
    }});
    if(data.complete)schedules=schedules.filter(function(e){if(!belongs(e,data)||incoming.has(e.source.sourceId))return true;cancelled++;if(options.removeMissing&&!e.done&&!e.taskId&&!e.projectId&&!edited(e)){removed++;removedIds.push(e.id);return false}e.source.cancelled=true;return true});
    return{schedules:schedules,added:added,updated:updated,unchanged:unchanged,keptEdits:keptEdits,cancelled:cancelled,removed:removed,removedIds:removedIds,meta:{provider:'bupt',accountKey:data.accountKey,termId:data.termId,termStart:data.termStart,fetchedAt:String(data.fetchedAt||'')}}
  }
  return{plan:plan,validate:validate,validDate:validDate};
});
