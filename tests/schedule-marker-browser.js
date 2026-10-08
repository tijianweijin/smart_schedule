/* Real desktop and Edge-phone rendering; synthetic data in isolated browser profiles. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');const root=path.resolve(__dirname,'..');let browser;
function event(id,start,end,extra={}){return{id,name:id==='start'?'开放自习':'提交报告',date:'2026-10-08',start,end,repeat:'none',color:'#8fbaa5',location:'图书馆',...extra};}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:mobile?1280:1366,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.clock.install({time:new Date('2026-10-08T11:00:00+08:00')});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  let ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  async function show(schedules){await ui.evaluate(data=>localStorage.setItem(window.KetimeEdgePreview?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify(data)),{dayStartHour:6,projects:[{id:'project',name:'测试项目',color:'#8fbaa5',nodes:[{id:'node',name:'测试节点',checklist:[],done:false}]}],schedules,inbox:[],reminders:[],growth:{series:[]}});await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo&&window.KetimeAssistant);}
  const block=(id,segment)=>ui.locator('.event-block[data-event-id="'+id+'"]'+(segment?'[data-segment="'+segment+'"]':''));
  await show([event('start','09:00',''),event('end','','09:45',{color:'#aac7df'}),event('normal','09:25','10:00',{color:'#dbc593'}),event('repeat','10:30','11:00',{repeat:'daily',endDate:'2026-10-10'}),event('isolated-start','12:00','',{name:'小组讨论',location:'自习室'}),event('isolated-end','','14:00',{name:'资料截止',location:'办公室',color:'#aac7df'})]);
  assert.equal(await ui.locator('#event-time-mode,#task-time-mode').count(),0);
  for(const [id,direction] of [['start','bottom'],['end','top']]){
   const marker=block(id);assert(await marker.evaluate(e=>e.classList.contains('event-marker')));assert.equal(await marker.locator('.event-title').textContent(),(id==='start'?'开放自习':'提交报告')+'（图书馆）');
   const shape=await marker.evaluate(e=>{const fade=e.querySelector('.marker-fade'),s=getComputedStyle(fade),title=e.querySelector('.event-title').getBoundingClientRect(),r=e.getBoundingClientRect();return{height:r.height,mask:fade.style.maskImage,size:s.maskSize,titleTop:title.top,titleBottom:title.bottom,top:r.top,bottom:r.bottom};});
   assert(Math.abs(shape.height-28)<1&&(direction==='bottom'?!shape.mask.includes('to top'):shape.mask.includes('to top'))&&shape.size==='100% 28px'&&(direction==='bottom'?shape.titleTop>=shape.top+2:shape.titleBottom<=shape.bottom-2),JSON.stringify({mobile,id,...shape}));
   assert((await marker.locator('.marker-fade').getAttribute('style')).includes('239, 107, 100'));
   assert.match(await marker.getAttribute('aria-label'),/有时间重叠/);
  }
  assert.deepEqual(JSON.parse(await block('start').getAttribute('data-conflicts')),[{start:195,end:210}]);
  assert.deepEqual(JSON.parse(await block('end').getAttribute('data-conflicts')),[{start:195,end:225}]);
  assert.equal(await ui.locator('.has-conflict').count(),3);
  for(const id of ['start','isolated-start','end','isolated-end','normal','repeat']){
   const item=block(id).first();
   const placement=await item.evaluate(e=>{const check=e.querySelector('.event-check').getBoundingClientRect(),title=e.querySelector('.event-title').getBoundingClientRect(),r=e.getBoundingClientRect();return{checkTop:check.top,checkBottom:check.bottom,checkRight:check.right,right:r.right,titleBottom:title.bottom,bottom:r.bottom,checkHeight:check.height};});
   assert(Math.abs(placement.right-placement.checkRight-(['normal','repeat'].includes(id)?4:3))<1,JSON.stringify({id,mobile,...placement}));
   if(id==='start'||id==='isolated-start')assert(placement.checkTop>=placement.titleBottom+2,JSON.stringify({id,mobile,...placement}));
   else assert(Math.abs(placement.bottom-placement.checkBottom-3)<1,JSON.stringify({id,mobile,...placement}));
  }
  assert.match(await block('start').getAttribute('aria-label'),/无尾日程/);assert.match(await block('end').getAttribute('aria-label'),/无头日程/);
  if(mobile){
   for(const size of ['360,800','430,932','393,851']){
    await page.selectOption('#preview-size',size);await ui.waitForFunction(w=>innerWidth===w,Number(size.split(',')[0]));
    await ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    for(const id of ['start','isolated-start','end','isolated-end','normal'])assert(await block(id).evaluate(e=>{const check=e.querySelector('.event-check').getBoundingClientRect(),title=e.querySelector('.event-title').getBoundingClientRect(),r=e.getBoundingClientRect(),start=e.classList.contains('marker-start-only'),marker=e.classList.contains('event-marker');return Math.abs(r.right-check.right-(marker?3:4))<1&&(start?check.top>=title.bottom+2:Math.abs(r.bottom-check.bottom-3)<1);}),id+' must stay lower-right after resizing');
   }
  }
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=2*56);await page.screenshot({path:path.join(root,'.local/schedule-markers'+(mobile?'-android':'-desktop')+'.png')});
  await block('start').locator('.event-check').click();assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='start').done);
  await block('start').locator('.event-title').click();assert.equal(await ui.locator('#event-end').inputValue(),'');await ui.fill('#event-end','09:30');await ui.click('#save-event');assert.equal(await block('start').locator('.marker-fade').count(),0);
  await block('start').focus();await block('start').press('Enter');await ui.click('[data-clear-time=event-start]');await ui.click('#save-event');assert(await block('start').evaluate(e=>e.classList.contains('marker-end-only')));
  await block('start').locator('.event-title').click();await ui.click('[data-clear-time=event-end]');await ui.click('#save-event');assert(await ui.locator('#schedule-overlay').isVisible());await ui.click('#cancel-event');
  await block('repeat').first().click();await ui.click('#choice-single');await ui.click('[data-clear-time=event-end]');await ui.click('#save-event');assert.equal(await block('repeat').locator('.marker-fade').count(),1);
  await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo);const saved=await ui.evaluate(()=>window.__ketimeDemo.getState());assert.equal(saved.schedules.find(e=>e.id==='start').start,'');assert.equal(saved.schedules.find(e=>e.id==='repeat').occurrenceStates[0].end,'');assert.equal(saved.schedules.find(e=>e.id==='repeat').end,'11:00');
  await ui.click('#add-event-btn');await ui.locator('#chips-editor .chip-text').first().fill('关联截止标记');await ui.fill('#event-start','');await ui.fill('#event-end','13:00');await ui.selectOption('#event-project','project');await ui.click('#save-event');
  let state=await ui.evaluate(()=>window.__ketimeDemo.getState());const linked=state.schedules.at(-1);assert.equal(linked.start,'');assert(state.projects[0].nodes[0].checklist.some(t=>t.scheduleId===linked.id));
  await ui.click('[data-view=projects]');await ui.locator('[data-action=edit-task]').first().click();assert.equal(await ui.locator('#task-start').inputValue(),'');await ui.fill('#task-start','12:00');await ui.click('[data-clear-time=task-end]');await ui.click('#save-task');state=await ui.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules.find(e=>e.id===linked.id).end,'');
  await show([event('boundary-start','05:50',''),event('boundary-end','','06:10'),event('boundary-exact','','06:00')]);
  for(const id of ['boundary-start','boundary-end']){assert.equal(await block(id).count(),2);assert.equal(await ui.locator('.event-block[data-event-id="'+id+'"].marker-has-line').count(),1);const height=await block(id).evaluateAll(es=>es.reduce((sum,e)=>sum+e.getBoundingClientRect().height,0));assert(Math.abs(height-28)<1);}
  assert.equal(await ui.locator('.event-block[data-event-id=boundary-exact].marker-has-line').count(),1);
  assert.equal(await block('boundary-exact').evaluate(e=>e.parentElement.dataset.date),'2026-10-07');
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=0);
  await block('boundary-end','start').locator('.event-check').click({timeout:3500});assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='boundary-end').done);
  await block('boundary-start','continuation').locator('.event-check').click({timeout:3500});assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='boundary-start').done);
  await block('boundary-end','start').locator('.event-title').click();assert(await ui.locator('#schedule-overlay').isVisible());await ui.click('#cancel-event');
  await page.screenshot({path:path.join(root,'.local/schedule-markers-boundary'+(mobile?'-android':'-desktop')+'.png')});
  const raw={name:'助手单端时间',date:'2026-10-08',start:'',end:'14:00',repeat:'none',endDate:null,color:'#8fbaa5',location:'办公室',notes:'',projectId:null,nodeId:null};
  await ui.evaluate(e=>window.KetimeScheduleAPI.create([e]),raw);assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.at(-1).start,'');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Marker browser checks passed: desktop/phone, both fade directions, exact 30-minute geometry and red overlap, clear-time creation/editing, completion, repeat blank overrides, persistence, project sync, day-boundary splitting and assistant creation.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
