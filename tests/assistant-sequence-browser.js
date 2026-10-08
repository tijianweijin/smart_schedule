/* Multi-event ordering, count validation and isolated real Sol-low extraction. */
const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),live=process.argv.includes('--live');
const child=live?null:spawn('python',['-B','-u',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const url=live?'http://127.0.0.1:8766':await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))resolve(JSON.parse(text.split('\n')[0]).url)});child.on('error',reject);setTimeout(()=>reject(Error('Startup timeout')),15000).unref()});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
 const context=await browser.newContext({timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let mode='complete',response;
 const event=(name,date,start,end,location)=>({name,date,start,end,repeat:'none',endDate:null,location,notes:'',color:null,projectId:null,nodeId:null});
 if(!live)await page.route('**/api/chatgpt/assistant',async route=>{
   let events=[event('晚间活动','2026-10-11','23:00','01:00','晚间地点'),event('下午学习','2026-10-10','14:00','15:00','图书馆'),event('上午开会','2026-10-10','09:00','10:00','会议室')];
   if(mode==='draft')events=[event('日期待补充',null,'08:00',null,'未知日期地点'),event('晚间活动','2026-10-11','23:00',null,'晚间地点'),event('当天开始待补充','2026-10-10',null,'17:00','待补充地点'),event('上午开会','2026-10-10','09:00','10:00','会议室')];
   await route.fulfill({contentType:'application/json',body:JSON.stringify({eventCount:mode==='mismatch'?4:events.length,message:'已提取，请确认。',events,model:'gpt-5.6-sol',reasoningEffort:'low',completed:true})});
 });
 page.on('response',async res=>{if(res.url().endsWith('/api/chatgpt/assistant'))response=await res.json()});
 await page.goto(url+'/');const before=await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length);await page.click('#schedule-assistant-btn');
 async function send(text){await page.fill('#assistant-input',text);await page.click('#assistant-send');await page.waitForFunction(()=>!document.getElementById('assistant-input').disabled,null,{timeout:150000})}
 if(live){
   await send('请建立以下三个独立日程：10月11日晚上19:00到20:00参加读书交流，在图书馆二层，备注带书；10月10日14:00到15:00进行数学讨论，在教学楼101，备注带教材；10月10日早上7:30参加升旗仪式，在体育场，需要7:15前入场，通知没有写结束时间。三项均不重复、不关联项目。');
   if(await page.locator('.assistant-message.error').count())throw Error(await page.locator('.assistant-message.error').last().textContent());
   assert.equal(response.eventCount,3);assert(['gpt-6.1-sol','gpt-6-sol','gpt-5.6-sol'].includes(response.model));assert.equal(response.reasoningEffort,'low');
   assert.equal(await page.locator('.assistant-draft').count(),3);assert.equal(await page.locator('.assistant-event-card').count(),0);
   const forms=page.locator('.assistant-draft'),year=await page.evaluate(()=>window.KetimeScheduleAPI.context().today.slice(0,4));
   assert.equal(await forms.nth(0).locator('[name=date]').inputValue(),year+'-10-10');assert.equal(await forms.nth(0).locator('[name=start]').inputValue(),'07:30');assert.equal(await forms.nth(0).locator('[name=end]').inputValue(),'');assert((await forms.nth(0).locator('[name=location]').inputValue()).includes('体育场'));
   assert.equal(await forms.nth(1).locator('[name=date]').inputValue(),year+'-10-10');assert.equal(await forms.nth(1).locator('[name=start]').inputValue(),'14:00');assert.equal(await forms.nth(1).locator('[name=end]').inputValue(),'15:00');assert((await forms.nth(1).locator('[name=location]').inputValue()).includes('101'));
   assert.equal(await forms.nth(2).locator('[name=date]').inputValue(),year+'-10-11');assert.equal(await forms.nth(2).locator('[name=start]').inputValue(),'19:00');assert.equal(await forms.nth(2).locator('[name=end]').inputValue(),'20:00');assert((await forms.nth(2).locator('[name=location]').inputValue()).includes('图书馆'));
   assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length),before);
   // Confirm in reverse chronological order; cards must still sort by time.
   await forms.nth(2).locator('[type=submit]').click();await forms.nth(1).locator('[type=submit]').click();await forms.nth(0).locator('[name=end]').fill('08:30');await forms.nth(0).locator('[type=submit]').click();
   const cards=page.locator('.assistant-event-card');assert.equal(await cards.count(),3);assert((await cards.nth(0).textContent()).includes('07:30'));assert((await cards.nth(1).textContent()).includes('14:00'));assert((await cards.nth(2).textContent()).includes('19:00'));
   await cards.first().click();assert(await page.locator('#schedule-assistant').isHidden());await page.reload();assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length),before+3);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({live:true,eventCount:response.eventCount,model:response.model,reasoningEffort:response.reasoningEffort,separateAttributes:true,chronologicalDrafts:true,reverseConfirmationSorted:true,persisted:true,isolatedBrowser:true}));return;
 }
 await send('三个活动，故意按晚到早描述');assert.deepEqual(await page.locator('.assistant-event-name').allTextContents(),['上午开会','下午学习','晚间活动']);assert((await page.locator('.assistant-batch-summary').textContent()).includes('共识别 3 项'));
 assert.deepEqual(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.slice(-3).map(e=>e.name)),['上午开会','下午学习','晚间活动']);
 await page.click('#assistant-clear');mode='draft';await send('四个活动，部分时间不明');let forms=page.locator('.assistant-draft');
 assert.equal(await forms.count(),4);assert.deepEqual(await forms.locator('[name=name]').evaluateAll(items=>items.map(item=>item.value)),['上午开会','当天开始待补充','晚间活动','日期待补充']);assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length),before+3);
 assert((await forms.nth(0).locator('h3').textContent()).includes('1/4'));assert((await forms.nth(3).locator('h3').textContent()).includes('4/4'));
 await forms.nth(2).locator('[name=end]').fill('01:00');await forms.nth(2).locator('[type=submit]').click();await forms.nth(0).locator('[type=submit]').click();assert.deepEqual(await page.locator('.assistant-event-name').allTextContents(),['上午开会','晚间活动']);
 const tieOrder=await page.evaluate(()=>{const a=[{name:'未知甲',date:null,start:'09:00'},{name:'同时间甲',date:'2026-10-10',start:'10:00'},{name:'同时间乙',date:'2026-10-10',start:'10:00'},{name:'未知乙',date:null,start:'07:00'}];return {sorted:window.KetimeAssistant.sortEvents(a).map(e=>e.name),original:a.map(e=>e.name)}});
 assert.deepEqual(tieOrder.sorted,['同时间甲','同时间乙','未知甲','未知乙']);assert.equal(tieOrder.original[0],'未知甲');
 await page.click('#assistant-clear');mode='mismatch';const count=await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length);await send('数量不一致');assert((await page.locator('.assistant-message.error').textContent()).includes('数量'));assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length),count);assert.equal(await page.locator('.assistant-event-card').count(),0);
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('Sequence browser checks passed: complete/draft chronological ordering, unknown times, stable ties, batch counts, reverse confirmations, count mismatch and mobile.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(child)child.kill()});
