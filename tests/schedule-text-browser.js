/* Inline capture and text priority in isolated desktop and Android Edge profiles. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:mobile?1280:1366,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-09T11:00:00+08:00')});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  let ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  const title='科研项目小组讨论与成果汇报\n第二阶段工作安排';
  const location='沙河校区图书馆三层东侧的综合研讨会议室';
  const make=(id,start,end,name,place='')=>({id,start,end,name,location:place,date:'2026-10-09',repeat:'none',color:'#8fbaa5'});
  await ui.evaluate(s=>localStorage.setItem(window.KetimeEdgePreview?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify(s)),{
   dayStartHour:6,projects:[],inbox:[],reminders:[],growth:{series:[],demoSeeded:true},
   schedules:[make('long','06:00','09:30',title,location),make('short','10:00','11:00',title,location),
    make('tiny','11:30','11:50','提交材料',location),make('marker','12:00','',title,location),
    make('english','15:00','18:00','ResearchAndDevelopmentPlanningMeetingWithInternationalColleagues',location)]
  });
  await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  await ui.waitForFunction(()=>window.__ketimeDemo);
  const settle=()=>ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await settle();
  const cell=ui.locator('.day-reminder-cell[data-date="2026-10-09"]'),input=cell.locator('.day-reminder-input');
  await cell.locator('.day-reminder-add').click();
  assert.equal(await ui.locator('#reminder-overlay.visible').count(),0);
  await input.fill('第一行提醒');
  await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});
  assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).reminders.length,0,'IME confirmation must not create a reminder');
  await input.press('End');await input.press('Shift+Enter');await input.pressSequentially('第二行提醒，文字过长时也要完整换行');
  await input.press('Enter');await settle();
  const reminder=cell.locator('.day-reminder-item');
  assert.equal(await reminder.count(),1);
  assert.equal(await reminder.locator('.reminder-name').textContent(),'第一行提醒\n第二行提醒，文字过长时也要完整换行');
  assert(await reminder.evaluate(e=>{
   const name=e.querySelector('.reminder-name'),toggle=e.querySelector('.reminder-toggle'),s=getComputedStyle(name);
   return s.whiteSpace==='pre-wrap'&&name.clientHeight>parseFloat(s.lineHeight)*2&&toggle.getBoundingClientRect().right<name.getBoundingClientRect().left;
  }));
  await reminder.locator('.reminder-toggle').click();assert(await reminder.locator('.reminder-toggle').getAttribute('aria-pressed')==='true');
  await cell.locator('.day-reminder-add').click();await input.fill('取消这条');await input.press('Escape');assert.equal(await input.count(),0);
  await cell.locator('.day-reminder-add').click();await input.fill('   ');await input.press('Enter');assert.equal(await input.getAttribute('aria-invalid'),'true');await input.press('Escape');
  await cell.locator('.day-reminder-add').click();await input.fill('暂存草稿');
  await reminder.locator('.reminder-toggle').click();assert.equal(await input.inputValue(),'暂存草稿');
  await reminder.locator('.reminder-name').click();await ui.click('#reminder-save');
  assert.equal(await input.inputValue(),'暂存草稿');await input.press('Escape');
  const block=id=>ui.locator('.event-block[data-event-id="'+id+'"]');
  async function measure(id){return block(id).evaluate(e=>{
   const t=e.querySelector('.event-title'),r=t.getBoundingClientRect(),s=getComputedStyle(t),b=e.getBoundingClientRect(),check=e.querySelector('.event-check').getBoundingClientRect();
   const meta=Array.from(e.querySelectorAll('.event-time,.event-link,.event-source')).filter(el=>getComputedStyle(el).display!=='none');
   return {title:t.textContent,titleHeight:r.height,titleLines:r.height/parseFloat(s.lineHeight),whiteSpace:s.whiteSpace,titleBottom:r.bottom,blockBottom:b.bottom,checkTop:check.top,meta:meta.map(el=>({text:el.textContent,height:el.getBoundingClientRect().height,lines:el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight)}))};
  })}
  const long=await measure('long');assert(long.title===title&&long.titleLines>1.9&&long.whiteSpace==='pre-wrap',JSON.stringify(long));
  assert(long.meta.some(m=>m.text.includes(location)&&m.lines>1),JSON.stringify(long));
  const short=await measure('short');assert(short.titleLines>1.9&&short.titleBottom<=short.blockBottom&&!short.meta.some(m=>m.text.includes(location)),JSON.stringify(short));
  const tiny=await measure('tiny');assert(tiny.titleHeight>0&&tiny.meta.length===0,JSON.stringify(tiny));
  const english=await measure('english');assert(english.titleLines>1.9,JSON.stringify(english));
  assert(await block('marker').evaluate(e=>{const title=e.querySelector('.event-title'),check=e.querySelector('.event-check');return title.getBoundingClientRect().height>parseFloat(getComputedStyle(title).lineHeight)*2&&check.getBoundingClientRect().top>=title.getBoundingClientRect().bottom+2}));
  if(mobile){
   for(const size of ['360,800','430,932']){
    await page.selectOption('#preview-size',size);await ui.waitForFunction(w=>innerWidth===w,Number(size.split(',')[0]));await settle();
    const m=await measure('long');assert(m.titleLines>1.9&&m.meta.some(x=>x.text.includes(location)),JSON.stringify(m));
   }
   await page.selectOption('#preview-size','393,851');await settle();
  }
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=0);
  await page.screenshot({path:path.join(root,'.local/schedule-text'+(mobile?'-android':'-desktop')+'.png')});
  await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).reminders[0].name,'第一行提醒\n第二行提醒，文字过长时也要完整换行');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Text browser checks passed: inline Enter, IME, Shift+Enter, circles, cancel, empty input, draft preservation, persistence, Chinese/English/manual wrapping, title priority, locations, short events, markers and responsive Android preview.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
