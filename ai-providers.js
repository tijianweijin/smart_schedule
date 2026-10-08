(function(){
 'use strict';
 var panel=document.getElementById('chatgpt-panel');if(!panel||!window.KetimeModelSettings)return;
 var summary=panel.querySelector('summary'),gpt=document.createElement('div');gpt.id='ai-gpt-settings';
 Array.from(panel.children).forEach(function(child){if(child!==summary)gpt.appendChild(child);});panel.appendChild(gpt);
 var choice=document.createElement('label');choice.className='form-group';choice.style.cssText='display:block;margin:14px 0';
 choice.innerHTML='<span class="form-label">大模型选择</span><select id="ai-provider" class="form-select" aria-label="大模型选择"><option value="gpt">GPT / ChatGPT</option><option value="deepseek">DeepSeek</option><option value="minimax">MiniMax（尚未接入）</option><option value="kimi">Kimi（尚未接入）</option></select>';
 panel.insertBefore(choice,gpt);
 var ds=document.createElement('div');ds.id='ai-deepseek-settings';ds.hidden=true;
 ds.innerHTML='<p class="bupt-note">使用你自己的 DeepSeek API Key，API 调用按 DeepSeek 账户计费。密钥仅在本机加密保存，不进入浏览器存储或日程备份。更新模型仅读取目录；测试和日程助手才发送推理请求。</p>'+
 '<label class="form-group" style="display:block"><span class="form-label">DeepSeek API Key</span><input id="deepseek-key" type="password" class="form-input" autocomplete="off" spellcheck="false" maxlength="256" placeholder="填写后保存，已保存密钥不会回显" aria-label="DeepSeek API Key"></label>'+
 '<div class="chatgpt-model-actions"><button id="deepseek-connect" class="btn btn-primary" type="button">保存并连接</button><button id="deepseek-disconnect" class="btn" type="button">清除本机连接</button><a class="btn" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">获取 API Key</a></div>'+
 '<div class="form-row"><label class="form-group"><span class="form-label">模型</span><select id="deepseek-model" class="form-select" aria-label="DeepSeek 模型" disabled></select></label><label class="form-group"><span class="form-label">推理强度</span><select id="deepseek-effort" class="form-select" aria-label="DeepSeek 推理强度" disabled></select></label></div>'+
 '<div class="chatgpt-model-actions"><button id="deepseek-save-model" class="btn btn-primary" type="button" disabled>保存模型设置</button><button id="deepseek-refresh" class="btn" type="button">更新模型</button></div>'+
 '<p id="deepseek-status" class="bupt-status" role="status" aria-live="polite">尚未连接 DeepSeek。</p>'+
 '<label class="form-group" style="display:block"><span class="form-label">测试消息（最多 2000 字）</span><textarea id="deepseek-message" class="form-input" rows="3" maxlength="2000" aria-label="DeepSeek 测试消息">你好，请用一句中文确认你收到了来自刻时的测试消息。</textarea></label>'+
 '<button id="deepseek-send" class="btn btn-primary" type="button" disabled>发送测试消息</button>'+
 '<pre id="deepseek-reply" role="region" aria-label="智能模型回复" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-family:inherit;padding:12px;border:1px solid var(--border);border-radius:8px" hidden></pre>';
 panel.appendChild(ds);
 var unsupported=document.createElement('p');unsupported.className='bupt-note';unsupported.hidden=true;unsupported.textContent='此提供方尚未接入，暂不能发送测试消息或使用日程助手；不会改用其他模型。';panel.appendChild(unsupported);
 var provider=document.getElementById('ai-provider'),$=function(name){return document.getElementById('deepseek-'+name);};
 var local=location.protocol==='http:'&&location.hostname==='127.0.0.1',connected=false,rows=[],saved=null,valid=false,operation=null,loading=false;
 var storageKey='ketime-ai-provider-v1',originalEnsure=window.KetimeModelSettings.ensureApplied;
 try{var stored=localStorage.getItem(storageKey);if(['gpt','deepseek','minimax','kimi'].indexOf(stored)>=0)provider.value=stored;}catch(e){}
 function status(text,error){$('status').textContent=text;$('status').classList.toggle('error',!!error);}
 function selection(){return{model:$('model').value,reasoningEffort:$('effort').value};}
 function dirty(){var current=selection();return !saved||current.model!==saved.model||current.reasoningEffort!==saved.reasoningEffort;}
 function buttons(){var locked=loading||!!operation;provider.disabled=locked;['key','connect','refresh','disconnect'].forEach(function(id){$(id).disabled=!local||locked||(id==='disconnect'&&!connected)||(id==='refresh'&&!connected);});['model','effort'].forEach(function(id){$(id).disabled=locked||!connected||!rows.length;});$('save-model').disabled=!local||locked||!connected||!rows.length||(!dirty()&&valid);$('send').disabled=!local||locked||!connected||!valid||dirty()||!$('message').value.trim();}
 async function call(action,payload){
  if(!local)throw Error('离线预览仅展示选项；请使用 Android 安装版或通过 start-ketime.cmd 打开正式网页连接 DeepSeek。');
  var response=await fetch('/api/config',{cache:'no-store'}),config=await response.json();if(!response.ok||config.deepseek!==true)throw Error('请更新并重启刻时服务后连接 DeepSeek。');
  response=await fetch('/api/deepseek/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Ketime-Token':config.csrfToken},body:JSON.stringify(payload||{}),cache:'no-store'});
  var data=await response.json();if(!response.ok)throw Error(data.error||'DeepSeek 请求失败。');return data;
 }
 function options(element,choices,value){element.replaceChildren();choices.forEach(function(row){var option=document.createElement('option');option.value=row.value;option.textContent=row.label;element.appendChild(option);});element.value=choices.some(function(row){return row.value===value;})?value:choices.length?choices[0].value:'';}
 function efforts(preferred){var row=rows.find(function(item){return item.id===$('model').value;});options($('effort'),row?row.reasoningEfforts.map(function(e){return{value:e,label:window.KetimeModelSettings.effortLabel(e)};}):[],preferred||row&&row.defaultReasoningEffort);}
 async function loadModels(){var data=await call('models');if(!Array.isArray(data.models)||!data.models.length||!data.models.every(function(row){return typeof row.id==='string'&&/^deepseek-/.test(row.id)&&Array.isArray(row.reasoningEfforts)&&row.reasoningEfforts.length;}))throw Error('DeepSeek 模型目录格式无效。');rows=data.models;saved={model:data.selectedModel,reasoningEffort:data.reasoningEffort};valid=data.selectionValid===true;options($('model'),rows.map(function(row){return{value:row.id,label:row.name+' · '+row.id};}),saved.model);efforts(saved.reasoningEffort);status(valid?'已生效：'+saved.model+' · '+window.KetimeModelSettings.effortLabel(saved.reasoningEffort)+'，用于日程助手和测试。':'原选择已不可用，请选择模型后保存。',!valid);}
 async function refresh(){var data=await call('status');connected=data.connected===true;if(connected)await loadModels();else{rows=[];saved=null;valid=false;options($('model'),[],'');options($('effort'),[],'');status('尚未连接，请填写 DeepSeek API Key 并保存。');}}
 function run(action){if(operation)return operation;loading=true;buttons();operation=(async function(){try{await action();}catch(e){status(e.message,true);}finally{loading=false;operation=null;buttons();}})();return operation;}
 async function saveModel(){valid=false;var current=selection();status('正在保存模型设置…');var data=await call('configure',current);if(data.saved!==true||data.model!==current.model||data.reasoningEffort!==current.reasoningEffort)throw Error('模型设置未确认保存，请重试。');saved=current;valid=true;status('已生效：'+saved.model+' · '+window.KetimeModelSettings.effortLabel(saved.reasoningEffort)+'，用于日程助手和测试。');}
 function show(){var selected=provider.value;gpt.hidden=selected!=='gpt';ds.hidden=selected!=='deepseek';unsupported.hidden=selected==='gpt'||selected==='deepseek';$('key').value='';$('reply').textContent='';$('reply').hidden=true;if(selected==='deepseek'){if(local)run(refresh);else status('离线预览不连接 DeepSeek。请使用 Android 安装版或正式网页。');}buttons();}
 provider.addEventListener('change',function(){try{localStorage.setItem(storageKey,provider.value);}catch(e){}show();});
 $('connect').addEventListener('click',function(){var key=$('key').value;$('key').value='';run(async function(){status('正在验证 API Key 并读取模型…');await call('connect',{apiKey:key});key='';await refresh();});});
 $('disconnect').addEventListener('click',function(){if(confirm('清除本机保存的 DeepSeek API Key？不影响 GPT 授权或日程数据。'))run(async function(){await call('disconnect');await refresh();});});
 $('refresh').addEventListener('click',function(){run(refresh);});
 $('model').addEventListener('change',function(){efforts($('effort').value);valid=false;run(saveModel);});$('effort').addEventListener('change',function(){valid=false;run(saveModel);});$('save-model').addEventListener('click',function(){run(saveModel);});$('message').addEventListener('input',buttons);
 $('send').addEventListener('click',function(){var current=selection();run(async function(){status('等待中，正在发送测试消息…');$('reply').textContent='';$('reply').hidden=true;var data=await call('test',Object.assign({message:$('message').value},current));if(data.completed!==true||typeof data.reply!=='string'||!data.reply.trim()||data.model!==current.model||data.reasoningEffort!==current.reasoningEffort)throw Error('没有收到所选模型的完整回复，测试尚未成功。');$('reply').textContent=data.reply;$('reply').hidden=false;status('测试成功：'+data.model+'，已收到完整回复。');});});
 async function ensure(){var selected=provider.value;if(selected==='gpt'){if(originalEnsure)await originalEnsure();return;}if(selected!=='deepseek')throw Error('此提供方尚未接入，未调用其他模型。');if(operation)await operation;if(!connected||!rows.length){await run(refresh);}if(!connected||!valid||dirty())throw Error('请在智能模型选择中连接 DeepSeek 并保存可用模型。');}
 window.KetimeModelSettings.ensureApplied=ensure;
 window.KetimeModelSettings.prepareAssistant=async function(){var selected=provider.value;await ensure();if(provider.value!==selected)throw Error('提供方已改变，请重新发送。');return{provider:selected};};
 function clearKey(){ $('key').value=''; }
 document.querySelectorAll('.view-tab').forEach(function(tab){tab.addEventListener('click',clearKey);});
 var close=document.getElementById('settings-close');if(close)close.addEventListener('click',clearKey);
 var settingsBox=document.getElementById('settings-overlay');if(settingsBox)new MutationObserver(function(){if(!settingsBox.classList.contains('visible'))clearKey();}).observe(settingsBox,{attributes:true,attributeFilter:['class']});
 document.getElementById('settings-btn').addEventListener('click',function(){if(provider.value==='deepseek'&&local)run(refresh);});
 panel.addEventListener('toggle',function(){if(panel.open&&provider.value==='deepseek'&&local)run(refresh);});
 show();
})();
