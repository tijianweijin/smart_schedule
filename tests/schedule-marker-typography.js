// Verify shared field typography without changing stored schedules or fade geometry.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..');let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-08T09:46:00+08:00')});
  await page.addInitScript(({mobile})=>{
   const schedules=[['normal','08:00','09:00'],['start','10:00',''],['end','','14:00'],['course','','17:00'],['normal-course','19:00','20:00']].map(([id,start,end])=>({id,start,end,name:'共同标题\n第二行',date:'2026-10-08',repeat:'none',color:'#8fbaa5',location:'教学楼203室',...(id.includes('course')?{source:{provider:'bupt',accountKey:'a'.repeat(24),sourceId:'b'.repeat(32),termId:'2026-2027-1',location:'教学楼203室',teacher:'测试教师'}}:{})}));
   localStorage.setItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify({dayStartHour:6,projects:[],schedules,inbox:[],reminders:[],growth:{series:[]}}));
  },{mobile});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);
  const ui=mobile?page.frames().find(f=>f.parentFrame()):page;
  await ui.waitForFunction(()=>document.querySelector('.marker-expanded'));
  for(const size of mobile?['360,800','393,851','430,932']:['desktop']){
   if(mobile){await page.selectOption('#preview-size',size);await ui.waitForFunction(w=>innerWidth===w,+size.split(',')[0]);}
   await ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const result=await ui.evaluate(()=>{
    const normal=document.querySelector('[data-event-id=normal]');
    const props=['fontFamily','fontSize','fontWeight','lineHeight','whiteSpace','overflowWrap','opacity'];
    function style(e){const s=getComputedStyle(e);return Object.fromEntries(props.map(p=>[p,s[p]]));}
    return ['start','end','course'].map(id=>{
     const block=document.querySelector('[data-event-id="'+id+'"]'),content=block.querySelector('.marker-content'),check=block.querySelector('.event-check'),r=content.getBoundingClientRect(),c=check.getBoundingClientRect();
     return {id,expanded:block.classList.contains('marker-expanded'),title:content.querySelector('.event-title').textContent,time:content.querySelector('.event-time').textContent,location:content.querySelector('.event-location').textContent,fields:['event-title','event-location','event-source'].filter(k=>content.querySelector('.'+k)).map(k=>({kind:k,actual:style(content.querySelector('.'+k)),expected:style((k==='event-source'?document.querySelector('[data-event-id=normal-course]'):normal).querySelector('.'+k))})),height:block.getBoundingClientRect().height,mask:block.querySelector('.marker-fade').style.maskImage,checkBelow:c.top>=r.bottom+2,checkInside:c.bottom<=block.getBoundingClientRect().bottom-2,order:Array.from(content.children).map(e=>e.className)};
    });
   });
   for(const item of result){
    assert(item.expanded,JSON.stringify({mobile,size,...item}));assert.equal(item.title,'共同标题\n第二行');assert.match(item.location,/教学楼203室/);assert(item.time.includes(item.id==='start'?'10:00':item.id==='end'?'14:00':'17:00'));
    for(const field of item.fields)assert.deepEqual(field.actual,field.expected,`${size} ${item.id} ${field.kind}`);
    assert(item.height>0);assert(item.id==='start'?!item.mask.includes('to top'):item.mask.includes('to top'));
    assert(item.checkBelow&&item.checkInside);assert.deepEqual(item.order,item.id==='course'?['event-title','event-time','event-source','event-location']:['event-title','event-time','event-location']);
   }
   const copies=await ui.locator('.event-marker .marker-readable-copy').evaluateAll(elements=>elements.map(element=>({background:getComputedStyle(element).backgroundColor,shadow:getComputedStyle(element).boxShadow})));
   assert(copies.length>0);for(const copy of copies){assert.equal(copy.background,'rgba(0, 0, 0, 0)');assert.equal(copy.shadow,'none');}
   assert(await ui.locator('.marker-has-line').evaluateAll(elements=>elements.every(element=>getComputedStyle(element,'::before').display==='none')));
  }
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=2*96);
  await page.screenshot({path:path.join(root,'.local/marker-typography-'+(mobile?'android':'desktop')+'.png')});
  await ui.locator('[data-event-id=start] .event-check').click();assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='start').done);
  await page.reload();const fresh=mobile?page.frames().find(f=>f.parentFrame()):page;await fresh.waitForFunction(()=>window.__ketimeDemo);assert.equal((await fresh.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='start').end,'');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Shared marker typography passed: desktop and 360/393/430px Android; transparent text background, no boundary bars, separate title/time/location, imported location, multiline, completion persistence and dynamic fades.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
