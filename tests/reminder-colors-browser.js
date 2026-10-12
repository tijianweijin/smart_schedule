/* Isolated desktop/Android preview: bottom reminders and arbitrary schedule colors. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:mobile?1280:1366,height:1050},timezoneId:'Asia/Shanghai',hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-09T11:00:00+08:00')});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  let ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  await ui.evaluate(s=>localStorage.setItem(window.KetimeEdgePreview?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify(s)),{
   projects:[{id:'p',name:'项目',color:'#8fbaa5',nodes:[{id:'n',name:'节点',checklist:[{id:'original',name:'原待办',done:false}],done:false}]}],
   dayStartHour:6,schedules:[],inbox:[],reminders:[],growth:{series:[],demoSeeded:true}
  });
  await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo);
  const settle=()=>ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await settle();
  const cell=ui.locator('.day-reminder-cell[data-date="2026-10-09"]');
  assert(await cell.evaluate(e=>{
   const head=e.querySelector('.day-reminder-head').getBoundingClientRect(),r=e.getBoundingClientRect(),padding=parseFloat(getComputedStyle(e).paddingTop);
   return Math.abs(head.top-r.top-padding)<1;
  }),'Empty reminder add control should sit at the top');
  for(let i=0;i<8;i++){await cell.locator('.day-reminder-add').click();await cell.locator('.day-reminder-input').fill('提醒 '+i);await cell.locator('.day-reminder-input').press('Enter')}
  await settle();
  assert(await cell.evaluate(e=>{
   const head=e.querySelector('.day-reminder-head'),list=e.querySelector('.day-reminder-list');
   return list.lastElementChild===head&&list.scrollHeight>list.clientHeight;
  }),'Add control should be the final item inside a bounded scrollable list');
  await cell.locator('.day-reminder-list').evaluate(e=>e.scrollTop=e.scrollHeight);
  assert(await cell.evaluate(e=>e.querySelector('.day-reminder-head').getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom));
  await cell.locator('.day-reminder-add').click();await cell.locator('.day-reminder-input').fill('继续添加');await cell.locator('.day-reminder-input').press('Enter');
  await ui.click('#add-event-btn');
  const picker=ui.locator('#event-color-presets'),status=picker.locator('.custom-color-status'),out=picker.locator('.color-value');
  assert.equal(await picker.locator('.color-preset').count(),7);
  await ui.locator('#chips-editor .chip-text').first().fill('自选颜色日程');
  async function rgb(box,values){for(let i=0;i<3;i++)await box.locator('[data-channel="'+['R','G','B'][i]+'"]').fill(String(values[i]))}
  await rgb(picker,[255,0,0]);assert.equal(await out.textContent(),'#FF0000');
  await picker.locator('.color-hue').evaluate(e=>{e.value='120';e.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(await out.textContent(),'#00FF00');
  const spectrum=picker.locator('.color-spectrum'),rect=await spectrum.boundingBox();
  if(mobile)await spectrum.tap({position:{x:rect.width/2,y:rect.height/2}});
  else await spectrum.click({position:{x:rect.width/2,y:rect.height/2}});
  const channels=await picker.locator('.color-rgb-row input').evaluateAll(es=>es.map(e=>Number(e.value)));
  assert(Math.abs(channels[0]-64)<=1&&Math.abs(channels[1]-128)<=1&&Math.abs(channels[2]-64)<=1,JSON.stringify(channels));
  await spectrum.press('Shift+ArrowLeft');assert.notEqual(await out.textContent(),'#408040');
  const drag=await spectrum.boundingBox();
  await page.mouse.move(drag.x+drag.width/2,drag.y+drag.height/2);await page.mouse.down();
  await page.mouse.move(drag.x-12,drag.y+drag.height/3,{steps:4});await page.mouse.up();
  const gray=await picker.locator('.color-rgb-row input').evaluateAll(es=>es.map(e=>Number(e.value)));
  assert(gray.every(v=>v===gray[0]),'Dragging outside spectrum should safely clamp saturation at zero');
  await picker.locator('[data-channel=R]').fill('256');assert.match(await status.textContent(),/0–255/);await ui.click('#save-event');assert(await ui.locator('#schedule-overlay').isVisible());assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,0);
  await picker.locator('.color-preset').first().click();assert.equal(await out.textContent(),'#236C62');assert.equal(await status.textContent(),'');assert.equal(await picker.locator('.color-preset.selected').count(),1);
  await rgb(picker,[12,34,56]);assert.equal(await out.textContent(),'#0C2238');assert.equal(await picker.locator('.color-preset.selected').count(),0);
  await picker.locator('[data-channel=B]').fill('');await ui.click('#save-event');assert(await ui.locator('#schedule-overlay').isVisible());
  await picker.locator('[data-channel=B]').fill('12.5');assert.match(await status.textContent(),/整数/);
  await picker.locator('[data-channel=B]').fill('56');await ui.click('#save-event');
  let state=await ui.evaluate(()=>window.__ketimeDemo.getState());const saved=state.schedules.find(e=>e.name==='自选颜色日程');assert.equal(saved.color,'#0c2238');
  assert.equal(await ui.locator('.event-block[data-event-id="'+saved.id+'"] .event-title').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)','Dark custom colors need readable text');
  await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo);
  await ui.locator('.event-block[data-event-id="'+saved.id+'"] .event-title').click();
  assert.equal(await ui.locator('#event-color-presets .color-value').textContent(),'#0C2238');
  assert.deepEqual(await ui.locator('#event-color-presets .color-rgb-row input').evaluateAll(es=>es.map(e=>Number(e.value))),[12,34,56]);
  await ui.locator('#event-color-presets [data-channel=R]').fill('200');await ui.click('#cancel-event');assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id===saved.id).color,'#0c2238');
  await ui.click('[data-view=projects]');await ui.click('[data-action=add-task][data-pi="0"][data-ni="0"]');
  await ui.fill('#task-name','关联颜色待办');await ui.selectOption('#task-schedule-link','linked');
  const taskPicker=ui.locator('#task-color-presets');assert.equal(await taskPicker.locator('.color-preset').count(),7);
  await rgb(taskPicker,[17,34,51]);await ui.click('#save-task');
  state=await ui.evaluate(()=>window.__ketimeDemo.getState());const task=state.projects[0].nodes[0].checklist.find(t=>t.name==='关联颜色待办');assert.equal(state.schedules.find(e=>e.id===task.scheduleId).color,'#112233');
  await ui.click('[data-view=schedule]');await ui.click('#add-event-btn');
  await ui.locator('#chips-editor .chip-text').first().fill('重复颜色');await ui.selectOption('#event-repeat','daily');await ui.fill('#event-start','16:00');await ui.fill('#event-end','17:00');await rgb(ui.locator('#event-color-presets'),[100,110,120]);await ui.click('#save-event');
  state=await ui.evaluate(()=>window.__ketimeDemo.getState());const repeat=state.schedules.find(e=>e.name==='重复颜色');
  await ui.locator('.event-block[data-event-id="'+repeat.id+'"]').first().click();await ui.click('#choice-single');await rgb(ui.locator('#event-color-presets'),[40,50,60]);await ui.click('#save-event');
  state=await ui.evaluate(()=>window.__ketimeDemo.getState());const updated=state.schedules.find(e=>e.id===repeat.id);assert.equal(updated.color,'#646e78');assert.equal(updated.occurrenceStates[0].color,'#28323c');
  await ui.click('#add-event-btn');
  if(mobile)for(const size of ['360,800','430,932']){await page.selectOption('#preview-size',size);await ui.waitForFunction(w=>innerWidth===w,Number(size.split(',')[0]));assert(await ui.locator('#event-color-presets').evaluate(e=>e.scrollWidth<=e.clientWidth))}
  await page.screenshot({path:path.join(root,'.local/custom-colors'+(mobile?'-android':'-desktop')+'.png')});
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Reminder/color browser checks passed: top anchoring, add after list, internal scrolling, inline create, 7 schedule presets, spectrum, hue, keyboard, RGB validation, saving/editing/reload/cancel, linked task, repeat occurrence and Android sizes.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
