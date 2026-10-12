// Isolated Edge contexts: UI-only fixtures, no real accounts or external requests.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 const root=path.resolve(__dirname,'..');browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  await page.addInitScript(({mobile})=>{const key=mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({dayStartHour:6,schedules:[],projects:[],inbox:[],reminders:[],growth:{series:[],demoSeeded:true}}))},{mobile});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  let ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.KetimeTimelineAPI&&window.__ketimeDemo);
  const style=async(selector)=>ui.locator(selector).evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{bg:s.backgroundColor,border:s.borderTopColor,radius:s.borderTopLeftRadius,width:s.borderTopWidth,outline:s.outlineStyle,shadow:s.boxShadow,w:r.width,h:r.height,inside:r.left>=0&&r.right<=innerWidth+1}});
  const check=(s,focused)=>{assert.equal(s.bg,'rgb(255, 255, 255)');assert.equal(s.border,focused?'rgb(42, 128, 82)':'rgba(0, 0, 0, 0)',JSON.stringify(s));assert.equal(s.radius,'12px');assert.equal(s.width,'2px');assert.equal(s.outline,'none');assert.equal(s.shadow,'none');assert(s.inside)};
  for(const size of mobile?['360,800','393,851','430,932']:['desktop']){
   if(mobile)await page.selectOption('#preview-size',size);
   await ui.click('#add-event-btn');await ui.locator('#chips-editor .chip-text').first().focus();check(await style('#chips-editor'),true);
   const before=await style('#event-location');check(before,false);await ui.locator('#event-location').focus();check(await style('#event-location'),true);check(await style('#chips-editor'),false);
   await ui.locator('#chips-editor .chip-text').first().focus();const after=await style('#event-location');check(after,false);assert.equal(after.w,before.w);assert.equal(after.h,before.h,'Focus does not resize controls');
   if(mobile){await ui.locator('#event-start-picker').hover();check(await style('#event-start-picker'),false);await ui.click('#event-start-picker');check(await style('#event-start-picker'),true);await ui.evaluate(()=>window.KetimeAndroid.back());await ui.locator('#chips-editor .chip-text').first().focus();check(await style('#event-start-picker'),false);}
   if(mobile&&size==='393,851')await page.screenshot({path:path.join(root,'.local/focus-input-mobile.png')});
   await ui.click('#cancel-event');await ui.click('#add-untimed-todo');await ui.locator('#untimed-input').focus();check(await style('#untimed-input'),true);
   assert.equal(await ui.locator('.untimed-add-hint').count(),0);assert(!/Enter/.test(await ui.locator('#untimed-add-row').textContent()));assert.equal(await ui.locator('#untimed-input').getAttribute('placeholder'),'记录尚未整理的事情');
   await ui.fill('#untimed-input','');await ui.press('#untimed-input','Enter');assert.equal(await ui.locator('.untimed-edit-input').count(),0);
   const count=await ui.evaluate(()=>window.__ketimeDemo.getState().inbox.length);
   await ui.click('#add-untimed-todo');await ui.fill('#untimed-input','待收纳输入 '+size);
   if(mobile&&size==='393,851')await page.screenshot({path:path.join(root,'.local/inbox-input-mobile.png')});
   await ui.press('#untimed-input','Enter');assert.equal(await ui.evaluate(()=>window.__ketimeDemo.getState().inbox.length),count+1);
   const item=ui.locator('.untimed-item').last();await item.locator('.untimed-name').click();check(await style('.untimed-edit-input'),true);await ui.fill('.untimed-edit-input','已修改 '+size);await ui.press('.untimed-edit-input','Enter');assert.equal(await item.locator('.untimed-name').textContent(),'已修改 '+size);
   await item.locator('.untimed-name').click();await ui.fill('.untimed-edit-input','不应保存');await ui.press('.untimed-edit-input','Escape');assert.equal(await item.locator('.untimed-name').textContent(),'已修改 '+size);
   await ui.click('#add-untimed-todo');await ui.fill('#untimed-input','取消新增');await ui.press('#untimed-input','Escape');assert.equal(await ui.evaluate(()=>window.__ketimeDemo.getState().inbox.length),count+1);
  }
  const saved=await ui.evaluate(()=>window.__ketimeDemo.getState().inbox.map(x=>({...x,source:x.source||null})));await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.__ketimeDemo);assert.deepEqual(await ui.evaluate(()=>window.__ketimeDemo.getState().inbox.map(x=>({...x,source:x.source||null}))),saved);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await context.close();
 }
 console.log('Focus/inbox passed: desktop and 360/393/430px, white 12px controls, green only when focused/open, no hover border or size jump, inbox add/edit, no Enter badge, keyboard confirm/cancel and persistence.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
