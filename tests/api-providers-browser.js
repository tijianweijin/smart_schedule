/* Official API behavior simulated in an isolated Edge profile; no real keys. */
const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),child=spawn(process.env.KETIME_PYTHON||'python',['-B','-u',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))resolve(JSON.parse(text.split('\n')[0]).url);});child.on('error',reject);setTimeout(()=>reject(Error('Fixture timeout')),15000).unref();});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:393,height:851}}),page=await context.newPage(),errors=[],tests=[],assistants=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const rows={kimi:[{id:'kimi-k2.6',name:'kimi-k2.6',reasoningEfforts:['none','auto'],defaultReasoningEffort:'none'},{id:'kimi-k3',name:'kimi-k3',reasoningEfforts:['low','high','max'],defaultReasoningEffort:'low'}],minimax:[{id:'MiniMax-M3',name:'MiniMax-M3',reasoningEfforts:['none','auto'],defaultReasoningEffort:'none'},{id:'MiniMax-M2.7',name:'MiniMax-M2.7',reasoningEfforts:['auto'],defaultReasoningEffort:'auto'}]};
 const states={kimi:{connected:false,selected:{model:'kimi-k2.6',reasoningEffort:'none'}},minimax:{connected:false,selected:{model:'MiniMax-M3',reasoningEffort:'none'}}};
 let stale=false,modelFailure=false,saveFailure=false,testFailure=false,lastAssistant;
 await page.route('**/api/chatgpt/**',route=>{
  const action=route.request().url().split('/').pop(),payload=route.request().postDataJSON();let data={connected:false,pending:false,error:'',accounts:[]};
  if(action==='assistant'){
   lastAssistant=payload;assistants.push(payload.provider);const state=states[payload.provider];assert(state.connected);
   const event=(name,start,end)=>({name,date:'2026-10-10',start,end,repeat:'none',endDate:null,location:'图书馆',notes:'synthetic',color:'#8fbaa5',projectId:null,nodeId:null});
   data={eventCount:2,message:'已提取日程',events:[event('晚上复习','20:00','21:00'),event('上午学习','09:00','10:00')],provider:payload.provider,model:state.selected.model,reasoningEffort:state.selected.reasoningEffort,completed:true};
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route(/\/api\/(kimi|minimax)\//,route=>{
  const parts=new URL(route.request().url()).pathname.split('/'),p=parts[2],action=parts[3],payload=route.request().postDataJSON(),state=states[p];
  assert(route.request().headers()['x-ketime-token']);let data,code=200;
  if(action==='status')data={provider:p,connected:state.connected,encrypted:true};
  else if(action==='connect'){if(payload.apiKey==='sk-'+p+'-synthetic-only-key'){state.connected=true;data={saved:true,connected:true,provider:p};}else{data={error:'API Key 无效'};code=502;}}
  else if(action==='models'){
   if(modelFailure){code=502;data={error:'目录读取失败'};}
   else data={provider:p,models:stale&&p==='kimi'?rows[p].slice(1):rows[p],selectedModel:state.selected.model,reasoningEffort:state.selected.reasoningEffort,selectionValid:!(stale&&p==='kimi'&&state.selected.model==='kimi-k2.6')};
  }
  else if(action==='configure'){if(saveFailure){code=502;data={error:'模型设置保存失败'};}else{state.selected=payload;data={saved:true,...payload};}}
  else if(action==='test'){tests.push(p);data=testFailure?{error:'余额不足'}:{provider:p,...state.selected,reply:'收到 <img src=x onerror=alert(1)>',completed:true};if(testFailure)code=502;}
  else if(action==='disconnect'){state.connected=false;data={connected:false};}
  return route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(url);await page.click('#settings-btn');await page.locator('#chatgpt-panel summary').click();
 assert.deepEqual(await page.locator('#ai-provider option').allTextContents(),['ChatGPT','DeepSeek','MiniMax','Kimi']);
 for(const p of ['kimi','minimax']){
  const key='sk-'+p+'-synthetic-only-key';await page.selectOption('#ai-provider',p);await page.waitForFunction(id=>!document.getElementById(id+'-connect').disabled,p);
  assert(await page.locator('#ai-'+p+'-settings').isVisible());assert(await page.locator('#ai-gpt-settings').isHidden());
  await page.fill('#'+p+'-key','sk-invalid-synthetic-key');await page.click('#'+p+'-connect');await page.waitForFunction(id=>document.getElementById(id+'-status').textContent.includes('无效'),p);
  assert.equal(await page.locator('#'+p+'-key').inputValue(),'');assert(await page.locator('#'+p+'-send').isDisabled());
  await page.fill('#'+p+'-key',key);await page.click('#'+p+'-connect');await page.waitForFunction(id=>!document.getElementById(id+'-send').disabled,p);
  assert.equal(await page.locator('#'+p+'-key').inputValue(),'');assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(key));
  assert.deepEqual(await page.locator('#'+p+'-effort option').evaluateAll(options=>options.map(o=>o.value)),['none','auto']);
  await page.selectOption('#'+p+'-model',rows[p][1].id);await page.waitForFunction(id=>!document.getElementById(id+'-send').disabled,p);
  assert.deepEqual(await page.locator('#'+p+'-effort option').evaluateAll(options=>options.map(o=>o.value)),p==='kimi'?['low','high','max']:['auto']);
  await page.click('#'+p+'-send');await page.waitForFunction(id=>document.getElementById(id+'-status').textContent.includes('测试成功'),p);
  assert.equal(await page.locator('#'+p+'-reply img').count(),0);
  assert((await page.locator('#'+p+'-reply').textContent()).includes('<img'));
  await page.click('#settings-close');await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','明天上午学习，晚上复习');await page.click('#assistant-send');
  await page.waitForFunction(()=>document.querySelectorAll('.assistant-event-card').length===2);
  assert.equal(lastAssistant.provider,p);assert.equal(await page.locator('.assistant-event-name').first().textContent(),'上午学习');
  assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length),p==='kimi'?2:4);
  await page.click('#assistant-clear');await page.click('#assistant-close');await page.click('#settings-btn');await page.waitForFunction(()=>!document.getElementById('ai-provider').disabled);
 }
 await page.reload();await page.click('#settings-btn');await page.locator('#chatgpt-panel summary').click();await page.waitForFunction(()=>!document.getElementById('minimax-send').disabled);assert.equal(await page.locator('#ai-provider').inputValue(),'minimax');
 testFailure=true;await page.click('#minimax-send');await page.waitForFunction(()=>document.getElementById('minimax-status').textContent.includes('余额不足'));assert(await page.locator('#minimax-reply').isHidden());testFailure=false;
 await page.selectOption('#ai-provider','kimi');await page.waitForFunction(()=>!document.getElementById('kimi-send').disabled);
 saveFailure=true;await page.selectOption('#kimi-effort','high');await page.waitForFunction(()=>document.getElementById('kimi-status').textContent.includes('保存失败'));assert(await page.locator('#kimi-send').isDisabled());saveFailure=false;
 await page.click('#kimi-save-model');await page.waitForFunction(()=>!document.getElementById('kimi-send').disabled);
 modelFailure=true;await page.click('#kimi-refresh');await page.waitForFunction(()=>document.getElementById('kimi-status').textContent.includes('目录读取失败'));assert(await page.locator('#kimi-send').isDisabled());modelFailure=false;
 await page.click('#kimi-refresh');await page.waitForFunction(()=>!document.getElementById('kimi-send').disabled);
 await page.selectOption('#kimi-model','kimi-k2.6');await page.waitForFunction(()=>!document.getElementById('kimi-send').disabled);stale=true;await page.click('#kimi-refresh');await page.waitForFunction(()=>document.getElementById('kimi-status').textContent.includes('原选择已不可用'));assert(await page.locator('#kimi-send').isDisabled());await page.click('#kimi-save-model');await page.waitForFunction(()=>!document.getElementById('kimi-send').disabled);
 await page.fill('#kimi-key','sk-typed-but-not-saved');await page.click('#settings-close');await page.click('#settings-btn');assert.equal(await page.locator('#kimi-key').inputValue(),'');await page.waitForFunction(()=>!document.getElementById('ai-provider').disabled);
 await page.selectOption('#ai-provider','minimax');await page.waitForFunction(()=>!document.getElementById('minimax-send').disabled);await page.locator('#minimax-model').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'.local/minimax-settings.png')});
 await page.selectOption('#ai-provider','kimi');await page.waitForFunction(()=>!document.getElementById('kimi-send').disabled);await page.locator('#kimi-model').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'.local/kimi-settings.png')});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.click('#kimi-disconnect');await page.waitForFunction(()=>document.getElementById('kimi-status').textContent.includes('尚未连接'));assert(states.minimax.connected);
 await page.selectOption('#ai-provider','gpt');assert(await page.locator('#ai-gpt-settings').isVisible());assert.deepEqual(assistants,['kimi','minimax']);assert.deepEqual(tests,['kimi','minimax','minimax']);assert.deepEqual(errors,[]);await context.close();
 const offline=await browser.newContext(),preview=await offline.newPage(),requests=[];preview.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await preview.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);const frame=preview.frames().find(f=>f.parentFrame());await frame.click('#settings-btn');await frame.locator('#chatgpt-panel summary').click();
 for(const p of ['kimi','minimax']){await frame.selectOption('#ai-provider',p);assert(await frame.locator('#'+p+'-key').isDisabled());assert(await frame.locator('#'+p+'-connect').isDisabled());assert(await frame.locator('#ai-'+p+'-settings').isVisible());}
 assert.deepEqual(requests,[]);await offline.close();
 console.log('Kimi/MiniMax browser checks passed: labels, isolated keys, catalog/effort, autosave, tests, assistant routing/sorting, stale/errors without fallback, mobile and offline preview.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();child.kill();});
