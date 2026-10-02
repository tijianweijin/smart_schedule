/* Opt-in live verification. Credentials come only from environment; never log data. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
if(!process.env.KETIME_TEST_ACCOUNT||!process.env.KETIME_TEST_PASSWORD)throw Error('Set temporary KETIME_TEST_ACCOUNT and KETIME_TEST_PASSWORD for authorized live verification.');
const root=path.resolve(__dirname,'..');
const child=spawn(process.env.KETIME_PYTHON||'python',['-u','-B',path.join(__dirname,'browser_fixture_server.py'),'--live'],{cwd:root,stdio:['ignore','pipe','pipe']});
let browser;
(async()=>{
  const url=await new Promise((resolve,reject)=>{let buf='';child.stdout.on('data',d=>{buf+=d;if(buf.includes('\n'))try{resolve(JSON.parse(buf.split('\n')[0]).url)}catch(e){reject(e)}});child.on('error',reject);child.on('exit',code=>reject(Error('Service exited '+code)));setTimeout(()=>reject(Error('Service startup timeout')),15000).unref()});
  browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.click('#bupt-sync-btn');await page.fill('#bupt-account',process.env.KETIME_TEST_ACCOUNT);await page.fill('#bupt-password',process.env.KETIME_TEST_PASSWORD);delete process.env.KETIME_TEST_ACCOUNT;delete process.env.KETIME_TEST_PASSWORD;
  const responseEvent=page.waitForResponse(r=>r.url().endsWith('/api/bupt/timetable'),{timeout:90000});await page.click('#bupt-fetch');const response=await responseEvent;assert.equal(response.status(),200,'Live school sync failed');const payload=await response.json();await page.waitForSelector('#bupt-preview:not([hidden])');assert.equal(await page.inputValue('#bupt-password'),'');assert(payload.events.length>0);
  await page.click('#bupt-import');assert.match(await page.textContent('#bupt-status'),/导入成功/);await page.click('#bupt-close');let state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules.length,payload.events.length);assert.equal(new Set(state.schedules.map(e=>e.id)).size,payload.events.length);
  if(await page.locator('.event-check').count()){await page.locator('.event-check').first().click();assert((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.some(e=>e.done))}
  await page.reload();await page.waitForFunction(()=>window.__ketimeDemo);state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules.length,payload.events.length);
  const repeat=await page.evaluate(data=>{const p=window.KetimeBupt.plan(window.__ketimeDemo.getState().schedules,data);return{added:p.added,updated:p.updated,count:p.schedules.length,done:p.schedules.filter(e=>e.done).length}},payload);assert.equal(repeat.added,0);assert.equal(repeat.updated,0);assert.equal(repeat.count,payload.events.length);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({liveVerified:true,term:payload.termId,termStart:payload.termStart,courses:payload.courses.length,occurrences:payload.events.length,complete:payload.complete,repeatAdded:repeat.added,reloadVerified:true}));
  await context.close();
})().catch(()=>{console.error('Live end-to-end verification failed (sensitive details suppressed).');process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
