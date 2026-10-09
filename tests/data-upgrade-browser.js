/* Historical payloads, failed commits and recovery use isolated browser storage. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright'),root=path.resolve(__dirname,'..');let browser;
const legacy=version=>({version,dayStartHour:6,projects:[{id:0,name:'旧项目',color:'#8fbaa5',nodes:[{id:1,name:'旧节点',done:false,failed:true,checklist:[{id:2,name:'旧日程',done:false,scheduleId:3}]}]}],schedules:[{id:3,name:'旧日程',date:'2026-10-09',start:'09:01',end:'10:02',repeat:'none',done:false,color:'#112233',location:'原地点',projectId:0,nodeId:1,taskId:2}],todos:[{id:4,name:'旧待办',done:true,createdAt:'2026-10-01T00:00:00Z'}]});
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1366,height:1050},timezoneId:'Asia/Shanghai',acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.clock.install({time:new Date('2026-10-09T11:00:00+08:00')});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  let ui=mobile?page.frames().find(f=>f.parentFrame()):page;const key=mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1';
  const reload=async()=>{await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo)};
  const get=()=>ui.evaluate(()=>window.__ketimeDemo.getState());
  async function install(raw,extra={}){
   await ui.evaluate(({key,raw,extra})=>{localStorage.clear();localStorage.setItem(key,raw);for(const [k,v]of Object.entries(extra))localStorage.setItem(key+k,v)},{key,raw,extra});await reload();
  }
  for(const version of ['0.1','0.2','0.3','0.4','0.5']){
   const raw=JSON.stringify(legacy(version),null,2);await install(raw);const state=await get();
   assert.equal(state.schemaVersion,1);assert.equal(state.projects[0].id,'0');assert.equal(state.schedules[0].projectId,'0');
   assert.equal(state.projects[0].nodes[0].checklist[0].scheduleId,'3');assert.equal(state.schedules[0].taskId,'2');
   assert.equal(state.inbox[0].id,'4');assert.equal(state.inbox[0].done,true);assert.equal(state.schedules[0].color,'#112233');
   assert.deepEqual(state.reminders,[]);assert.deepEqual(state.importantDays,[]);
   assert.equal(state.growth.series[0].points.length,1);assert.equal(state.growth.series[0].points[0].date,'2026-10-09','Upgrade must not create demo July history');
   assert.equal(await ui.evaluate(k=>localStorage.getItem(k+'-before-schema-1'),key),raw);
   const ids=JSON.stringify(state.projects.map(p=>[p.id,...p.nodes.flatMap(n=>[n.id,...n.checklist.map(t=>t.id)])]));await reload();
   assert.equal(JSON.stringify((await get()).projects.map(p=>[p.id,...p.nodes.flatMap(n=>[n.id,...n.checklist.map(t=>t.id)])])),ids);
   assert.equal((await get()).schedules.length,1);
  }
  // A complete previous release keeps all feature data across repeated upgrades.
  const full=legacy('0.5');
  full.reminders=[{id:8,name:'两行\n提醒',date:'2026-10-10',done:true,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z'}];
  full.importantDays=[{id:9,name:'重要纪念日',date:'2026-10-11',done:false,createdAt:'2026-10-01T00:00:00Z'}];
  full.holidays=[{id:'holiday',name:'国庆',enabled:true,start:'2026-10-01',end:'2026-10-07',makeup:true,moves:[{from:'2026-10-01',to:'2026-10-10'}]}];
  full.todos[0].source={provider:'bupt-ucloud',accountKey:'a'.repeat(24),sourceId:'hw1',title:'原作业',courseName:'原课程',dueAt:'2026-10-11T23:59+08:00',snapshotName:'未修改的作业名'};
  full.homeworkSync={seen:['a'.repeat(24)+':hw1'],fetchedAt:'2026-10-01T00:00:00Z'};
  full.buptSync={provider:'bupt',accountKey:'a'.repeat(24),termId:'2026-2027-1',termStart:'2026-08-31',fetchedAt:'2026-10-01T00:00:00Z'};
  full.growth={demoSeeded:true,series:[{projectId:'deleted-project',name:'已删除项目',color:'#445566',deletedOn:'2026-09-30',retiredAfter:null,points:[{date:'2026-09-30',completion:66.7}]}]};
  full.schedules.push({id:6,name:'背单词',date:'2026-10-07',start:'16:00',end:'16:30',repeat:'daily',endDate:'2026-10-12',color:'#aabbcc',occurrenceStates:[{date:'2026-10-07',done:true},{date:'2026-10-08',exception:true},{date:'2026-10-09',overrideDate:'2026-10-10',start:'',end:'15:30',location:'改地点'}]});
  await install(JSON.stringify(full));let preserved=await get();
  assert.equal(preserved.reminders[0].id,'8');assert.equal(preserved.reminders[0].name,'两行\n提醒');assert.equal(preserved.importantDays[0].id,'9');
  assert.deepEqual(preserved.holidays,full.holidays);assert.equal(preserved.inbox[0].name,'旧待办');assert.equal(preserved.inbox[0].source.dueAt,full.todos[0].source.dueAt);
  assert.deepEqual(preserved.homeworkSync,full.homeworkSync);assert.deepEqual(preserved.buptSync,full.buptSync);
  assert.deepEqual(preserved.growth.series.find(s=>s.projectId==='deleted-project'),full.growth.series[0]);
  assert.equal(preserved.schedules[1].occurrenceStates[0].done,true);assert.equal(preserved.schedules[1].occurrenceStates[1].exception,true);assert.equal(preserved.schedules[1].occurrenceStates[2].start,'');
  await reload();assert.deepEqual(await get(),preserved);
  await ui.click('#settings-btn');await ui.locator('.bupt-backup summary').click();
  const completePromise=page.waitForEvent('download');await ui.click('#bupt-export');const completeDownload=await completePromise,completeBackup=fs.readFileSync(await completeDownload.path(),'utf8');
  await ui.locator('#bupt-backup-file').setInputFiles({name:'complete.json',mimeType:'application/json',buffer:Buffer.from(completeBackup)});assert.deepEqual(await get(),preserved);
  await ui.click(mobile?'[data-view=schedule]':'#settings-close');
  await install(JSON.stringify(legacy('0.5')));
  // Old backups without inbox, growth, reminders or importantDays can be restored.
  await ui.click('#settings-btn');await ui.locator('.bupt-backup summary').click();
  const oldBackup=legacy('0.1');delete oldBackup.todos;
  await ui.locator('#bupt-backup-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});
  await ui.waitForFunction(()=>document.getElementById('settings-status').textContent.includes('备份已恢复'));assert.equal((await get()).schedules.length,1);assert.equal((await get()).inbox.length,0);
  assert(await ui.evaluate(k=>!!localStorage.getItem(k+'-before-restore'),key));
  const downloadPromise=page.waitForEvent('download');await ui.click('#bupt-export-snapshots');const download=await downloadPromise,bundle=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(bundle.format,'ketime-protection-snapshots');assert(bundle.snapshots.some(x=>x.kind==='upgrade'));
  await ui.locator('#bupt-backup-file').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  await ui.waitForFunction(()=>window.__ketimeDemo.getState().inbox.length===1);
  assert.equal((await get()).inbox[0].name,'旧待办');
  await ui.locator('#bupt-backup-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});await ui.waitForFunction(()=>window.__ketimeDemo.getState().inbox.length===0);assert.equal((await get()).inbox.length,0);
  await ui.click(mobile?'[data-view=schedule]':'#settings-close');
  const goodRaw=await ui.evaluate(k=>localStorage.getItem(k),key);
  // Final commit failure must roll back in-memory changes, not only warn.
  await ui.evaluate(key=>{const original=Storage.prototype.setItem;window.__restoreSetItem=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Full','QuotaExceededError');return original.call(this,k,v)}},key);
  await ui.click('#add-untimed-todo');await ui.fill('#untimed-input','保存失败的输入草稿');await ui.locator('#untimed-input').press('Enter');
  assert.equal((await get()).inbox.length,0);assert.equal(await ui.locator('#untimed-input').inputValue(),'保存失败的输入草稿');assert(await ui.locator('#untimed-add-row').isVisible());await ui.locator('#untimed-input').press('Escape');
  await ui.locator('.event-block[data-event-id="3"] .event-check').click();
  assert.equal((await get()).schedules[0].done,false);assert.equal(await ui.evaluate(k=>localStorage.getItem(k),key),goodRaw);
  assert(await ui.locator('#data-storage-warning').isVisible());await ui.evaluate(()=>window.__restoreSetItem());
  await ui.locator('.event-block[data-event-id="3"] .event-check').click();assert.equal((await get()).schedules[0].done,true);
  // A stale page cannot replace changes written by another tab/instance.
  await ui.evaluate(key=>{const next=JSON.parse(localStorage.getItem(key));next.inbox.push({id:'other-tab',name:'另一页面的新记录',done:false});localStorage.setItem(key,JSON.stringify(next))},key);
  const newer=await ui.evaluate(k=>localStorage.getItem(k),key);await ui.locator('.event-block[data-event-id="3"] .event-check').click();
  assert.equal(await ui.evaluate(k=>localStorage.getItem(k),key),newer);await reload();assert.equal((await get()).inbox[0].id,'other-tab');
  // Future, malformed and structurally damaged primary data remain byte-identical.
  for(const raw of ['{broken',JSON.stringify({...legacy('0.5'),schemaVersion:999}),JSON.stringify({...legacy('0.5'),projects:[null]}),JSON.stringify({...legacy('0.5'),schedules:[{date:'2026-02-31'}]})]){
   await install(raw,{'-last-good':goodRaw});assert.equal(await ui.evaluate(k=>localStorage.getItem(k),key),raw);assert(await ui.locator('#data-storage-warning').isVisible());
   assert.equal((await get()).schedules.length,1);await ui.evaluate(()=>{try{window.KetimeScheduleAPI.create([{name:'不允许覆盖',date:'2026-10-09',start:'14:00',end:'15:00',repeat:'none'}])}catch(e){}});
   assert.equal(await ui.evaluate(k=>localStorage.getItem(k),key),raw);
  }
  await ui.click('#data-storage-warning button');await ui.locator('.bupt-backup summary').click();await ui.click('#bupt-recover');
  await ui.waitForFunction(()=>document.getElementById('settings-status').textContent.includes('快照已恢复'));
  assert.equal((await get()).schedules.length,1);assert(await ui.evaluate(k=>!!localStorage.getItem(k+'-protected-original'),key));
  // Legacy event-only associations are reconstructed; source collections remain.
  const linked=legacy('0.5');linked.projects[0].nodes[0].checklist=[];linked.schedules[0].taskId=null;
  await install(JSON.stringify(linked));assert.equal((await get()).projects[0].nodes[0].checklist.length,1);assert.equal((await get()).schedules[0].projectId,'0');
  // A second claimant does not silently steal the real owner's event.
  const conflict=legacy('0.5');conflict.projects[0].nodes[0].checklist.push({id:'extra',name:'另一待办',scheduleId:3,done:true});
  await install(JSON.stringify(conflict));assert.equal((await get()).schedules[0].taskId,'2');assert.equal((await get()).projects[0].nodes[0].checklist[1].scheduleId,null);
  // Empty legacy arrays represent an intentionally empty project list.
  await ui.evaluate(mobile=>{localStorage.clear();localStorage.setItem(mobile?'ketime-edge-preview-project-tracker-data-v5':'project-tracker-data-v5','[]');localStorage.setItem(mobile?'ketime-edge-preview-keshi-schedule-v4':'keshi-schedule-v4',JSON.stringify({events:[],dayStartHour:0}))},mobile);
  await reload();assert.equal((await get()).projects.length,0);assert.equal((await get()).dayStartHour,0);
  // Malformed original small-demo storage is still available for raw export.
  await ui.evaluate(mobile=>{localStorage.clear();localStorage.setItem(mobile?'ketime-edge-preview-project-tracker-data-v5':'project-tracker-data-v5','{broken-legacy')},mobile);
  await reload();assert.equal(await ui.evaluate(k=>localStorage.getItem(k),key),null);assert(await ui.locator('#data-storage-warning').isVisible());
  await ui.click('#data-storage-warning button');await ui.locator('.bupt-backup summary').click();await ui.selectOption('#bupt-snapshot-source','legacyProjectsV5');
  const rawDownload=page.waitForEvent('download');await ui.click('#bupt-export-snapshots');const badDownload=await rawDownload,rawBundle=JSON.parse(fs.readFileSync(await badDownload.path(),'utf8'));assert.equal(rawBundle.snapshots[0].raw,'{broken-legacy');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Data upgrade browser checks passed: 0.1–0.5, numeric IDs, linkage, todos, optional fields, stable reload, exact upgrade snapshots, old backup restore, snapshot export, quota rollback, stale writes, malformed/future protection and recovery, legacy association repair and empty legacy lists on desktop and Android preview.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
