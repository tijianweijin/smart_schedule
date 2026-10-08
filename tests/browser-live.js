/* Opt-in: tests the already configured running local service; logs no personal content. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
if(process.env.KETIME_LIVE_TEST!=='1')throw Error('Explicit KETIME_LIVE_TEST=1 is required; save authorized credentials locally first.');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});try{
 const context=await browser.newContext({timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.KETIME_RUNNING_URL||'http://127.0.0.1:8766/');
 await page.click('#bupt-sync-btn');await page.waitForFunction(()=>document.getElementById('sync-status').textContent.includes('课表已更新'),null,{timeout:90000});const courseCount=(await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.length;
 await page.click('#ucloud-btn');await page.waitForFunction(()=>document.getElementById('sync-status').textContent.includes('作业已更新'),null,{timeout:180000});const workCount=(await page.evaluate(()=>window.__ketimeDemo.getState())).inbox.length;
 await page.reload();await page.waitForFunction(()=>window.__ketimeDemo);const count=await page.evaluate(()=>({courses:window.__ketimeDemo.getState().schedules.length,assignments:window.__ketimeDemo.getState().inbox.length}));assert.equal(count.courses,courseCount);assert.equal(count.assignments,workCount);assert.deepEqual(errors,[]);console.log(JSON.stringify({live:true,oneClick:true,courseCount,workCount,reload:true}));await context.close();
 }finally{await browser.close()}})().catch(()=>{console.error('Live direct-import test failed (details suppressed).');process.exitCode=1});
