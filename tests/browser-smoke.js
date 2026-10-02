/* Requires Playwright for development only, not for end users. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');
const child=spawn(process.env.KETIME_PYTHON||'python',['-u','-B',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});
let browser;
(async()=>{
  const url=await new Promise((resolve,reject)=>{let buf='';child.stdout.on('data',d=>{buf+=d;let end=buf.indexOf('\n');if(end>=0)try{resolve(JSON.parse(buf.slice(0,end)).url)}catch(e){reject(e)}});child.on('error',reject);child.on('exit',code=>reject(Error('Fixture exited '+code)));setTimeout(()=>reject(Error('Fixture startup timeout')),15000).unref()});
  browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
  const context=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='alert')throw Error('Unsafe course markup executed');await d.accept()});
  await page.goto(url);await page.waitForFunction(()=>window.__ketimeDemo&&document.getElementById('bupt-overlay'));
  assert.equal(await page.locator('.view-tab').count(),3);
  async function getPreview(){await page.click('#bupt-sync-btn');await page.fill('#bupt-account','test_account');await page.fill('#bupt-password','test_password_not_saved');await page.click('#bupt-fetch');await page.waitForSelector('#bupt-preview:not([hidden])');assert.equal(await page.inputValue('#bupt-password'),'')}
  await getPreview();assert.equal(await page.locator('#bupt-courses tr').count(),3);assert.equal(await page.locator('#bupt-courses img').count(),0);
  await page.click('#bupt-import');assert.match(await page.textContent('#bupt-status'),/导入成功/);await page.click('#bupt-close');
  let state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules.length,3);assert.equal(state.schedules.filter(e=>e.source).length,3);assert.equal(await page.locator('.event-block img').count(),0);
  await page.locator('.event-check').first().click();state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules[0].done,true);
  await page.reload();await page.waitForFunction(()=>window.__ketimeDemo);state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules[0].done,true);assert.equal(state.schedules[0].source.location,'测试教学楼 101');
  await page.waitForTimeout(5100);await getPreview();assert.match(await page.textContent('#bupt-summary'),/新增 0/);await page.click('#bupt-import');await page.click('#bupt-close');state=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(state.schedules.length,3);assert.equal(state.schedules[0].done,true);
  for(const view of ['projects','growth','schedule']){await page.click('[data-view="'+view+'"]');assert.equal(await page.locator('#view-'+view).isVisible(),true)}
  await page.click('#bupt-sync-btn');await page.locator('.bupt-backup summary').click();const downloadEvent=page.waitForEvent('download');await page.click('#bupt-export');const download=await downloadEvent,content=fs.readFileSync(await download.path(),'utf8');assert.equal(JSON.parse(content).schedules.length,3);assert(!content.includes('test_password_not_saved'));assert(!content.includes('test_account'));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#bupt-overlay').isVisible(),false);
  await page.click('#add-untimed-todo');await page.fill('#untimed-input','旧功能回归测试');await page.press('#untimed-input','Enter');assert.match(await page.textContent('#untimed-list'),/旧功能回归测试/);
  await page.click('#next-week');assert.match(await page.textContent('#untimed-list'),/旧功能回归测试/);await page.click('#today-btn');
  const artifacts=path.join(root,'.local');fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'timetable-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.click('#bupt-sync-btn');assert.equal(await page.locator('#bupt-fetch').isVisible(),true);const dimensions=await page.locator('.bupt-modal').boundingBox();assert(dimensions.width<390);await page.screenshot({path:path.join(artifacts,'timetable-mobile.png')});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('Browser checks passed: import, XSS escaping, done state, reload, repeat sync, three pages, backup, inbox, mobile.');
  await context.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
