/* Isolated local data tests, never use real accounts or network services. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1366,height:1050},timezoneId:'Asia/Shanghai',acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-09T11:00:00+08:00')});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  let ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  await ui.evaluate(()=>localStorage.setItem(window.KetimeEdgePreview?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify({projects:[],schedules:[],inbox:[],reminders:[],dayStartHour:6,growth:{series:[],demoSeeded:true}})));
  const reload=async()=>{await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo)};
  await reload();const state=()=>ui.evaluate(()=>window.__ketimeDemo.getState());
  assert.deepEqual((await state()).importantDays,[]);
  assert(await ui.locator('.day-reminder-cell[data-date="2026-10-09"]').evaluate(e=>Math.abs(e.querySelector('.day-reminder-head').getBoundingClientRect().top-e.getBoundingClientRect().top-parseFloat(getComputedStyle(e).paddingTop))<1));
  for(const id of ['event-start','event-end','task-start','task-end'])assert.equal(await ui.locator('#'+id).getAttribute('step'),'60');
  await ui.click('#add-event-btn');await ui.locator('#chips-editor .chip-text').first().fill('逐分钟');
  await ui.fill('#event-start','09:01');await ui.fill('#event-end','10:02');await ui.click('#save-event');
  assert.equal((await state()).schedules[0].start,'09:01');assert.equal((await state()).schedules[0].end,'10:02');
  await ui.click('#settings-btn');if(mobile)await ui.locator('#settings-important-section>summary').click();await ui.fill('#important-day-date','2026-10-09');await ui.fill('#important-day-name','纪念日 <安全显示>');await ui.click('#important-day-save');
  assert.equal((await state()).importantDays.length,1);assert.equal((await state()).reminders.length,0);
  assert.equal(await ui.locator('#important-days-list .important-day-entry').count(),1);
  await page.screenshot({path:path.join(root,'.local','important-days-settings'+(mobile?'-android':'-desktop')+'.png')});
  await ui.locator('.important-day-entry button').first().click();await ui.fill('#important-day-date','2026-10-10');await ui.fill('#important-day-name','重要纪念日');await ui.click('#important-day-save');
  assert.equal((await state()).importantDays.length,1);assert.equal((await state()).importantDays[0].date,'2026-10-10');
  await ui.click(mobile?'[data-view=schedule]':'#settings-close');
  const cell=ui.locator('.day-reminder-cell[data-date="2026-10-10"]');
  assert.equal(await cell.locator('.reminder-name').textContent(),'重要纪念日');
  assert.equal(await ui.locator('.day-reminder-cell[data-date="2026-10-09"] .day-reminder-item').count(),0);
  await cell.locator('.reminder-toggle').click();assert.equal((await state()).importantDays[0].done,true);
  await cell.locator('.reminder-name').click();assert.equal(await ui.locator('#reminder-modal-title').textContent(),'编辑重要日');
  await ui.fill('#reminder-name','纪念日更新');await ui.click('#reminder-save');
  assert.equal((await state()).importantDays[0].name,'纪念日更新');assert.equal((await state()).reminders.length,0);
  await cell.locator('.day-reminder-add').click();await cell.locator('.day-reminder-input').fill('普通提醒');await cell.locator('.day-reminder-input').press('Enter');
  assert.equal((await state()).reminders.length,1);assert.equal(await cell.locator('.day-reminder-item').count(),2);
  assert(await cell.evaluate(e=>e.querySelector('.day-reminder-list').lastElementChild.classList.contains('day-reminder-head')));
  await page.screenshot({path:path.join(root,'.local','important-days-calendar'+(mobile?'-android':'-desktop')+'.png')});
  await reload();assert.equal((await state()).importantDays[0].done,true);
  await ui.click('#settings-btn');if(mobile)await ui.locator('#settings-important-section>summary').click();await ui.locator('.bupt-backup summary').click();
  const downloading=page.waitForEvent('download');await ui.click('#bupt-export');const download=await downloading,backup=fs.readFileSync(await download.path(),'utf8');
  assert.equal(JSON.parse(backup).importantDays[0].name,'纪念日更新');
  page.once('dialog',d=>d.dismiss());await ui.locator('.important-day-entry button').last().click();assert.equal((await state()).importantDays.length,1);
  page.once('dialog',d=>d.accept());await ui.locator('.important-day-entry button').last().click();assert.equal((await state()).importantDays.length,0);
  page.once('dialog',d=>d.accept());await ui.locator('#bupt-backup-file').setInputFiles({name:'important-days.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await ui.waitForFunction(()=>window.__ketimeDemo.getState().importantDays.length===1);
  assert.equal(await ui.locator('.important-day-entry').count(),1);await ui.click(mobile?'[data-view=schedule]':'#settings-close');
  assert.equal(await ui.locator('.day-reminder-cell[data-date="2026-10-10"] .day-reminder-item').count(),2);
  if(mobile){
   for(const size of ['360,800','393,851','430,932']){
    await page.selectOption('#preview-size',size);await ui.waitForFunction(w=>innerWidth===w,Number(size.split(',')[0]));
    await ui.click('#settings-btn');assert(await ui.locator('.important-days-settings').evaluate(e=>e.scrollWidth<=e.clientWidth));await ui.click(mobile?'[data-view=schedule]':'#settings-close');
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Important-day and minute checks passed: upgrade, exact date, add/edit/move/toggle/delete, local persistence, backup/restore, safe text, empty/add sequence positioning, desktop and Android preview.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
