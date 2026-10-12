// Isolated fixtures only. No accounts, external inference or user storage.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 const root=path.resolve(__dirname,'..');browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-12T09:46:00+08:00')});
  await page.addInitScript(({mobile})=>{const schedules=[['full','08:00','10:00','数字电路实验','教学楼'],['short','11:00','','学习',''],['long','13:00','','这是用户手动输入的长日程名称不能自动改写',''],['place','15:00','','学习','教学楼203室'],['end','','18:00','提交成果','办公室'],['tiny','19:00','19:15','短日程','非常长的地点'],['course','20:00','22:00','课程实验','实验楼']].map(([id,start,end,name,location])=>({id,start,end,name,location,date:'2026-10-12',repeat:'none',color:'#8fbaa5',...(id==='course'?{source:{provider:'bupt',accountKey:'a'.repeat(24),sourceId:'b'.repeat(32),termId:'2026-2027-1',location}}:{})}));localStorage.setItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify({dayStartHour:6,schedules,projects:[],inbox:[],reminders:[],growth:{series:[]}}))},{mobile});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);const ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.KetimeCardTextLayout);
  const selector=id=>'[data-event-id="'+id+'"]';
  for(const size of mobile?['360,800','393,851','430,932']:['desktop']){
   if(mobile)await page.selectOption('#preview-size',size);
   await ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{window.KetimeTimelineLayout();requestAnimationFrame(resolve)}))));
   for(const [id,text] of [['full','08:00–10:00'],['short','11:00 开始'],['end','18:00 结束'],['tiny','19:00–19:15'],['course','20:00–22:00']]){assert.equal(await ui.locator(selector(id)+' .event-time').textContent(),text);assert(await ui.locator(selector(id)+' .event-time').isVisible(),size+' '+id)}
   assert(await ui.locator(selector('tiny')+' .event-location').isHidden());
   for(const id of ['short','long','place','end']){
    const result=await ui.locator(selector(id)).evaluate(block=>{const content=block.querySelector('.marker-content'),fields=Array.from(content.querySelectorAll('.event-title,.event-time,.event-location')).filter(field=>getComputedStyle(field).display!=='none'),first=fields[0].getBoundingClientRect(),last=fields.at(-1).getBoundingClientRect(),fade=block.querySelector('.marker-fade'),r=block.getBoundingClientRect(),s=getComputedStyle(block);return{actual:block.querySelector('.event-card-layout').getBoundingClientRect().height+(parseFloat(s.paddingTop)||0)+(parseFloat(s.paddingBottom)||0),fade:Number(fade.dataset.contentHeight),height:r.height,inside:first.top>=r.top-.5&&last.bottom<=r.bottom+.5,background:getComputedStyle(fade).backgroundColor,mask:fade.style.maskImage,textOpacity:getComputedStyle(content).opacity}});
    assert(Math.abs(result.actual-result.fade)<.8,JSON.stringify({id,size,...result}));assert(result.fade<=result.height+.8);assert(result.inside,JSON.stringify({id,size,...result}));assert.equal(result.background,'rgb(143, 186, 165)');assert.equal(result.textOpacity,'1');assert(id==='end'?result.mask.includes('to top'):!result.mask.includes('to top'));
   }
   const heights=await ui.evaluate(()=>Object.fromEntries(['short','long','place'].map(id=>[id,Number(document.querySelector('[data-event-id="'+id+'"] .marker-fade').dataset.contentHeight)])));
   assert(heights.long>heights.short,JSON.stringify({size,heights}));assert(heights.place>heights.short,JSON.stringify({size,heights}));
  }
  // Actual text/location edits remeasure without rebuilding schedule geometry.
  const originalTop=await ui.locator(selector('short')).evaluate(e=>e.style.top);
  await ui.evaluate(()=>{document.querySelector('[data-event-id=short] .event-title').textContent='动态文字换行测试名称';window.KetimeTimelineLayout()});await ui.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await ui.locator(selector('short')).evaluate(e=>e.style.top),originalTop);
  const stable=await ui.locator(selector('short')+' .marker-fade').getAttribute('style');await ui.evaluate(()=>{for(let i=0;i<20;i++)window.KetimeCardTextLayout.layout(document.getElementById('schedule-grid'))});assert.equal(await ui.locator(selector('short')+' .marker-fade').getAttribute('style'),stable);
  await ui.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=4*96);await page.screenshot({path:path.join(root,'.local/content-layout-'+(mobile?'mobile':'desktop')+'.png')});
  await ui.click('#add-event-btn');await ui.locator('#chips-editor .chip-text').first().fill('手动名称完整保留不限制十个汉字');await ui.fill('#event-start','');await ui.fill('#event-end','');await ui.click('#save-event');assert(await ui.locator('#schedule-overlay').isVisible());await ui.fill('#event-start','07:00');await ui.click('#save-event');assert((await ui.evaluate(()=>window.__ketimeDemo.getState())).schedules.some(e=>e.name==='手动名称完整保留不限制十个汉字'&&e.start==='07:00'&&e.end===''));
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Content layout passed: desktop and 360/393/430px, title/time/location priority, dynamic measured fade, resize/rewrap, own color, stable remeasurement, unchanged offsets, manual names and unknown-time validation.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
