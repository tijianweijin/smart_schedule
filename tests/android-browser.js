/* Android web UI with a fake native bridge, synthetic APIs, no user credentials. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),child=spawn(process.env.KETIME_PYTHON||'python',['-u','-B',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))resolve(JSON.parse(text.split('\n')[0]).url)});child.on('error',reject);setTimeout(()=>reject(Error('Fixture timeout')),15000).unref()});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
 const context=await browser.newContext({viewport:{width:393,height:851},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{window.__nativeCalls=[];window.__ketimeAndroidToken='fixture';window.KetimeNative={exportBackup:(...args)=>window.__nativeCalls.push({type:'backup',args}),openAuth:(...args)=>window.__nativeCalls.push({type:'auth',args})};});
 await page.route(url+'/',async route=>{const response=await route.fetch();let html=await response.text();html=html.replace('</head>','<script>window.KetimeAndroid=true</script><link rel="stylesheet" href="/android-mobile.css"></head>').replace('</body>','<script src="/android-mobile.js"></script></body>');await route.fulfill({response,body:html});});
 for(const file of ['android-mobile.js','android-mobile.css'])await page.route('**/'+file,route=>route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/css',body:fs.readFileSync(path.join(root,'android/app/src/main/web',file),'utf8')}));
 await page.route('**/api/chatgpt/**',route=>{const action=route.request().url().split('/').pop();const data=action==='connect'?{authorizationUrl:'https://auth.openai.com/api/accounts/authorize?state=synthetic'}:{connected:false,pending:false,error:'',accounts:[]};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto(url);await page.waitForFunction(()=>window.KetimeAndroid&&window.KetimeAndroid.back);
 assert.equal(await page.title(),'刻时 Android 1.0');assert.equal(await page.locator('.view-tab').count(),4);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.click('#add-event-btn');assert(await page.locator('#schedule-overlay').isVisible());assert(await page.evaluate(()=>window.KetimeAndroid.back()));assert(await page.locator('#schedule-overlay').isHidden());
 await page.click('#add-untimed-todo');await page.fill('#untimed-input','Android 测试待收纳');await page.press('#untimed-input','Enter');assert((await page.evaluate(()=>window.__ketimeDemo.getState().inbox)).some(x=>x.name==='Android 测试待收纳'));
 await page.click('[data-view=projects]');await page.click('#btn-add-project');const circle=page.locator('.node-circle').first();await circle.scrollIntoViewIfNeeded();const before=await circle.getAttribute('class');
 await circle.evaluate(element=>{const box=element.getBoundingClientRect(),touch=new Touch({identifier:1,target:element,clientX:box.x+20,clientY:box.y+20});element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch],changedTouches:[touch]}));});
 await page.waitForSelector('#context-menu.visible');await circle.evaluate(element=>{element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));element.click();});assert.equal(await circle.getAttribute('class'),before);assert(await page.evaluate(()=>window.KetimeAndroid.back()));
 await page.click('[data-view=growth]');assert(await page.locator('#growth-svg').isVisible());await page.click('[data-view=schedule]');
 await page.click('#settings-btn');assert((await page.locator('#settings-overlay .modal>.bupt-note').first().textContent()).includes('Android Keystore'));
 assert(await page.locator('#view-settings').isVisible());assert(await page.locator('#view-schedule').isHidden());assert.equal(await page.locator('#settings-overlay.overlay').count(),0);assert.equal(await page.locator('#settings-overlay [aria-modal=true]').count(),0);
 await page.fill('#settings-password','synthetic-unsaved-draft');await page.click('[data-view=projects]');assert.equal(await page.locator('#settings-password').inputValue(),'');assert(await page.locator('#view-settings').isHidden());await page.click('#settings-btn');assert(await page.locator('#view-projects').isHidden());assert(await page.evaluate(()=>window.KetimeAndroid.back()));assert(await page.locator('#view-projects').isVisible());await page.click('[data-view=schedule]');await page.click('#settings-btn');
 await page.locator('.bupt-backup summary').click();await page.click('#bupt-export');let calls=await page.evaluate(()=>window.__nativeCalls);const backup=calls.find(x=>x.type==='backup');assert(backup);assert.equal(backup.args[0],'fixture');const data=JSON.parse(backup.args[1]);assert(data.inbox.some(x=>x.name==='Android 测试待收纳'));assert(!backup.args[1].includes('access_token'));assert(backup.args[2].endsWith('.json'));
 await page.locator('#bupt-backup-file').setInputFiles({name:'ketime-backup.json',mimeType:'application/json',buffer:Buffer.from(backup.args[1])});await page.waitForFunction(()=>document.getElementById('settings-status').textContent.includes('备份已恢复'));
 await page.locator('#chatgpt-panel summary').click();await page.waitForFunction(()=>!document.getElementById('chatgpt-connect').disabled);await page.click('#chatgpt-connect');await page.waitForFunction(()=>window.__nativeCalls.some(x=>x.type==='auth'));calls=await page.evaluate(()=>window.__nativeCalls);assert(calls.find(x=>x.type==='auth').args[1].startsWith('https://auth.openai.com/'));assert.equal(context.pages().length,1);
 assert(await page.evaluate(()=>window.KetimeAndroid.back()));await page.reload();assert((await page.evaluate(()=>window.__ketimeDemo.getState().inbox)).some(x=>x.name==='Android 测试待收纳'));assert.deepEqual(errors,[]);
 await page.evaluate(()=>{
  const state=window.__ketimeDemo.getState(),today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  state.schedules=[{id:'android-layout-course',name:'数据结构与算法课程',date,start:'09:00',end:'11:30',repeat:'none',color:'#dceee1'}];
  state.inbox=[{id:'layout-homework',name:'高等数学：第一章习题',source:{provider:'bupt-ucloud',accountKey:'a'.repeat(24),sourceId:'layout-homework',courseName:'高等数学',title:'第一章习题',snapshotName:'高等数学：第一章习题',dueAt:'2026-10-08T18:00:00+08:00'}},{id:'layout-misc',name:'整理本周课堂笔记'}];
  localStorage.setItem('ketime-demo-v0.1',JSON.stringify(state));
 });
 await page.reload();await page.waitForFunction(()=>document.querySelector('.homework-due')?.textContent==='10月8日 18:00');
 assert.equal(await page.locator('.app-nav .view-tabs').count(),0);
 assert.equal(await page.locator('body > .android-bottom-nav .view-tab').count(),4);
 assert.equal(await page.locator('.homework-due').getAttribute('aria-label'),'截止时间：2026-10-08T18:00:00+08:00');
 const sourceBefore=await page.evaluate(()=>window.__ketimeDemo.getState().inbox[0].source.dueAt);
 for(const viewport of [{width:320,height:740},{width:393,height:851},{width:600,height:960},{width:851,height:393}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(80);
  const layout=await page.evaluate(()=>{
   const nav=document.querySelector('.android-bottom-nav').getBoundingClientRect(),wrap=document.getElementById('schedule-wrap'),grid=getComputedStyle(document.getElementById('schedule-grid')).gridTemplateColumns.split(' ').map(parseFloat),add=document.getElementById('add-event-btn').getBoundingClientRect(),rows=[...document.querySelectorAll('.untimed-item')].map(e=>e.getBoundingClientRect()),panel=document.querySelector('.untimed-panel').getBoundingClientRect(),headers=[...document.querySelectorAll('.day-header-cell')].map(e=>e.textContent);
   return {navBottom:nav.bottom,navTop:nav.top,navWidth:nav.width,navLeft:nav.left,width:innerWidth,height:innerHeight,grid,wrapWidth:wrap.clientWidth,add:{centre:add.x+add.width/2,width:add.width,height:add.height},headers,toolbarOverflow:document.querySelector('.schedule-toolbar').scrollWidth>innerWidth,twoColumns:rows[0].top===rows[1].top&&rows[1].left>rows[0].left,panelBottom:panel.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert(Math.abs(layout.navBottom-layout.height)<1);assert(Math.abs(layout.add.centre-layout.width/2)<1);assert.equal(layout.add.width,48);assert.equal(layout.add.height,33);assert(layout.headers.every(text=>/^\d+月\d+周[一二三四五六日]$/.test(text)));assert(!layout.toolbarOverflow);
  assert.match(await page.locator('.android-calendar-month').textContent(),/^\d{4}年(?:[1-9]|1[0-2])月$/);assert.equal(await page.locator('.android-daystart-label').textContent(),'每日起始自');assert(await page.locator('.android-daystart-label').isVisible());assert.equal(await page.locator('#add-untimed-todo').textContent(),'＋');
  assert(Math.abs(layout.navWidth-layout.width)<1);assert(Math.abs(layout.navLeft)<1);assert(Math.abs(layout.navBottom-layout.navTop-34)<1);assert.equal(await page.locator('.app-nav').count(),0);assert.equal(await page.locator('#settings-btn').textContent(),'设置');assert.equal(await page.locator('#add-event-btn').textContent(),'＋');
  assert(await page.evaluate(()=>{const toolbar=document.querySelector('.schedule-toolbar').getBoundingClientRect();return ['date-picker-btn','daystart-select','bupt-sync-btn','schedule-assistant-btn'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top>=toolbar.top&&r.bottom<=toolbar.bottom&&r.right<=toolbar.right;});}));
  assert(Math.abs(layout.grid[0]+layout.grid[1]*3-layout.wrapWidth)<1,'Exactly three days fit beside time gutter');
  assert(layout.twoColumns);assert(layout.panelBottom<=layout.navTop+1);assert(!layout.overflow);
 }
 await page.setViewportSize({width:393,height:851});await page.waitForTimeout(100);
 const checkLayout=await page.locator('.event-block').evaluate(block=>{const rect=block.getBoundingClientRect(),check=block.querySelector('.event-check').getBoundingClientRect(),title=block.querySelector('.event-title');return{bottomGap:rect.bottom-check.bottom,belowTitle:check.top>=title.getBoundingClientRect().bottom,titleStyle:getComputedStyle(title).whiteSpace};});
 assert(checkLayout.bottomGap>=0&&checkLayout.bottomGap<=5);assert(checkLayout.belowTitle);assert.equal(checkLayout.titleStyle,'normal');
 await page.locator('.event-check').click();assert((await page.evaluate(()=>window.__ketimeDemo.getState().schedules[0])).done);assert.equal(await page.locator('#schedule-overlay').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__ketimeDemo.getState().inbox[0].source.dueAt),sourceBefore);
 await page.locator('#schedule-wrap').evaluate(e=>e.scrollLeft=e.scrollWidth);await page.waitForTimeout(50);assert(await page.evaluate(()=>document.getElementById('schedule-wrap').scrollLeft>0));
 await page.locator('#schedule-wrap').evaluate(e=>e.scrollLeft=0);await page.locator('.event-check').click();await page.waitForTimeout(2800);await page.screenshot({path:path.join(root,'.local','android-schedule-mobile.png')});
 for(const view of ['projects','growth','schedule']){await page.click('.android-bottom-nav [data-view='+view+']');assert(await page.locator('#view-'+view).isVisible());}
 assert.deepEqual(errors,[]);
 console.log('Android web checks passed: centered square add button, one-line dates, three-day width at 320/393/600/851px, two-column inbox, compact deadlines without source changes, bottom completion toggle, touch menu, back, persistence, backup/restore, OAuth.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
