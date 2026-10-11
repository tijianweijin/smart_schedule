/* Shared schedule presentation and transient gestures. No new persistent schema. */
(function(){
 'use strict';
 var api=window.KetimeTimelineAPI,wrap=document.getElementById('schedule-wrap'),grid=document.getElementById('schedule-grid');
 if(!api||!wrap||!grid)return;
 var style=document.createElement('style');style.dataset.ketimeTimeline='1';style.textContent=`
 #view-schedule{background:var(--schedule-bg)}
 #schedule-wrap,#schedule-grid{background:var(--schedule-drawing)}
 #schedule-grid{--reminder-height:48px}
 #schedule-grid .day-click-cell{border-right-color:var(--schedule-day-line);border-bottom-color:var(--schedule-hour-line);background-image:linear-gradient(to bottom,transparent calc(50% - .5px),var(--schedule-half-line) calc(50% - .5px),var(--schedule-half-line) calc(50% + .5px),transparent calc(50% + .5px))}
 #schedule-grid .hour-label-cell{font-size:12px;color:var(--schedule-hour-text);background:var(--schedule-drawing);border-right-color:var(--schedule-day-line)}
 #schedule-grid .day-header-cell,#schedule-grid .day-reminder-cell,#schedule-grid .grid-corner,#schedule-grid .reminder-corner{background:var(--schedule-bg);border-color:var(--schedule-divider)}
 #schedule-grid .day-header-cell.today,#schedule-grid .day-reminder-cell.today{background:var(--schedule-today)}
 #schedule-grid .day-col-overlay.today-col{background:rgba(237,246,240,.48)}
 #schedule-grid .day-reminder-cell{padding:6px 4px}
 #schedule-grid .day-reminder-head{min-height:32px}
 #schedule-grid .day-reminder-add,#schedule-grid .reminder-name{font-size:12px}
 #schedule-grid .day-reminder-item{background:transparent;align-items:center}
 #schedule-grid .reminder-toggle{margin-top:0}
 #schedule-grid .event-block{border:1.5px solid;border-radius:10px;box-shadow:none;padding:6px 8px 30px;display:flex;flex-direction:column;color:var(--event-ink);overflow:hidden;transition:filter 180ms}
 #schedule-grid .event-block:hover{transform:none}
 #schedule-grid .event-block .event-title{font-size:16px;font-weight:700;line-height:1.2;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;color:inherit;min-width:0;flex:0 0 auto}
 #schedule-grid .event-block .event-location{font-size:12px;font-weight:500;line-height:1.2;margin-top:4px;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit;overflow:hidden;flex:0 0 auto}
 #schedule-grid .event-block .event-time,#schedule-grid .event-block .event-link,#schedule-grid .event-block .event-source{display:none!important}
 #schedule-grid .event-block.event-compact{padding:0 30px 0 4px}
 #schedule-grid .event-block .event-check{width:22px;height:22px;min-width:22px;min-height:22px;right:4px;bottom:4px;border-width:1.5px;font-size:12px;background:rgba(255,255,255,.92);color:transparent}
 #schedule-grid .event-block .event-check.done{background:var(--primary);border-color:var(--primary);color:#fff}
 #schedule-grid .event-block.event-compact .event-check{width:20px;height:20px;min-width:20px;min-height:20px;bottom:1px}
 #schedule-grid .event-block.done{opacity:1;filter:none}
 #schedule-grid .event-block.continues-from{border-top-style:dashed}
 #schedule-grid .event-block.event-marker{border:0;border-radius:10px;overflow:visible;padding:6px 4px 0;display:block;color:var(--schedule-text)}
 #schedule-grid .event-marker .marker-content{left:8px;right:8px;top:6px}
 #schedule-grid .event-marker.marker-end-only .marker-content{top:auto;bottom:30px}
 #schedule-grid .event-marker.marker-start-only{display:flex;flex-direction:column;padding:6px 8px 0}
 #schedule-grid .event-marker.marker-start-only .marker-content{left:auto;right:auto;top:auto}
 #schedule-grid .event-marker .event-title{max-height:2.4em}
 #schedule-grid .event-marker.marker-expanded .event-title{max-height:none}
 #schedule-grid .event-marker:not(.marker-expanded) .event-location{display:none}
 #schedule-grid .event-marker.marker-detail-collides .event-title{max-height:2.4em}
 #schedule-grid .event-marker .event-check{right:4px;bottom:4px;flex-basis:22px}
 #schedule-grid .event-marker.marker-start-only .event-check,#schedule-grid .event-marker .marker-edge-details .event-check{position:relative;right:auto;bottom:auto;flex:0 0 22px;align-self:flex-end;margin-top:4px}
 #schedule-grid .event-marker .marker-edge-details{left:8px;right:8px}
 #schedule-grid .event-marker .marker-edge-details .marker-content{position:static}
 #schedule-grid .event-marker .marker-fade{border-radius:inherit}
 .untimed-panel.inbox-collapsed{flex:0 0 56px;min-height:56px;height:56px}
 .untimed-panel.inbox-expanded{flex:0 0 min(240px,30dvh);min-height:150px;height:min(240px,30dvh)}
 .untimed-panel .untimed-head{height:56px;flex-basis:56px;padding:0 12px;gap:8px}
 .untimed-panel.inbox-collapsed .untimed-scroll{display:none}
 #inbox-toggle{border:0;background:transparent;color:var(--schedule-text);font-size:16px;font-weight:700;display:flex;align-items:center;gap:6px;min-height:44px;padding:0}
 .inbox-chevron{font-size:14px;color:var(--schedule-muted);transition:transform 180ms}
 .inbox-expanded .inbox-chevron{transform:rotate(180deg)}
 #schedule-overlay{height:var(--timeline-viewport-height,100dvh);top:var(--timeline-viewport-top,0px);bottom:auto}
 #schedule-overlay .modal{display:flex;flex-direction:column;padding:20px 0 0;width:640px;max-width:calc(100vw - 24px);max-height:calc(var(--timeline-viewport-height,100dvh) - 32px);overflow:hidden}
 #schedule-overlay .modal-title{padding:0 20px;margin-bottom:12px;flex:0 0 auto}
 .schedule-form-content{min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 20px 20px;scroll-padding:16px}
 .schedule-form-group{margin:0 0 22px;display:flex;flex-direction:column;gap:12px}
 .schedule-form-group h3{font-size:12px;font-weight:600;color:var(--schedule-secondary);margin:0}
 #schedule-overlay .form-group,#schedule-overlay .form-row,#schedule-overlay .link-summary,#schedule-overlay .form-hint{margin:0}
 #schedule-overlay .form-row{gap:12px}
 #schedule-overlay .modal-actions{flex:0 0 auto;margin:0;padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--border);z-index:2}
 #schedule-overlay #save-event{min-height:44px}
 #schedule-overlay #chips-editor{position:relative;min-height:56px;max-height:132px;overflow:auto;border:1px solid #DAD7D0;border-radius:12px;background:var(--surface);padding:6px 46px 6px 8px;gap:0}
 #schedule-overlay #chips-editor:focus-within{border:2px solid var(--primary);padding:5px 45px 5px 7px;box-shadow:none}
 #schedule-overlay .chip-text{font-size:16px;color:var(--schedule-text);min-width:12px;max-width:100%;min-height:36px;padding:6px 0;line-height:1.5}
 #schedule-overlay .chip-text-empty-main:empty:before{content:'输入日程名称';color:#AAA69E}
 #schedule-overlay .ph-add{position:absolute;right:7px;top:10px;width:34px;height:34px;margin:0;padding:0;border:0;background:transparent;color:var(--schedule-secondary);font-size:18px}
 .schedule-name-help{font-size:12px;color:var(--schedule-secondary);margin-top:6px}
 .schedule-name-help summary{cursor:pointer;width:max-content}
 .schedule-name-help p{margin:6px 0;line-height:1.5}
 .timeline-range-preview{position:absolute;left:2px;right:2px;border:2px solid var(--primary);background:rgba(40,121,75,.22);border-radius:10px;pointer-events:none;z-index:16}
 .timeline-range-label{position:fixed;z-index:310;background:var(--primary);color:#fff;padding:4px 8px;border-radius:6px;font-size:13px;pointer-events:none;white-space:nowrap}
 #timeline-quick-create{position:fixed;z-index:320;width:300px;max-width:calc(100vw - 24px);padding:12px;background:var(--surface);color:var(--schedule-text);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-soft)}
 #timeline-quick-create[hidden],.timeline-range-label[hidden]{display:none}
 #timeline-quick-create h2{font-size:14px;margin-bottom:4px}
 #timeline-quick-range{font-size:12px;color:var(--schedule-secondary);margin-bottom:8px}
 #timeline-quick-name{width:100%;height:48px;border:1px solid #DAD7D0;border-radius:10px;padding:8px 10px;font-size:16px;color:var(--schedule-text);background:var(--surface)}
 #timeline-quick-name:focus{border-color:var(--primary)}
 .timeline-quick-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
 .timeline-quick-actions button{min-height:44px}
 #timeline-quick-status{font-size:12px;color:var(--danger);margin-top:6px}
 #timeline-quick-status:empty{display:none}
 .timeline-selecting,.timeline-selecting *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
 @media(max-width:600px){#schedule-overlay .modal{max-height:calc(var(--timeline-viewport-height,100dvh) - 16px);padding-top:16px}#schedule-overlay .modal-title{padding:0 16px}.schedule-form-content{padding:0 16px 16px}#schedule-overlay .modal-actions{padding-left:16px;padding-right:16px}.untimed-panel .untimed-head{gap:6px}#inbox-toggle{font-size:15px}.untimed-panel .untimed-count{font-size:12px}}
 @media(prefers-reduced-motion:reduce){#view-schedule *,#schedule-overlay *,#timeline-quick-create *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
 `;document.head.appendChild(style);

 // Preserve the existing form fields and listeners while regrouping their containers.
 var overlay=document.getElementById('schedule-overlay'),modal=overlay.querySelector('.modal'),footer=modal.querySelector('.modal-actions');
 var content=document.createElement('div');content.className='schedule-form-content';
 var nameGroup=document.getElementById('chips-editor').parentElement,projectRow=document.getElementById('event-project').closest('.form-row'),link=document.getElementById('event-link-summary');
 var dates=document.getElementById('event-date').closest('.form-row'),hint=dates.nextElementSibling,repeat=document.getElementById('event-repeat').closest('.form-row'),repeatOptions=document.getElementById('event-repeat-options');
 function group(title,nodes){var section=document.createElement('section'),heading=document.createElement('h3');section.className='schedule-form-group';heading.textContent=title;section.appendChild(heading);nodes.forEach(function(node){section.appendChild(node)});content.appendChild(section)}
 group('基本信息',[nameGroup,projectRow,link]);group('时间',[dates,hint]);group('其他设置',[document.getElementById('event-location').parentElement,repeat,repeatOptions,document.getElementById('event-notes').parentElement,document.getElementById('event-color-presets').parentElement]);modal.insertBefore(content,footer);
 var explanation=nameGroup.querySelector('.form-hint'),help=document.createElement('details');help.className='schedule-name-help';help.innerHTML='<summary>ⓘ 数字占位符说明</summary><p>将光标放在名称的任意位置，点右侧 # 插入数字。可插入多个占位符，点击占位符可修改范围与格式。</p>';if(explanation)explanation.remove();nameGroup.appendChild(help);
 document.getElementById('chips-editor').addEventListener('click',function(event){if(event.target===event.currentTarget){var field=event.currentTarget.querySelector('.chip-text');if(field)field.focus()}});
 overlay.addEventListener('keydown',function(event){if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'&&!event.shiftKey&&(event.target.classList.contains('chip-text')||event.ctrlKey||event.metaKey)){event.preventDefault();document.getElementById('save-event').click()}});
 new MutationObserver(function(records){if(!overlay.classList.contains('visible'))return;var editing=document.getElementById('delete-event').style.display!=='none';document.getElementById('save-event').textContent=editing?'保存修改':'创建日程';content.scrollTop=0;}).observe(overlay,{attributes:true,attributeFilter:['class']});
 function keepInputVisible(event){if(overlay.classList.contains('visible')&&event.target.closest('.schedule-form-content'))requestAnimationFrame(function(){event.target.scrollIntoView({block:'nearest',inline:'nearest'})});}
 content.addEventListener('focusin',keepInputVisible);

 // Session-only inbox expansion: no local data migration or persistent UI preference.
 var panel=document.querySelector('.untimed-panel'),head=panel.querySelector('.untimed-head'),heading=document.getElementById('untimed-title'),toggle=document.createElement('button'),expanded=false;
 toggle.type='button';toggle.id='inbox-toggle';toggle.innerHTML='待收纳<span class="inbox-chevron" aria-hidden="true">⌃</span>';toggle.setAttribute('aria-controls','untimed-content');heading.replaceChildren(toggle);panel.querySelector('.untimed-scroll').id='untimed-content';
 function expand(value){expanded=!!value;panel.classList.toggle('inbox-expanded',expanded);panel.classList.toggle('inbox-collapsed',!expanded);toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'折叠待收纳':'展开待收纳');}
 toggle.addEventListener('click',function(){expand(!expanded)});document.getElementById('add-untimed-todo').addEventListener('click',function(){expand(true)},true);expand(false);
 var inboxTouch=null;head.addEventListener('touchstart',function(event){if(event.target.closest('button,input')||event.touches.length!==1)return;inboxTouch={x:event.touches[0].clientX,y:event.touches[0].clientY};},{passive:true});head.addEventListener('touchend',function(event){if(!inboxTouch)return;var touch=event.changedTouches[0],dy=touch.clientY-inboxTouch.y,dx=touch.clientX-inboxTouch.x;inboxTouch=null;if(Math.abs(dx)<24&&Math.abs(dy)>24)expand(dy<0);},{passive:true});

 var draft=null,timer=null,scrollFrame=null,lastStamp=0,suppressClickUntil=0;
 var label=document.createElement('div');label.className='timeline-range-label';label.hidden=true;document.body.appendChild(label);
 var quick=document.createElement('form');quick.id='timeline-quick-create';quick.hidden=true;quick.setAttribute('role','dialog');quick.setAttribute('aria-labelledby','timeline-quick-title');quick.innerHTML='<h2 id="timeline-quick-title">新建日程</h2><p id="timeline-quick-range"></p><input id="timeline-quick-name" maxlength="200" autocomplete="off" placeholder="输入日程名称" aria-label="快捷日程名称"><p id="timeline-quick-status" role="alert"></p><div class="timeline-quick-actions"><button type="button" id="timeline-quick-cancel" class="btn">取消</button><button type="submit" class="btn btn-primary">创建日程</button></div>';document.body.appendChild(quick);
 var input=document.getElementById('timeline-quick-name'),range=document.getElementById('timeline-quick-range'),status=document.getElementById('timeline-quick-status');
 function minuteText(offset){var minute=(Number(document.getElementById('daystart-select').value)*60+offset)%1440;return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')}
 function columnFor(date){return grid.querySelector('.day-col-overlay[data-date="'+date+'"]')}
 function minuteAt(y){var column=columnFor(draft.date);return Math.max(0,Math.min(1440,Math.round((y-column.getBoundingClientRect().top)/api.hourHeight*60/15)*15))}
 function visibleBounds(){var rect=wrap.getBoundingClientRect(),header=grid.querySelector('.day-header-cell'),reminders=grid.querySelector('.day-reminder-cell');return{top:rect.top+(header?header.getBoundingClientRect().height:0)+(reminders?reminders.getBoundingClientRect().height:0),bottom:rect.bottom,left:rect.left,right:rect.right}}
 function positionQuick(){if(quick.hidden||!draft)return;var column=columnFor(draft.date);if(!column)return;var bounds=column.getBoundingClientRect(),viewport=window.visualViewport,top=viewport?viewport.offsetTop:0,height=viewport?viewport.height:innerHeight,width=viewport?viewport.width:innerWidth,bottom=top+height-(window.KetimeAndroid?55:12),desired=bounds.top+draft.start/60*api.hourHeight;quick.style.left=Math.max(12,Math.min(width-quick.offsetWidth-12,bounds.left))+'px';quick.style.top=Math.max(top+12,Math.min(bottom-quick.offsetHeight,desired))+'px';}
 function draw(){if(!draft||draft.phase==='pending')return;var column=columnFor(draft.date);if(!column){cancel();return;}if(!draft.preview.isConnected)column.appendChild(draft.preview);draft.preview.style.top=draft.start/60*api.hourHeight+'px';draft.preview.style.height=(draft.end-draft.start)/60*api.hourHeight+'px';var text=minuteText(draft.start)+'—'+minuteText(draft.end)+(draft.end+Number(document.getElementById('daystart-select').value)*60>=1440?'（跨日）':'');label.textContent=text;range.textContent=draft.date+' · '+text;var bounds=visibleBounds();label.style.left=Math.max(bounds.left+4,Math.min(bounds.right-label.offsetWidth-4,column.getBoundingClientRect().left+6))+'px';label.style.top=Math.max(bounds.top+4,Math.min(bounds.bottom-32,draft.y-52))+'px';positionQuick();}
 function update(y){if(!draft||draft.phase!=='selecting')return;draft.y=y;var minute=minuteAt(y);draft.start=Math.min(draft.anchor,minute);draft.end=Math.max(draft.anchor,minute);if(draft.end===draft.start)draft.end=Math.min(1440,draft.start+15);draw();}
 function scrollTick(stamp){scrollFrame=null;if(!draft||draft.phase!=='selecting')return;var bounds=visibleBounds(),margin=40,speed=draft.y<bounds.top+margin?-Math.min(4,1+(bounds.top+margin-draft.y)/margin*3):draft.y>bounds.bottom-margin?Math.min(4,1+(draft.y-bounds.bottom+margin)/margin*3):0,elapsed=Math.min(32,lastStamp?stamp-lastStamp:16);lastStamp=stamp;if(speed){wrap.scrollTop+=speed*elapsed/16;update(draft.y)}scrollFrame=requestAnimationFrame(scrollTick);}
 function haptic(){try{if(window.KetimeNative&&window.__ketimeAndroidToken&&typeof window.KetimeNative.haptic==='function')window.KetimeNative.haptic(window.__ketimeAndroidToken);else if(navigator.vibrate)navigator.vibrate(12)}catch(ignore){}}
 function activate(){timer=null;if(!draft||draft.phase!=='pending')return;draft.phase='selecting';draft.start=draft.anchor;draft.end=draft.anchor+15;draft.preview=document.createElement('div');draft.preview.className='timeline-range-preview';document.documentElement.classList.add('timeline-selecting');label.hidden=false;haptic();draw();if(draft.pointerId!==undefined)try{wrap.setPointerCapture(draft.pointerId)}catch(ignore){}lastStamp=0;scrollFrame=requestAnimationFrame(scrollTick);}
 function start(event,point,kind){if(draft||!document.getElementById('view-schedule').classList.contains('active')||overlay.classList.contains('visible'))return;var cell=event.target.closest('.day-click-cell');if(!cell||event.target.closest('.event-block,.day-reminder-cell,button,input'))return;draft={date:cell.dataset.date,x:point.clientX,y:point.clientY,startX:point.clientX,startY:point.clientY,kind:kind,phase:'pending',pointerId:kind==='pointer'?event.pointerId:undefined,touchId:kind==='touch'?point.identifier:undefined};draft.anchor=Math.min(1425,minuteAt(point.clientY));timer=setTimeout(activate,350);}
 function move(event,point){if(!draft)return;if(draft.phase==='pending'){if(Math.hypot(point.clientX-draft.startX,point.clientY-draft.startY)>9){draft.moved=true;cancel()}return;}if(draft.phase==='selecting'){if(event.cancelable)event.preventDefault();update(point.clientY)}}
 function finish(event){if(!draft)return;if(draft.phase==='pending'){cancel();return;}if(draft.phase!=='selecting')return;if(event.cancelable)event.preventDefault();suppressClickUntil=performance.now()+600;draft.phase='editing';if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);scrollFrame=null;document.documentElement.classList.remove('timeline-selecting');label.hidden=true;quick.hidden=false;input.value='';status.textContent='';positionQuick();input.focus({preventScroll:true});}
 function cancel(){if(timer!==null)clearTimeout(timer);timer=null;if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);scrollFrame=null;var old=draft;draft=null;if(old&&old.preview)old.preview.remove();quick.hidden=true;label.hidden=true;document.documentElement.classList.remove('timeline-selecting');if(old&&(old.phase!=='pending'||old.moved))suppressClickUntil=performance.now()+600;return !!old;}
 window.KetimeTimeline={hasDraft:function(){return !!draft},isSelecting:function(){return !!draft&&draft.phase==='selecting'},cancel:cancel,expandInbox:expand};
 wrap.addEventListener('pointerdown',function(event){if(event.pointerType==='touch'||event.button!==0)return;start(event,event,'pointer')});
 document.addEventListener('pointermove',function(event){if(draft&&draft.kind==='pointer'&&draft.pointerId===event.pointerId)move(event,event)},{passive:false});document.addEventListener('pointerup',function(event){if(draft&&draft.kind==='pointer'&&draft.pointerId===event.pointerId)finish(event)});document.addEventListener('pointercancel',function(event){if(draft&&draft.kind==='pointer')cancel()});
 wrap.addEventListener('touchstart',function(event){if(event.touches.length!==1){cancel();return;}start(event,event.touches[0],'touch')},{passive:true});
 document.addEventListener('touchmove',function(event){if(!draft||draft.kind!=='touch')return;if(event.touches.length!==1){cancel();return;}var point=Array.from(event.touches).find(function(t){return t.identifier===draft.touchId});if(point)move(event,point)},{passive:false});document.addEventListener('touchend',function(event){if(draft&&draft.kind==='touch'&&Array.from(event.changedTouches).some(function(t){return t.identifier===draft.touchId}))finish(event)},{passive:false});document.addEventListener('touchcancel',function(){if(draft&&draft.kind==='touch')cancel()});
 wrap.addEventListener('click',function(event){if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);wrap.addEventListener('contextmenu',function(event){if(draft){event.preventDefault();event.stopImmediatePropagation()}},true);
 quick.addEventListener('submit',function(event){event.preventDefault();if(!draft||draft.phase!=='editing')return;try{api.quickCreate(draft.date,draft.start,draft.end,input.value);cancel()}catch(error){status.textContent=error.message;input.focus()}});document.getElementById('timeline-quick-cancel').addEventListener('click',cancel);
 document.addEventListener('keydown',function(event){if(event.key==='Escape'&&draft){event.preventDefault();event.stopImmediatePropagation();cancel()}},true);document.querySelectorAll('.view-tab').forEach(function(tab){tab.addEventListener('click',cancel,true)});document.getElementById('date-picker-btn').addEventListener('click',cancel,true);document.getElementById('add-event-btn').addEventListener('click',cancel,true);window.addEventListener('blur',function(){if(draft&&draft.phase!=='editing')cancel()});document.addEventListener('visibilitychange',function(){if(document.hidden)cancel()});
 function viewportChanged(){var viewport=window.visualViewport;document.documentElement.style.setProperty('--timeline-viewport-height',(viewport?viewport.height:innerHeight)+'px');document.documentElement.style.setProperty('--timeline-viewport-top',(viewport?viewport.offsetTop:0)+'px');positionQuick();if(overlay.classList.contains('visible')&&content.contains(document.activeElement))keepInputVisible({target:document.activeElement});}
 if(window.visualViewport){window.visualViewport.addEventListener('resize',viewportChanged);window.visualViewport.addEventListener('scroll',viewportChanged);}window.addEventListener('resize',viewportChanged);viewportChanged();wrap.addEventListener('scroll',function(){if(draft)draw()},{passive:true});
 new MutationObserver(function(){if(draft&&draft.phase!=='pending')draw()}).observe(grid,{childList:true});
})();
