// Isolated synthetic records; never read or replace a user's live browser data.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');const root=path.resolve(__dirname,'..');let browser;
const before=process.argv.includes('--capture-before');
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [true,false]){
  const context=await browser.newContext({viewport:{width:mobile?1280:1366,height:1050},timezoneId:'Asia/Shanghai',hasTouch:mobile}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-08T09:46:00+08:00')});
  await page.addInitScript(({mobile})=>{if(localStorage.getItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1'))return;
   const events=[['short','08:00','08:15','快速整理','#236C62'],['long','09:00','10:30','图书馆阅读与学习','#6554AA'],['overlap','10:00','11:00','小组讨论','#2E66A3'],['tail','12:00','','阅读截止准备','#9A4660'],['head','','14:00','提交项目成果','#38744D']].map(([id,start,end,name,color])=>({id,start,end,name,color,date:'2026-10-08',repeat:'none',location:'教学楼203室'}));
   localStorage.setItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify({dayStartHour:6,schedules:events,projects:[],inbox:[{id:'inbox-a',name:'整理课堂笔记'},{id:'inbox-b',name:'购买文具'}],reminders:[],growth:{series:[]}}));
  },{mobile});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  const ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo);
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=2*Number(getComputedStyle(document.documentElement).getPropertyValue('--hour').replace('px','')));
  await page.screenshot({path:path.join(root,'.local/ui-optimization-'+(before?'before':'after')+'-'+(mobile?'mobile':'desktop')+'.png')});
  if(before){await context.close();continue;}
  // Assertions and gesture checks follow the actual UI rather than fixed old dimensions.
  assert.equal(await ui.locator('.day-click-cell').first().evaluate(e=>e.getBoundingClientRect().height),96);
  assert.equal(await ui.locator('.day-reminder-cell').first().evaluate(e=>e.getBoundingClientRect().height),48);
  assert.equal(await ui.locator('.untimed-panel').evaluate(e=>e.getBoundingClientRect().height),56);
  assert(await ui.locator('.untimed-scroll').isHidden());await ui.click('#inbox-toggle');assert(await ui.locator('.untimed-scroll').isVisible());
  await ui.click('[data-view=projects]');await ui.click('[data-view=schedule]');assert(await ui.locator('.untimed-scroll').isVisible());await ui.click('#inbox-toggle');
  for(const id of ['short','long','overlap']){const block=ui.locator('[data-event-id="'+id+'"]');assert(await block.locator('.event-time').isVisible());assert(await block.locator('.event-link').isHidden());if(id!=='short')assert.equal(await block.locator('.event-title').evaluate(e=>getComputedStyle(e).fontSize),'16px');}
  assert(await ui.locator('[data-event-id=short] .event-location').isHidden());assert(await ui.locator('[data-event-id=long] .event-time').isVisible());
  await ui.click('#add-event-btn');assert(await ui.locator('#chips-editor .chip-text').first().evaluate(e=>e===document.activeElement));assert.equal(await ui.locator('#save-event').textContent(),'创建日程');assert.equal(await ui.locator('#chips-editor').evaluate(e=>e.getBoundingClientRect().height),56);
  assert.equal(await ui.locator('.color-preset').count(),7);await ui.locator('#chips-editor .chip-text').first().fill('完整表单日程');await ui.fill('#event-start','07:15');await ui.fill('#event-end','07:45');await ui.press('#chips-editor .chip-text','Enter');assert(await ui.locator('#schedule-overlay').isHidden());
  const created=(await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.name==='完整表单日程');assert(created);assert.equal(created.start,'07:15');assert.equal(created.end,'07:45');
  await ui.evaluate(id=>window.KetimeScheduleAPI.jump(id),created.id);await page.clock.runFor(1000);await ui.locator('[data-event-id="'+created.id+'"] .event-title').click();assert(!(await ui.locator('#chips-editor .chip-text').first().evaluate(e=>e===document.activeElement)));await ui.click('#cancel-event');
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=3*96);
  const date='2026-10-08';
  async function coords(minute){return ui.evaluate(({date,minute})=>{const column=document.querySelector('.day-col-overlay[data-date="'+date+'"]'),r=column.getBoundingClientRect(),wrap=document.getElementById('schedule-wrap').getBoundingClientRect();return{x:Math.min(wrap.right-12,r.left+r.width*.5),y:r.top+minute/60*96,top:r.top,wrap:{top:wrap.top,bottom:wrap.bottom}}},{date,minute});}
  // Trusted mouse input exercises the same range selection state machine as touch.
  let first=await coords(330),last=await coords(390); // 11:30–12:30 relative to 06:00.
  // iframe coordinates are local; the outer mouse requires its page position.
  const origin=mobile?await page.locator('iframe').boundingBox():{x:0,y:0};
  async function mouseAt(point){await page.mouse.move(origin.x+point.x,origin.y+point.y);}
  await mouseAt(first);await page.mouse.down();assert(await ui.evaluate(()=>window.KetimeTimeline.hasDraft()),JSON.stringify({first,origin,target:await ui.evaluate(p=>document.elementFromPoint(p.x,p.y)?.outerHTML,first)}));await page.clock.runFor(360);await mouseAt(last);await page.mouse.up();
  assert(await ui.locator('#timeline-quick-create').isVisible());assert.match(await ui.locator('#timeline-quick-range').textContent(),/11:30.*12:30/);assert(await ui.locator('#timeline-quick-name').evaluate(e=>document.activeElement===e));
  const count=(await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.length;await ui.fill('#timeline-quick-name','长按快捷创建');await ui.press('#timeline-quick-name','Enter');const quick=(await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.name==='长按快捷创建');assert.equal(quick.date,date);assert.equal(quick.start,'11:30');assert.equal(quick.end,'12:30');assert.equal(quick.projectId,null);assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,count+1);
  // Upward selection, cancellation, threshold movement and Escape have no side effects.
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=5*96);first=await coords(480);last=await coords(435);
  await mouseAt(first);await page.mouse.down();await page.clock.runFor(360);await mouseAt(last);await page.mouse.up();assert.match(await ui.locator('#timeline-quick-range').textContent(),/13:15.*14:00/);await ui.click('#timeline-quick-cancel');assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,count+1);assert.equal(await ui.locator('.timeline-range-preview').count(),0);
  first=await coords(500);await mouseAt(first);await page.mouse.down();await page.clock.runFor(100);await mouseAt({...first,y:first.y+24});await page.clock.runFor(300);await page.mouse.up();assert(await ui.locator('#timeline-quick-create').isHidden());assert(await ui.locator('#schedule-overlay').isHidden());
  // Simulated keyboard viewport: not a claim about a physical phone's IME.
  await ui.click('#add-event-btn');await ui.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:360});window.visualViewport.dispatchEvent(new Event('resize'))});await page.clock.runFor(32);assert(await ui.locator('#save-event').evaluate(e=>e.getBoundingClientRect().bottom<=360));await ui.click('#cancel-event');await ui.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'))});
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(before?'Saved isolated before screenshots.':'Timeline UX checks passed: responsive visual hierarchy, compact session inbox, full form focus/keyboard, stable colors, mouse long-press/downward/upward selection, cancellation and accidental movement.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
