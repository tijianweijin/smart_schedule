/* Calendar marker follows the actual viewport center, without moving the grid. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 await page.clock.install({time:new Date('2026-10-08T09:46:00+08:00')});
 await page.addInitScript(()=>localStorage.setItem('ketime-android-edge-preview-v1',JSON.stringify({dayStartHour:6,projects:[],schedules:[],inbox:[],reminders:[],growth:{series:[]}})));
 await page.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);
 const frame=page.frames().find(f=>f.parentFrame());await frame.waitForFunction(()=>window.__ketimeDemo&&document.querySelector('.day-header-cell.today'));
 async function marked(date){await frame.waitForFunction(date=>{const selected=document.querySelectorAll('.calendar-day.android-calendar-selected');return selected.length===1&&selected[0].dataset.date===date&&selected[0].getAttribute('aria-pressed')==='true';},date);}
 await frame.click('#date-picker-btn');await marked('2026-10-08');
 async function assertColor(selector,variable,foreground){const color=await frame.locator(selector).evaluate((e,variable)=>{const probe=document.createElement('span');probe.style.backgroundColor='var('+variable+')';document.body.appendChild(probe);const result={actual:getComputedStyle(e).backgroundColor,expected:getComputedStyle(probe).backgroundColor,foreground:getComputedStyle(e).color};probe.remove();return result;},variable);assert.equal(color.actual,color.expected);if(foreground)assert.equal(color.foreground,foreground);}
 await assertColor('.calendar-day.android-calendar-selected','--primary','rgb(255, 255, 255)');
 await frame.click('.calendar-day[data-date="2026-10-07"]');await frame.click('#date-picker-btn');await marked('2026-10-07');
 await assertColor('.calendar-day.android-calendar-selected','--primary','rgb(255, 255, 255)');
 await assertColor('.calendar-day.today:not(.android-calendar-selected)','--primary-soft');
 await frame.hover('.calendar-day.android-calendar-selected');await assertColor('.calendar-day.android-calendar-selected','--primary');
 await frame.hover('.calendar-day.today');await assertColor('.calendar-day.today','--primary-soft');
 await frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap');wrap.scrollTop=200;wrap.scrollLeft+=document.querySelector('.day-header-cell').getBoundingClientRect().width;});
 await marked('2026-10-08');assert.equal(await frame.locator('#schedule-wrap').evaluate(e=>e.scrollTop),200,'Highlighting must not change time scroll');
 await frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap'),rect=wrap.getBoundingClientRect(),heads=[...document.querySelectorAll('.day-header-cell')],col=document.querySelector('.day-col-overlay[data-date="2026-10-09"]'),head=heads.find(e=>e.style.gridColumn===col.style.gridColumn);wrap.scrollLeft+=head.getBoundingClientRect().left-(rect.left+wrap.clientWidth/2)+1;});
 await marked('2026-10-09');
 const scroll=await frame.locator('#schedule-wrap').evaluate(e=>[e.scrollLeft,e.scrollTop]);
 await frame.evaluate(()=>window.__ketimeDemo.render());await marked('2026-10-09');
 assert.deepEqual(await frame.locator('#schedule-wrap').evaluate(e=>[e.scrollLeft,e.scrollTop]),scroll,'Repainting and highlighting preserve browsing position');
 await frame.click('#cal-next-month');await frame.waitForFunction(()=>!document.querySelector('.android-calendar-selected'));
 await frame.click('#cal-prev-month');await marked('2026-10-09');
 await frame.click('#date-picker-btn');await frame.click('#date-picker-btn');await marked('2026-10-09');
 await page.screenshot({path:path.join(root,`.local/android-calendar-selection-${process.pid}.png`)});
 await frame.click('.calendar-day[data-date="2026-10-11"]');await frame.click('#date-picker-btn');await marked('2026-10-11');
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);await context.close();
 console.log('Calendar selection passed: dark-green selected date, light-green unselected today, hover colors, date picking, swipe and exact viewport-center boundary, redraw and reopen, month navigation, one selected marker only, scroll position preserved.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
