/* Isolated browser regression; synthetic events only, no school requests. */
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),child=spawn(process.env.KETIME_PYTHON||'python',['-u','-B',path.join(__dirname,'browser_fixture_server.py')],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
const monday='2026-10-05',tuesday='2026-10-06';
function event(id,start,end,date=monday,extra={}){return{id,name:'测试日程 '+id,date,start,end,color:id==='a'?'#8fbaa5':'#aac7df',repeat:'none',done:false,...extra}}
(async()=>{
 const url=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',d=>{text+=d;if(text.includes('\n'))try{resolve(JSON.parse(text.split('\n')[0]).url)}catch(e){reject(e)}});child.on('error',reject);setTimeout(()=>reject(Error('Fixture service timeout')),15000).unref()});
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.clock.install({time:new Date('2026-10-05T04:00:00Z')});await page.goto(url);
 async function show(schedules,options={}){await page.evaluate(payload=>localStorage.setItem('ketime-demo-v0.1',JSON.stringify(payload)),{version:'0.5',dayStartHour:options.dayStartHour||0,projects:[],schedules,inbox:[],holidays:options.holidays||[],growth:{series:[],demoSeeded:true}});await page.reload();await page.waitForFunction(()=>window.__ketimeDemo);}
 function block(id,segment){return page.locator('.event-block[data-event-id="'+id+'"]'+(segment?'[data-segment="'+segment+'"]':''))}
 async function ranges(id,segment){return JSON.parse(await block(id,segment).getAttribute('data-conflicts'))}
 await show([event('a','09:00','11:00'),event('b','10:00','12:00'),event('c','12:00','13:00')]);
 assert.deepEqual(await ranges('a'),[{start:600,end:660}]);assert.deepEqual(await ranges('b'),[{start:600,end:660}]);assert.deepEqual(await ranges('c'),[]);
 assert.equal(await block('a').evaluate(el=>el.parentElement.dataset.date),monday);assert.equal(await block('b').evaluate(el=>el.parentElement.dataset.date),monday);assert.equal(await block('c').evaluate(el=>el.parentElement.dataset.date),monday);
 assert.match(await block('a').getAttribute('style'),/rgb\(239, 107, 100\) 50%/);assert.match(await block('b').getAttribute('aria-label'),/有时间重叠/);
 const aBox=await block('a').boundingBox(),bBox=await block('b').boundingBox();assert(aBox.x+aBox.width<=bBox.x+1,'Overlapping blocks must be visible in separate lanes');
 await page.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=8*56);fs.mkdirSync(path.join(root,'.local'),{recursive:true});await page.screenshot({path:path.join(root,'.local','schedule-overlap.png')});
 await block('a').locator('.event-check').click();assert((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='a').done);assert.equal(await page.locator('.has-conflict').count(),2);
 await page.reload();assert.equal(await page.locator('.has-conflict').count(),2);
 await block('b').click();await page.waitForSelector('#schedule-overlay.visible');await page.fill('#event-start','11:00');await page.fill('#event-end','12:00');await page.click('#save-event');assert.equal(await page.locator('.has-conflict').count(),0);
 await show([event('a','09:00','12:00'),event('b','09:30','10:00'),event('c','10:30','11:00')]);assert.deepEqual(await ranges('a'),[{start:570,end:600},{start:630,end:660}]);
 await show([event('a','09:00','11:00'),event('b','09:00','11:00')]);assert.equal(await page.locator('.has-conflict').count(),2);assert.deepEqual(await ranges('a'),[{start:540,end:660}]);
 await show([event('a','23:00','02:00'),event('b','01:00','03:00',tuesday)]);assert.deepEqual(await ranges('a','start'),[]);assert.deepEqual(await ranges('a','continuation'),[{start:60,end:120}]);assert.deepEqual(await ranges('b'),[{start:60,end:120}]);
 assert.equal(await block('a','start').evaluate(el=>el.parentElement.dataset.date),monday);assert.equal(await block('a','continuation').evaluate(el=>el.parentElement.dataset.date),tuesday);assert.equal(await block('b').evaluate(el=>el.parentElement.dataset.date),tuesday);
 await block('a','continuation').locator('.event-check').click();assert.equal(await page.locator('.event-block[data-event-id="a"].done').count(),2);
 await show([event('a','05:00','07:00'),event('b','06:30','07:30')],{dayStartHour:6});assert.deepEqual(await ranges('a','continuation'),[{start:30,end:60}]);assert.deepEqual(await ranges('b'),[{start:30,end:60}]);
 await show([event('a','09:00','10:00',monday,{repeat:'weekly'}),event('b','09:30','10:30',monday,{repeat:'weekly'})]);assert.equal(await page.locator('.has-conflict').count(),2);await page.click('#next-week');assert.equal(await page.locator('.has-conflict').count(),2);await page.click('#prev-week');assert.equal(await page.locator('.has-conflict').count(),2);
 const source={provider:'bupt',accountKey:'a'.repeat(24),sourceId:'b'.repeat(32),termId:'2026-2027-1',courseId:'course',snapshot:{name:'测试日程 a',date:monday,start:'09:00',end:'10:00'}};
 const holiday={id:'holiday',name:'测试假期',enabled:true,start:monday,end:monday,makeup:false,moves:[]};
 await show([event('a','09:00','10:00',monday,{source}),event('b','09:30','10:30')],{holidays:[holiday]});assert.equal(await block('a').count(),0);assert.equal(await page.locator('.has-conflict').count(),0);
 await show([event('a','09:00','10:00',monday,{source}),event('b','09:30','10:30',tuesday)],{holidays:[{...holiday,makeup:true,moves:[{from:monday,to:tuesday}]}]});assert.deepEqual(await ranges('a'),[{start:570,end:600}]);assert.deepEqual(await ranges('b'),[{start:570,end:600}]);
 await show([event('a','09:00','09:01'),event('b','09:02','09:03')]);assert.equal(await page.locator('.has-conflict').count(),0);
 await show([event('a','09:00','11:00'),event('b','10:00','12:00')]);await page.setViewportSize({width:390,height:844});await block('a').locator('.event-check').focus();await page.keyboard.press('Enter');assert((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.find(e=>e.id==='a').done);assert.equal(await page.locator('.has-conflict').count(),2);
 await page.evaluate(()=>document.getElementById('schedule-wrap').scrollTop=8*56);await page.screenshot({path:path.join(root,'.local','schedule-overlap-mobile.png')});assert.deepEqual(errors,[]);await context.close();
 console.log('Overlap browser regression passed: exact red intervals, lanes, completion, edits, reload, identical/nested events, midnight, custom day start/week boundary, repeats, holidays, makeup, short events and mobile keyboard.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();child.kill()});
