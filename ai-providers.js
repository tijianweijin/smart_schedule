(function(){
 'use strict';
 var panel=document.getElementById('chatgpt-panel');if(!panel||!window.KetimeModelSettings)return;
 var summary=panel.querySelector('summary'),gpt=document.createElement('div');gpt.id='ai-gpt-settings';
 Array.from(panel.children).forEach(function(child){if(child!==summary)gpt.appendChild(child);});panel.appendChild(gpt);
 var choice=document.createElement('label');choice.className='form-group';choice.style.cssText='display:block;margin:14px 0';
 choice.innerHTML='<span class="form-label">大模型选择</span><select id="ai-provider" class="form-select" aria-label="大模型选择"><option value="gpt">ChatGPT</option><option value="deepseek">DeepSeek</option><option value="minimax">MiniMax</option><option value="kimi">Kimi</option></select>';
 panel.insertBefore(choice,gpt);
 var provider=document.getElementById('ai-provider'),storageKey='ketime-ai-provider-v1';
 var local=location.protocol==='http:'&&location.hostname==='127.0.0.1',originalEnsure=window.KetimeModelSettings.ensureApplied;
 var definitions={
  deepseek:{name:'DeepSeek',url:'https://platform.deepseek.com/api_keys',pattern:/^deepseek-[A-Za-z0-9._-]+$/,note:'使用 DeepSeek 通用 API Key，按官方账户计费。'},
  kimi:{name:'Kimi',url:'https://platform.kimi.com/console/api-keys',pattern:/^(kimi-k|moonshot-v)[A-Za-z0-9._-]+$/,note:'使用中国区 Kimi 通用 API Key（api.moonshot.cn），不是 Kimi Code／聊天会员密钥；按 API 账户计费。'},
  minimax:{name:'MiniMax',url:'https://platform.minimax.cn/console/access?tab=api-keys',pattern:/^MiniMax-M\d[A-Za-z0-9._-]*$/,note:'使用中国区 MiniMax 按量 API Key（api.minimax.cn），不是 M Plan 订阅密钥。预览模型可能需要额外权益，请以官方账户权限为准。'}
 },controllers={},activeOperations=0;
 try{var stored=localStorage.getItem(storageKey);if(stored==='gpt'||definitions[stored])provider.value=stored;}catch(e){}
 function options(element,choices,value){element.replaceChildren();choices.forEach(function(row){var option=document.createElement('option');option.value=row.value;option.textContent=row.label;element.appendChild(option);});element.value=choices.some(function(row){return row.value===value;})?value:choices.length?choices[0].value:'';}
 function mount(id,definition){
  var box=document.createElement('div');box.id='ai-'+id+'-settings';box.hidden=true;
  box.innerHTML='<p class="bupt-note">'+definition.note+' 密钥仅在本机加密保存，不进入浏览器存储或日程备份。更新模型仅读取目录；测试和日程助手会发送推理请求。</p>'+
   '<label class="form-group" style="display:block"><span class="form-label">'+definition.name+' API Key</span><input id="'+id+'-key" type="password" class="form-input" autocomplete="off" spellcheck="false" maxlength="4096" placeholder="填写后保存，已保存密钥不会回显" aria-label="'+definition.name+' API Key"></label>'+
   '<div class="chatgpt-model-actions"><button id="'+id+'-connect" class="btn btn-primary" type="button">保存并连接</button><button id="'+id+'-disconnect" class="btn" type="button">清除本机连接</button><a class="btn" href="'+definition.url+'" target="_blank" rel="noopener noreferrer">获取 API Key</a></div>'+
   '<div class="form-row"><label class="form-group"><span class="form-label">模型</span><select id="'+id+'-model" class="form-select" aria-label="'+definition.name+' 模型" disabled></select></label><label class="form-group"><span class="form-label">推理强度</span><select id="'+id+'-effort" class="form-select" aria-label="'+definition.name+' 推理强度" disabled></select></label></div>'+
   '<div class="chatgpt-model-actions"><button id="'+id+'-save-model" class="btn btn-primary" type="button" disabled>保存模型设置</button><button id="'+id+'-refresh" class="btn" type="button">更新模型</button></div>'+
   '<p id="'+id+'-status" class="bupt-status" role="status" aria-live="polite">尚未连接 '+definition.name+'。</p>'+
   '<label class="form-group" style="display:block"><span class="form-label">测试消息（最多 2000 字）</span><textarea id="'+id+'-message" class="form-input" rows="3" maxlength="2000" aria-label="'+definition.name+' 测试消息">你好，请用一句中文确认你收到了来自刻时的测试消息。</textarea></label>'+
   '<button id="'+id+'-send" class="btn btn-primary" type="button" disabled>发送测试消息</button>'+
   '<pre id="'+id+'-reply" role="region" aria-label="智能模型回复" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-family:inherit;padding:12px;border:1px solid var(--border);border-radius:8px" hidden></pre>';
  panel.appendChild(box);
  var $=function(name){return document.getElementById(id+'-'+name);},connected=false,rows=[],saved=null,valid=false,operation=null;
  function status(text,error){$('status').textContent=text;$('status').classList.toggle('error',!!error);}
  function selection(){return{model:$('model').value,reasoningEffort:$('effort').value};}
  function dirty(){var current=selection();return !saved||current.model!==saved.model||current.reasoningEffort!==saved.reasoningEffort;}
  function buttons(){var locked=!!operation;['key','connect','refresh','disconnect'].forEach(function(name){$(name).disabled=!local||locked||(name==='disconnect'&&!connected)||(name==='refresh'&&!connected);});['model','effort'].forEach(function(name){$(name).disabled=locked||!connected||!rows.length;});$('save-model').disabled=!local||locked||!connected||!rows.length||(!dirty()&&valid);$('send').disabled=!local||locked||!connected||!valid||dirty()||!$('message').value.trim();}
  async function call(action,payload){
   if(!local)throw Error('离线预览不进行联网调用；请使用 Android 安装版或正式网页连接 '+definition.name+'。');
   var response=await fetch('/api/config',{cache:'no-store'}),config=await response.json();if(!response.ok||config[id]!==true)throw Error('请更新并重启刻时服务后连接 '+definition.name+'。');
   response=await fetch('/api/'+id+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Ketime-Token':config.csrfToken},body:JSON.stringify(payload||{}),cache:'no-store'});
   var data=await response.json();if(!response.ok)throw Error(data.error||definition.name+' 请求失败。');return data;
  }
  function efforts(preferred){var row=rows.find(function(item){return item.id===$('model').value;});options($('effort'),row?row.reasoningEfforts.map(function(e){return{value:e,label:e==='auto'?'自动思考（模型默认）':window.KetimeModelSettings.effortLabel(e)};}):[],preferred||row&&row.defaultReasoningEffort);}
  async function loadModels(){
   var data=await call('models'),allowed=['auto','none','minimal','low','medium','high','xhigh','max'];
   if(!Array.isArray(data.models)||!data.models.length||!data.models.every(function(row){return typeof row.id==='string'&&definition.pattern.test(row.id)&&Array.isArray(row.reasoningEfforts)&&row.reasoningEfforts.length&&row.reasoningEfforts.every(function(e){return allowed.indexOf(e)>=0;});}))throw Error(definition.name+' 模型目录格式无效。');
   rows=data.models;saved={model:data.selectedModel,reasoningEffort:data.reasoningEffort};valid=data.selectionValid===true;
   options($('model'),rows.map(function(row){return{value:row.id,label:row.name===row.id||!row.name?row.id:row.name+' · '+row.id};}),saved.model);efforts(saved.reasoningEffort);
   status(valid?'已生效：'+saved.model+' · '+window.KetimeModelSettings.effortLabel(saved.reasoningEffort)+'，用于日程助手和测试。':'原选择已不可用，请选择模型后保存。',!valid);
  }
  async function refresh(){
   // A failed refresh must never leave an outdated selection usable.
   valid=false;var data=await call('status');connected=data.connected===true;
   if(connected)await loadModels();else{rows=[];saved=null;options($('model'),[],'');options($('effort'),[],'');status('尚未连接，请填写 '+definition.name+' API Key 并保存。');}
  }
  function run(action){
   if(operation)return operation;
   var promise=Promise.resolve().then(action);operation=promise;activeOperations++;provider.disabled=true;buttons();
   operation=promise.catch(function(e){status(e.message,true);}).finally(function(){operation=null;activeOperations--;provider.disabled=activeOperations>0;buttons();});return operation;
  }
  async function saveModel(){valid=false;var current=selection();status('正在保存模型设置…');var data=await call('configure',current);if(data.saved!==true||data.model!==current.model||data.reasoningEffort!==current.reasoningEffort)throw Error('模型设置未确认保存，请重试。');saved=current;valid=true;status('已生效：'+saved.model+' · '+window.KetimeModelSettings.effortLabel(saved.reasoningEffort)+'，用于日程助手和测试。');}
  function clearKey(){$('key').value='';}
  $('connect').addEventListener('click',function(){var key=$('key').value;clearKey();run(async function(){try{status('正在验证 API Key 并读取模型…');await call('connect',{apiKey:key});await refresh();}finally{key='';}});});
  $('disconnect').addEventListener('click',function(){if(confirm('清除本机保存的 '+definition.name+' API Key？不影响 ChatGPT 授权、其他模型或日程数据。'))run(async function(){await call('disconnect');await refresh();});});
  $('refresh').addEventListener('click',function(){run(refresh);});
  $('model').addEventListener('change',function(){efforts($('effort').value);valid=false;run(saveModel);});$('effort').addEventListener('change',function(){valid=false;run(saveModel);});$('save-model').addEventListener('click',function(){run(saveModel);});$('message').addEventListener('input',buttons);
  $('send').addEventListener('click',function(){var current=selection();run(async function(){status('等待中，正在发送测试消息…');$('reply').textContent='';$('reply').hidden=true;var data=await call('test',Object.assign({message:$('message').value},current));if(data.completed!==true||typeof data.reply!=='string'||!data.reply.trim()||data.model!==current.model||data.reasoningEffort!==current.reasoningEffort||data.provider&&data.provider!==id)throw Error('没有收到所选模型的完整回复，测试尚未成功。');$('reply').textContent=data.reply;$('reply').hidden=false;status('测试成功：'+data.model+'，已收到完整回复。');});});
  buttons();
  return {box:box,clearKey:clearKey,show:function(){clearKey();$('reply').textContent='';$('reply').hidden=true;if(local)run(refresh);else status('离线预览不连接 '+definition.name+'。请使用 Android 安装版或正式网页。');buttons();},refresh:function(){return run(refresh);},ensure:async function(){if(operation)await operation;if(!connected||!rows.length)await run(refresh);if(!connected||!valid||dirty())throw Error('请在智能模型选择中连接 '+definition.name+' 并保存可用模型。');}};
 }
 Object.keys(definitions).forEach(function(id){controllers[id]=mount(id,definitions[id]);});
 function clearKeys(){Object.keys(controllers).forEach(function(id){controllers[id].clearKey();});}
 function show(){clearKeys();var selected=provider.value;gpt.hidden=selected!=='gpt';Object.keys(controllers).forEach(function(id){controllers[id].box.hidden=id!==selected;});if(controllers[selected])controllers[selected].show();}
 provider.addEventListener('change',function(){try{localStorage.setItem(storageKey,provider.value);}catch(e){}show();});
 async function ensure(){var selected=provider.value;if(selected==='gpt'){if(originalEnsure)await originalEnsure();return;}if(!controllers[selected])throw Error('提供方无效，未调用其他模型。');await controllers[selected].ensure();}
 window.KetimeModelSettings.ensureApplied=ensure;
 window.KetimeModelSettings.prepareAssistant=async function(){var selected=provider.value;await ensure();if(provider.value!==selected)throw Error('提供方已改变，请重新发送。');return{provider:selected};};
 document.querySelectorAll('.view-tab').forEach(function(tab){tab.addEventListener('click',clearKeys);});
 var close=document.getElementById('settings-close');if(close)close.addEventListener('click',clearKeys);
 var settingsBox=document.getElementById('settings-overlay');if(settingsBox)new MutationObserver(function(){if(!settingsBox.classList.contains('visible'))clearKeys();}).observe(settingsBox,{attributes:true,attributeFilter:['class']});
 document.getElementById('settings-btn').addEventListener('click',function(){if(local&&controllers[provider.value])controllers[provider.value].refresh();});
 panel.addEventListener('toggle',function(){if(panel.open&&local&&controllers[provider.value])controllers[provider.value].refresh();});
 show();
})();
