// Real Edge, isolated schedule fixtures. Never uses personal data or networks.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 const root=path.resolve(__dirname,'..');browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-12T09:46:00+08:00')});
  await page.addInitScript(({mobile})=>{
   if(localStorage.getItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1'))return;
   const schedules=[['short','08:00','','阅读',''],['long','10:00','','这是需要多行显示而且不应当丢失的完整日程名称',''],['place','13:00','','阅读','教学楼203室'],['end','','16:00','交报告','办公室'],['unknown','','','待定活动','地点待确认'],['tiny','17:00','17:15','短日程','教学楼'],['half','18:00','18:30','半小时日程','教学楼'],['full','19:00','22:00','三小时学习','图书馆'],['boundary-start','05:50','','边界开始',''],['boundary-end','','06:10','边界结束','']].map(([id,start,end,name,location])=>({id,start,end,name,location,date:id.startsWith('boundary')?'2026-10-13':'2026-10-12',repeat:'none',color:'#8fbaa5'}));
   localStorage.setItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify({dayStartHour:6,schedules,projects:[],inbox:[],reminders:[],growth:{series:[]}}));
  },{mobile});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);let ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  await ui.waitForFunction(()=>window.KetimeCardTextLayout&&document.querySelector('[data-event-id=short] .event-completion-row'));
  const settle=()=>ui.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
  const card=id=>ui.locator('[data-event-id="'+id+'"]').first();
  for(const size of mobile?['360,800','393,851','430,932']:['desktop']){
   if(mobile)await page.selectOption('#preview-size',size);await settle();
   for(const id of ['short','long','place','end','unknown','tiny','half','full']){
    const result=await card(id).evaluate(block=>{const layout=block.querySelector('.event-card-layout'),text=block.querySelector('.event-content,.marker-content'),fields=[...text.querySelectorAll('.event-title,.event-time,.event-location')].filter(e=>getComputedStyle(e).display!=='none'),last=fields.at(-1),check=block.querySelector('.event-check'),row=check.parentElement,cs=getComputedStyle(check),style=getComputedStyle(block),r=block.getBoundingClientRect(),c=check.getBoundingClientRect();return{height:r.height,top:parseFloat(block.style.top),content:layout.getBoundingClientRect().height+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0),checkPosition:cs.position,checkMargin:cs.marginTop,diameter:c.height,gap:c.top-last.getBoundingClientRect().bottom,right:text.getBoundingClientRect().right-c.right,flowOrder:[...layout.children].map(e=>e.className),scroll:block.classList.contains('event-content-scroll'),title:text.querySelector('.event-title').textContent,fade:block.querySelector('.marker-fade')?.style.maskSize,mask:block.querySelector('.marker-fade')?.style.maskImage,opacity:getComputedStyle(layout).opacity,padding:parseFloat(style.paddingBottom)}});
    assert.equal(result.checkPosition,'static',JSON.stringify({id,size,result}));assert.equal(result.checkMargin,'0px');assert(result.diameter>=18&&result.diameter<=22);assert.equal(result.opacity,'1');
    if(['short','long','place','unknown'].includes(id)){assert(Math.abs(result.gap-4)<.8,JSON.stringify({id,size,result}));assert(Math.abs(result.right)<.8);assert.equal(result.flowOrder[1],'event-completion-row');}
    else assert(await card(id).evaluate(e=>{const row=e.querySelector('.event-completion-row'),r=e.getBoundingClientRect(),c=row.getBoundingClientRect();return getComputedStyle(row).position==='absolute'&&Math.abs(r.right-c.right-6-(parseFloat(getComputedStyle(e).borderRightWidth)||0))<1&&c.top>=r.top-.1&&Math.abs(r.bottom-c.bottom-Number.parseFloat(e.style.getPropertyValue('--completion-inset'))-(parseFloat(getComputedStyle(e).borderBottomWidth)||0))<1}),JSON.stringify({id,size,result}));
    if(['short','long','place','end','unknown'].includes(id)){assert(Math.abs(result.height-result.content)<1,JSON.stringify({id,size,result}));assert(Math.abs(parseFloat(result.fade.split(' ')[1])-result.content)<1);if(id==='end')assert(Math.abs(result.top+result.height-10*96)<1);if(id==='short')assert.equal(result.top,2*96);if(id==='unknown'){assert(result.mask.includes('transparent 0%'));assert.equal(await card(id).locator('.event-time').textContent(),'时间未定');}}
    if(id==='tiny'){assert.equal(result.height,24);assert(result.scroll,'15-minute events scroll internally, not grow');}
    if(id==='half')assert.equal(result.height,48);if(id==='full'){assert.equal(result.height,288);assert(result.gap>100,'Long normal event checkbox is fixed at the card bottom');}
   }
   const heights=await ui.evaluate(()=>Object.fromEntries(['short','long','place'].map(id=>[id,document.querySelector('[data-event-id="'+id+'"] ').getBoundingClientRect().height])));assert(heights.long>heights.short);assert(heights.place>heights.short);
   for(const id of ['boundary-start','boundary-end']){const all=ui.locator('[data-event-id="'+id+'"]');assert.equal(await all.count(),2);assert(await all.evaluateAll(es=>{const sum=es.reduce((s,e)=>s+e.getBoundingClientRect().height,0),full=Number(es[0].dataset.markerFullHeight);return Math.abs(sum-full)<1&&es.every(e=>parseFloat(e.style.top)>=0&&parseFloat(e.style.top)+parseFloat(e.style.height)<=24*96+.1)}),'Measured boundary splits share one occurrence');}
  }
  // Actual DOM changes remeasure content and preserve known time anchors.
  const before=await card('short').evaluate(e=>e.getBoundingClientRect().height);
  await card('short').locator('.event-title').evaluate(e=>e.textContent='动态改变的多行标题需要根据真实换行高度调整色块');await settle();assert((await card('short').evaluate(e=>e.getBoundingClientRect().height))>before);assert.equal(await card('short').evaluate(e=>parseFloat(e.style.top)),192);
  await card('end').locator('.event-location').evaluate(e=>e.remove());await settle();assert(await card('end').evaluate(e=>Math.abs(parseFloat(e.style.top)+parseFloat(e.style.height)-960)<1));
  const stable=await card('short').getAttribute('style');for(let i=0;i<12;i++)await ui.evaluate(()=>window.KetimeCardTextLayout.layout(document.getElementById('schedule-grid')));assert.equal(await card('short').getAttribute('style'),stable);
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=96);await page.screenshot({path:path.join(root,'.local/schedule-dynamic-height-'+(mobile?'mobile':'desktop')+'.png')});
  await card('short').locator('.event-check').click();assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='short').done);
  await card('tiny').locator('.event-check').click();assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='tiny').done,'Short card completion still works');
  await page.reload();ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.KetimeCardTextLayout);assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='short').done);assert.equal((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='unknown').start,'');assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Dynamic card height passed: desktop/360/393/430px; compact/long/place/end/unknown, normal-flow trailing completion, measured height + background fade, exact known-duration geometry, 15-minute inner scroll, boundary splitting, live rewrap/place removal, stable layout and completion persistence.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
