// Real multi-touch in an isolated Edge context. No real user data or APIs.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 const root=path.resolve(__dirname,'..');browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1280,height:1050},hasTouch:true,timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[],network=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url())});
 await page.clock.install({time:new Date('2026-10-12T09:46:00+08:00')});await page.clock.pauseAt(new Date('2026-10-12T09:47:00+08:00'));
 await page.addInitScript(()=>{window.__touchTrace=[];for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,e=>window.__touchTrace.push([type,e.touches.length]),true)});
 await page.addInitScript(()=>{if(!localStorage.getItem('ketime-android-edge-preview-v1'))localStorage.setItem('ketime-android-edge-preview-v1',JSON.stringify({dayStartHour:6,projects:[],inbox:[],reminders:[],growth:{series:[]},schedules:[{id:'normal',name:'正常日程',date:'2026-10-12',start:'12:00',end:'14:00',repeat:'none',color:'#236C62'},{id:'tail',name:'动态换行无尾日程',date:'2026-10-12',start:'15:00',end:'',location:'教学楼203室',repeat:'none',color:'#6554AA'}]}))});
 await page.goto(pathToFileURL(path.join(root,'android/dist/刻时-Android-Edge预览.html')).href);let ui=page.frames().find(f=>f.parentFrame());await ui.waitForFunction(()=>window.KetimeTimelineScale);await page.clock.runFor(64);
 const session=await context.newCDPSession(page),origin=await page.locator('iframe').boundingBox();
 const metrics=()=>ui.evaluate(()=>{const wrap=document.getElementById('schedule-wrap'),col=document.querySelector('.day-col-overlay[data-date="2026-10-12"]'),normal=document.querySelector('[data-event-id=normal]'),r=col.getBoundingClientRect(),w=wrap.getBoundingClientRect();return{scale:window.KetimeTimelineScale.value,hour:window.KetimeTimelineAPI.hourHeight,day:r.width,colLeft:r.left,colTop:r.top,normalHeight:normal.getBoundingClientRect().height,normalTop:parseFloat(normal.style.top),text:getComputedStyle(normal.querySelector('.event-title')).fontSize,nav:document.querySelector('.android-bottom-nav').getBoundingClientRect().height,toolbar:document.querySelector('.schedule-toolbar').getBoundingClientRect().height,inbox:document.querySelector('.untimed-head').getBoundingClientRect().height,viewportScale:visualViewport.scale,x:r.left+r.width/2,y:(w.top+96+w.bottom)/2}});
 const original=await ui.evaluate(()=>window.__ketimeDemo.getState().schedules),baseline=await metrics();
 async function touches(type,points){await session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i+1,x:origin.x+p.x,y:origin.y+p.y,radiusX:1,radiusY:1}))});await page.waitForTimeout(60);}
 async function pinch(ratio){
  const before=await metrics(),point={x:before.x,y:before.y},world={x:.5,y:(point.y-before.colTop)/before.hour};
  await touches('touchStart',[{x:point.x-35,y:point.y},{x:point.x+35,y:point.y}]);assert(await ui.evaluate(()=>window.KetimeTimelineScale.active),JSON.stringify({ratio,before,status:await ui.evaluate(p=>({target:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,160),overlays:[...document.querySelectorAll('.overlay.visible')].map(e=>e.id),draft:window.KetimeTimeline.hasDraft()}),point)}));
  for(const fraction of [.33,.66,1]){const step=1+(ratio-1)*fraction;await touches('touchMove',[{x:point.x-35*step,y:point.y},{x:point.x+35*step,y:point.y}]);await page.clock.runFor(48);}
  const during=await metrics();assert(Math.abs(during.colLeft+world.x*during.day-point.x)<1.2,JSON.stringify({axis:'date',before,during,world,point}));assert(Math.abs(during.colTop+world.y*during.hour-point.y)<1.2,JSON.stringify({axis:'time',before,during,world,point}));
  await touches('touchEnd',[]);await page.clock.runFor(32);assert(!await ui.evaluate(()=>window.KetimeTimelineScale.active),JSON.stringify({ratio,trace:await ui.evaluate(()=>window.__touchTrace)}));assert(!await ui.evaluate(()=>window.KetimeTimeline.hasDraft()));
  assert.equal(await ui.locator('.timeline-range-preview').count(),0);assert(await ui.locator('#timeline-quick-create').isHidden());return metrics();
 }
 for(const ratio of [1.25,.91,.5,3]){
  const before=await metrics(),after=await pinch(ratio),expected=Math.max(.75,Math.min(1.75,before.scale*ratio));assert(Math.abs(after.scale-expected)<.005);
  assert(Math.abs(after.hour-96*after.scale)<.01);assert(Math.abs(after.day-baseline.day*after.scale)<.1);assert(Math.abs(after.normalHeight-192*after.scale)<.1);assert(Math.abs(after.normalTop-576*after.scale)<.1);
  for(const key of ['nav','toolbar','inbox','text','viewportScale'])assert.equal(after[key],baseline[key],key+' is outside the zoom scope');
 }
 assert.deepEqual(await ui.evaluate(()=>window.__ketimeDemo.getState().schedules),original,'Pinch never changes schedule dates/times/duration');
 // Other views and forms stay unscaled, then returning retains the preference.
 for(const view of ['projects','growth']){await ui.click('[data-view='+view+']');assert.equal(await ui.locator('#view-'+view).evaluate(e=>getComputedStyle(e).transform),'none');assert.equal(await ui.evaluate(()=>visualViewport.scale),1);}
 await ui.click('#settings-btn');assert.equal(await ui.locator('#view-settings').evaluate(e=>getComputedStyle(e).transform),'none');await ui.click('[data-view=schedule]');await page.clock.runFor(64);assert.equal((await metrics()).scale,1.75);
 await ui.click('#add-event-btn');assert.equal(await ui.locator('#event-location').evaluate(e=>getComputedStyle(e).fontSize),'16px');assert.equal(await ui.locator('#schedule-overlay').evaluate(e=>getComputedStyle(e).transform),'none');await ui.click('#cancel-event');
 await ui.click('#schedule-assistant-btn');assert.equal(await ui.locator('#assistant-input').evaluate(e=>getComputedStyle(e).fontSize),'16px');assert.equal(await ui.locator('.schedule-assistant').evaluate(e=>getComputedStyle(e).transform),'none');await ui.click('#assistant-close');
 // A long press after a pinch still creates the ordinary, shared event UI.
 await ui.evaluate(()=>{window.KetimeTimelineScale.set(1);document.getElementById('schedule-wrap').scrollTop=3*96});await page.clock.runFor(1000);
 const blank=await ui.evaluate(()=>{const r=document.querySelector('.day-col-overlay[data-date="2026-10-12"]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+4*96}});
 await touches('touchStart',[blank]);await page.clock.runFor(360);assert.equal(await ui.locator('.timeline-range-preview').count(),1);await touches('touchEnd',[]);assert(await ui.locator('#timeline-quick-create').isVisible());await ui.click('#timeline-quick-cancel');
 // Exactly seven uniform random buckets, persisted once. No hash-colour fallback.
 const generated=await ui.evaluate(()=>{const old=Math.random,items=[];try{for(let i=0;i<7;i++){Math.random=()=> (i+.5)/7;items.push(window.KetimeTimelineAPI.quickCreate('2026-10-'+String(13+i).padStart(2,'0'),600,660,'拖动创建'+i))}}finally{Math.random=old}return items});
 assert.deepEqual(generated.map(e=>e.color),await ui.evaluate(()=>window.KetimeTimelineAPI.palette));
 await ui.evaluate(()=>window.__ketimeDemo.navigateScheduleDate('2026-10-13'));await page.clock.runFor(900);
 await ui.click('#add-event-btn');await ui.locator('#chips-editor .chip-text').first().fill('表单创建');await ui.fill('#event-date','2026-10-13');await ui.fill('#event-start','18:00');await ui.fill('#event-end','19:00');await ui.locator('#event-color-presets .color-preset[data-color="#236C62"]').click();await ui.click('#save-event');await page.clock.runFor(64);
 const manual=await ui.evaluate(()=>window.__ketimeDemo.getState().schedules.find(e=>e.name==='表单创建'));
 const presentation=async id=>ui.locator('[data-event-id="'+id+'"]').first().evaluate(e=>{const s=getComputedStyle(e),c=getComputedStyle(e.querySelector('.event-check')),t=getComputedStyle(e.querySelector('.event-title'));return{bg:s.backgroundColor,border:s.borderTopColor,radius:s.borderRadius,title:t.fontSize,weight:t.fontWeight,check:c.width,row:getComputedStyle(e.querySelector('.event-completion-row')).position}});
 assert.deepEqual(await presentation(generated[0].id),await presentation(manual.id));
 await ui.evaluate(()=>window.KetimeTimelineScale.set(1.25));await page.clock.runFor(64);await page.screenshot({path:path.join(root,'.local/timeline-pinch-1.25.png')});
 await page.reload();ui=page.frames().find(f=>f.parentFrame());await ui.waitForFunction(()=>window.KetimeTimelineScale);await page.clock.runFor(64);assert.equal(await ui.evaluate(()=>window.KetimeTimelineScale.value),1.25);
 for(const item of generated)assert.equal(await ui.evaluate(id=>window.__ketimeDemo.getState().schedules.find(e=>e.id===id).color,item.id),item.color);
 // Cache replacement compensates by the actual zoomed week width, in both directions.
 for(const value of [.75,1.75]){
  await ui.evaluate(value=>window.KetimeTimelineScale.set(value),value);await page.clock.runFor(96);
  for(const direction of [1,-1])for(let i=0;i<5;i++){
   const expected=await ui.evaluate(direction=>{const wrap=document.getElementById('schedule-wrap'),width=document.querySelector('.day-header-cell').getBoundingClientRect().width;wrap.scrollLeft+=direction*7*width;wrap.scrollTop=17;const middle=wrap.getBoundingClientRect().left+wrap.clientWidth/2,head=[...document.querySelectorAll('.day-header-cell')].find(e=>{const r=e.getBoundingClientRect();return r.left<=middle&&r.right>middle}),col=[...document.querySelectorAll('.day-col-overlay')].find(e=>e.style.gridColumn===head.style.gridColumn);return{date:col.dataset.date,left:head.getBoundingClientRect().left}},direction);
   await page.clock.runFor(96);assert(await ui.evaluate(expected=>{const col=document.querySelector('.day-col-overlay[data-date="'+expected.date+'"]');return col&&Math.abs(col.getBoundingClientRect().left-expected.left)<1&&document.querySelectorAll('.day-header-cell').length===21&&document.getElementById('schedule-wrap').scrollTop===17},expected),'Zoomed rolling weeks preserve the viewport');
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);await context.close();console.log('Pinch passed: real two-touch smooth ratios/clamps, same X/Y scale, date/time anchor, no page zoom, unscaled nav/toolbar/inbox/views/form, no accidental creation, resumed long press, seven random colours stable on reload and shared form/card styles.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
