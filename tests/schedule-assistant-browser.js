/* Isolated synthetic browser checks; --live explicitly uses the local authorized Sol account. */
const assert = require('node:assert/strict'), {spawn} = require('node:child_process'), path = require('node:path');
const {chromium} = require(process.env.KETIME_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..'), live = process.argv.includes('--live');
const child = live ? null : spawn('python', ['-B','-u',path.join(__dirname,'browser_fixture_server.py')], {cwd:root,stdio:['ignore','pipe','pipe']});
let browser;
(async () => {
  const url = live ? 'http://127.0.0.1:8766' : await new Promise((resolve,reject) => {
    let text=''; child.stdout.on('data', d => {text+=d; if(text.includes('\n'))try{resolve(JSON.parse(text.split('\n')[0]).url)}catch(e){reject(e)}});
    child.on('error',reject);setTimeout(()=>reject(Error('Startup timeout')),15000).unref();
  });
  browser = await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER || undefined});
  const context = await browser.newContext({timezoneId:'Asia/Shanghai'}), page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  const mainBefore = await page.evaluate(()=>window.__ketimeDemo.getState());
  assert(await page.locator('#schedule-assistant').isHidden());
  assert.equal(await page.locator('#schedule-assistant-btn').evaluate(e=>e.nextElementSibling.id),'add-event-btn');
  await page.click('#schedule-assistant-btn');
  assert((await page.locator('#assistant-welcome').textContent()).includes('把最新的消息/日程放进来，让小助手为你创建日程~'));
  assert(await page.locator('#assistant-send').isDisabled());
  if(live) {
    await page.fill('#assistant-input','请帮我创建一个日程：明天下午14:00到15:00，在图书馆三层复习数学，备注带教材，不关联项目、不重复。');
    await page.click('#assistant-send');
    await page.waitForFunction(()=>document.querySelector('.assistant-event-card')||document.querySelector('.assistant-message.error'),{},{timeout:150000});
    if(await page.locator('.assistant-message.error').count())throw Error(await page.locator('.assistant-message.error').textContent());
    const state=await page.evaluate(()=>window.__ketimeDemo.getState());
    assert.equal(state.schedules.length,mainBefore.schedules.length+1);
    const event=state.schedules.at(-1), tomorrow=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')});
    assert.equal(event.date,tomorrow);assert.equal(event.start,'14:00');assert.equal(event.end,'15:00');assert(event.location.includes('图书馆'));assert(event.notes.includes('教材'));assert.equal(event.repeat,'none');
    assert((await page.locator('#assistant-status').textContent()).includes('轻度（low）'));
    await page.click('.assistant-event-card');assert(await page.locator('#schedule-assistant').isHidden());
    assert(await page.locator('.event-block[data-event-id="'+event.id+'"]').count());
    await page.reload();assert((await page.evaluate(()=>window.__ketimeDemo.getState().schedules)).some(e=>e.id===event.id));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({live:true,created:1,date:event.date,start:event.start,end:event.end,locationCaptured:!!event.location,notesCaptured:!!event.notes,jump:true,persisted:true,status:'Sol low real inference passed; isolated browser only'}));
    await context.close();return;
  }
  let mode='clarify', requests=[], holdResolve;
  const mockEvent=(changes={})=>({name:'数学 <img src=x onerror=alert(1)>',date:'2026-10-12',start:'14:00',end:'15:00',repeat:'none',endDate:null,location:'图书馆三层',notes:'带教材',color:'#8fbaa5',projectId:null,nodeId:null,...changes});
  await page.route('**/api/chatgpt/assistant', async route=>{
    const payload=route.request().postDataJSON();requests.push(payload);assert(route.request().headers()['x-ketime-token']);
    let events=[],message='请补充结束时间或时长。',status=200,completed=true;
    if(mode==='hold')await new Promise(resolve=>{holdResolve=resolve});
    if(['create','hold','storage'].includes(mode)){
      const project=payload.context.projects[0];events=[mockEvent(),mockEvent({name:'背单词',date:'2026-10-12',start:'23:00',end:'01:00',repeat:'weekly',endDate:'2026-10-31',projectId:project.id,nodeId:project.nodes[0].id,color:null})];message='完成';
    }
    if(mode==='invalid')events=[mockEvent(),mockEvent({date:'2026-02-30'})];
    if(mode==='incomplete'){events=[mockEvent()];completed=false;}
    if(mode==='failure'){status=502;message='fixture error';}
    if(mode==='stale')events=[mockEvent({projectId:'removed',nodeId:'removed'})];
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{message,events,completed,model:'gpt-5.6-sol',reasoningEffort:'low'}:{error:message})});
  });
  await page.fill('#assistant-input','明天下午去图书馆学习');await page.press('#assistant-input','Enter');
  await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('请补充信息'));
  assert.equal(requests.length,1);assert.equal(await page.locator('.assistant-event-card').count(),0);
  assert.deepEqual(await page.evaluate(()=>window.__ketimeDemo.getState().schedules),mainBefore.schedules);
  mode='create';await page.fill('#assistant-input','14点到15点，带教材；另在课程项目每周一背单词到月底');await page.click('#assistant-send');
  await page.waitForFunction(()=>document.querySelectorAll('.assistant-event-card').length===2);
  assert.equal(requests.at(-1).messages.length,3);
  assert(!('schedules' in requests.at(-1).context));assert(!('inbox' in requests.at(-1).context));assert(!('growth' in requests.at(-1).context));
  assert.equal(await page.locator('.assistant-bubble img,.assistant-event-card img').count(),0);
  assert((await page.locator('.assistant-message.assistant').last().textContent()).includes('日程已创建完成，点击即可跳转！'));
  await page.screenshot({path:path.join(root,'.local','schedule-assistant-desktop.png')});
  let state=await page.evaluate(()=>window.__ketimeDemo.getState()), created=state.schedules.slice(-2);
  assert.equal(state.schedules.length,mainBefore.schedules.length+2);assert.equal(created[0].location,'图书馆三层');assert.equal(created[0].notes,'带教材');
  const task=state.projects[0].nodes[0].checklist.find(t=>t.scheduleId===created[1].id);assert(task);assert.equal(created[1].color,state.projects[0].color);assert.deepEqual(created[1].occurrenceStates,[]);
  await page.locator('.assistant-event-card').first().click();assert(await page.locator('#schedule-assistant').isHidden());
  const block=page.locator('.event-block[data-event-id="'+created[0].id+'"]');await block.click();
  assert.equal(await page.locator('#event-location').inputValue(),'图书馆三层');assert.equal(await page.locator('#event-notes').inputValue(),'带教材');await page.click('#cancel-event');
  await page.click('#schedule-assistant-btn');await page.locator('.assistant-event-card').nth(1).click();
  await page.locator('.event-block[data-event-id="'+created[1].id+'"][data-segment="start"]').click();await page.click('#choice-single');
  await page.fill('#event-location','自习室');await page.fill('#event-notes','仅本次改动');await page.click('#save-event');
  const repeatRecord=(await page.evaluate(()=>window.__ketimeDemo.getState().schedules)).find(e=>e.id===created[1].id);
  assert.equal(repeatRecord.location,'图书馆三层');assert.equal(repeatRecord.occurrenceStates[0].location,'自习室');assert.equal(repeatRecord.occurrenceStates[0].notes,'仅本次改动');
  await page.click('#schedule-assistant-btn');
  for(const invalidMode of ['invalid','incomplete','stale','failure']){
    mode=invalidMode;const before=await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState()));
    await page.fill('#assistant-input','失败用例 '+invalidMode);await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('本轮未完成'));
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState())),before);assert.equal(await page.locator('.assistant-event-card').count(),2);
  }
  mode='storage';await page.evaluate(()=>{window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('fixture storage full')}});
  const beforeStorage=await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState()));
  await page.fill('#assistant-input','存储失败用例');await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('本轮未完成'));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState())),beforeStorage);await page.evaluate(()=>{Storage.prototype.setItem=window.__originalSetItem});
  mode='hold';const heldRequest=page.waitForRequest('**/api/chatgpt/assistant');await page.fill('#assistant-input','等待中的创建');await page.click('#assistant-send');await heldRequest;
  await page.waitForFunction(()=>document.querySelector('.assistant-pending'));
  assert(await page.locator('#assistant-send').isDisabled());assert(await page.locator('#assistant-clear').isDisabled());
  const count=requests.length;await page.click('#assistant-close');await page.click('#schedule-assistant-btn');assert(await page.locator('.assistant-pending').count());assert.equal(requests.length,count);
  holdResolve();await page.waitForFunction(()=>document.querySelectorAll('.assistant-event-card').length===4);assert.equal(requests.length,count);
  await page.click('#assistant-clear');assert.equal(await page.locator('.assistant-event-card').count(),0);
  assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,mainBefore.schedules.length+4);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(root,'.local','schedule-assistant-mobile.png')});
  await page.press('#assistant-input','Escape');assert(await page.locator('#schedule-assistant').isHidden());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'schedule-assistant-btn');
  await page.click('#schedule-assistant-btn');await page.click('.view-tab[data-view="projects"]');assert(await page.locator('#schedule-assistant').isHidden());
  await page.reload();assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,mainBefore.schedules.length+4);
  assert(!JSON.stringify(await page.evaluate(()=>window.__ketimeDemo.getState())).includes('等待中的创建'));
  assert.deepEqual(errors,[]);
  await page.route('**/api/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'0.6.0',chatgpt:true,csrfToken:'fixture'})}));
  await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','旧服务保护');await page.click('#assistant-send');
  await page.waitForFunction(()=>document.querySelector('.assistant-message.error'));assert((await page.locator('.assistant-message.error').textContent()).includes('新版本机服务'));
  await context.close();
  const offline=await browser.newContext(), filePage=await offline.newPage();await filePage.goto(require('node:url').pathToFileURL(path.join(root,'ketime _demo_0.1.html')).href);
  await filePage.click('#schedule-assistant-btn');await filePage.fill('#assistant-input','离线不能创建');await filePage.click('#assistant-send');
  await filePage.waitForFunction(()=>document.querySelector('.assistant-message.error'));assert((await filePage.locator('.assistant-message.error').textContent()).includes('start-ketime.cmd'));await offline.close();
  console.log('Assistant synthetic checks passed: multi-turn, batch, projects, repeats, midnight, location/notes, safe text, jump, no duplicates, atomic validation/storage, mobile, keyboard, offline, privacy, persistence.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(child)child.kill()});
