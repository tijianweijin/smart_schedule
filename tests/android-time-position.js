/* Actual Edge layout, synthetic local time and isolated preview storage. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const scenario of [{time:'09:46',start:6},{time:'05:00',start:6},{time:'00:15',start:6},{time:'16:38',start:10},{time:'23:50',start:0,bottom:true}]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(`2026-10-08T${scenario.time}:00+08:00`)});
  await page.addInitScript(start=>localStorage.setItem('ketime-android-edge-preview-v1',JSON.stringify({dayStartHour:start,projects:[],schedules:[],inbox:[],reminders:[],growth:{series:[]}})),scenario.start);
  await page.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);
  const frame=page.frames().find(f=>f.parentFrame());await frame.waitForFunction(()=>window.__ketimeDemo&&document.querySelector('.day-header-cell.today'));
  async function positioned(){await frame.waitForFunction(()=>{
   const wrap=document.getElementById('schedule-wrap'),now=new Date(),start=Number(document.getElementById('daystart-select').value),hour=document.querySelector('.day-click-cell').getBoundingClientRect().height;
   const expected=Math.min(Math.max(0,now.getHours()*60+now.getMinutes()-120-start*60)/60*hour,wrap.scrollHeight-wrap.clientHeight);
   return Math.abs(wrap.scrollTop-expected)<1;
  });}
  await positioned();
  const layout=await frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap'),first=document.querySelector('.day-click-cell').getBoundingClientRect(),reminder=document.querySelector('.day-reminder-cell').getBoundingClientRect(),now=new Date(),start=Number(document.getElementById('daystart-select').value);return{scroll:wrap.scrollTop,max:wrap.scrollHeight-wrap.clientHeight,target:Math.max(0,now.getHours()*60+now.getMinutes()-120-start*60),hourHeight:first.height,timeTop:first.top,reminderBottom:reminder.bottom};});
  if(scenario.bottom)assert(Math.abs(layout.scroll-layout.max)<1,'Late-day viewport must clamp to the bottom');
  else assert(Math.abs(layout.timeTop+layout.target/60*layout.hourHeight-layout.reminderBottom)<1,'Target minute must align beneath sticky reminders');
  if(scenario.time==='09:46')await page.screenshot({path:path.join(root,'.local/android-edge-time-position.png')});
  await frame.evaluate(()=>{document.getElementById('schedule-wrap').scrollTop=17;window.__ketimeDemo.render();});
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await frame.locator('#schedule-wrap').evaluate(e=>e.scrollTop),17,'Repainting must preserve manual vertical scrolling');
  await frame.click('[data-view=projects]');await frame.click('[data-view=schedule]');await positioned();
  await frame.selectOption('#daystart-select','12');await positioned();
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Time positioning passed: 09:46 -> 07:46, early/midnight start clamp, custom start, late-day bottom clamp, return positioning, start changes, manual scrolling preserved.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
