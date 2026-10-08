(function () {
  'use strict';
  var settings = document.querySelector('#settings-overlay .modal');
  if (!settings || !window.KetimeAccount) return;
  var labels={auto:'自动',none:'无',minimal:'最小',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最大'};
  var detailLabels={auto:'自动',none:'无推理',minimal:'最小',low:'轻度',medium:'中度',high:'高度',xhigh:'极高',max:'最大'};
  function effortLabel(value){return detailLabels[value]?(detailLabels[value]+'（'+value+'）'):value;}
  window.KetimeModelSettings={effortLabel:effortLabel};
  var style=document.createElement('style');
  style.textContent='.chatgpt-model-picker{display:grid;grid-template-columns:70px 13px minmax(0,1fr) 13px minmax(0,1fr) 13px minmax(0,1fr);gap:7px;align-items:end;margin:12px 0}.chatgpt-model-picker label{min-width:0;display:block}.chatgpt-model-picker .form-label{display:block;margin-bottom:6px}.chatgpt-model-picker .form-select{width:100%;min-width:0}.chatgpt-picker-arrow{align-self:end;margin-bottom:9px;text-align:center;color:var(--muted)}.chatgpt-model-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.chatgpt-model-settings-status{font-size:.74rem;line-height:1.6;color:var(--text-2);margin:8px 0}.chatgpt-model-settings-status.error{color:var(--danger)}@media(max-width:600px){.chatgpt-model-picker{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.chatgpt-picker-arrow{display:none}}';
  document.head.appendChild(style);
  var section=document.createElement('details');section.id='chatgpt-panel';section.className='chatgpt-settings';
  section.style.cssText='margin-top:20px;border-top:1px solid var(--border);padding-top:12px;font-size:.8rem';
  section.innerHTML='<summary>智能模型选择</summary>'+
    '<p class="bupt-note">使用 ChatGPT 登录后，调用使用账户的套餐共享额度。不需要普通 API Key。授权凭据仅在本机加密保存，不进入浏览器存储或备份。</p>'+
    '<label class="form-group" style="display:block"><span class="form-label">ChatGPT 账户</span><select id="chatgpt-account" class="form-select" aria-label="ChatGPT 账户"><option value="">尚未连接</option></select></label>'+
    '<button id="chatgpt-connect" type="button" class="btn btn-primary">Continue with ChatGPT</button> '+
    '<button id="chatgpt-add-account" type="button" class="btn">添加其他账户</button> '+
    '<button id="chatgpt-disconnect" type="button" class="btn">退出当前账户</button>'+
    '<p id="chatgpt-status" class="bupt-status" role="status" aria-live="polite">尚未连接。</p>'+
    '<a id="chatgpt-auth-link" target="_blank" rel="noopener noreferrer" hidden>浏览器阻止了新窗口，请点击这里前往 OpenAI 登录</a>'+
    '<div class="chatgpt-model-picker" aria-label="模型与推理强度">'+
    '<label><span class="form-label">提供方</span><select id="chatgpt-provider" class="form-select" aria-label="模型提供方" disabled><option value="GPT">GPT</option></select></label><span class="chatgpt-picker-arrow" aria-hidden="true">→</span>'+
    '<label><span class="form-label">版本</span><select id="chatgpt-version" class="form-select" aria-label="GPT 版本" disabled><option value="">连接后读取</option></select></label><span class="chatgpt-picker-arrow" aria-hidden="true">→</span>'+
    '<label><span class="form-label">模型 / 系列</span><select id="chatgpt-model" class="form-select" aria-label="GPT 模型与系列" disabled><option value="">连接后读取</option></select></label><span class="chatgpt-picker-arrow" aria-hidden="true">→</span>'+
    '<label><span class="form-label">推理强度</span><select id="chatgpt-effort" class="form-select" aria-label="推理强度" disabled><option value="">连接后读取</option></select></label></div>'+
    '<div class="chatgpt-model-actions"><button id="chatgpt-save-model" type="button" class="btn btn-primary" disabled>保存模型设置</button><button id="chatgpt-refresh" type="button" class="btn">更新模型</button></div>'+
    '<p id="chatgpt-model-status" class="chatgpt-model-settings-status" role="status" aria-live="polite">连接后读取当前账户可用模型与强度。</p>'+
    '<p class="bupt-note">模型菜单列出账户全部可用版本。切换模型或强度后自动保存，同时用于日程助手和消息测试；提示“已生效”后即可使用。首次默认优先 Sol＋低强度。更新模型只刷新目录，不发送推理请求。</p>'+
    '<label class="form-group" style="display:block;margin-top:10px"><span class="form-label">测试消息（最多 2000 字）</span><textarea id="chatgpt-message" class="form-input" rows="3" maxlength="2000" style="resize:vertical">你好，请用一句中文确认你收到了来自刻时的测试消息。</textarea></label>'+
    '<button id="chatgpt-send" type="button" class="btn btn-primary" disabled>发送测试消息</button>'+
    '<p class="bupt-note">测试只发送测试文字，不读取日程或项目；收到完整回复才标记成功。消息与回复刷新后清空。</p>'+
    '<pre id="chatgpt-reply" role="region" aria-label="ChatGPT 回复" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-family:inherit;padding:12px;border:1px solid var(--border);border-radius:8px" hidden></pre>';
  settings.insertBefore(section,settings.querySelector('.modal-actions'));section.querySelector('summary').style.cssText='cursor:pointer;margin-bottom:10px';
  var $=function(id){return document.getElementById('chatgpt-'+id);};
  var connected=false,busy=false,loading=false,saving=false,saveTimer=null,savePromise=null,modelAccount='',polling=null,refreshPromise=null,catalog=[],saved=null,selectionValid=false;
  function status(text,error){$('status').textContent=text;$('status').classList.toggle('error',!!error);}
  function selection(){return {model:$('model').value,reasoningEffort:$('effort').value};}
  function dirty(){var current=selection();return !saved||current.model!==saved.model||current.reasoningEffort!==saved.reasoningEffort;}
  function selectedRow(){return catalog.find(function(row){return row.id===$('model').value;});}
  function describe(current){var row=catalog.find(function(item){return item.id===current.model;});return row?'GPT → '+row.version+' → '+row.series+' → '+labels[current.reasoningEffort]+'（'+row.id+'）':current.model;}
  function modelStatus(){
    var text=!connected?'连接后读取当前账户可用模型与强度。':!catalog.length?'尚未读取可用模型。':saving||saveTimer?'正在自动应用：'+describe(selection())+'。':!selectionValid?'原设置已不可用，请重新选择并保存。当前候选：'+describe(selection())+'。':dirty()?'尚未保存：'+describe(selection())+'。请点击保存重试。':'已生效：'+describe(saved)+'。用于日程助手及测试。';
    $('model-status').textContent=text;$('model-status').classList.toggle('error',connected&&catalog.length&&!selectionValid);
  }
  function buttons(){
    var local=location.protocol==='http:'&&location.hostname==='127.0.0.1',locked=busy||loading||saving||!!saveTimer;
    ['connect','add-account','refresh','account'].forEach(function(id){$(id).disabled=locked||!local;});
    $('disconnect').disabled=locked||!connected;
    ['version','model','effort'].forEach(function(id){$(id).disabled=busy||loading||!connected||!$(id).value;});
    $('save-model').disabled=locked||!connected||!$('model').value||!$('effort').value||(!dirty()&&selectionValid);
    $('send').disabled=locked||!connected||!selectionValid||dirty()||!$('model').value||!$('effort').value||!$('message').value.trim();
  }
  function options(select,rows,value){select.replaceChildren();rows.forEach(function(row){var option=document.createElement('option');option.value=row.value;option.textContent=row.label;select.appendChild(option);});select.value=rows.some(function(row){return row.value===value;})?value:rows.length?rows[0].value:'';}
  function efforts(preferred){var row=selectedRow(),chosen=row&&(row.reasoningEfforts.indexOf(preferred)>=0?preferred:row.defaultReasoningEffort);options($('effort'),row?row.reasoningEfforts.map(function(e){return {value:e,label:labels[e]};}):[],chosen);}
  function models(version,id,effort){
    var select=$('model');select.replaceChildren();
    Array.from($('version').options).forEach(function(option){
      var group=document.createElement('optgroup');group.label='GPT '+option.value;
      catalog.filter(function(row){return row.version===option.value;}).forEach(function(row){var item=document.createElement('option');item.value=row.id;item.textContent=row.series+' · '+row.version+(catalog.filter(function(other){return other.version===row.version&&other.series===row.series;}).length>1?' · '+row.name:'');group.appendChild(item);});
      if(group.children.length)select.appendChild(group);
    });
    var chosen=catalog.find(function(row){return row.id===id;})||catalog.find(function(row){return row.version===version;});
    select.value=chosen?chosen.id:'';if(chosen)$('version').value=chosen.version;efforts(effort);
  }
  async function call(action,payload){
    if(!(location.protocol==='http:'&&location.hostname==='127.0.0.1'))throw Error('请双击 start-ketime.cmd，通过本机刻时页面使用 ChatGPT。');
    var response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw Error('本机刻时服务不可用，请重新启动。');
    var config=await response.json();if(!config.chatgpt||config.modelSettings!==true)throw Error('当前仍运行旧版刻时服务，请更新并重启服务后刷新页面。');
    response=await fetch('/api/chatgpt/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Ketime-Token':config.csrfToken},body:JSON.stringify(payload||{}),cache:'no-store'});
    var data=await response.json();if(!response.ok)throw Error(data.error||'ChatGPT 请求未成功。');return data;
  }
  async function loadModels(preserve){
    var previous=preserve?selection():null,data=await call('models');
    if(!Array.isArray(data.models)||!data.models.length)throw Error('当前账户未返回可用 GPT 模型，请检查授权。');
    if(!data.models.every(function(row){return typeof row.id==='string'&&/^gpt-\d/.test(row.id)&&typeof row.version==='string'&&typeof row.series==='string'&&Array.isArray(row.reasoningEfforts)&&row.reasoningEfforts.length&&row.reasoningEfforts.every(function(e){return Object.prototype.hasOwnProperty.call(labels,e);});}))throw Error('模型目录格式不完整，请更新本机服务。');
    catalog=data.models;saved={model:data.selectedModel||data.defaultModel,reasoningEffort:data.reasoningEffort};selectionValid=data.selectionValid!==false;
    var current=previous||saved,row=catalog.find(function(item){return item.id===current.model;});
    if(!row){row=catalog.find(function(item){return item.id===data.defaultModel;})||catalog[0];current={model:row.id,reasoningEffort:row.defaultReasoningEffort};}
    var versions=Array.from(new Set(catalog.map(function(item){return item.version;}))).sort(function(a,b){var av=a.split('.').map(Number),bv=b.split('.').map(Number);return bv[0]-av[0]||(bv[1]||0)-(av[1]||0);});
    options($('version'),versions.map(function(version){return {value:version,label:version};}),row.version);models(row.version,current.model,current.reasoningEffort);modelStatus();
  }
  async function refreshInner(force){
    var data=await call('status');connected=data.connected;var oldAccount=modelAccount;
    options($('account'),data.accounts.length?data.accounts.map(function(row,index){return {value:row.id,label:(row.email||'账户 '+(index+1))+(row.active?'（当前）':'')};}):[{value:'',label:'尚未连接'}],(data.accounts.find(function(row){return row.active;})||{}).id||'');
    var active=$('account').value;
    if(connected&&(force||oldAccount!==active||!catalog.length)){await loadModels(oldAccount===active);modelAccount=active;}
    if(!connected){modelAccount='';catalog=[];saved=null;selectionValid=false;['version','model','effort'].forEach(function(id){options($(id),[{value:'',label:'连接后读取'}],'');});}
    status(data.error||(connected?'已连接 ChatGPT；模型设置同时用于日程助手和测试。':data.pending?'等待你在 OpenAI 官方页面登录并授权…':'尚未连接 ChatGPT。'),!!data.error);modelStatus();
    if(!data.pending){$('auth-link').hidden=true;$('auth-link').removeAttribute('href');}
    clearTimeout(polling);if(data.pending&&document.getElementById('settings-overlay').classList.contains('visible'))polling=setTimeout(function(){refresh(false).catch(function(e){status(e.message,true);});},3000);
  }
  function refresh(force){
    if(refreshPromise)return refreshPromise;loading=true;buttons();
    refreshPromise=refreshInner(force).finally(function(){loading=false;refreshPromise=null;buttons();});return refreshPromise;
  }
  async function run(action){if(busy||loading)return;busy=true;buttons();try{await action();}catch(e){status(e.message,true);}finally{busy=false;buttons();}}
  async function saveSelection(){
    clearTimeout(saveTimer);saveTimer=null;if(saving||busy||loading||!connected)return;
    saving=true;modelStatus();buttons();
    try{
      while(dirty()||!selectionValid){
        var current=selection();status('正在应用模型设置…');
        var data=await call('configure',current);
        if(data.saved!==true||data.model!==current.model||data.reasoningEffort!==current.reasoningEffort)throw Error('模型设置未确认保存，请点击保存重试。');
        saved=current;selectionValid=true;
      }
      status('模型设置已保存，日程助手和测试将使用 '+describe(saved)+'。');
    }catch(e){status('模型切换未成功：'+e.message,true);}
    finally{clearTimeout(saveTimer);saveTimer=null;saving=false;modelStatus();buttons();}
  }
  function applySelection(){
    if(savePromise){clearTimeout(saveTimer);saveTimer=null;return savePromise;}
    savePromise=saveSelection().finally(function(){savePromise=null;});return savePromise;
  }
  window.KetimeModelSettings.ensureApplied=async function(){
    if(!connected||!catalog.length)return;
    if(saveTimer||savePromise)await applySelection();
    if(dirty()||!selectionValid)throw Error('模型设置尚未成功保存，请返回设置重试；未使用旧模型发送消息。');
  };
  function selectionChanged(){clearTimeout(saveTimer);saveTimer=setTimeout(applySelection,350);modelStatus();buttons();}
  function connect(newAccount){
    if(busy||loading)return;var nativeAuth=window.KetimeAndroid&&window.KetimeAndroid.openAuth,popup=nativeAuth?null:window.open('about:blank','_blank');if(popup)popup.opener=null;
    run(async function(){try{var data=await call('connect',{newAccount:newAccount}),url=new URL(data.authorizationUrl);if(url.origin!=='https://auth.openai.com'||url.pathname!=='/api/accounts/authorize')throw Error('授权地址不正确，已停止。');if(nativeAuth)window.KetimeAndroid.openAuth(url.href);else if(popup)popup.location.href=url.href;else{$('auth-link').href=url.href;$('auth-link').hidden=false;}await refresh(false);}catch(e){if(popup)popup.close();throw e;}});
  }
  $('connect').addEventListener('click',function(){connect(false);});$('add-account').addEventListener('click',function(){connect(true);});
  $('refresh').addEventListener('click',function(){run(async function(){status('正在更新当前账户的模型与可用强度…');await refresh(true);status('模型已更新。'+(!selectionValid?'原选择已不可用，请重新保存。':'当前设置已保留。'));});});
  $('account').addEventListener('change',function(){var account=this.value;run(async function(){await call('select',{account:account});modelAccount='';catalog=[];saved=null;selectionValid=false;$('reply').hidden=true;await refresh(true);});});
  $('disconnect').addEventListener('click',function(){run(async function(){var data=await call('disconnect');$('reply').textContent='';$('reply').hidden=true;await refresh(false);if(data.warning)status(data.warning,true);});});
  $('version').addEventListener('change',function(){var old=selectedRow(),effort=$('effort').value,row=catalog.find(function(item){return item.version===$('version').value&&old&&item.series===old.series;})||catalog.find(function(item){return item.version===$('version').value;});models($('version').value,row&&row.id,effort);selectionChanged();});
  $('model').addEventListener('change',function(){var previous=$('effort').value,row=selectedRow();if(row)$('version').value=row.version;efforts(previous);selectionChanged();});
  $('effort').addEventListener('change',selectionChanged);$('message').addEventListener('input',buttons);
  $('save-model').addEventListener('click',applySelection);
  $('send').addEventListener('click',function(){var current=selection();run(async function(){
    $('reply').textContent='';$('reply').hidden=true;status('正在发送测试消息，等待完整回复…');$('send').setAttribute('aria-busy','true');
    try{var data=await call('test',{model:current.model,reasoningEffort:current.reasoningEffort,message:$('message').value});if(data.completed!==true||!data.reply||data.model!==current.model||data.reasoningEffort!==current.reasoningEffort)throw Error('未收到所选模型与强度的完整回复，测试尚未成功。');$('reply').textContent=data.reply;$('reply').hidden=false;status('测试成功：'+data.model+' · '+effortLabel(data.reasoningEffort)+'，已收到完整回复。');}finally{$('send').removeAttribute('aria-busy');}
  });});
  document.getElementById('settings-btn').addEventListener('click',function(){if(!saving&&!saveTimer)refresh(false).catch(function(e){status(e.message,true);});});
  section.addEventListener('toggle',function(){if(section.open&&!busy&&!saving&&!saveTimer)refresh(false).catch(function(e){status(e.message,true);});});buttons();
})();
