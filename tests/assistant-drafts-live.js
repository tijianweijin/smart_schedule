/* Explicit real Sol-low validation. Uses an isolated browser; no daily user data modified. */
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.KETIME_PLAYWRIGHT||'playwright');let browser;
(async()=>{
 if(!process.argv.includes('--live'))throw Error('Use --live to explicitly authorize the two real Sol-low requests.');
 browser=await chromium.launch({headless:true,executablePath:process.env.KETIME_BROWSER||undefined});
 const context=await browser.newContext({timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/');const before=await page.evaluate(()=>window.__ketimeDemo.getState().schedules.length);
 await page.click('#schedule-assistant-btn');
 async function send(text,count){await page.fill('#assistant-input',text);await page.click('#assistant-send');await page.waitForFunction(n=>document.querySelectorAll('.assistant-draft').length===n||document.querySelector('.assistant-message.error'),count,{timeout:150000});if(await page.locator('.assistant-message.error').count())throw Error(await page.locator('.assistant-message.error').last().textContent());return page.locator('.assistant-draft').nth(count-1)}
 let form=await send('各位同学好：10月1日（明天）早上7:30，学校在沙河校区（体育场）举办升国旗仪式。需要7:15前入场完毕。活动纳入综合素质评价。',1);
 const today=await page.evaluate(()=>window.KetimeScheduleAPI.context().today),expected=today.slice(0,4)+'-10-01';
 assert.equal(await form.locator('[name=date]').inputValue(),expected);assert.equal(await form.locator('[name=start]').inputValue(),'07:30');assert.equal(await form.locator('[name=end]').inputValue(),'');assert((await form.locator('[name=location]').inputValue()).includes('沙河'));assert((await form.locator('[name=notes]').inputValue()).includes('7:15')||(await form.locator('[name=notes]').inputValue()).includes('07:15'));
 form=await send('10月1日',2);assert.equal(await form.locator('[name=date]').inputValue(),expected);assert.equal(await form.locator('[name=end]').inputValue(),'');assert.equal(await page.locator('.assistant-event-card').count(),0);
 assert.equal(await form.locator('[name=onlyStart]').count(),0);await form.locator('[name=end]').fill('08:30');await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.assistant-event-card'));
 let state=await page.evaluate(()=>window.__ketimeDemo.getState()),ev=state.schedules.at(-1);assert.equal(state.schedules.length,before+1);assert.equal(ev.start,'07:30');assert.equal(ev.end,'08:30');assert(!('endUnknown' in ev));
 await page.locator('.assistant-event-card').click();assert(await page.locator('.event-block[data-event-id="'+ev.id+'"]').count());await page.reload();assert.equal((await page.evaluate(()=>window.__ketimeDemo.getState())).schedules.at(-1).end,'08:30');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({live:true,date:expected,start:'07:30',end:'08:30',noYearQuestion:true,partialForm:true,onlyStartOption:false,jump:true,persisted:true,isolatedBrowser:true}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
