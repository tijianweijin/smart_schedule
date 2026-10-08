/* Synthetic APIs and isolated browser state: never uses real keys or inference. */
const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),child=spawn(process.env.KETIME_PYTHON||'python',['-B','-u',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))resolve(JSON.parse(text.split('\n')[0]).url)});child.on('error',reject);setTimeout(()=>reject(Error('Fixture timeout')),15000).unref();});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:393,height:851}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 let connected=false,selected={model:'deepseek-flash',reasoningEffort:'none'},stale=false,testFailure=false,configureFailure=false,testCalls=0,lastAssistant;
 const key='sk-deepseek-synthetic-ui-key',row=(id,name)=>({id,name,version:'4',series:name,reasoningEfforts:['none','low','high','max'],defaultReasoningEffort:'none'});
 await page.route('**/api/chatgpt/**',route=>{const action=route.request().url().split('/').pop(),payload=route.request().postDataJSON();let data={connected:false,pending:false,error:'',accounts:[]};if(action==='assistant'){lastAssistant=payload;const event=(name,start,end)=>({name,date:'2026-10-09',start,end,repeat:'none',endDate:null,location:'图书馆',notes:'模拟测试',color:'#eaf4ed',projectId:null,nodeId:null});data={eventCount:2,message:'已提取两项日程',events:[event('晚上复习','20:00','21:00'),event('上午学习','09:00','10:00')],provider:'deepseek',model:selected.model,reasoningEffort:selected.reasoningEffort,completed:true};}return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.route('**/api/deepseek/**',route=>{
  assert(route.request().headers()['x-ketime-token']);const action=route.request().url().split('/').pop(),payload=route.request().postDataJSON();let data,code=200;
  if(action==='status')data={connected,hasKey:connected,encrypted:true};
  else if(action==='connect'){if(payload.apiKey===key){connected=true;data={saved:true,connected:true};}else{data={error:'API Key 无效，请重新填写。'};code=502;}}
  else if(action==='models')data={models:[...(stale?[]:[row('deepseek-flash','DeepSeek-V4.1-Flash')]),row('deepseek-v4-pro','DeepSeek-V4-Pro')],...{selectedModel:selected.model,reasoningEffort:selected.reasoningEffort,defaultModel:'deepseek-v4-pro',selectionValid:!(stale&&selected.model==='deepseek-flash')}};
  else if(action==='configure'){if(configureFailure){data={error:'保存失败'};code=502;}else{selected=payload;data={...selected,saved:true};}}
  else if(action==='test'){testCalls++;data=testFailure?{error:'账户余额不足'}:{...payload,completed:true,reply:'收到 <img src=x onerror=alert(1)>'};if(testFailure)code=502;}
  else if(action==='disconnect'){connected=false;data={connected:false};}
  return route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(url);await page.click('#settings-btn');await page.locator('#chatgpt-panel summary').click();
 assert.equal(await page.locator('#chatgpt-panel summary').textContent(),'智能模型选择');
 assert.equal(await page.locator('#ai-provider option').count(),4);
 await page.selectOption('#ai-provider','deepseek');await page.waitForFunction(()=>!document.getElementById('deepseek-connect').disabled);
 assert(await page.locator('#ai-gpt-settings').isHidden());assert(await page.locator('#ai-deepseek-settings').isVisible());
 await page.fill('#deepseek-key','sk-invalid-synthetic-key');await page.click('#deepseek-connect');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('无效'));
 assert.equal(await page.locator('#deepseek-key').inputValue(),'');assert(await page.locator('#deepseek-send').isDisabled());
 await page.fill('#deepseek-key',key);await page.click('#deepseek-connect');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('已生效')&&!document.getElementById('deepseek-send').disabled);
 assert.equal(await page.locator('#deepseek-key').inputValue(),'');assert.equal(await page.locator('#deepseek-model').inputValue(),'deepseek-flash');
 assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(key));
 await page.selectOption('#deepseek-model','deepseek-v4-pro');await page.waitForFunction(()=>!document.getElementById('deepseek-effort').disabled);await page.selectOption('#deepseek-effort','low');await page.waitForFunction(()=>!document.getElementById('deepseek-send').disabled);
 assert.deepEqual(selected,{model:'deepseek-v4-pro',reasoningEffort:'low'});
 await page.click('#deepseek-send');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('测试成功'));
 assert.equal(await page.locator('#deepseek-reply img').count(),0);assert((await page.locator('#deepseek-reply').textContent()).includes('<img'));
 testFailure=true;await page.click('#deepseek-send');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('余额不足'));assert(await page.locator('#deepseek-reply').isHidden());testFailure=false;
 configureFailure=true;await page.selectOption('#deepseek-effort','high');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('保存失败'));assert(await page.locator('#deepseek-send').isDisabled());configureFailure=false;await page.click('#deepseek-save-model');await page.waitForFunction(()=>!document.getElementById('deepseek-send').disabled);
  await page.click('#settings-close');await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','明天上午学习，晚上复习');await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('deepseek-v4-pro'));assert.equal(lastAssistant.provider,'deepseek');assert.equal(await page.locator('.assistant-event-card').count(),2);assert.equal(await page.locator('.assistant-event-name').first().textContent(),'上午学习');assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length),2);await page.click('#assistant-close');
 await page.reload();await page.click('#settings-btn');await page.locator('#chatgpt-panel summary').click();await page.waitForFunction(()=>!document.getElementById('deepseek-send').disabled);assert.equal(await page.locator('#ai-provider').inputValue(),'deepseek');
 await page.selectOption('#deepseek-model','deepseek-flash');await page.waitForFunction(()=>!document.getElementById('deepseek-send').disabled);stale=true;await page.click('#deepseek-refresh');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('原选择已不可用'));assert(await page.locator('#deepseek-send').isDisabled());await page.click('#deepseek-save-model');await page.waitForFunction(()=>!document.getElementById('deepseek-send').disabled);
 await page.fill('#deepseek-key',key);await page.click('#settings-close');await page.click('#settings-btn');assert.equal(await page.locator('#deepseek-key').inputValue(),'');
 await page.waitForFunction(()=>!document.getElementById('ai-provider').disabled);await page.selectOption('#ai-provider','kimi');assert(await page.locator('#ai-deepseek-settings').isHidden());
 lastAssistant=null;await page.click('#settings-close');await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','测试未接入');await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-messages').textContent.includes('尚未接入'));assert.equal(lastAssistant,null);await page.click('#assistant-close');
 await page.click('#settings-btn');await page.selectOption('#ai-provider','gpt');assert(await page.locator('#ai-gpt-settings').isVisible());await page.selectOption('#ai-provider','deepseek');await page.waitForFunction(()=>!document.getElementById('deepseek-send').disabled);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#deepseek-model').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,`.local/deepseek-settings-${process.pid}.png`)});
 await page.click('#deepseek-disconnect');await page.waitForFunction(()=>document.getElementById('deepseek-status').textContent.includes('尚未连接'));assert(await page.locator('#deepseek-send').isDisabled());assert.equal(testCalls,2);assert.deepEqual(errors,[]);await context.close();
 const offline=await browser.newContext(),preview=await offline.newPage(),requests=[];preview.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await preview.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);const frame=preview.frames().find(f=>f.parentFrame());await frame.click('#settings-btn');await frame.locator('#chatgpt-panel summary').click();await frame.selectOption('#ai-provider','deepseek');assert(await frame.locator('#deepseek-key').isDisabled());assert(await frame.locator('#deepseek-connect').isDisabled());assert.deepEqual(requests,[]);await offline.close();
 console.log('DeepSeek synthetic browser checks passed: providers, key clearing/privacy, model update and persistence, autosave, reply/error, shared assistant routing, unsupported provider without fallback, mobile and offline preview.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill();});
