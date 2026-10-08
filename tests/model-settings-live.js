/* One real alternate-model request. Mock only preference writes; no user settings changes. */
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 if(!process.argv.includes('--live'))throw Error('Use --live for one real Terra-low test.');
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
 const context=await browser.newContext({timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/chatgpt/configure',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...route.request().postDataJSON(),saved:true})}));
 await page.goto('http://127.0.0.1:8766/');const state=await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState()));
 await page.click('#settings-btn');await page.locator('#chatgpt-panel summary').click();
 await page.waitForFunction(()=>document.getElementById('chatgpt-model').value&&!document.getElementById('chatgpt-model').disabled,null,{timeout:60000});
 const catalog=await page.evaluate(()=>window.KetimeAccount.call('/api/chatgpt/models',{}));
 const model=catalog.models.find(m=>m.id==='gpt-5.6-terra');assert(model&&model.reasoningEfforts.includes('low'));
 await page.selectOption('#chatgpt-model',model.id);await page.selectOption('#chatgpt-effort','low');
 await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效')&&document.getElementById('chatgpt-model').value==='gpt-5.6-terra');
 assert.equal(await page.locator('#chatgpt-version').inputValue(),model.version);await page.fill('#chatgpt-message','请用一句简短中文确认收到刻时模型切换测试消息。');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/chatgpt/test'));await page.click('#chatgpt-send');const reply=await(await response).json();
 assert.equal(reply.completed,true);assert.equal(reply.model,model.id);assert.equal(reply.reasoningEffort,'low');assert(typeof reply.reply==='string'&&reply.reply.trim());
 await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('测试成功'));assert.equal(await page.locator('#chatgpt-reply').textContent(),reply.reply);
 const after=await page.evaluate(()=>window.KetimeAccount.call('/api/chatgpt/models',{}));assert.equal(after.selectedModel,catalog.selectedModel);assert.equal(after.reasoningEffort,catalog.reasoningEffort);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState())),state);
 await page.screenshot({path:path.join(__dirname,'..','.local','model-settings-desktop.png')});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,'..','.local','model-settings-mobile.png')});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({live:true,model:reply.model,reasoningEffort:reply.reasoningEffort,catalogCount:catalog.models.length,responseReceived:true,desktopAndMobile:true,userPreferencesUnchanged:true,calendarUnchanged:true}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
