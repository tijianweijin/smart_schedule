/* Isolated file profiles, synthetic records, no accounts or paid API requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:{width:1366,height:1050},timezoneId:'Asia/Shanghai',acceptDownloads:true}),page=await context.newPage(),errors=[],network=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url())});page.on('dialog',dialog=>dialog.accept());
   await page.clock.install({time:new Date('2026-10-09T11:00:00+08:00')});
   await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
   let ui=mobile?page.frames().find(frame=>frame.parentFrame()):page;
   const key=mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1';
   const day=index=>new Date(Date.UTC(2026,9,9+index)).toISOString().slice(0,10);
   const data={schemaVersion:1,version:'0.5',dayStartHour:6,projects:[],schedules:[],inbox:[],reminders:[],importantDays:[],growth:{series:[],demoSeeded:true}};
   for(let p=0;p<10;p++)data.projects.push({id:'p'+p,name:'项目 '+p+' — 长名称与换行\n第二行',color:'#28794b',nodes:Array.from({length:8},(_,n)=>({id:'n'+p+'-'+n,name:'阶段 '+n,done:false,failed:n===1,checklist:Array.from({length:3},(_,t)=>({id:'t'+p+'-'+n+'-'+t,name:'有效待办 '+t,done:t===0,scheduleId:null}))}))});
   for(let i=0;i<500;i++)data.schedules.push({id:'e'+i,name:'中文很长的日程名称\n第二行 <img src=x onerror=alert(1)> '+i,date:day(i%101-50),start:'09:00',end:'10:00',repeat:'none',done:i%3===0,color:'#112233',location:'图书馆\n二层讨论区'});
   for(let i=0;i<200;i++)data.inbox.push({id:'i'+i,name:'待收纳事项 '+i+'\n补充说明',done:i%2===0,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'});
   for(let i=0;i<200;i++)data.reminders.push({id:'r'+i,name:'提醒 '+i,date:day(i%31-15),done:false});
   for(let p=0;p<10;p++)data.growth.series.push({projectId:'p'+p,name:'项目 '+p,color:'#28794b',deletedOn:null,retiredAfter:null,points:Array.from({length:100},(_,i)=>({date:day(i-99),completion:i/2}))});
   await ui.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key,data});
   const before=Date.now();await page.reload();ui=mobile?page.frames().find(frame=>frame.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo&&document.querySelector('.day-header-cell'));
   const elapsed=Date.now()-before,state=await ui.evaluate(()=>window.__ketimeDemo.getState());
   assert.equal(state.schedules.length,500);assert.equal(state.projects.length,10);assert.equal(state.inbox.length,200);assert.equal(state.reminders.length,200);
   await ui.click('[data-view=projects]');assert.equal(await ui.locator('.project-card').count(),10);
   await ui.click('[data-view=growth]');assert(await ui.locator('#growth-svg').isVisible());
   await ui.click('#settings-btn');const privacy=ui.locator('#settings-data-privacy');assert(await privacy.isVisible());await privacy.locator('summary').click();
   const description=await privacy.textContent();for(const phrase of ['未加密文件','项目和节点','当前日期/时间/时区','不替代','卸载'])assert(description.includes(phrase));
   if(mobile){assert((await ui.locator('#settings-account-section .bupt-note').first().textContent()).includes('Edge 离线布局预览'));}
   await ui.locator('.bupt-backup summary').click();const promise=page.waitForEvent('download');await ui.click('#bupt-export');const download=await promise;
   const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(saved.schedules.length,500);assert.equal(saved.inbox.length,200);assert.equal(saved.projects.length,10);
   await ui.click(mobile?'[data-view=schedule]':'#settings-close');assert(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(errors,[]);assert.deepEqual(network,[]);console.log((mobile?'Android preview':'Desktop')+' release checks: privacy disclosures, 500 schedules, 10 projects/80 nodes, 200 reminders/inbox items, 100-day histories, safe text, export and offline page switches; reload '+elapsed+' ms.');
   await context.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
