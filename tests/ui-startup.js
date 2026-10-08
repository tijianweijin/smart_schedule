const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright'),root=path.resolve(__dirname,'..');
const child=spawn('python',['-u','-B',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))try{resolve(JSON.parse(text.split('\n')[0]).url)}catch(e){reject(e)}});child.on('error',reject);setTimeout(()=>reject(Error('Startup timeout')),15000).unref()});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
 for(const entry of ['ketime _demo_0.1.html','刻时 小样.html']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];let scripts=0,protectedCalls=0;
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*.js',route=>{scripts++;route.fulfill({status:404,body:'unavailable'})});
  await page.route('**/api/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'0.4.0',csrfToken:'old-fixture'})}));
  await page.route('**/api/settings/**',route=>{protectedCalls++;route.fulfill({status:404,contentType:'application/json',body:'{}'})});
  await page.goto(url+'/'+encodeURIComponent(entry));await page.waitForFunction(()=>window.KetimeAccount);await page.click('#holiday-btn');assert(await page.locator('#holiday-overlay').isVisible());await page.click('#holiday-cancel');await page.click('#settings-btn');
  await page.waitForFunction(()=>document.getElementById('settings-status').textContent.includes('旧版刻时服务'));assert.equal(protectedCalls,0);assert.equal(scripts,0);await page.click('#settings-close');await page.click('#ucloud-btn');await page.waitForFunction(()=>document.getElementById('sync-status').textContent.includes('旧版刻时服务'));assert.equal(protectedCalls,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Both entry points open settings/holidays without external scripts; legacy services are blocked before credentials are sent.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
