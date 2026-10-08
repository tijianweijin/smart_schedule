/* Isolated Edge preview regression: every weekday, no personal data or network. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(let day=5;day<=11;day++){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.clock.install({time:new Date(`2026-10-${String(day).padStart(2,'0')}T10:00:00+08:00`)});
  await page.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);
  const frame=page.frames().find(f=>f.parentFrame());assert(frame);
  await frame.waitForFunction(()=>window.__ketimeDemo&&document.querySelector('.day-header-cell.today'));
  async function centered(){await frame.waitForFunction(()=>{const wrap=document.getElementById('schedule-wrap'),r=wrap.getBoundingClientRect(),d=document.querySelector('.day-header-cell.today').getBoundingClientRect();return Math.abs(d.left+d.width/2-r.left-42-(wrap.clientWidth-42)/2)<1;});}
  await centered();assert.equal(await frame.locator('.day-header-cell').count(),9);
  if(day===8)await page.screenshot({path:path.join(root,'.local/android-edge-today.png')});
  assert.equal(Number(await frame.locator('.day-header-cell.today .day-num').textContent()),day);
  assert(await frame.evaluate(()=>{const headers=[...document.querySelectorAll('.day-header-cell')],index=headers.findIndex(e=>e.classList.contains('today'));return index>0&&index<headers.length-1;}));
  assert(await frame.locator('#date-picker-btn').evaluate(e=>{const s=getComputedStyle(e);return ['borderTopWidth','borderBottomWidth','borderLeftWidth','borderRightWidth'].every(k=>parseFloat(s[k])===0)&&s.boxShadow==='none';}));
  await frame.evaluate(()=>{document.getElementById('schedule-wrap').scrollLeft=0;window.__ketimeDemo.render();});
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await frame.locator('#schedule-wrap').evaluate(e=>e.scrollLeft),0,'Rendering must not interrupt manual browsing');
  await frame.click('[data-view=projects]');await frame.click('[data-view=schedule]');await centered();
  await frame.click('#date-picker-btn');assert(await frame.locator('#calendar-popup').isVisible());
  assert(await frame.locator('#calendar-popup').evaluate(e=>parseFloat(getComputedStyle(e).borderTopWidth)>0),'Popup panel should retain its own border');
  await frame.click('#cal-prev-month');await frame.click('.calendar-day[data-date="2026-09-15"]');
  assert.equal(await frame.locator('.day-header-cell.today').count(),0);assert.equal(await frame.locator('.android-calendar-month').textContent(),'2026年9月');
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);await context.close();
 }
 console.log('Today centering passed for Monday through Sunday: adjacent days, initial and return positioning, manual browsing preserved, calendar button borderless, historical selection unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
