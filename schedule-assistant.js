(function () {
  'use strict';
  var api = window.KetimeScheduleAPI, account = window.KetimeAccount;
  if (!api || !account) return;
  var style = document.createElement('style');
  style.textContent = '#view-schedule{position:relative}.schedule-assistant[hidden]{display:none!important}.schedule-assistant{position:absolute;inset:0;z-index:150;background:var(--bg);display:flex;flex-direction:column;min-height:0}.assistant-head{display:flex;align-items:center;gap:12px;padding:17px 24px;background:#fff;border-bottom:1px solid var(--border);flex-shrink:0}.assistant-heading{font-family:var(--serif);font-size:1.35rem;color:var(--primary)}.assistant-head .assistant-clear{margin-left:auto}.assistant-messages{flex:1;overflow:auto;overscroll-behavior:contain;padding:28px max(24px,calc((100% - 820px)/2));min-height:0}.assistant-welcome{padding:36px 0;text-align:center;color:var(--text-2);font-size:1.05rem}.assistant-message{margin:0 0 20px;display:flex;flex-direction:column;align-items:flex-start;gap:7px}.assistant-message.user{align-items:flex-end}.assistant-who{font-size:.72rem;color:var(--muted)}.assistant-bubble{max-width:100%;padding:13px 17px;background:#fff;border:1px solid var(--border);border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:.9rem}.user .assistant-bubble{background:var(--primary-soft);border-color:#d5e9db}.assistant-message.error .assistant-bubble{border-color:#edcaca;color:var(--danger)}.assistant-event-card{width:min(420px,100%);display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:4px;background:#fff;border:1px solid var(--border);border-left:5px solid var(--primary);border-radius:10px;padding:13px 17px;color:var(--text);overflow-wrap:anywhere}.assistant-event-card:hover{background:var(--primary-soft);box-shadow:var(--shadow-soft)}.assistant-event-name{font-weight:600}.assistant-event-meta{font-size:.78rem;color:var(--text-2);white-space:pre-wrap}.assistant-compose{flex-shrink:0;padding:14px max(24px,calc((100% - 820px)/2)) 20px;background:#fff;border-top:1px solid var(--border)}.assistant-input-row{display:flex;gap:10px;align-items:flex-end}.assistant-input{flex:1;min-width:0;resize:none;max-height:150px;font-family:var(--font);line-height:1.6}.assistant-note{font-size:.72rem;color:var(--muted);margin-top:8px}.assistant-live{font-size:.8rem;color:var(--primary);min-height:22px;margin-bottom:8px}.assistant-pending{color:var(--primary)}.assistant-pending:before{content:"";display:inline-block;width:13px;height:13px;border:2px solid var(--primary-soft);border-top-color:var(--primary);border-radius:50%;margin-right:8px;vertical-align:middle;animation:assistant-spin 1s linear infinite}@keyframes assistant-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.assistant-pending:before{animation:none}}@media(max-width:760px){.assistant-head{padding:13px 12px;gap:8px}.assistant-heading{font-size:1.12rem}.assistant-head .btn{padding:6px 9px;font-size:.76rem}.assistant-messages{padding:18px 12px}.assistant-compose{padding:12px}.assistant-welcome{font-size:.92rem}.assistant-note{line-height:1.6}#schedule-assistant-btn{white-space:nowrap;padding:7px 9px;font-size:.78rem}.schedule-toolbar{flex-wrap:wrap;height:auto;min-height:58px;padding-top:8px;padding-bottom:8px}.schedule-toolbar .toolbar-spacer{flex-grow:1}.assistant-input{font-size:16px}}';
  document.head.appendChild(style);
  var panel = document.createElement('section');
  panel.className = 'schedule-assistant'; panel.id = 'schedule-assistant'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'assistant-heading');
  panel.innerHTML = '<div class="assistant-head"><h2 class="assistant-heading" id="assistant-heading">日程助手</h2><button class="btn assistant-clear" id="assistant-clear" type="button">新对话</button><button class="btn" id="assistant-close" type="button">返回日程表</button></div>' +
    '<div class="assistant-messages" id="assistant-messages" role="log" aria-label="日程助手对话" aria-live="polite"><p class="assistant-welcome" id="assistant-welcome">把最新的消息/日程放进来，让小助手为你创建日程~</p></div>' +
    '<form class="assistant-compose" id="assistant-form"><p class="assistant-live" id="assistant-status" role="status" aria-live="polite"></p><div class="assistant-input-row"><textarea class="form-input assistant-input" id="assistant-input" rows="3" maxlength="6000" placeholder="例如：明天下午2点到3点，在图书馆讨论小组作业" aria-label="发送给日程助手的消息"></textarea><button class="btn btn-primary" id="assistant-send" type="submit">发送</button></div><p class="assistant-note">模型与强度使用设置中保存的选择。Enter 发送，Shift＋Enter 换行；只发送本次对话及项目/节点名称，不上传现有日程。对话刷新后清空，创建的日程会保存在本机。</p></form>';
  document.getElementById('view-schedule').appendChild(panel);
  var $ = function (id) { return document.getElementById('assistant-' + id); };
  var busy = false, history = [], composing = false, open = false, draftForms = [];
  var draftStyle = document.createElement('style');
  draftStyle.textContent = '.assistant-draft{width:min(660px,100%);padding:17px;background:#fff;border:1px solid var(--border);border-radius:12px;margin-top:6px}.assistant-draft h3{font-size:.95rem;margin-bottom:13px;color:var(--primary)}.assistant-draft .form-group{margin-bottom:11px}.assistant-draft .form-row{gap:10px}.assistant-draft .form-input,.assistant-draft .form-select{width:100%;min-width:0}.assistant-draft .check-line{font-size:.8rem}.assistant-draft-status{font-size:.8rem;min-height:24px;white-space:pre-wrap;color:var(--text-2);margin:7px 0}.assistant-draft-status.error{color:var(--danger)}.assistant-draft fieldset{border:0;min-width:0}.assistant-draft legend{font-size:.75rem;color:var(--muted);margin-bottom:10px}@media(max-width:760px){.assistant-draft{padding:13px}.assistant-draft .form-row{grid-template-columns:1fr 1fr}.assistant-draft .form-row.three{grid-template-columns:1fr}.assistant-draft .form-input{font-size:16px}}';
  document.head.appendChild(draftStyle);
  var button = document.getElementById('schedule-assistant-btn');
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
  var underlying = Array.from(document.getElementById('view-schedule').children).filter(function (child) { return child !== panel; });
  function bottom() { $('messages').scrollTop = $('messages').scrollHeight; }
  function controls() { $('send').disabled = busy || !$('input').value.trim(); $('clear').disabled = busy; $('input').disabled = busy; draftForms.forEach(function (form) { if (!form.dataset.finished) form.querySelector('button[type="submit"]').disabled = busy; }); }
  function message(role, value, error) {
    var welcome = $('welcome'); if (welcome) welcome.remove();
    var row = document.createElement('div'); row.className = 'assistant-message ' + role + (error ? ' error' : '');
    var who = document.createElement('span'); who.className = 'assistant-who'; who.textContent = role === 'user' ? '你' : '日程助手';
    var bubble = document.createElement('div'); bubble.className = 'assistant-bubble'; bubble.textContent = value;
    row.append(who, bubble); $('messages').appendChild(row); bottom(); return row;
  }
  function close(focus) {
    panel.hidden = true; open = false; button.setAttribute('aria-expanded', 'false');
    underlying.forEach(function (child) { child.inert = false; });
    if (focus !== false) button.focus();
  }
  button.addEventListener('click', function () {
    panel.hidden = false; open = true; button.setAttribute('aria-expanded', 'true');
    underlying.forEach(function (child) { child.inert = true; });
    (busy ? $('close') : $('input')).focus(); bottom();
    if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') $('status').textContent = '请使用安装版或本机刻时，在设置 → 智能模型选择中连接提供方。';
  });
  $('close').addEventListener('click', function () { close(); });
  document.querySelectorAll('.view-tab').forEach(function (tab) { tab.addEventListener('click', function () { if (open && tab.dataset.view !== 'schedule') close(false); }); });
  $('clear').addEventListener('click', function () {
    if (busy) return; history = []; draftForms = []; $('messages').replaceChildren();
    var welcome = document.createElement('p'); welcome.className = 'assistant-welcome'; welcome.id = 'assistant-welcome'; welcome.textContent = '把最新的消息/日程放进来，让小助手为你创建日程~';
    $('messages').appendChild(welcome); $('status').textContent = ''; $('input').value = ''; controls(); $('input').focus();
  });
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      var all = Array.from(panel.querySelectorAll('button:not(:disabled),textarea:not(:disabled)')), first = all[0], last = all[all.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('input').addEventListener('input', controls);
  $('input').addEventListener('compositionstart', function () { composing = true; });
  $('input').addEventListener('compositionend', function () { composing = false; });
  $('input').addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing) { event.preventDefault(); if (!busy && $('input').value.trim()) $('form').requestSubmit(); } });
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number), d = new Date(0); d.setFullYear(parts[0], parts[1] - 1, parts[2]); d.setHours(12, 0, 0, 0);
    return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
  }
  function validate(events, context, allowDraft) {
    function invalid() { throw Error('日程字段无效，整批日程未创建。'); }
    function string(value, limit, required) { if (typeof value !== 'string' || value.length > limit || required && !value.trim()) invalid(); return value.trim(); }
    if (!Array.isArray(events) || !events.length || events.length > 50) invalid();
    return events.map(function (e) {
      if (!e || typeof e !== 'object' || Object.keys(e).sort().join(',') !== 'color,date,end,endDate,location,name,nodeId,notes,projectId,repeat,start') invalid();
      var name = e.name === null && allowDraft ? null : string(e.name, 200, true);
      if (!(e.date === null && allowDraft) && !validDate(e.date)) invalid();
      if (!(e.start === null && allowDraft) && (typeof e.start !== 'string' || e.start !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start))) invalid();
      if (!(e.end === null && allowDraft) && (typeof e.end !== 'string' || e.end !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.end)) || e.start && e.start === e.end || ['none', 'daily', 'weekly', 'monthly'].indexOf(e.repeat) < 0) invalid();
      if(!allowDraft&&!e.start&&!e.end)throw Error('请至少填写一个开始或结束时间。');
      if (e.endDate !== null && (!validDate(e.endDate) || e.date && e.endDate < e.date || e.repeat === 'none')) invalid();
      if (e.color !== null && (typeof e.color !== 'string' || !/^#[\da-f]{6}$/i.test(e.color))) invalid();
      var pid = e.projectId, nid = e.nodeId;
      if (pid === null && nid !== null) invalid();
      if (pid !== null) { var project = context.projects.find(function (p) { return p.id === pid; }); if (!project || !(nid === null && allowDraft) && !project.nodes.some(function (n) { return n.id === nid; })) throw Error('关联项目或节点已更改，请重新描述需求；未创建任何日程。'); }
      var cleaned = {name:name, date:e.date, start:e.start, end:e.end, repeat:e.repeat, endDate:e.endDate, location:string(e.location === null ? '' : e.location, 300), notes:string(e.notes === null ? '' : e.notes, 2000), color:e.color, projectId:pid, nodeId:nid};
      return cleaned;
    });
  }
  function sortEvents(events) {
    return events.map(function(e,i){return {event:e,index:i};}).sort(function(a,b){
      var ad=a.event.date||'9999-99-99',bd=b.event.date||'9999-99-99';
      var at=a.event.date?(a.event.start||a.event.end||'99:99'):'99:99',bt=b.event.date?(b.event.start||b.event.end||'99:99'):'99:99';
      return ad<bd?-1:ad>bd?1:at<bt?-1:at>bt?1:a.index-b.index;
    }).map(function(item){return item.event;});
  }
  window.KetimeAssistant = {validate:validate,sortEvents:sortEvents};
  function card(row, event) {
    var item = document.createElement('button'); item.type = 'button'; item.className = 'assistant-event-card'; item.style.borderLeftColor = event.color;
    var name = document.createElement('span'); name.className = 'assistant-event-name'; name.textContent = event.name;
    var meta = document.createElement('span'); meta.className = 'assistant-event-meta';
    var repeats = {none:'',daily:'每天',weekly:'每周',monthly:'每月'};
    var timeText=event.start&&event.end?event.start+'–'+event.end+(event.end<event.start?'（次日结束）':''):event.start?event.start+' 开始 · 无尾日程':event.end+' 截止 · 无头日程';
    meta.textContent = event.date + ' · ' + timeText + (repeats[event.repeat] ? '\n' + repeats[event.repeat] + (event.endDate ? ' · 至 ' + event.endDate : ' · 无期限') : '') + (event.location ? '\n地点：' + event.location : '');
    var context = api.context(), project = context.projects.find(function (p) { return p.id === event.projectId; });
    if (project) { var node = project.nodes.find(function (n) { return n.id === event.nodeId; }); meta.textContent += '\n' + project.name + ' · ' + (node ? node.name : ''); }
    if (event.notes) meta.textContent += '\n备注：' + event.notes;
    item.append(name, meta); item.setAttribute('aria-label', '跳转到日程：' + event.name + '，' + event.date);
    item.addEventListener('click', function () { if (api.jump(event.id)) close(false); }); row.appendChild(item);
  }
  function finishDrafts() {
    draftForms.forEach(function (form) { if (!form.dataset.finished) { form.dataset.finished = 'superseded'; form.querySelectorAll('fieldset,button').forEach(function (el) { el.disabled = true; }); form.querySelector('.assistant-draft-status').textContent = '草稿已由新回复更新，请使用下面的新表单。'; } });
  }
  function draft(row, event, index, batch) {
    var form = document.createElement('form'); form.className = 'assistant-draft';
    form.innerHTML = '<h3>创建日程' + (index ? ' · ' + (index + 1) : '') + '</h3><fieldset><legend>已填入识别的信息，确认后创建。结束时间留空为无尾日程，开始时间留空为无头日程；至少填写一个时间。</legend>' +
      '<label class="form-group" style="display:block">日程名称<input class="form-input" name="name" maxlength="200" required></label>' +
      '<div class="form-row three"><label class="form-group">日期<input class="form-input" name="date" type="date" required></label><label class="form-group">开始（可不填）<button type="button" class="time-clear" data-clear-draft-time="start">清空</button><input class="form-input" name="start" type="time" step="60"></label><label class="form-group">结束（可不填）<button type="button" class="time-clear" data-clear-draft-time="end">清空</button><input class="form-input" name="end" type="time" step="60"></label></div>' +
      '<div class="form-row"><label class="form-group">重复<select class="form-select" name="repeat"><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label class="form-group">重复结束日期（可留空）<input class="form-input" name="endDate" type="date"></label></div>' +
      '<div class="form-row"><label class="form-group">关联项目<select class="form-select" name="projectId"></select></label><label class="form-group">关联节点<select class="form-select" name="nodeId"></select></label></div>' +
      '<label class="form-group" style="display:block">地点<input class="form-input" name="location" maxlength="300"></label><label class="form-group" style="display:block">备注<textarea class="form-input" name="notes" maxlength="2000" rows="2"></textarea></label>' +
      '<label class="form-group" style="display:block">颜色<input name="color" type="color" aria-label="日程颜色"></label></fieldset>' +
      '<p class="assistant-draft-status" role="status"></p><button type="submit" class="btn btn-primary">确认创建日程</button>';
    form.querySelector('h3').textContent='创建日程 · '+(index+1)+'/'+batch.total+(event.name?' · '+event.name:'');
    var field = function (name) { return form.elements.namedItem(name); };
    form.querySelectorAll('[data-clear-draft-time]').forEach(function(button){button.addEventListener('click',function(){field(button.dataset.clearDraftTime).value='';field(button.dataset.clearDraftTime).focus()})});
    ['name','date','start','end','repeat','endDate','location','notes'].forEach(function (name) { field(name).value = event[name] || ''; });
    var projects = api.context().projects, none = document.createElement('option'); none.value = ''; none.textContent = '无关联项目'; field('projectId').appendChild(none);
    projects.forEach(function (p) { var option = document.createElement('option'); option.value = p.id; option.textContent = p.name; field('projectId').appendChild(option); });
    field('projectId').value = event.projectId || '';
    field('color').value = event.color || '#8fbaa5';
    function nodes(initial) { field('nodeId').replaceChildren(); var option = document.createElement('option'); option.value = ''; option.textContent = '请选择节点'; field('nodeId').appendChild(option); var project = api.context().projects.find(function (p) { return p.id === field('projectId').value; }); if(project)project.nodes.forEach(function(n){var o=document.createElement('option');o.value=n.id;o.textContent=n.name;field('nodeId').appendChild(o)});field('nodeId').disabled=!project;field('nodeId').required=!!project;field('nodeId').value=initial||''; }
    nodes(event.nodeId);
    field('projectId').addEventListener('change', function () { nodes(null); });
    function repeatFields() { field('endDate').disabled=field('repeat').value==='none';field('endDate').min=field('date').value; }
    field('repeat').addEventListener('change',repeatFields);field('date').addEventListener('change',repeatFields);repeatFields();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (busy || form.dataset.finished) return;
      var status = form.querySelector('.assistant-draft-status');
      try {
        var data = {}; ['name','date','start','end','repeat','endDate','location','notes','color','projectId','nodeId'].forEach(function (key) { data[key]=field(key).value; });
        data.endDate=data.repeat==='none'||!data.endDate?null:data.endDate;data.projectId=data.projectId||null;data.nodeId=data.projectId?(data.nodeId||null):null;
        var created=api.create([data]);form.dataset.finished='created';form.querySelector('fieldset').disabled=true;form.querySelector('button[type="submit"]').disabled=true;status.classList.remove('error');status.textContent='已保存到本机。';
        batch.created.push(created[0]);
        if(!batch.reply)batch.reply=message('assistant','日程已创建完成，点击即可跳转！');
        batch.reply.querySelectorAll('.assistant-event-card').forEach(function(item){item.remove();});
        sortEvents(batch.created).forEach(function(item){card(batch.reply,item);});
        history.push({role:'assistant',content:'用户确认表单，已创建：'+created[0].name+' '+created[0].date+' '+created[0].start+'-'+created[0].end+'。此日程不应再次创建。'});
        $('status').textContent='本批已创建 '+batch.created.length+'/'+batch.total+' 项日程 · 表单确认';bottom();
      } catch (error) { status.classList.add('error');status.textContent=error.message; }
    });
    draftForms.push(form);row.appendChild(form);
  }
  var diagnosticStyle=document.createElement('style');diagnosticStyle.textContent='.assistant-diagnostics{font-size:12px;color:var(--text-2);margin-top:8px;max-width:100%}.assistant-diagnostics summary{cursor:pointer}.assistant-diagnostics dl{display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:5px 16px;margin:10px 0}.assistant-diagnostics dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.assistant-diagnostics p{line-height:1.5;margin:8px 0}.assistant-diagnostics .btn{font-size:12px;min-height:32px}';document.head.appendChild(diagnosticStyle);
  var phaseLabels={checking:'检查模型设置',models:'检查模型目录',requesting:'已发送，等待模型响应',waiting_output:'模型已响应，等待文字输出',receiving:'正在接收日程信息',validating:'正在校验日程信息',complete:'模型回复已完成',failed:'本轮未完成'};
  function safeDiagnostics(raw){
    if(!raw||typeof raw!=='object')return null;var out={stage:phaseLabels[raw.stage]?raw.stage:'checking',elapsedMs:0,timings:{},usage:{},catalogCacheHit:typeof raw.catalogCacheHit==='boolean'?raw.catalogCacheHit:null};
    if(Number.isFinite(raw.elapsedMs)&&raw.elapsedMs>=0)out.elapsedMs=raw.elapsedMs;
    ['catalogMs','headersMs','firstTextMs','inferenceMs','validationMs'].forEach(function(k){var n=raw.timings&&raw.timings[k];if(Number.isFinite(n)&&n>=0)out.timings[k]=n});
    ['inputTokens','outputTokens','reasoningTokens'].forEach(function(k){var n=raw.usage&&raw.usage[k];if(Number.isInteger(n)&&n>=0&&n<=10000000)out.usage[k]=n});return out;
  }
  function diagnosticId(){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,function(b){return b.toString(16).padStart(2,'0')}).join('')}
  function showDiagnostics(row,report){
    var details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('dl');details.className='assistant-diagnostics';summary.textContent='耗时明细 · '+(report.totalMs/1000).toFixed(1)+' 秒';details.append(summary,list);
    function item(label,n){if(!Number.isFinite(n))return;var dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=(n/1000).toFixed(2)+' 秒';list.append(dt,dd)}
    item('本机准备',report.preflightMs);var server=report.backend;
    if(server){item('模型目录'+(server.catalogCacheHit===true?'（命中缓存）':server.catalogCacheHit===false?'（联网读取）':''),server.timings.catalogMs);item('完整模型响应',server.timings.inferenceMs);item('首次文字等待',server.timings.firstTextMs);item('后端格式校验',server.timings.validationMs)}
    item('本机请求往返',report.backendRoundTripMs);item('界面数据校验',report.frontValidationMs);item('保存及同步页面更新',report.localApplyMs);
    var note=document.createElement('p');note.textContent='首次文字等待包含在模型响应中，各项不可直接相加。诊断仅含耗时和计数，不含消息、日程内容或凭据。';details.appendChild(note);
    var copy=document.createElement('button');copy.type='button';copy.className='btn';copy.textContent='复制耗时概要';copy.addEventListener('click',function(){if(!navigator.clipboard){copy.textContent='请截图保存耗时明细';return}navigator.clipboard.writeText(JSON.stringify(report,null,2)).then(function(){copy.textContent='已复制'},function(){copy.textContent='复制失败，可截图保存'})});details.appendChild(copy);row.appendChild(details);
  }
  function watchProgress(config,id,waiting,started){
    var done=false,timer=null,controller=null,last=null,stage='checking',ticker=setInterval(function(){var bubble=waiting.querySelector('.assistant-bubble');if(!bubble)return;bubble.textContent=(phaseLabels[stage]||phaseLabels.checking)+'… · '+((performance.now()-started)/1000).toFixed(1)+' 秒'},250);
    async function poll(){if(done||!id)return;controller=new AbortController();var timeout=setTimeout(function(){controller.abort()},2500);try{var response=await fetch('/api/assistant/progress',{method:'POST',headers:{'Content-Type':'application/json','X-Ketime-Token':config.csrfToken},body:JSON.stringify({requestId:id}),signal:controller.signal,cache:'no-store'});var value=await response.json();if(!done&&response.ok&&value.found){last=safeDiagnostics(value);if(last)stage=last.stage}}catch(ignore){}finally{clearTimeout(timeout);controller=null;if(!done)timer=setTimeout(poll,700)}}
    if(id)timer=setTimeout(poll,100);return{phase:function(value){if(phaseLabels[value])stage=value},last:function(){return last},stop:function(){done=true;clearInterval(ticker);clearTimeout(timer);if(controller)controller.abort()}};
  }
  $('form').addEventListener('submit', async function (event) {
    event.preventDefault(); var input = $('input').value.trim(); if (busy || !input) return;
    if (input.length > 6000) { $('status').textContent = '每条消息最多6000字。'; return; }
    if (history.length + 1 > 24 || history.reduce(function (n, m) { return n + m.content.length; }, input.length) > 24000) { $('status').textContent = '对话较长，请点击“新对话”后继续，已创建的日程不会删除。'; return; }
    busy = true; controls(); message('user', input); $('input').value = '';
    var waiting = message('assistant', '正在检查模型设置…'); waiting.querySelector('.assistant-bubble').classList.add('assistant-pending');
    $('status').textContent = '等待中，请勿重复发送。返回日程表不会中断当前请求。';
    var submitted = history.concat([{role:'user',content:input}]);
    var started=performance.now(),watch=null,report={version:1,platform:window.KetimeHarmony?'harmony':window.KetimeAndroid?'android':'web',totalMs:0,preflightMs:0,backendRoundTripMs:0,frontValidationMs:0,localApplyMs:0},config={};watch=watchProgress(config,null,waiting,started);
    try {
      if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') throw Error('请使用安装版或通过 start-ketime.cmd 打开本机刻时，在智能模型选择中连接提供方。');
      var configResponse = await fetch('/api/config', {cache:'no-store'});config = await configResponse.json();
      if (!configResponse.ok || config.scheduleAssistant !== true || config.assistantDrafts !== true || config.modelSettings !== true) throw Error('日程助手需要新版本机服务，请重启 start-ketime.cmd 并刷新页面。');
      var providerOptions={};
      if(window.KetimeModelSettings&&window.KetimeModelSettings.prepareAssistant)providerOptions=await window.KetimeModelSettings.prepareAssistant();
      else if(window.KetimeModelSettings&&window.KetimeModelSettings.ensureApplied)await window.KetimeModelSettings.ensureApplied();
      report.preflightMs=performance.now()-started;var requestId=config.assistantDiagnostics===true&&(providerOptions.provider||'gpt')==='gpt'?diagnosticId():null;
      watch.stop();watch=watchProgress(config,requestId,waiting,started);watch.phase(requestId?'models':'requesting');
      var callStart=performance.now(),payload=Object.assign({messages:submitted,context:api.context()},providerOptions);if(requestId)payload.requestId=requestId;
      var result = await account.call('/api/chatgpt/assistant',payload);
      report.backendRoundTripMs=performance.now()-callStart;report.backend=safeDiagnostics(result.diagnostics)||watch.last();if(typeof result.model==='string'&&/^(gpt-|deepseek-|kimi-|moonshot-|MiniMax-)[A-Za-z0-9._-]{1,100}$/.test(result.model))report.model=result.model;if(['auto','none','minimal','low','medium','high','xhigh','max'].indexOf(result.reasoningEffort)>=0)report.reasoningEffort=result.reasoningEffort;watch.stop();
      var validationStart=performance.now();
      var modelPatterns={gpt:/^gpt-\d/,deepseek:/^deepseek-[A-Za-z0-9._-]+$/,kimi:/^(kimi-k|moonshot-v)[A-Za-z0-9._-]+$/,minimax:/^MiniMax-M\d[A-Za-z0-9._-]*$/};
      var modelPattern=modelPatterns[providerOptions.provider||'gpt'];
      if (result.completed !== true || !Array.isArray(result.events) || typeof result.message !== 'string' || !result.message.trim() || typeof result.model !== 'string' || !modelPattern.test(result.model) || result.provider&&result.provider!==(providerOptions.provider||'gpt') || ['auto','none','minimal','low','medium','high','xhigh','max'].indexOf(result.reasoningEffort) < 0) throw Error('回复未完成或模型配置无效，未创建日程。');
      if(result.eventCount!==undefined&&(!Number.isInteger(result.eventCount)||result.eventCount!==result.events.length))throw Error('识别数量与日程明细不一致，未创建任何日程，请重试。');
      var candidates = result.events.length ? sortEvents(validate(result.events,api.context(),true)) : [];
      var needsForm = candidates.some(function (e) { return !e.name || !e.date || !e.start || !e.end || e.projectId && !e.nodeId; });
      report.frontValidationMs=performance.now()-validationStart;var applyStart=performance.now();
      var created = candidates.length && !needsForm ? api.create(candidates) : [];
      report.localApplyMs=performance.now()-applyStart;
      waiting.remove();
      var reply = created.length ? '日程已创建完成，点击即可跳转！' : needsForm ? '已自动整理并填入日程信息，请在下方补充结束时间或其他缺失项，确认后创建。' : result.message;
      if(candidates.length)finishDrafts();
      var row = message('assistant', reply);
      if(candidates.length){var summary=document.createElement('p');summary.className='assistant-event-meta assistant-batch-summary';summary.textContent='共识别 '+candidates.length+' 项日程，按日期和开始时间排列。'+(candidates.some(function(e){return !e.date||!e.start;})?'时间待补充的日程置于相应末尾。':'');row.appendChild(summary);}
      sortEvents(created).forEach(function (e) { card(row, e); });
      if(needsForm){var batch={total:candidates.length,created:[],reply:null};candidates.forEach(function(e,i){draft(row,e,i,batch)});}report.totalMs=performance.now()-started;showDiagnostics(row,report);bottom();
      history = submitted.concat([{role:'assistant',content:created.length ? (reply + '\n已创建：' + created.map(function (e) { return e.name + ' ' + e.date + ' ' + e.start + '-' + e.end + ' ' + e.repeat; }).join('\n')).slice(0,6000) : needsForm ? (reply+'\n尚未创建的草稿：'+JSON.stringify(candidates)).slice(0,6000) : result.message}]);
      $('status').textContent = (created.length ? '已创建 ' + created.length + ' 项日程' : needsForm ? '草稿待确认，尚未创建日程' : '请补充信息，尚未创建日程') + ' · ' + result.model + ' · ' + (window.KetimeModelSettings ? window.KetimeModelSettings.effortLabel(result.reasoningEffort) : result.reasoningEffort);
    } catch (error) {
      report.totalMs=performance.now()-started;if(typeof callStart==='number')report.backendRoundTripMs=performance.now()-callStart;else report.preflightMs=report.totalMs;if(watch){report.backend=watch.last();watch.stop()}waiting.remove();var errorRow=message('assistant', error.message || '请求未完成，未创建日程，请重试。', true);showDiagnostics(errorRow,report);
      $('status').textContent = '本轮未完成，可修改消息后重新发送。'; $('input').value = input;
    } finally { if(watch)watch.stop();busy = false; controls(); if (open) $('input').focus(); }
  });
  controls();
})();
