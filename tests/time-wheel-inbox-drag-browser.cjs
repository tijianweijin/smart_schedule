/* Both packaged mobile surfaces, isolated data, real pointer/touch input. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const{chromium}=require('../.local/browser-test/node_modules/playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const platform of ['android','harmony']){
  const context=await browser.newContext({viewport:platform==='android'?{width:1280,height:1200}:{width:393,height:851},hasTouch:true,timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-16T09:46:00+08:00')});await page.clock.pauseAt(new Date('2026-10-16T09:47:00+08:00'));
  await page.addInitScript(({platform})=>{
   const key=platform==='android'?'ketime-android-edge-preview-v1':'ketime-demo-v0.1';
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({dayStartHour:6,schedules:[],projects:[],inbox:[{id:'drag-a',name:'拖入并调整',done:false},{id:'drag-b',name:'触摸拖入',done:true},{id:'drag-c',name:'失败仍保留',done:false}],reminders:[],growth:{series:[],demoSeeded:true}}));
   if(platform==='harmony'){
    window.KetimeHarmonyHost={postMessage:raw=>{const m=JSON.parse(raw);setTimeout(()=>window.__ketimeHarmonyReceive({id:m.id,value:m.op==='api'?JSON.stringify({status:200,body:{}}):'',error:''}),0)}};
    addEventListener('load',()=>window.__ketimeHarmonyReady('synthetic-only-token-1234567890123456789'));
   }
  },{platform});
  if(platform==='harmony')await page.route('http://127.0.0.1:8766/**',async route=>{const u=new URL(route.request().url()),name=u.pathname==='/'?'index.html':u.pathname.slice(1);assert(['index.html','harmony-bridge.js','android-mobile.js','android-mobile.css'].includes(name));await route.fulfill({body:fs.readFileSync(path.join(root,'harmony/entry/src/main/resources/rawfile/web',name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'})});
  await page.goto(platform==='android'?pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href:'http://127.0.0.1:8766/');
  const ui=platform==='android'?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.KetimeInboxDrag&&window.KetimeAndroidControls);await page.clock.runFor(200);
  await ui.click('#add-event-btn');await ui.fill('#event-start','23:59');await ui.click('#event-start-picker');await page.clock.runFor(160);
  async function centered(){assert(await ui.evaluate(()=>Array.from(document.querySelectorAll('.android-time-option[aria-pressed=true]')).length===2&&Array.from(document.querySelectorAll('.android-time-option[aria-pressed=true]')).every(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<1.1})),platform+' selected wheel value is centered')}
  await centered();await ui.locator('[data-time-unit=hour][aria-pressed=true]').press('ArrowDown');await ui.locator('[data-time-unit=minute][aria-pressed=true]').press('ArrowDown');await page.clock.runFor(200);assert.equal(await ui.locator('.android-time-preview').textContent(),'00:00');await centered();
  await ui.locator('[data-time-unit=minute][aria-pressed=true]').press('ArrowUp');await page.clock.runFor(180);assert.equal(await ui.locator('.android-time-preview').textContent(),'00:59');
  await ui.evaluate(()=>{const list=document.querySelector('[data-time-wheel=minute]');list.scrollTop=(120+17)*44+30;list.dispatchEvent(new Event('scroll'))});await page.clock.runFor(300);await centered();assert.equal(await ui.locator('.android-time-preview').textContent(),'00:18');
  assert.equal(await ui.locator('#event-start').inputValue(),'23:59');await ui.click('#android-picker-actions .btn-primary');assert.equal(await ui.locator('#event-start').inputValue(),'00:18');await ui.click('#cancel-event');
  await ui.evaluate(()=>{window.KetimeTimeline.expandInbox(true);document.getElementById('schedule-wrap').scrollTop=4*96});await page.clock.runFor(100);
  async function location(offset){const c=await ui.locator('.day-col-overlay[data-date="2026-10-16"]').boundingBox();return{x:c.x+c.width/2,y:c.y+offset/60*96}}
  async function dragMouse(id,target){const r=await ui.locator('.untimed-item[data-todo-id="'+id+'"] .untimed-name').boundingBox();await page.mouse.move(r.x+8,r.y+8);await page.mouse.down();await page.clock.runFor(350);assert(await ui.locator('.inbox-drag-ghost').isVisible());await page.mouse.move(target.x,target.y,{steps:5});await page.mouse.up();await page.clock.runFor(40)}
  await dragMouse('drag-a',await location(300));let state=await ui.evaluate(()=>window.__ketimeDemo.getState()),event=state.schedules.find(e=>e.name==='拖入并调整');assert(event);assert.equal(event.start,'11:00');assert.equal(event.end,'11:15');assert(!state.inbox.some(t=>t.id==='drag-a'));const color=event.color;
  let card=await ui.locator('.inbox-drop-active').boundingBox(),target=await location(360);await page.mouse.move(card.x+8,card.y+4);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:4});await page.mouse.up();await page.clock.runFor(40);state=await ui.evaluate(()=>window.__ketimeDemo.getState());event=state.schedules.find(e=>e.name==='拖入并调整');assert.equal(event.end,'12:00');assert.equal(event.color,color);
  card=await ui.locator('.inbox-drop-active').boundingBox();await page.mouse.dblclick(card.x+8,card.y+8,{delay:80});await page.clock.runFor(40);event=(await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.name==='拖入并调整');assert.equal(event.end,'');assert.equal(event.color,color);assert(await ui.locator('#schedule-overlay').isHidden());
  // Real touch sequence, including completion preservation and double-tap.
  const session=await context.newCDPSession(page),source=await ui.locator('.untimed-item[data-todo-id="drag-b"] .untimed-name').boundingBox();target=await location(420);
  const touch=async(type,p)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:p.x,y:p.y,id:1,radiusX:1,radiusY:1}]});
  await touch('touchStart',{x:source.x+8,y:source.y+8});await page.clock.runFor(350);await touch('touchMove',target);await touch('touchEnd');await page.clock.runFor(60);state=await ui.evaluate(()=>window.__ketimeDemo.getState());event=state.schedules.find(e=>e.name==='触摸拖入');assert(event&&event.done);assert.equal(event.start,'13:00');
  card=await ui.locator('.inbox-drop-active').boundingBox();const tap={x:card.x+7,y:card.y+3};for(let i=0;i<2;i++){await touch('touchStart',tap);await touch('touchEnd');await page.clock.runFor(90)}await page.clock.runFor(50);assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.name==='触摸拖入').end,'');
  // A cancelled or out-of-bounds drop never removes the source item.
  await dragMouse('drag-c',{x:10,y:20});assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).inbox.some(t=>t.id==='drag-c'));
  await ui.evaluate(()=>{window.__savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Synthetic full storage')}});await dragMouse('drag-c',await location(480));assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).inbox.some(t=>t.id==='drag-c'));assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.length,2);await ui.evaluate(()=>Storage.prototype.setItem=window.__savedSetItem);
  const cross=await ui.evaluate(()=>window.KetimeTimelineAPI.quickCreate('2026-10-16',1170,null,'凌晨无尾','drag-c'));assert.equal(cross.date,'2026-10-17');assert.equal(cross.start,'01:30');assert.equal(cross.end,'');
  await page.screenshot({path:path.join(root,'.local/'+platform+'-wheel-inbox-drag.png')});assert.deepEqual(errors,[]);await context.close();console.log(platform+': centered snap, cyclic hours/minutes, pointer/touch drop, resize, double-tap no-tail, stable color, completion preservation, failure rollback and midnight passed');
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
