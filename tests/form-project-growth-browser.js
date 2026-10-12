// Isolated fixtures and real Edge rendering. No production storage or API calls.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 const root=path.resolve(__dirname,'..');browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:{width:1280,height:1050},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-12T09:46:00+08:00')});
  await page.addInitScript(({mobile})=>{
   const series=[['sparse','#b58ba6',[[1,5],[4,25],[10,90]]],['pair','#c67d45',[[2,70],[8,30]]],['single','#736da1',[[6,50]]],['turning','#3b7a91',[[1,0],[3,100],[5,0],[7,100],[10,50]]]].map(([projectId,color,points])=>({projectId,name:projectId,color,deletedOn:'2026-10-12',retiredAfter:null,points:points.map(([day,completion])=>({date:'2026-10-'+String(day).padStart(2,'0'),completion}))}));
   const projects=[{id:'layout',name:'项目页面缓冲检查',color:'#8fbaa5',nodes:[{id:'n1',name:'准备',done:true,checklist:[]},{id:'n2',name:'执行',done:false,checklist:[{id:'t1',name:'检查任务',done:false}]},{id:'n3',name:'验收',done:false,checklist:[]}]}];
   localStorage.setItem(mobile?'ketime-android-edge-preview-v1':'ketime-demo-v0.1',JSON.stringify({dayStartHour:6,schedules:[],projects,inbox:[],reminders:[],growth:{series,demoSeeded:true}}));
  },{mobile});
  await page.goto(pathToFileURL(path.join(root,mobile?'android/dist/刻时-Android-Edge预览.html':'ketime _demo_0.1.html')).href);const ui=mobile?page.frames().find(f=>f.parentFrame()):page;await ui.waitForFunction(()=>window.KetimeProjectBuffer);
  const settle=()=>ui.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
  for(const size of mobile?['360,800','393,851','430,932']:['desktop']){
   if(mobile)await page.selectOption('#preview-size',size);
   await ui.click('#add-event-btn');await settle();
   const controls=await ui.locator('#schedule-overlay .form-input,#schedule-overlay .form-select,#schedule-overlay .ketime-control-trigger,#chips-editor').evaluateAll(els=>els.filter(e=>getComputedStyle(e).opacity!=='0'&&e.getClientRects().length).map(e=>{const s=getComputedStyle(e);return{id:e.id,bg:s.backgroundColor,color:s.color,border:s.borderTopColor,width:s.borderTopWidth,radius:s.borderTopLeftRadius,shadow:s.boxShadow,outline:s.outlineStyle,focused:e.matches(':focus-within')||e.getAttribute('aria-expanded')==='true'}}));
   for(const control of controls){assert.equal(control.bg,'rgb(255, 255, 255)',JSON.stringify(control));assert.equal(control.border,control.focused?'rgb(42, 128, 82)':'rgba(0, 0, 0, 0)',JSON.stringify(control));assert.equal(control.width,'2px');assert.equal(control.radius,'12px');assert.equal(control.shadow,'none');assert.equal(control.outline,'none');}
   assert(await ui.locator('#chips-editor .chip-text').first().evaluate(e=>getComputedStyle(e).outlineStyle==='none'),'Name contenteditable has no second focus outline');
   assert(await ui.locator('.schedule-name-help').evaluate(e=>!e.open));
   assert(await ui.locator('#chips-editor .ph-add').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&getComputedStyle(e).borderTopWidth==='0px'}));
   const time=await ui.locator('.schedule-time-pair').evaluate(e=>{const a=e.children[0].getBoundingClientRect(),b=e.children[1].getBoundingClientRect();return{top:Math.abs(a.top-b.top),gap:b.left-a.right,width:Math.abs(a.width-b.width),overflow:e.scrollWidth-e.clientWidth}});
   assert(time.top<1&&Math.abs(time.gap-12)<1&&time.width<1&&time.overflow<=1,JSON.stringify({size,time}));
   if(mobile){assert(await ui.locator('#event-start').evaluate(e=>getComputedStyle(e).opacity==='0'));assert(await ui.locator('#event-start-picker').evaluate(e=>getComputedStyle(e.parentElement).borderTopWidth==='0px'));await ui.click('#event-start-picker');assert(await ui.locator('#event-start-picker').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(e).outlineStyle==='none'));await ui.evaluate(()=>window.KetimeAndroid.back());}
   await ui.locator('#chips-editor .chip-text').first().fill('输入框样式检查');await ui.fill('#event-start','09:01');await ui.fill('#event-end','10:02');
   if(mobile&&size==='393,851')await page.screenshot({path:path.join(root,'.local/form-clean-green.png')});
   await ui.click('#cancel-event');
   await ui.click('[data-view=projects]');await settle();
   const buffer=await ui.evaluate(()=>{const view=document.getElementById('view-projects'),app=view.querySelector('.project-app'),last=document.querySelector('.project-card:last-child'),spacer=app.querySelector('.project-scroll-buffer'),h=Number(spacer.dataset.viewportHeight),r=view.getBoundingClientRect();return{h,last:last.getBoundingClientRect().bottom-r.top,total:app.getBoundingClientRect().bottom-r.top,spacer:spacer.offsetHeight,overflow:document.documentElement.scrollWidth-innerWidth}});
   assert(buffer.total>=Math.max(buffer.last,buffer.h)+buffer.h/3-1,JSON.stringify(buffer));assert(buffer.overflow<=1);
   const before=buffer.spacer;for(let i=0;i<10;i++){await ui.evaluate(()=>window.KetimeProjectBuffer.layout());await settle();}assert.equal(await ui.locator('.project-scroll-buffer').evaluate(e=>e.offsetHeight),before,'Repeated layout is stable');
   // Actual long lists still reserve one-third viewport after the final card.
   await ui.evaluate(()=>{const list=document.getElementById('projects-list');for(let i=0;i<4;i++)list.appendChild(list.firstElementChild.cloneNode(true));});await settle();
   assert(await ui.evaluate(()=>{const last=document.querySelector('.project-card:last-child'),app=document.querySelector('.project-app'),h=Number(document.querySelector('.project-scroll-buffer').dataset.viewportHeight);return app.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom>=h/3-.5}));
   await ui.evaluate(()=>{const list=document.getElementById('projects-list');while(list.children.length>1)list.lastElementChild.remove();window.scrollTo(0,0)});await settle();
   if(mobile&&size==='393,851')await page.screenshot({path:path.join(root,'.local/project-scroll-buffer.png')});
   await ui.click('[data-view=growth]');await settle();
   for(const [color,count,lines] of [['#b58ba6',3,1],['#c67d45',2,1],['#736da1',1,0],['#3b7a91',5,1]]){assert.equal(await ui.locator('.growth-point[fill="'+color+'"]').count(),count);assert.equal(await ui.locator('.growth-line[stroke="'+color+'"]').count(),lines);}
   const chart=await ui.locator('#growth-svg').evaluate(svg=>{const line=svg.querySelector('.growth-line[stroke="#b58ba6"]'),all=[...svg.querySelectorAll('.growth-line')],samples=Array.from({length:301},(_,i)=>line.getPointAtLength(line.getTotalLength()*i/300));return{smooth:line.getAttribute('d').includes(' C '),stroke:getComputedStyle(line).strokeWidth,monotone:samples.every((p,i)=>!i||p.x>=samples[i-1].x-.001&&p.y<=samples[i-1].y+.001),inside:all.every(path=>{const r=path.getBBox();return r.x>=0&&r.y>=0&&r.x+r.width<=svg.viewBox.baseVal.width&&r.y+r.height<=svg.viewBox.baseVal.height})}});
   assert(chart.smooth&&chart.monotone&&chart.inside,JSON.stringify(chart));assert.equal(chart.stroke,'3px');await ui.locator('.growth-point[fill="#b58ba6"]').nth(1).focus();assert.match(await ui.locator('#growth-tooltip').textContent(),/2026-10-04.*25%/);
   if(mobile&&size==='393,851')await page.screenshot({path:path.join(root,'.local/growth-smooth-points.png')});
   await ui.click('[data-view=schedule]');
  }
  if(mobile){
   await page.locator('#phone-frame').evaluate(e=>e.style.width='280px');await ui.waitForFunction(()=>innerWidth===280);await ui.click('#add-event-btn');await settle();
   assert(await ui.locator('.schedule-time-pair').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===1&&e.scrollWidth<=e.clientWidth+1),'280px degrades to a clean vertical time layout');await ui.click('#cancel-event');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Form/project/growth passed: desktop and 360/393/430px, single white/green controls and focus, embedded #, paired times, stable dynamic short/long-list buffer, sparse/two/single/turning series, no synthesized dots, monotone in-bounds curves and recorded-date tooltip.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
