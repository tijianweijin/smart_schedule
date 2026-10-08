(function(){
 'use strict';
 // This is a browser-only bridge. It never reads or writes credential vaults.
 window.__ketimeAndroidToken='edge-preview';
 window.KetimeNative={
  exportBackup:function(token,json,name){
   if(token!=='edge-preview'||typeof json!=='string'||json.length>10*1024*1024)throw Error('预览备份格式不正确。');
   JSON.parse(json);var url=URL.createObjectURL(new Blob([json],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=/^[\w.-]+\.json$/.test(name)?name.replace('ketime-backup-','ketime-preview-backup-'):'ketime-preview-backup.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  },
  openAuth:function(){throw Error('离线预览不能进行账号授权，请使用手机安装版或正式网页。');}
 };
 window.fetch=function(){return Promise.reject(Error('离线预览不连接账号或 AI 服务，请使用手机安装版或正式网页。'));};
 window.KetimeEdgePreview={
  example:function(){
   var state=window.__ketimeDemo.getState();if((state.schedules.length||state.inbox.length||state.projects.length)&&!confirm('加载示例会替换当前预览数据，不影响正式网页或手机。需要保留的话请先导出预览备份。继续？'))return;
   var now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'),at=now.toISOString();
   var projectId='preview-project',names=['资料准备','基础复习','章节练习','课程项目','总结验收'];state.projects=[{id:projectId,name:'学期学习计划',color:'#8fbaa5',nodes:names.map(function(name,index){return{id:'preview-node-'+index,name:name,done:index<2,failed:false,clCollapsed:false,checklist:index<2?[]:[{id:'preview-task-'+index,name:['','','完成章节习题','整理课程资料','撰写总结报告'][index],done:false,scheduleId:null}]};})}];
   var points=[];for(var day=29;day>=0;day--){var stamp=new Date(now);stamp.setDate(stamp.getDate()-day);points.push({date:[stamp.getFullYear(),String(stamp.getMonth()+1).padStart(2,'0'),String(stamp.getDate()).padStart(2,'0')].join('-'),completion:Math.round((29-day)/29*40)});}state.growth={series:[{projectId:projectId,name:'学期学习计划',color:'#8fbaa5',deletedOn:null,retiredAfter:null,points:points}],demoSeeded:true};state.holidays=[];state.reminders=[];state.buptSync=null;state.homeworkSync={seen:[],fetchedAt:''};
   state.schedules=[{id:'preview-course',name:'数据结构与算法课程',date:date,start:'09:00',end:'11:00',repeat:'none',done:false,color:'#dceee1',location:'教学楼 201'}];
   state.inbox=[{id:'preview-homework',name:'高等数学：第一章习题',done:false,createdAt:at,updatedAt:at,source:{provider:'bupt-ucloud',accountKey:'a'.repeat(24),sourceId:'preview-homework',title:'第一章习题',courseName:'高等数学',dueAt:date+'T18:00:00+08:00',snapshotName:'高等数学：第一章习题'}},{id:'preview-inbox',name:'整理本周课堂笔记',done:false,createdAt:at,updatedAt:at}];
   localStorage.setItem('ketime-android-edge-preview-v1',JSON.stringify(state));location.reload();
  }
 };
 document.addEventListener('DOMContentLoaded',function(){
  document.title='刻时 Android · 离线预览';
  var note=document.querySelector('#settings-overlay .modal>.bupt-note');if(note)note.textContent='这是 Edge 离线布局预览。只保存独立的预览日程，不保存学校账号、密码或 ChatGPT 授权，也不使用 Android Keystore。';
  var hint=document.getElementById('settings-local-hint');if(hint){hint.hidden=false;hint.textContent='课表、作业与 AI 联网请使用手机安装版或正式网页；本预览不发送任何账号请求。';}
  ['settings-account','settings-password','settings-cloud-password','settings-term-start','settings-save','settings-clear','bupt-sync-btn','ucloud-btn','chatgpt-connect','chatgpt-add-account','chatgpt-refresh'].forEach(function(id){var element=document.getElementById(id);if(element){element.disabled=true;element.title='离线预览不连接账号服务';}});
 });
})();
