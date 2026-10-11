/* Bounded rolling weeks in isolated real Edge; no personal data or services. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 await page.clock.install({time:new Date('2026-10-08T09:46:00+08:00')});
 await page.addInitScript(()=>localStorage.setItem('ketime-android-edge-preview-v1',JSON.stringify({dayStartHour:0,projects:[],inbox:[],growth:{series:[]},schedules:[{id:'sunday-night',name:'周日跨午夜',date:'2026-10-11',start:'23:30',end:'00:30',repeat:'none',color:'#8fbaa5'}],reminders:[{id:'monday-reminder',name:'周一提醒',date:'2026-10-12',done:false}]})));
 await page.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);
 const frame=page.frames().find(f=>f.parentFrame());await frame.waitForFunction(()=>window.__ketimeDemo&&window.KetimeAndroid.selectedScheduleDate==='2026-10-08');
 const settle=()=>frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 async function snapshot(){return frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap'),box=wrap.getBoundingClientRect(),middle=box.left+wrap.clientWidth/2,heads=[...document.querySelectorAll('.day-header-cell')],head=heads.find(h=>{const r=h.getBoundingClientRect();return r.left<=middle&&r.right>middle;}),column=[...document.querySelectorAll('.day-col-overlay')].find(c=>c.style.gridColumn===head.style.gridColumn);return{date:column.dataset.date,x:head.getBoundingClientRect().left-box.left,first:document.querySelector('.day-col-overlay').dataset.date,top:wrap.scrollTop,count:heads.length,cells:document.querySelectorAll('.day-click-cell').length,selected:window.KetimeAndroid.selectedScheduleDate};});}
 const original=await frame.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState()));
 assert.equal((await snapshot()).count,21);assert.equal((await snapshot()).first,'2026-09-28');
 for(const direction of [1,-1])for(let i=0;i<20;i++){
  const before=await frame.evaluate(direction=>{const wrap=document.getElementById('schedule-wrap'),width=document.querySelector('.day-header-cell').getBoundingClientRect().width;wrap.scrollTop=200;wrap.scrollLeft=direction===1?wrap.scrollWidth-wrap.clientWidth-3*width+10:3*width-10;const box=wrap.getBoundingClientRect(),middle=box.left+wrap.clientWidth/2,heads=[...document.querySelectorAll('.day-header-cell')],head=heads.find(h=>{const r=h.getBoundingClientRect();return r.left<=middle&&r.right>middle;}),column=[...document.querySelectorAll('.day-col-overlay')].find(c=>c.style.gridColumn===head.style.gridColumn);return{date:column.dataset.date,x:head.getBoundingClientRect().left-box.left,first:document.querySelector('.day-col-overlay').dataset.date};},direction);
  await frame.waitForFunction(first=>document.querySelector('.day-col-overlay').dataset.date!==first,before.first);await settle();const after=await snapshot();
  assert.equal(after.date,before.date);assert(Math.abs(after.x-before.x)<1.5,'Replacing a cached week must not shift visible date position');assert.equal(after.top,200);assert.equal(after.count,21);assert.equal(after.cells,504);assert.equal(after.selected,after.date);
  const a=new Date(before.first+'T12:00:00Z'),b=new Date(after.first+'T12:00:00Z');assert.equal((b-a)/86400000,7*direction);
 }
 assert.equal(await frame.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState())),original,'Browsing never changes persisted records');
 await frame.click('#date-picker-btn');const selected=(await snapshot()).date;assert.equal(await frame.locator('#cal-month-label').textContent(),Number(selected.slice(0,4))+'年'+Number(selected.slice(5,7))+'月');
 await frame.click('#date-picker-btn');await frame.click('[data-view=projects]');await frame.click('[data-view=schedule]');await frame.waitForFunction(()=>window.KetimeAndroid.selectedScheduleDate==='2026-10-08');
 await frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap'),col=document.querySelector('.day-col-overlay[data-date="2026-10-11"]'),head=[...document.querySelectorAll('.day-header-cell')].find(h=>h.style.gridColumn===col.style.gridColumn),box=wrap.getBoundingClientRect(),r=head.getBoundingClientRect();wrap.scrollLeft+=r.left+r.width/2-box.left-wrap.clientWidth/2;});await settle();assert.equal((await snapshot()).date,'2026-10-11');
 await frame.evaluate(()=>{document.getElementById('schedule-wrap').scrollLeft+=document.querySelector('.day-header-cell').getBoundingClientRect().width;});await settle();assert.equal((await snapshot()).date,'2026-10-12');
 assert.equal(await frame.locator('.event-block[data-event-id="sunday-night"]').count(),2);assert.equal(await frame.locator('.day-reminder-cell[data-date="2026-10-12"] .reminder-name').textContent(),'周一提醒');
 await frame.click('#date-picker-btn');await frame.click('.calendar-day[data-date="2026-10-12"]');await settle();assert.equal((await snapshot()).date,'2026-10-12');assert.equal((await snapshot()).top,0);
 await frame.locator('.day-click-cell[data-date="2026-10-12"][data-hour="09"]').click();assert.equal(await frame.locator('#event-date').inputValue(),'2026-10-12');await frame.click('#cancel-event');
 await frame.locator('#schedule-wrap').hover();await page.mouse.wheel(117*8,0);await frame.waitForFunction(()=>window.KetimeAndroid.selectedScheduleDate==='2026-10-20');assert.equal((await snapshot()).count,21);
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);await context.close();
 console.log('Infinite calendar passed: 40 rolling week loads both directions, year/month boundaries, fixed 21-day/504-cell cache, no viewport jump or data writes, Sunday/Monday and overnight continuation, reminders, selected-month calendar, date/time positioning and new-event date.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
