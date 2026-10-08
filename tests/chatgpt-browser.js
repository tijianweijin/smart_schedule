/* Synthetic UI checks only. No OpenAI request or subscription usage. */
const assert = require('node:assert/strict'), {spawn} = require('node:child_process'), path = require('node:path');
const {chromium} = require(process.env.KETIME_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const child = spawn('python', ['-B', '-u', path.join(__dirname, 'browser_fixture_server.py')], {cwd:root, stdio:['ignore','pipe','pipe']});
let browser;
(async () => {
  const url = await new Promise((resolve,reject) => { let text=''; child.stdout.on('data', d => {text+=d; if(text.includes('\n')) try{resolve(JSON.parse(text.split('\n')[0]).url)}catch(e){reject(e)}}); child.on('error',reject); setTimeout(()=>reject(Error('Startup timeout')),15000).unref(); });
  browser = await chromium.launch({headless:true, executablePath:process.env.KETIME_BROWSER || undefined});
  const context = await browser.newContext(), page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let connected=false, pending=false, failure=false, requestCount=0, connectCount=0, modelCount=0, lastPayload, active='oaiapp_fixture', removed=false, configureFailure=false, configureDelay=0;
  const preferences={}, row=(id,version,series,reasoningEfforts=['low','medium','high'])=>({id,name:'Fixture '+series,provider:'GPT',version,series,reasoningEfforts,defaultReasoningEffort:'low'});
  await context.route('https://auth.openai.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Synthetic authorization page</h1>'}));
  await page.route('**/api/chatgpt/**', async route => {
    const action = route.request().url().split('/').pop();
    assert(route.request().headers()['x-ketime-token']);
    let data;
    if(action==='status') data={connected,pending,error:'',accounts:connected?[{id:'oaiapp_fixture',email:'fixture@example.invalid',active:active==='oaiapp_fixture'},{id:'oaiapp_second',email:'second@example.invalid',active:active==='oaiapp_second'}]:[]};
    else if(action==='connect'){connectCount++;pending=true;data={authorizationUrl:'https://auth.openai.com/api/accounts/authorize?state=fixture'};}
    else if(action==='models'){modelCount++;const saved=preferences[active]||{model:'gpt-6.1-sol',reasoningEffort:'low'};data={models:[row('gpt-6-astra','6.0','Astra',['low','high']),row('gpt-5.6-terra','5.6','Terra'),row('gpt-6.1-sol','6.1','Sol'),...(removed?[]:[row('gpt-5.6-sol','5.6','Sol')])],defaultModel:'gpt-6.1-sol',selectedModel:saved.model,reasoningEffort:saved.reasoningEffort,selectionValid:!(removed&&saved.model==='gpt-5.6-sol')};}
    else if(action==='configure'){const payload=route.request().postDataJSON();if(configureDelay)await new Promise(resolve=>setTimeout(resolve,configureDelay));if(configureFailure)data={error:'fixture save failed'};else{preferences[active]=payload;data={...payload,saved:true};}}
    else if(action==='select'){active=route.request().postDataJSON().account;data={connected};}
    else if(action==='test'){requestCount++;lastPayload=route.request().postDataJSON();data=failure?{error:'fixture incomplete reply'}:{reply:'收到 <img src=x onerror=alert(1)>',model:lastPayload.model,reasoningEffort:lastPayload.reasoningEffort,completed:true};}
    else if(action==='assistant'){const saved=preferences[active]||{model:'gpt-6.1-sol',reasoningEffort:'low'};data={eventCount:0,message:'没有需要创建的日程。',events:[],model:saved.model,reasoningEffort:saved.reasoningEffort,completed:true};}
    else if(action==='disconnect'){connected=false;pending=false;data={warning:''};}
    await route.fulfill({status:(action==='test'&&failure)||(action==='configure'&&configureFailure)?502:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(url+'/'); await page.click('#settings-btn'); await page.locator('#chatgpt-panel summary').click();
  await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('尚未连接 ChatGPT')&&!document.getElementById('chatgpt-connect').disabled);
  assert(await page.locator('#chatgpt-send').isDisabled());
  const popupPromise=page.waitForEvent('popup');await page.click('#chatgpt-connect');const popup=await popupPromise;
  await popup.waitForURL('https://auth.openai.com/**');assert.equal(connectCount,1);
  connected=true;pending=false;await page.click('#chatgpt-refresh');
  await page.waitForFunction(()=>!document.getElementById('chatgpt-send').disabled);
  assert.equal(await page.locator('#chatgpt-model').inputValue(),'gpt-6.1-sol');
  assert.equal(await page.locator('#chatgpt-model option[value="gpt-6-astra"]').count(),1);
  assert(modelCount>0);await page.fill('#chatgpt-message','最小测试');await page.click('#chatgpt-send');
  await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('测试成功'));
  assert.deepEqual(lastPayload,{model:'gpt-6.1-sol',reasoningEffort:'low',message:'最小测试'});
  assert((await page.locator('#chatgpt-status').textContent()).includes('轻度（low）'));
  assert.equal(await page.locator('#chatgpt-reply').textContent(),'收到 <img src=x onerror=alert(1)>');
  assert.equal(await page.locator('#chatgpt-reply img').count(),0);
  const state=await page.evaluate(()=>JSON.stringify(window.__ketimeDemo.getState()));
  assert(!state.includes('最小测试')&&!state.includes('oaiapp_fixture')&&!state.includes('fixture@example.invalid'));
  failure=true;await page.click('#chatgpt-send');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('incomplete'));
  assert(await page.locator('#chatgpt-reply').isHidden());assert.equal(requestCount,2);
  failure=false;await page.selectOption('#chatgpt-version','5.6');await page.selectOption('#chatgpt-model','gpt-5.6-sol');await page.selectOption('#chatgpt-effort','medium');assert(await page.locator('#chatgpt-send').isDisabled());
  await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效')&&document.getElementById('chatgpt-effort').value==='medium');assert.deepEqual(preferences[active],{model:'gpt-5.6-sol',reasoningEffort:'medium'});
  assert((await page.locator('#chatgpt-model-status').textContent()).includes('GPT → 5.6 → Sol → 中'));await page.click('#chatgpt-send');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('测试成功'));assert.equal(lastPayload.reasoningEffort,'medium');assert.equal(lastPayload.model,'gpt-5.6-sol');
  const previousCount=modelCount,inferenceCount=requestCount;await page.click('#chatgpt-refresh');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('模型已更新'));assert(modelCount>previousCount);assert.equal(requestCount,inferenceCount);assert.equal(await page.locator('#chatgpt-effort').inputValue(),'medium');
  await page.click('#settings-close');await page.reload();await page.click('#settings-btn');await page.locator('#chatgpt-panel summary').click();await page.waitForFunction(()=>document.getElementById('chatgpt-effort').value==='medium');assert.equal(await page.locator('#chatgpt-model').inputValue(),'gpt-5.6-sol');
  await page.selectOption('#chatgpt-account','oaiapp_second');await page.waitForFunction(()=>document.getElementById('chatgpt-model').value==='gpt-6.1-sol');assert.equal(await page.locator('#chatgpt-effort').inputValue(),'low');
  await page.selectOption('#chatgpt-version','6.0');assert.equal(await page.locator('#chatgpt-model').inputValue(),'gpt-6-astra');assert.equal(await page.locator('#chatgpt-effort option[value=medium]').count(),0);await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效'));assert.equal(preferences[active].model,'gpt-6-astra');
  // Switch across versions directly, without first selecting a version or pressing Save.
  await page.selectOption('#chatgpt-model','gpt-5.6-terra');assert.equal(await page.locator('#chatgpt-version').inputValue(),'5.6');await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效'));await page.click('#chatgpt-send');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('测试成功'));assert.equal(lastPayload.model,'gpt-5.6-terra');
  // Changes made while the previous save is in flight must win, in order.
  configureDelay=700;await page.selectOption('#chatgpt-effort','medium');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('正在应用'));await page.selectOption('#chatgpt-model','gpt-6.1-sol');await page.selectOption('#chatgpt-effort','high');await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效')&&document.getElementById('chatgpt-effort').value==='high');assert.deepEqual(preferences[active],{model:'gpt-6.1-sol',reasoningEffort:'high'});configureDelay=0;
  configureFailure=true;await page.selectOption('#chatgpt-effort','low');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('切换未成功'));assert(await page.locator('#chatgpt-send').isDisabled());assert(await page.locator('#chatgpt-save-model').isEnabled());configureFailure=false;await page.click('#chatgpt-save-model');await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效'));assert.equal(preferences[active].reasoningEffort,'low');
  await page.selectOption('#chatgpt-account','oaiapp_fixture');await page.waitForFunction(()=>document.getElementById('chatgpt-effort').value==='medium');
  await page.click('#settings-close');await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','你好');await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('中度（medium）'));assert((await page.locator('#assistant-status').textContent()).includes('gpt-5.6-sol'));await page.click('#assistant-close');await page.click('#settings-btn');
  // Sending immediately after a change must await autosave, not use the old model.
  configureDelay=700;await page.selectOption('#chatgpt-model','gpt-5.6-terra');await page.click('#settings-close');await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','你好');await page.click('#assistant-send');await page.waitForFunction(()=>document.getElementById('assistant-status').textContent.includes('gpt-5.6-terra'));assert.equal(preferences[active].model,'gpt-5.6-terra');configureDelay=0;await page.click('#assistant-close');await page.click('#settings-btn');await page.waitForFunction(()=>!document.getElementById('chatgpt-model').disabled);await page.selectOption('#chatgpt-model','gpt-5.6-sol');await page.waitForFunction(()=>document.getElementById('chatgpt-model-status').textContent.includes('已生效'));
  removed=true;await page.click('#chatgpt-refresh');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('原选择已不可用'));assert(await page.locator('#chatgpt-send').isDisabled());assert(await page.locator('#chatgpt-save-model').isEnabled());
  await page.fill('#chatgpt-message','  ');assert(await page.locator('#chatgpt-send').isDisabled());
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.click('#chatgpt-disconnect');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('尚未连接'));
  assert(await page.locator('#chatgpt-send').isDisabled());
  await page.click('#settings-close');
  await page.route('**/api/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'0.5.0',csrfToken:'fixture'})}));
  await page.click('#settings-btn');await page.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('旧版刻时服务'));
  assert.equal(connectCount,1);assert.deepEqual(errors,[]);
  await context.close();
  const offline = await browser.newContext(), filePage=await offline.newPage();
  await filePage.goto(require('node:url').pathToFileURL(path.join(root,'ketime _demo_0.1.html')).href);
  await filePage.click('#settings-btn');await filePage.locator('#chatgpt-panel summary').click();
  await filePage.waitForFunction(()=>document.getElementById('chatgpt-status').textContent.includes('start-ketime.cmd'));
  assert(await filePage.locator('#chatgpt-connect').isDisabled());await offline.close();
  console.log('ChatGPT synthetic browser checks passed: connect, version/series/effort, save/reload, account isolation, model update, stale selection, shared assistant settings, send/reply, privacy, mobile and offline.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
