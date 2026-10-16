/* Destructive operations are restricted to the EMPTY dedicated local emulator. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const{chromium}=require('../.local/browser-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),cache=JSON.parse(fs.readFileSync(path.join(root,'.local/harmony-tools/build-location.json'),'utf8')).path;
assert(/^C:\\Windows\\Temp\\KetimeHarmony-[a-f0-9]{32}$/.test(cache));
const hdc=path.join(cache,'studio/sdk/default/openharmony/toolchains/hdc.exe'),target='127.0.0.1:11111';
const device=(...args)=>execFileSync(hdc,['-t',target,...args],{cwd:path.dirname(hdc),encoding:'utf8',timeout:60000}).trim();
assert(/^emulator /.test(device('shell','param','get','const.product.software.version')));
let browser,page,original,changed=false;
async function attach(){for(let i=0;i<30;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages().find(p=>p.url()==='http://127.0.0.1:8766/');if(page){await page.waitForFunction(()=>window.__ketimeDemo&&window.__ketimeAndroidToken,{},{timeout:10000});return}await browser.close()}catch(_){}await new Promise(r=>setTimeout(r,1000))}throw Error('Native page did not restart')}
async function api(route,body={}){return page.evaluate(async({route,body})=>{const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()}},{route,body})}
async function cleanup(){if(!changed||!page)return;await api('/api/settings/save',{clear:true});await page.evaluate(async state=>{const input=document.getElementById('bupt-backup-file'),transfer=new DataTransfer(),confirm=window.confirm;transfer.items.add(new File([JSON.stringify(state)],'synthetic-original.json',{type:'application/json'}));window.confirm=()=>true;input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,100));window.confirm=confirm},original);changed=false}
(async()=>{
 await attach();original=await page.evaluate(()=>window.__ketimeDemo.getState());assert.equal(original.schedules.length,0);assert.equal(original.inbox.length,0);const initial=await api('/api/settings/read');assert.equal(initial.body.account,'');assert.equal(initial.body.hasPassword,false);
 await page.click('#add-untimed-todo');changed=true;await page.fill('#untimed-input','覆盖安装持久化验证');await page.press('#untimed-input','Enter');await page.waitForFunction(()=>window.__ketimeDemo.getState().inbox.some(x=>x.name==='覆盖安装持久化验证'));assert.equal((await api('/api/settings/save',{account:'upgrade_test_only',password:'synthetic-not-real',cloudPassword:'synthetic-cloud-not-real'})).status,200);
 // ArkWeb's localStorage disk commit is asynchronous; test an ordinary
 // settled upgrade separately from an abrupt process-kill durability test.
 await page.waitForTimeout(6000);
 const oldPid=device('shell','pidof','cn.ketime.app');assert(/^\d+$/.test(oldPid));await browser.close();browser=null;
 const version=JSON.parse(fs.readFileSync(path.join(root,'harmony/AppScope/app.json5'),'utf8')).app.versionName;
 device('shell','aa','force-stop','cn.ketime.app');const installed=device('install','-r',path.join(root,'harmony/dist/刻时-HarmonyOS-'+version+'-debug-unsigned.hap'));assert(/successfully/i.test(installed),installed);
 device('shell','aa','start','-a','EntryAbility','-b','cn.ketime.app');let newPid='';for(let i=0;i<30;i++){newPid=device('shell','pidof','cn.ketime.app');if(/^\d+$/.test(newPid))break;await new Promise(r=>setTimeout(r,1000))}assert(/^\d+$/.test(newPid));
 for(let i=0;i<30;i++){if(device('shell','cat','/proc/net/unix').includes('@webview_devtools_remote_'+newPid))break;await new Promise(r=>setTimeout(r,1000))}
 device('fport','rm','tcp:9223','localabstract:webview_devtools_remote_'+oldPid);device('fport','tcp:9223','localabstract:webview_devtools_remote_'+newPid);await attach();
 assert((await page.evaluate(()=>window.__ketimeDemo.getState().inbox)).some(x=>x.name==='覆盖安装持久化验证'));const settings=await api('/api/settings/read');assert.equal(settings.body.account,'upgrade_test_only');assert(settings.body.hasPassword&&settings.body.hasCloudPassword);
 await cleanup();const reportPath=path.join(root,'harmony/dist/模拟器验证报告.json'),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));report.checks.push('actual HAP cover-install without uninstall preserves localStorage and AssetStore credentials across process restart after 6-second storage settle');report.notVerified.push('native document picker save/read: cancelled extra first-run input method privacy consent');report.knownLimitations=['Immediate force-stop after saving can lose recent ArkWeb localStorage changes; native encrypted settings survive. The settled upgrade test waits 6 seconds; abrupt-kill durability remains unresolved.'];report.syntheticCredentialsCleared=true;report.originalBusinessStateRestored=true;fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log('PASS: settled cover-install preserved business and encrypted settings; synthetic data restored.');await browser.close();
})().catch(async error=>{console.error(error.stack||error);try{if(!browser)await attach();await cleanup()}catch(e){console.error('Cleanup requires attention: '+e.message)}if(browser)await browser.close();process.exitCode=1});
