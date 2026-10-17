/* No service, vault or upstream traffic. All HTTP routes are local fixtures. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('../.local/browser-test/node_modules/playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:393,height:851},hasTouch:true,timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 let stage='models',complete=null,requestId='',polls=0,mode='success',copied='';
 let html=fs.readFileSync(path.join(root,'ketime _demo_0.1.html'),'utf8').replace('<head>','<head><script>window.KetimeAndroid=true;</script>').replace('</head>','<style>'+fs.readFileSync(path.join(root,'android/app/src/main/web/android-mobile.css'),'utf8')+'</style></head>').replace('</body>','<script>'+fs.readFileSync(path.join(root,'android/app/src/main/web/android-mobile.js'),'utf8')+'</script></body>');
 const diagnostics={stage:'complete',elapsedMs:1240,timings:{catalogMs:1,headersMs:300,firstTextMs:850,inferenceMs:1230,validationMs:2},catalogCacheHit:true,usage:{inputTokens:100,outputTokens:50,reasoningTokens:12},secret:'must-not-copy'};
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push(u.href);assert.equal(u.origin,'http://127.0.0.1:18765');let data,status=200;
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(u.pathname==='/api/config')data={csrfToken:'fixture-token-must-not-copy',version:'0.11.0',chatgpt:true,modelSettings:true,scheduleAssistant:true,assistantDrafts:true,assistantDiagnostics:true};
  else if(u.pathname==='/api/chatgpt/status')data={connected:true,pending:false,error:'',accounts:[{id:'fixture-account',email:'fixture@example.invalid',active:true}]};
  else if(u.pathname==='/api/chatgpt/models')data={models:[{id:'gpt-6.1-sol',version:'6.1',series:'Sol',reasoningEfforts:['low'],defaultReasoningEffort:'low'}],selectedModel:'gpt-6.1-sol',defaultModel:'gpt-6.1-sol',reasoningEffort:'low',selectionValid:true};
  else if(u.pathname==='/api/assistant/progress'){
   assert.equal(route.request().headers()['x-ketime-token'],'fixture-token-must-not-copy');assert.equal(route.request().postDataJSON().requestId,requestId);polls++;data={found:true,...diagnostics,stage};
  }else if(u.pathname==='/api/chatgpt/assistant'){
   const payload=route.request().postDataJSON();assert.equal(payload.provider,'gpt');requestId=payload.requestId;assert(/^[a-f0-9]{32}$/.test(requestId));await new Promise(r=>{complete=r});
   if(mode==='failure'){status=502;data={error:'模拟网络中断'}}else data={eventCount:1,message:'已解析',events:[{name:'诊断测试',date:'2026-10-17',start:'09:00',end:'10:00',repeat:'none',endDate:null,location:null,notes:null,color:null,projectId:null,nodeId:null}],model:'gpt-6.1-sol',reasoningEffort:'low',completed:true,diagnostics};
  }else {status=404;data={error:'Unexpected fixture route'}}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.exposeFunction('__copyFixture',value=>{copied=value});await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:v=>window.__copyFixture(v)},configurable:true}));
 await page.goto('http://127.0.0.1:18765/');await page.click('#schedule-assistant-btn');await page.fill('#assistant-input','这段原始消息不应进入耗时概要');await page.click('#assistant-send');
 await page.waitForFunction(()=>document.getElementById('assistant-input').disabled);while(!complete)await page.waitForTimeout(30);await page.waitForTimeout(300);assert.match(await page.locator('.assistant-pending').textContent(),/检查模型目录/);assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,0);
 stage='receiving';await page.waitForFunction(()=>document.querySelector('.assistant-pending').textContent.includes('接收日程信息'));assert(polls>0);complete();await page.waitForFunction(()=>!document.getElementById('assistant-input').disabled);
 assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,1);await page.locator('.assistant-diagnostics summary').click();assert.match(await page.locator('.assistant-diagnostics').textContent(),/命中缓存/);assert.match(await page.locator('.assistant-diagnostics').textContent(),/首次文字/);await page.locator('.assistant-diagnostics button').click();await page.waitForTimeout(30);
 const report=JSON.parse(copied);assert.equal(report.model,'gpt-6.1-sol');assert.equal(report.reasoningEffort,'low');assert.equal(report.backend.usage.reasoningTokens,12);for(const secret of ['原始消息','fixture-account','fixture-token','must-not-copy','诊断测试'])assert(!copied.includes(secret));
 const finishedPolls=polls;await page.waitForTimeout(900);assert.equal(polls,finishedPolls,'No polling continues after completion');
 await page.click('#assistant-clear');mode='failure';complete=null;stage='requesting';await page.fill('#assistant-input','模拟失败');await page.click('#assistant-send');while(!complete)await page.waitForTimeout(30);complete();await page.waitForFunction(()=>!document.getElementById('assistant-input').disabled);assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,1);assert.match(await page.locator('.assistant-message.error').textContent(),/模拟网络中断/);assert(await page.locator('.assistant-diagnostics').isVisible());
 await page.screenshot({path:path.join(root,'.local/assistant-latency-mobile.png')});assert.deepEqual(errors,[]);await browser.close();console.log('PASS: mobile real-stage polling, elapsed time, safe timing report/copy, no partial creation, no polling leak, failed request preserves data; no live provider calls.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
