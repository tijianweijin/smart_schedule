const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright'),root=path.resolve(__dirname,'..');
const child=spawn(process.env.KETIME_PYTHON||'python',['-B','-u',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))resolve(JSON.parse(text.split('\n')[0]).url)});child.on('error',reject)});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
 const context=await browser.newContext({timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mode='missingEnd';
 await page.route('**/api/chatgpt/assistant',async route=>{
   const payload=route.request().postDataJSON(),project=payload.context.projects[0];
   const event={name:'升国旗仪式',date:'2026-10-01',start:'07:30',end:null,repeat:'none',endDate:null,location:'沙河校区（体育场）',notes:'需要7:15前入场完毕。活动纳入综合素质评价。',color:null,projectId:null,nodeId:null};
   if(mode==='allMissing')Object.assign(event,{name:null,date:null,start:null});
   if(mode==='node')Object.assign(event,{end:'08:30',projectId:project.id,nodeId:null});
   if(mode==='repeating')Object.assign(event,{name:'背单词',date:'2026-10-12',repeat:'weekly',endDate:'2026-10-31'});
   await route.fulfill({contentType:'application/json',body:JSON.stringify({message:'请确认草稿。',events:[event],model:'gpt-5.6-sol',reasoningEffort:'low',completed:true})});
 });
 await page.goto(url+'/');const before=await page.evaluate(()=>window.__ketimeDemo.getState());
 async function send(text){await page.fill('#assistant-input',text);await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('草稿待确认'));return page.locator('.assistant-draft').nth(await page.locator('.assistant-draft').count()-1)}
 await page.click('#schedule-assistant-btn');let form=await send('10月1日（明天）早上7:30，沙河校区体育场升旗，7:15前入场。');
 assert.equal(await form.locator('[name=date]').inputValue(),'2026-10-01');assert.equal(await form.locator('[name=start]').inputValue(),'07:30');assert.equal(await form.locator('[name=end]').inputValue(),'');
 assert.equal(await page.locator('.assistant-event-card').count(),0);assert.deepEqual((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules,before.schedules);
 await form.locator('[name=start]').fill('');await form.locator('[type=submit]').click();assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,before.schedules.length);await form.locator('[name=start]').fill('07:30');
 assert.equal(await form.locator('[name=onlyStart]').count(),0);await form.locator('[name=end]').fill('08:30');await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.assistant-event-card'));
 let state=await page.evaluate(()=>window.__ketimeDemo.getState()),ev=state.schedules.at(-1);assert.equal(ev.end,'08:30');assert(!('endUnknown' in ev));assert.equal(ev.date,'2026-10-01');assert(ev.notes.includes('7:15'));assert(await form.locator('[type=submit]').isDisabled());
 await page.locator('.assistant-event-card').last().click();let block=page.locator('.event-block[data-event-id="'+ev.id+'"]');assert((await block.textContent()).includes('07:30 - 08:30'));assert(!(await block.textContent()).includes('null'));assert.equal(await block.getAttribute('data-conflicts'),'[]');
 await block.locator('.event-check').click();assert((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.at(-1).done);
 await block.click();assert.equal(await page.locator('#event-end-unknown').count(),0);await page.fill('#event-end','08:00');await page.click('#save-event');state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules.at(-1).end,'08:00');
 await page.click('#schedule-assistant-btn');form=await send('另有仪式，结束时间未知');await form.locator('[name=end]').fill('09:00');await form.locator('[type=submit]').click();assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.at(-1).end,'09:00');
 mode='node';form=await send('关联示例项目，但未选节点');assert.equal(await form.locator('[name=nodeId]').inputValue(),'');assert.equal(await form.locator('[name=projectId]').inputValue(),before.projects[0].id);await form.locator('[name=nodeId]').selectOption(before.projects[0].nodes[2].id);await form.locator('[type=submit]').click();state=await page.evaluate(()=>window.__ketimeDemo.getState());assert(state.projects[0].nodes[2].checklist.some(t=>t.scheduleId===state.schedules.at(-1).id));
 mode='allMissing';form=await send('想记一个事情，但没时间');assert.equal(await form.locator('[name=date]').inputValue(),'');await form.locator('[name=name]').fill('手工补全');await form.locator('[name=date]').fill('2026-10-20');await form.locator('[name=start]').fill('10:00');await form.locator('[name=end]').fill('11:00');await form.locator('[type=submit]').click();assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.at(-1).name,'手工补全');
 mode='repeating';form=await send('每周背单词，结束时间未知');await form.locator('[name=end]').fill('08:00');await form.locator('[type=submit]').click();state=await page.evaluate(()=>window.__ketimeDemo.getState());const repeated=state.schedules.at(-1);assert.equal(repeated.end,'08:00');assert.equal(repeated.repeat,'weekly');
 await page.locator('.assistant-event-card').last().click();await page.locator('.event-block[data-event-id="'+repeated.id+'"]').click();await page.click('#choice-single');await page.fill('#event-end','08:30');await page.click('#save-event');state=await page.evaluate(()=>window.__ketimeDemo.getState());const updated=state.schedules.find(e=>e.id===repeated.id);assert.equal(updated.end,'08:00');assert.equal(updated.occurrenceStates[0].end,'08:30');
 await page.click('#schedule-assistant-btn');mode='missingEnd';form=await send('草稿A');const old=form;form=await send('更新为草稿B');assert(await old.locator('[type=submit]').isDisabled());assert((await old.locator('.assistant-draft-status').textContent()).includes('更新'));
 mode='missingEnd';form=await send('只知道開始，留空结束时间');await form.locator('[type=submit]').click();assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.at(-1).end,'');
await page.setViewportSize({width:390,height:844});await form.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'.local','assistant-draft-mobile.png')});
 await page.click('#assistant-close');await page.reload();state=await page.evaluate(()=>window.__ketimeDemo.getState());assert(state.schedules.every(e=>typeof e.end==='string'&&!('endUnknown' in e)));assert.equal(state.schedules.length,before.schedules.length+6);assert.deepEqual(errors,[]);
 console.log('Draft browser checks passed: date prefilling, both-blank rejected, confirmed one-sided schedule supported, no extra event-type selector, save/check/edit, repeat overrides, project selection, superseded drafts, mobile and persistence.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
