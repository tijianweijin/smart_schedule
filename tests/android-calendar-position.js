/* Calendar selection in real Edge, isolated storage and fixed local time. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const scenario of [{time:'09:46',start:6,width:393},{time:'05:00',start:6,width:360},{time:'23:50',start:0,width:430},{time:'16:38',start:10,width:393}]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.clock.install({time:new Date(`2026-10-08T${scenario.time}:00+08:00`)});
  await page.addInitScript(start=>localStorage.setItem('ketime-android-edge-preview-v1',JSON.stringify({dayStartHour:start,projects:[],schedules:[],inbox:[],reminders:[],growth:{series:[]}})),scenario.start);
  await page.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);
  const frame=page.frames().find(f=>f.parentFrame());await frame.waitForFunction(()=>window.__ketimeDemo&&document.querySelector('.day-header-cell.today'));
  await frame.evaluate(width=>{document.documentElement.style.width=width+'px';document.body.style.width=width+'px';},scenario.width);
  async function select(date){
   await frame.click('#date-picker-btn');
   const month=Number(date.slice(0,4))*12+Number(date.slice(5,7));
   for(let i=0;i<24;i++){
    const text=await frame.locator('#cal-month-label').textContent(),parts=text.match(/(\d+)年(\d+)月/),current=Number(parts[1])*12+Number(parts[2]);
    if(current===month)break;
    await frame.click(current<month?'#cal-next-month':'#cal-prev-month');
   }
   await frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap');wrap.scrollLeft=0;wrap.scrollTop=400;});
   await frame.click(`.calendar-day[data-date="${date}"]`);
   await frame.waitForFunction(date=>{
    const wrap=document.getElementById('schedule-wrap'),col=document.querySelector(`.day-col-overlay[data-date="${date}"]`),head=col&&[...document.querySelectorAll('.day-header-cell')].find(h=>h.style.gridColumn===col.style.gridColumn);
    if(!head)return false;
    const r=wrap.getBoundingClientRect(),d=head.getBoundingClientRect(),now=new Date(),hour=document.querySelector('.day-click-cell').getBoundingClientRect().height,start=Number(document.getElementById('daystart-select').value)*60;
    const expected=head.classList.contains('today')?Math.min(Math.max(0,now.getHours()*60+now.getMinutes()-120-start)/60*hour,wrap.scrollHeight-wrap.clientHeight):0;
    return Math.abs(d.left+d.width/2-r.left-42-(wrap.clientWidth-42)/2)<1&&Math.abs(wrap.scrollTop-expected)<1;
   },date);
   assert(!(await frame.locator('#calendar-popup').isVisible()));
   assert.equal(await frame.locator('.android-calendar-month').textContent(),Number(date.slice(0,4))+'年'+Number(date.slice(5,7))+'月');
  }
  for(const date of ['2026-10-05','2026-10-06','2026-10-07','2026-10-09','2026-10-10','2026-10-11','2026-09-15','2027-01-01','2026-10-08','2026-10-08'])await select(date);
  await select('2026-10-07');await frame.selectOption('#daystart-select','12');
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await frame.waitForFunction(()=>document.getElementById('schedule-wrap').scrollTop===0);
  assert.equal(await frame.locator('.hour-label-cell').first().textContent(),'12:00');
  await frame.evaluate(()=>{const wrap=document.getElementById('schedule-wrap');wrap.scrollLeft=10;wrap.scrollTop=17;window.__ketimeDemo.render();});
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(await frame.locator('#schedule-wrap').evaluate(e=>[e.scrollLeft,e.scrollTop]),[10,17],'Repainting preserves manual scrolling after selection');
  await select('2026-10-08');
  if(scenario.time==='09:46')await page.screenshot({path:path.join(root,`.local/android-calendar-position-${process.pid}.png`)});
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);await context.close();
 }
 console.log('Calendar positioning passed: selected weekday/date centered, past/future/cross-year start at configured hour, today uses current time minus two hours with clamps, repeated selection, start changes and manual scrolling.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
