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
 #schedule-grid .event-block{border:1.5px solid;border-radius:10px;box-shadow:none;padding:6px 6px;display:block;color:var(--event-ink);overflow:hidden;transition:filter 180ms}
 #schedule-grid .event-block:hover{transform:none}
 #schedule-grid .event-block .event-title{font-size:16px;font-weight:700;line-height:1.2;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;color:inherit;min-width:0;flex:0 0 auto}
 #schedule-grid .event-block .event-location{font-size:12px;font-weight:500;line-height:1.2;margin-top:4px;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit;overflow:hidden;flex:0 0 auto}
 #schedule-grid .event-block .event-time{display:block;font-size:13px;font-weight:600;line-height:1.2;margin-top:3px;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit;opacity:1;flex:0 0 auto}
 #schedule-grid .event-block .event-link,#schedule-grid .event-block .event-source{display:none!important}
 #schedule-grid .event-block.event-compact{padding:1px 6px}
 #schedule-grid .event-block .event-card-layout{display:flex;flex-direction:column;align-items:stretch;gap:0;min-width:0}
 #schedule-grid .event-block .event-content,#schedule-grid .event-block .marker-content{position:static;top:auto;bottom:auto;left:auto;right:auto;display:block;min-width:0;overflow:visible;flex:none}
 #schedule-grid .event-block .event-completion-row{display:flex;justify-content:flex-end;align-items:center;flex:none;height:20px;min-height:20px;margin:4px 0 0;padding:0}
 #schedule-grid .event-block .event-check{position:static;top:auto;right:auto;bottom:auto;left:auto;transform:none;flex:0 0 20px;align-self:auto;margin:0;width:20px;height:20px;min-width:20px;min-height:20px;border-width:1.5px;font-size:12px;background:rgba(255,255,255,.92);color:transparent}
 #schedule-grid .event-block .event-check:hover{transform:scale(1.08)}
 #schedule-grid .event-block .event-check.done{background:var(--primary);border-color:var(--primary);color:#fff}
 #schedule-grid .event-block.event-compact .event-completion-row{height:18px;min-height:18px}
 #schedule-grid .event-block.event-compact .event-check{width:18px;height:18px;min-width:18px;min-height:18px;flex-basis:18px}
 #schedule-grid .event-block.completion-fixed .event-completion-row{position:absolute;right:6px;bottom:var(--completion-inset,6px);height:20px;min-height:20px;margin:0;z-index:4}
 #schedule-grid .event-block.completion-fixed.event-compact .event-completion-row{height:18px;min-height:18px}
 #schedule-grid .event-block.completion-fixed.event-marker .event-card-layout{padding-bottom:24px}
 #schedule-grid .event-block.completion-fixed.marker-measure .event-card-layout{padding-bottom:0}
 #schedule-grid .event-block.event-content-scroll{overflow:hidden}
 #schedule-grid .event-block.event-content-scroll .event-card-layout{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none}
 #schedule-grid .event-block.event-content-scroll .event-card-layout::-webkit-scrollbar{display:none}
 #schedule-wrap{touch-action:pan-x pan-y}
 #schedule-grid .event-block.done{opacity:1;filter:none}
 #schedule-grid .event-block.continues-from{border-top-style:dashed}
 #schedule-grid .event-block.event-marker{border:0;border-radius:10px;overflow:hidden;padding:6px 8px;display:block;color:var(--schedule-text)}
 #schedule-grid .event-marker .event-title{max-height:none;-webkit-line-clamp:unset}
 #schedule-grid .event-marker .event-location,#schedule-grid .event-marker .event-time{display:block}
 #schedule-grid .event-marker .marker-fade{border-radius:inherit}
 #schedule-grid .event-marker.marker-has-line:before{content:none;display:none}
 #schedule-grid .event-marker .marker-readable-copy{background:transparent;color:var(--schedule-text);box-shadow:none}
 #schedule-grid .event-marker.marker-tail .marker-content,#schedule-grid .event-marker.marker-tail .event-check{display:block}
 #schedule-grid .event-marker.marker-tail .event-check{display:grid}
 #schedule-grid .event-marker.event-content-scroll{overflow:hidden}
 #schedule-grid .event-marker.marker-measure{height:auto!important;max-height:none;min-height:0;visibility:hidden;pointer-events:none;overflow:visible}
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
 #schedule-overlay .form-group{min-width:0}
 #schedule-overlay .form-input,#schedule-overlay .form-select,#schedule-overlay .ketime-control-trigger,#schedule-overlay .color-rgb-row input,.ph-config .form-input,.ph-config .form-select,.ph-config .ketime-control-trigger{border:2px solid transparent;border-radius:12px;background:#FFFFFF;color:#262623;box-shadow:none;min-width:0;outline:none}
 #schedule-overlay .ketime-control-trigger:hover:not(:focus):not([aria-expanded=true]),.ph-config .ketime-control-trigger:hover:not(:focus):not([aria-expanded=true]){border-color:transparent}
 #schedule-overlay .form-input:focus,#schedule-overlay .form-select:focus,#schedule-overlay .ketime-control-trigger:focus,#schedule-overlay .ketime-control-trigger[aria-expanded=true],#schedule-overlay .color-rgb-row input:focus,.ph-config .form-input:focus,.ph-config .form-select:focus,.ph-config .ketime-control-trigger:focus,.ph-config .ketime-control-trigger[aria-expanded=true]{border-color:#2A8052;background:#FFFFFF;outline:none;box-shadow:none}
 #schedule-overlay input::placeholder,#schedule-overlay textarea::placeholder,#schedule-overlay .ketime-control-trigger.is-empty{color:#AAA69E;opacity:1}
 #schedule-overlay .ketime-control,.ph-config .ketime-control{border:0;border-radius:0;background:transparent;box-shadow:none}
 #schedule-overlay .schedule-date-row{grid-template-columns:minmax(0,1fr)}
 #schedule-overlay .schedule-time-pair{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 #schedule-overlay .schedule-time-pair .form-label{display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:12px;white-space:nowrap}
 #schedule-overlay .schedule-time-pair .time-clear{float:none;flex:none;margin:0;font-size:11px}
 #schedule-overlay .schedule-time-pair .ketime-control-trigger{padding-left:10px;padding-right:26px}
 #schedule-overlay .schedule-time-pair .ketime-control-trigger::after{right:10px}
 .project-scroll-buffer{width:100%;height:0;pointer-events:none}
 #schedule-overlay .modal-actions{flex:0 0 auto;margin:0;padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--border);z-index:2}
 #schedule-overlay #save-event{min-height:44px}
 #schedule-overlay #chips-editor{position:relative;min-height:56px;max-height:132px;overflow:auto;border:2px solid transparent;border-radius:12px;background:#FFFFFF;padding:6px 46px 6px 8px;gap:0}
 #schedule-overlay #chips-editor:focus-within{border-color:#2A8052;box-shadow:none}
 #schedule-overlay .chip-text{font-size:16px;color:#262623;min-width:12px;max-width:100%;min-height:36px;padding:6px 0;line-height:1.5;outline:none;box-shadow:none;border:0;background:transparent}
 #schedule-overlay .chip-text-empty-main:empty:before{content:'输入日程名称';color:#AAA69E}
 #schedule-overlay .ph-add{position:absolute;right:7px;top:10px;width:34px;height:34px;margin:0;padding:0;border:0;background:transparent;color:var(--schedule-secondary);font-size:18px}
 #schedule-overlay .ph-add:focus-visible{outline:none;background:var(--primary-soft);color:#2A8052}
 .schedule-name-help{font-size:12px;color:var(--schedule-secondary);margin-top:6px}
 .schedule-name-help summary{cursor:pointer;width:max-content}
 .schedule-name-help p{margin:6px 0;line-height:1.5}
 .timeline-range-preview{position:absolute;left:2px;right:2px;border:2px solid var(--primary);background:rgba(40,121,75,.22);border-radius:10px;pointer-events:none;z-index:16}
 .timeline-range-label{position:fixed;z-index:310;background:var(--primary);color:#fff;padding:4px 8px;border-radius:6px;font-size:13px;pointer-events:none;white-space:nowrap}
 #timeline-quick-create{position:fixed;z-index:320;width:300px;max-width:calc(100vw - 24px);padding:12px;background:var(--surface);color:var(--schedule-text);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-soft)}
 #timeline-quick-create[hidden],.timeline-range-label[hidden]{display:none}
 #timeline-quick-create h2{font-size:14px;margin-bottom:4px}
 #timeline-quick-range{font-size:12px;color:var(--schedule-secondary);margin-bottom:8px}
 #timeline-quick-name{width:100%;height:48px;border:2px solid transparent;border-radius:12px;padding:8px 10px;font-size:16px;color:#262623;background:#FFFFFF;outline:none;box-shadow:none}
 #timeline-quick-name:focus{border-color:#2A8052}
 .untimed-panel .untimed-add-row{height:auto;min-height:46px;grid-template-columns:22px minmax(0,1fr);background:transparent}
 .untimed-panel .untimed-item.untimed-editing{height:auto;min-height:46px}
 .untimed-panel .untimed-input,.untimed-panel .untimed-edit-input{min-width:0;width:100%;min-height:40px;border:2px solid transparent;border-radius:12px;background:#FFFFFF;color:#262623;padding:8px 10px;line-height:1.4;outline:none;box-shadow:none}
 .untimed-panel .untimed-input:focus,.untimed-panel .untimed-edit-input:focus{border-color:#2A8052}
 .untimed-panel .untimed-input::placeholder{color:#AAA69E;opacity:1}
 .timeline-quick-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
 .timeline-quick-actions button{min-height:44px}
 #timeline-quick-status{font-size:12px;color:var(--danger);margin-top:6px}
 #timeline-quick-status:empty{display:none}
 .timeline-selecting,.timeline-selecting *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
 @media(max-width:600px){#schedule-overlay .modal{max-height:calc(var(--timeline-viewport-height,100dvh) - 16px);padding-top:16px}#schedule-overlay .modal-title{padding:0 16px}.schedule-form-content{padding:0 16px 16px}#schedule-overlay .modal-actions{padding-left:16px;padding-right:16px}.untimed-panel .untimed-head{gap:6px}#inbox-toggle{font-size:15px}.untimed-panel .untimed-count{font-size:12px}}
 @media(max-width:300px){#schedule-overlay .schedule-time-pair{grid-template-columns:minmax(0,1fr)}}
 @media(prefers-reduced-motion:reduce){#view-schedule *,#schedule-overlay *,#timeline-quick-create *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
 `;document.head.appendChild(style);

 // Preserve the existing form fields and listeners while regrouping their containers.
 var overlay=document.getElementById('schedule-overlay'),modal=overlay.querySelector('.modal'),footer=modal.querySelector('.modal-actions');
 var content=document.createElement('div');content.className='schedule-form-content';
 var nameGroup=document.getElementById('chips-editor').parentElement,projectRow=document.getElementById('event-project').closest('.form-row'),link=document.getElementById('event-link-summary');
 var dates=document.getElementById('event-date').closest('.form-row'),hint=dates.nextElementSibling,repeat=document.getElementById('event-repeat').closest('.form-row'),repeatOptions=document.getElementById('event-repeat-options');
 var timePair=document.createElement('div');timePair.className='form-row schedule-time-pair';timePair.appendChild(document.getElementById('event-start').parentElement);timePair.appendChild(document.getElementById('event-end').parentElement);dates.classList.remove('three');dates.classList.add('schedule-date-row');
 function group(title,nodes){var section=document.createElement('section'),heading=document.createElement('h3');section.className='schedule-form-group';heading.textContent=title;section.appendChild(heading);nodes.forEach(function(node){section.appendChild(node)});content.appendChild(section)}
 group('基本信息',[nameGroup,projectRow,link]);group('时间',[dates,timePair,hint]);group('其他设置',[document.getElementById('event-location').parentElement,repeat,repeatOptions,document.getElementById('event-notes').parentElement,document.getElementById('event-color-presets').parentElement]);modal.insertBefore(content,footer);
 var explanation=nameGroup.querySelector('.form-hint'),help=document.createElement('details');help.className='schedule-name-help';help.innerHTML='<summary>ⓘ 数字占位符说明</summary><p>将光标放在名称的任意位置，点右侧 # 插入数字。可插入多个占位符，点击占位符可修改范围与格式。</p>';if(explanation)explanation.remove();nameGroup.appendChild(help);
 document.getElementById('chips-editor').addEventListener('click',function(event){if(event.target===event.currentTarget){var field=event.currentTarget.querySelector('.chip-text');if(field)field.focus()}});
 overlay.addEventListener('keydown',function(event){if(event.isComposing||event.keyCode===229)return;if(event.key==='Enter'&&!event.shiftKey&&(event.target.classList.contains('chip-text')||event.ctrlKey||event.metaKey)){event.preventDefault();document.getElementById('save-event').click()}});
 new MutationObserver(function(records){if(!overlay.classList.contains('visible'))return;var editing=document.getElementById('delete-event').style.display!=='none';document.getElementById('save-event').textContent=editing?'保存修改':'创建日程';content.scrollTop=0;}).observe(overlay,{attributes:true,attributeFilter:['class']});
 function keepInputVisible(event){if(overlay.classList.contains('visible')&&event.target.closest('.schedule-form-content'))requestAnimationFrame(function(){event.target.scrollIntoView({block:'nearest',inline:'nearest'})});}
 content.addEventListener('focusin',keepInputVisible);

 // Layout-only tail space: no new data or saved UI preference. Measure from the
 // list's actual end, excluding this spacer, so repeated layouts cannot grow it.
 var projectView=document.getElementById('view-projects'),projectList=document.getElementById('projects-list'),projectApp=projectView.querySelector('.project-app'),projectBuffer=document.createElement('div'),bufferFrame=null;
 projectBuffer.className='project-scroll-buffer';projectBuffer.setAttribute('aria-hidden','true');projectApp.appendChild(projectBuffer);
 function layoutProjectBuffer(){
   bufferFrame=null;if(!projectView.classList.contains('active'))return;
   var last=projectList.querySelector('.project-card:last-child');
   if(!last){projectBuffer.style.height='0px';return}
   var viewRect=projectView.getBoundingClientRect(),nav=document.querySelector('.app-nav'),bottomNav=document.querySelector('.android-bottom-nav');
   var internalScroll=/auto|scroll/.test(getComputedStyle(projectView).overflowY);
   var height=internalScroll?projectView.clientHeight:innerHeight-(nav?nav.getBoundingClientRect().height:0)-(bottomNav?bottomNav.getBoundingClientRect().height:0);
   var lastBottom=last.getBoundingClientRect().bottom-viewRect.top+(internalScroll?projectView.scrollTop:0);
   var baseEnd=projectBuffer.getBoundingClientRect().top-viewRect.top+(internalScroll?projectView.scrollTop:0)+(parseFloat(getComputedStyle(projectApp).paddingBottom)||0);
   var desired=Math.ceil(Math.max(0,Math.max(lastBottom,height)+height/3-baseEnd));
   if(projectBuffer.style.height!==desired+'px')projectBuffer.style.height=desired+'px';
   projectBuffer.dataset.viewportHeight=height.toFixed(2);projectBuffer.dataset.lastBottom=lastBottom.toFixed(2);
 }
 function queueProjectBuffer(){if(bufferFrame===null)bufferFrame=requestAnimationFrame(layoutProjectBuffer)}
 new MutationObserver(queueProjectBuffer).observe(projectList,{childList:true,subtree:true,characterData:true});
 new MutationObserver(queueProjectBuffer).observe(projectView,{attributes:true,attributeFilter:['class']});
 if(typeof ResizeObserver==='function'){var projectObserver=new ResizeObserver(queueProjectBuffer);projectObserver.observe(projectApp);projectObserver.observe(projectList)}
 window.addEventListener('resize',queueProjectBuffer);if(window.visualViewport)window.visualViewport.addEventListener('resize',queueProjectBuffer);
 if(document.fonts)document.fonts.ready.then(queueProjectBuffer);queueProjectBuffer();
 window.KetimeProjectBuffer={layout:queueProjectBuffer};

 // Session-only inbox expansion: no local data migration or persistent UI preference.
 var panel=document.querySelector('.untimed-panel'),head=panel.querySelector('.untimed-head'),heading=document.getElementById('untimed-title'),toggle=document.createElement('button'),expanded=false;
 toggle.type='button';toggle.id='inbox-toggle';toggle.innerHTML='待收纳<span class="inbox-chevron" aria-hidden="true">⌃</span>';toggle.setAttribute('aria-controls','untimed-content');heading.replaceChildren(toggle);panel.querySelector('.untimed-scroll').id='untimed-content';
 function expand(value){expanded=!!value;panel.classList.toggle('inbox-expanded',expanded);panel.classList.toggle('inbox-collapsed',!expanded);toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'折叠待收纳':'展开待收纳');}
 toggle.addEventListener('click',function(){expand(!expanded)});document.getElementById('add-untimed-todo').addEventListener('click',function(){expand(true)},true);expand(false);
 var inboxTouch=null;head.addEventListener('touchstart',function(event){if(event.target.closest('button,input')||event.touches.length!==1)return;inboxTouch={x:event.touches[0].clientX,y:event.touches[0].clientY};},{passive:true});head.addEventListener('touchend',function(event){if(!inboxTouch)return;var touch=event.changedTouches[0],dy=touch.clientY-inboxTouch.y,dx=touch.clientX-inboxTouch.x;inboxTouch=null;if(Math.abs(dx)<24&&Math.abs(dy)>24)expand(dy<0);},{passive:true});

 // Measure rendered fields, not character counts. Known-duration geometry and
 // occurrence state stay unchanged; marker visuals and conflicts use real size.
 var observedWidths=new WeakMap(),observedTargets=new Set(),cardObserver=typeof ResizeObserver==='function'?new ResizeObserver(function(entries){var changed=false;entries.forEach(function(entry){var width=entry.contentRect.width,previous=observedWidths.get(entry.target);observedWidths.set(entry.target,width);if(previous!==undefined&&Math.abs(previous-width)>.25)changed=true});if(changed&&window.KetimeTimelineLayout)window.KetimeTimelineLayout()}):null;
 function observeCard(element){if(cardObserver&&!observedTargets.has(element)){observedTargets.add(element);observedWidths.set(element,element.getBoundingClientRect().width);cardObserver.observe(element)}}
 function pixels(style,key){return parseFloat(style[key])||0}
 function capField(field,height){if(!field)return;field.style.maxHeight=Math.max(0,height)+'px';field.style.display=height>.1?'block':'none';field.style.webkitLineClamp='unset'}
 function measureFields(block){
   var marker=block.classList.contains('event-marker'),fixed=block.classList.contains('completion-fixed'),content=block.querySelector('.event-content,.marker-content'),layout=block.querySelector('.event-card-layout');
   if(!content||!layout||!block.clientWidth)return null;
   block.classList.toggle('event-compact',!marker&&block.clientHeight<96);
   if(marker){block.classList.add('marker-expanded');block.classList.remove('marker-detail-collides')}
   var style=getComputedStyle(block),row=block.querySelector('.event-completion-row'),title=content.querySelector('.event-title'),time=content.querySelector('.event-time'),location=content.querySelector('.event-location');
   var fields=[title,time,location].filter(Boolean),short=!marker&&block.clientHeight<64;
   fields.forEach(function(field){field.style.display='block';field.style.maxHeight='none';field.style.fontSize='';field.style.lineHeight='';field.style.marginTop='';field.style.webkitLineClamp='unset'});
   if(short){title.style.fontSize='11px';title.style.lineHeight='1.05';if(time){time.style.fontSize='8.5px';time.style.lineHeight='1.05';time.style.marginTop='0'}}
   var paddingTop=pixels(style,'paddingTop'),paddingBottom=pixels(style,'paddingBottom');
   layout.style.maxHeight='none';layout.style.paddingRight=short?'26px':'';
   if(fixed)block.style.setProperty('--completion-inset',Math.max(0,Math.min(6,(block.clientHeight-(short?18:20))/2))+'px');
   if(marker){observeCard(block);fields.forEach(observeCard);var natural=layout.getBoundingClientRect().height+paddingTop+paddingBottom;block.dataset.contentHeight=natural.toFixed(2);return natural}
   var available=Math.max(0,block.clientHeight-paddingTop-paddingBottom-(short?0:row.getBoundingClientRect().height+4));
   layout.style.maxHeight=available+'px';
   var timeNatural=time?time.getBoundingClientRect().height:0,timeStyle=time?getComputedStyle(time):null,timeMargin=time?pixels(timeStyle,'marginTop')+pixels(timeStyle,'marginBottom'):0;
   var titleLine=title?parseFloat(getComputedStyle(title).lineHeight):0;
   if(available<titleLine+timeNatural+timeMargin){
     // 15 minutes is only 24px. Keep true geometry, a readable summary and the
     // normal-flow completion row; overflow scrolls inside the existing card.
     capField(title,titleLine);if(location)capField(location,0);block.classList.add('event-content-scroll');observeCard(block);fields.forEach(observeCard);return null;
   }
   var timeReserve=Math.min(timeNatural+(time?timeMargin:0),Math.max(0,available-(title?parseFloat(getComputedStyle(title).lineHeight):0)));
   var titleNatural=title?title.getBoundingClientRect().height:0,titleBudget=Math.max(0,available-timeReserve);
   var titleHeight=Math.min(titleNatural,Math.floor((titleBudget+.1)/titleLine)*titleLine);if(!titleHeight)titleHeight=Math.min(titleNatural,titleBudget);
   capField(title,titleHeight);available=Math.max(0,available-(title?title.getBoundingClientRect().height:0));
   if(time){var timeBudget=Math.max(0,available-timeMargin),timeLine=parseFloat(timeStyle.lineHeight),timeHeight=Math.min(timeNatural,Math.floor((timeBudget+.1)/timeLine)*timeLine);if(!timeHeight)timeHeight=Math.min(timeNatural,timeBudget);capField(time,timeHeight);available=Math.max(0,available-time.getBoundingClientRect().height-(timeHeight?timeMargin:0))}
   if(location){var locationStyle=getComputedStyle(location),margin=pixels(locationStyle,'marginTop')+pixels(locationStyle,'marginBottom'),line=parseFloat(locationStyle.lineHeight),natural=location.getBoundingClientRect().height,budget=Math.max(0,available-margin),height=Math.min(natural,Math.floor((budget+.1)/line)*line);capField(location,height)}
   block.classList.toggle('event-content-scroll',layout.scrollHeight>available+.5);observeCard(block);fields.forEach(observeCard);return null;
 }
 function layoutCards(root){
   observedTargets.forEach(function(element){if(!element.isConnected){cardObserver.unobserve(element);observedTargets.delete(element);observedWidths.delete(element)}});
   for(var pass=0;pass<8;pass++){
     var heights=new Map(),markers=Array.from(root.querySelectorAll('.event-marker'));
     root.querySelectorAll('.event-block').forEach(function(block){var height=measureFields(block);if(height!==null){var key=block.dataset.eventId+'|'+block.dataset.occurrence;heights.set(key,Math.max(heights.get(key)||0,height))}});
     markers.forEach(function(block){var fade=block.querySelector('.marker-fade');if(!fade)return;var full=Math.min(api.hourHeight*24,heights.get(block.dataset.eventId+'|'+block.dataset.occurrence)||1),anchor=Number(block.dataset.markerAnchor),top=anchor-(block.classList.contains('marker-end-only')?full:0),visibleTop=Math.max(0,top),visibleBottom=Math.min(api.hourHeight*24,top+full),height=Math.max(0,visibleBottom-visibleTop),offset=visibleTop-top;
       block.style.top=visibleTop+'px';block.style.height=height+'px';block.dataset.markerFullHeight=full.toFixed(2);block.classList.toggle('event-content-scroll',height<full-.5);if(height<full-.5)block.querySelector('.event-card-layout').style.maxHeight=Math.max(0,height-16-(block.classList.contains('completion-fixed')?24:0))+'px';
       fade.style.maskSize=fade.style.webkitMaskSize='100% '+full.toFixed(2)+'px';fade.style.maskPosition=fade.style.webkitMaskPosition='0 '+(-offset).toFixed(2)+'px';fade.dataset.contentHeight=full.toFixed(2);
     });
     var changed=false;root.querySelectorAll('.day-col-overlay').forEach(function(column){var cards=Array.from(column.querySelectorAll('.event-block'));var plan=window.KetimeOverlap.plan(cards.map(function(card){return{start:parseFloat(card.style.top)/api.hourHeight*60,end:(parseFloat(card.style.top)+parseFloat(card.style.height))/api.hourHeight*60,identity:card.dataset.eventId+'|'+card.dataset.occurrence}}));
       cards.forEach(function(card,index){var item=plan[index],left=item.lanes>1?'calc('+(item.lane*100/item.lanes)+'% + 2px)':'4px',width=item.lanes>1?'calc('+(100/item.lanes)+'% - 4px)':'',right=item.lanes>1?'auto':'4px';if(card.style.width!==width||card.style.left!==left||card.style.right!==right){card.style.left=left;card.style.width=width;card.style.right=right;changed=true}
         card.classList.toggle('has-conflict',item.ranges.length>0);card.dataset.conflicts=JSON.stringify(item.ranges);var label=(card.getAttribute('aria-label')||'').replace(/，有时间重叠/g,'');card.setAttribute('aria-label',label+(item.ranges.length?'，有时间重叠':''));var bg=window.KetimeOverlap.background(item.ranges,parseFloat(card.style.top)/api.hourHeight*60,parseFloat(card.style.height)/api.hourHeight*60,card.classList.contains('event-marker')?undefined:getComputedStyle(card).getPropertyValue('--event-ink').trim());var fade=card.querySelector('.marker-fade');if(fade)fade.style.backgroundImage=bg;else card.style.backgroundImage=bg;
       });
     });if(!changed)break;
   }
 }
 window.KetimeCardTextLayout={layout:layoutCards};
 new MutationObserver(function(){if(window.KetimeTimelineLayout)window.KetimeTimelineLayout()}).observe(grid,{childList:true,subtree:true,characterData:true});
 if(document.fonts)document.fonts.ready.then(function(){if(window.KetimeTimelineLayout)window.KetimeTimelineLayout()});
 // Rebuild measured boundary segments when viewport/lane widths change; the
 // initial main render happened before this module installed its shared styles.
 var markerRenderFrame=null,lastGridWidth=0;
 function queueMarkerRender(){if(markerRenderFrame!==null)return;markerRenderFrame=requestAnimationFrame(function(){markerRenderFrame=null;if(document.getElementById('view-schedule').classList.contains('active')&&!(window.KetimeTimeline&&window.KetimeTimeline.hasDraft())&&!(window.KetimeTimelineScale&&window.KetimeTimelineScale.active))api.render()})}
 if(typeof ResizeObserver==='function')new ResizeObserver(function(entries){var width=entries[0].contentRect.width;if(width&&Math.abs(width-lastGridWidth)>.25){lastGridWidth=width;queueMarkerRender()}}).observe(grid);
 if(document.fonts)document.fonts.ready.then(queueMarkerRender);queueMarkerRender();
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
 function start(event,point,kind){if(draft||window.KetimeInboxDrag&&window.KetimeInboxDrag.busy()||!document.getElementById('view-schedule').classList.contains('active')||overlay.classList.contains('visible'))return;var cell=event.target.closest('.day-click-cell');if(!cell||event.target.closest('.event-block,.day-reminder-cell,button,input'))return;draft={date:cell.dataset.date,x:point.clientX,y:point.clientY,startX:point.clientX,startY:point.clientY,kind:kind,phase:'pending',pointerId:kind==='pointer'?event.pointerId:undefined,touchId:kind==='touch'?point.identifier:undefined};draft.anchor=Math.min(1425,minuteAt(point.clientY));timer=setTimeout(activate,350);}
 function move(event,point){if(!draft)return;if(draft.phase==='pending'){if(Math.hypot(point.clientX-draft.startX,point.clientY-draft.startY)>9){draft.moved=true;cancel()}return;}if(draft.phase==='selecting'){if(event.cancelable)event.preventDefault();update(point.clientY)}}
 function finish(event){if(!draft)return;if(draft.phase==='pending'){cancel();return;}if(draft.phase!=='selecting')return;if(event.cancelable)event.preventDefault();suppressClickUntil=performance.now()+600;draft.phase='editing';if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);scrollFrame=null;document.documentElement.classList.remove('timeline-selecting');label.hidden=true;quick.hidden=false;input.value='';status.textContent='';positionQuick();input.focus({preventScroll:true});}
 function cancel(){var inboxCancelled=window.KetimeInboxDrag&&window.KetimeInboxDrag.cancel();if(timer!==null)clearTimeout(timer);timer=null;if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);scrollFrame=null;var old=draft;draft=null;if(old&&old.preview)old.preview.remove();quick.hidden=true;label.hidden=true;document.documentElement.classList.remove('timeline-selecting');if(old&&(old.phase!=='pending'||old.moved))suppressClickUntil=performance.now()+600;return !!old||!!inboxCancelled;}
 window.KetimeTimeline={hasDraft:function(){return !!draft||!!(window.KetimeInboxDrag&&window.KetimeInboxDrag.busy())},isSelecting:function(){return !!draft&&draft.phase==='selecting'},cancel:cancel,expandInbox:expand};
 wrap.addEventListener('pointerdown',function(event){if(event.pointerType==='touch'||event.button!==0)return;start(event,event,'pointer')});
 document.addEventListener('pointermove',function(event){if(draft&&draft.kind==='pointer'&&draft.pointerId===event.pointerId)move(event,event)},{passive:false});document.addEventListener('pointerup',function(event){if(draft&&draft.kind==='pointer'&&draft.pointerId===event.pointerId)finish(event)});document.addEventListener('pointercancel',function(event){if(draft&&draft.kind==='pointer')cancel()});
 wrap.addEventListener('touchstart',function(event){if(event.touches.length!==1){cancel();return;}start(event,event.touches[0],'touch')},{passive:true});
 document.addEventListener('touchmove',function(event){if(!draft||draft.kind!=='touch')return;if(event.touches.length!==1){cancel();return;}var point=Array.from(event.touches).find(function(t){return t.identifier===draft.touchId});if(point)move(event,point)},{passive:false});document.addEventListener('touchend',function(event){if(draft&&draft.kind==='touch'&&Array.from(event.changedTouches).some(function(t){return t.identifier===draft.touchId}))finish(event)},{passive:false});document.addEventListener('touchcancel',function(){if(draft&&draft.kind==='touch')cancel()});
 wrap.addEventListener('click',function(event){if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);wrap.addEventListener('contextmenu',function(event){if(draft){event.preventDefault();event.stopImmediatePropagation()}},true);
 quick.addEventListener('submit',function(event){event.preventDefault();if(!draft||draft.phase!=='editing')return;try{api.quickCreate(draft.date,draft.start,draft.end,input.value);cancel()}catch(error){status.textContent=error.message;input.focus()}});document.getElementById('timeline-quick-cancel').addEventListener('click',cancel);
 document.addEventListener('keydown',function(event){if(event.key==='Escape'&&draft){event.preventDefault();event.stopImmediatePropagation();cancel()}},true);document.querySelectorAll('.view-tab').forEach(function(tab){tab.addEventListener('click',cancel,true)});document.getElementById('date-picker-btn').addEventListener('click',cancel,true);document.getElementById('add-event-btn').addEventListener('click',cancel,true);window.addEventListener('blur',function(){if(draft&&draft.phase!=='editing')cancel()});document.addEventListener('visibilitychange',function(){if(document.hidden)cancel()});
 function viewportChanged(){var viewport=window.visualViewport;document.documentElement.style.setProperty('--timeline-viewport-height',(viewport?viewport.height:innerHeight)+'px');document.documentElement.style.setProperty('--timeline-viewport-top',(viewport?viewport.offsetTop:0)+'px');positionQuick();if(overlay.classList.contains('visible')&&content.contains(document.activeElement))keepInputVisible({target:document.activeElement});}
 if(window.visualViewport){window.visualViewport.addEventListener('resize',viewportChanged);window.visualViewport.addEventListener('scroll',viewportChanged);}window.addEventListener('resize',viewportChanged);viewportChanged();wrap.addEventListener('scroll',function(){if(draft)draw()},{passive:true});
 function readableMarkers(){grid.querySelectorAll('.event-marker .event-title,.event-marker .event-location').forEach(function(field){if(field.querySelector('.marker-readable-copy'))return;var copy=document.createElement('span');copy.className='marker-readable-copy';copy.textContent=field.textContent;field.replaceChildren(copy)});}
 new MutationObserver(function(){readableMarkers();if(draft&&draft.phase!=='pending')draw()}).observe(grid,{childList:true});readableMarkers();
 wrap.addEventListener('scroll',function(){if(typeof window.KetimeTimelineLayout==='function')window.KetimeTimelineLayout()},{passive:true});

 // A local UI preference only. One scale drives both axes, never CSS page zoom.
 var scaleKey='ketime-timetable-scale-v1',scale=1,baseWidth=0,pinch=null,pinchFrame=null,pinchPending=null,blockedTouches=false,zoomGeneration=0,zoomReady=false;
 try{var savedScale=Number(localStorage.getItem(scaleKey));if(Number.isFinite(savedScale)&&savedScale>=.75&&savedScale<=1.75)scale=savedScale}catch(ignore){}
 function saveScale(){try{localStorage.setItem(scaleKey,String(scale))}catch(ignore){}}
 function zoomPoint(){var b=visibleBounds();return{x:(b.left+(window.KetimeAndroid?42:56)+b.right)/2,y:(b.top+b.bottom)/2}}
 function zoomWorld(point){var first=grid.querySelector('.day-col-overlay');if(!first)return null;var r=first.getBoundingClientRect();return{x:(point.x-r.left)/r.width,y:(point.y-r.top)/api.hourHeight}}
 function alignZoom(point,world){var first=grid.querySelector('.day-col-overlay');if(!first||!world)return;var r=first.getBoundingClientRect();wrap.scrollLeft+=r.left+world.x*r.width-point.x;wrap.scrollTop+=r.top+world.y*api.hourHeight-point.y;}
 function applyScale(value,point,world,persist){
   if(!wrap.clientWidth)return;value=Math.max(.75,Math.min(1.75,Number(value)));if(!Number.isFinite(value))return;
   point=point||zoomPoint();world=zoomReady?(world||zoomWorld(point)):null;scale=value;
   var gutter=window.KetimeAndroid?42:56,count=window.KetimeAndroid?21:7;
   baseWidth=window.KetimeAndroid?(wrap.clientWidth-gutter)/3:(Math.max(820,wrap.clientWidth)-gutter)/7;
   var width=baseWidth*scale;grid.style.gridTemplateColumns=gutter+'px repeat('+count+','+width+'px)';grid.style.width=(gutter+count*width)+'px';grid.style.minWidth='0';
   var reminderSize=grid.style.getPropertyValue('--reminder-height'),generation=++zoomGeneration,ratio=96*scale/api.hourHeight;
   api.setScale(scale);
   if(pinch||blockedTouches){
     // Touch targets must stay connected until both fingers lift. Replacing the
     // grid here would swallow the rest of that native touch sequence.
     grid.querySelectorAll('.event-block,.now-line').forEach(function(block){block.style.top=parseFloat(block.style.top)*ratio+'px';if(block.classList.contains('event-marker'))block.dataset.markerAnchor=Number(block.dataset.markerAnchor)*ratio;else if(block.classList.contains('event-block'))block.style.height=parseFloat(block.style.height)*ratio+'px'});
     if(window.KetimeCardTextLayout)window.KetimeCardTextLayout.layout(grid);if(window.KetimeTimelineLayout)window.KetimeTimelineLayout();
   }else api.render();
   if(reminderSize)grid.style.setProperty('--reminder-height',reminderSize);alignZoom(point,world);
   requestAnimationFrame(function(){if(generation===zoomGeneration)alignZoom(point,world);requestAnimationFrame(function(){if(generation===zoomGeneration)alignZoom(point,world)})});zoomReady=true;if(persist)saveScale();
 }
 window.KetimeTimelineScale={get value(){return scale},get active(){return !!pinch||blockedTouches},get baseDayWidth(){return baseWidth},set:function(value,point){applyScale(value,point,null,true)},resize:function(){var next=window.KetimeAndroid?(wrap.clientWidth-42)/3:(Math.max(820,wrap.clientWidth)-56)/7;if(next>0&&Math.abs(next-baseWidth)>.1)applyScale(scale,null,null,false)}};
 function zoomAllowed(point){var b=visibleBounds(),target=document.elementFromPoint(point.clientX,point.clientY);return target&&wrap.contains(target)&&quick.hidden&&document.getElementById('view-schedule').classList.contains('active')&&!overlay.classList.contains('visible')&&point.clientX>b.left+(window.KetimeAndroid?42:56)&&point.clientX<b.right&&point.clientY>b.top&&point.clientY<b.bottom}
 function geometry(touches){return{x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2,distance:Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY)}}
 function eatGesture(event){if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=performance.now()+800}
 function flushPinch(){pinchFrame=null;if(!pinch||!pinchPending)return;var current=pinchPending;pinchPending=null;applyScale(pinch.scale*current.distance/pinch.distance,{x:current.x,y:current.y},pinch.world,false)}
 document.addEventListener('touchstart',function(event){
   if(blockedTouches){eatGesture(event);return}
   if(event.touches.length!==2||!Array.from(event.touches).every(zoomAllowed))return;
   cancel();var g=geometry(event.touches);if(g.distance<1)return;
   pinch={distance:g.distance,scale:scale,world:zoomWorld(g)};eatGesture(event);
 },{capture:true,passive:false});
 document.addEventListener('touchmove',function(event){
   if(blockedTouches){eatGesture(event);return}if(!pinch)return;eatGesture(event);
   if(event.touches.length!==2)return;pinchPending=geometry(event.touches);if(pinchFrame===null)pinchFrame=requestAnimationFrame(flushPinch);
 },{capture:true,passive:false});
 function endPinch(event){
   if(!pinch&&!blockedTouches)return;eatGesture(event);
   if(pinch&&event.touches.length<2){if(pinchFrame!==null)cancelAnimationFrame(pinchFrame);flushPinch();pinch=null;pinchPending=null;saveScale();blockedTouches=event.touches.length>0}
   if(!event.touches.length){blockedTouches=false;applyScale(scale,null,null,false);wrap.dispatchEvent(new Event('scroll'))}
 }
 document.addEventListener('touchend',endPinch,{capture:true,passive:false});document.addEventListener('touchcancel',endPinch,{capture:true,passive:false});
 function resetPinch(){if(pinchFrame!==null)cancelAnimationFrame(pinchFrame);pinchFrame=null;pinchPending=null;pinch=null;blockedTouches=false;saveScale()}
 document.addEventListener('visibilitychange',function(){if(document.hidden)resetPinch()});window.addEventListener('blur',resetPinch);document.querySelectorAll('.view-tab').forEach(function(tab){tab.addEventListener('click',resetPinch,true)});
 applyScale(scale,null,null,false);new ResizeObserver(function(){window.KetimeTimelineScale.resize()}).observe(wrap);
})();

// Inbox-to-timeline gestures share the existing event renderer and transaction.
(function(){
 'use strict';
 var api=window.KetimeTimelineAPI,grid=document.getElementById('schedule-grid'),wrap=document.getElementById('schedule-wrap'),panel=document.querySelector('.untimed-panel');
 if(!api||!api.inboxItem||!grid||!wrap||!panel)return;
 var drag=null,editor=null,hold=null,scrollFrame=null,suppressUntil=0,lastTap=null;
 var style=document.createElement('style');style.textContent=`
 .untimed-item.inbox-lifted{opacity:.35}
 .inbox-drag-ghost{position:fixed;z-index:15000;max-width:200px;padding:10px 14px;border:1.5px solid var(--primary);border-radius:12px;background:#fff;color:var(--text);font-size:14px;line-height:1.4;pointer-events:none;overflow-wrap:anywhere}
 .inbox-drop-preview{padding:4px;overflow:hidden;font-size:12px;color:var(--primary)}
 #schedule-grid .inbox-drop-active{outline:2px solid var(--primary);outline-offset:1px;touch-action:none}
 .inbox-duration-handle{position:absolute;bottom:2px;left:calc(50% - 16px);width:32px;height:8px;border:0;padding:0;border-radius:4px;background:var(--primary);z-index:6;touch-action:none}
 #inbox-drop-tools{position:fixed;z-index:330;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 16px);padding:6px 10px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--text-2);font-size:12px;line-height:1.4}
 #inbox-drop-tools[hidden]{display:none}#inbox-drop-tools button{min-height:36px;flex:none;padding:4px 10px}
 `;document.head.appendChild(style);
 var ghost=document.createElement('div');ghost.className='inbox-drag-ghost';ghost.hidden=true;document.body.appendChild(ghost);
 var tools=document.createElement('div');tools.id='inbox-drop-tools';tools.hidden=true;tools.innerHTML='<span>拖动色块设结束 · 双击变无尾</span><button type="button" class="btn btn-primary">完成</button>';document.body.appendChild(tools);
 tools.querySelector('button').addEventListener('click',finishEditor);
 function bounds(){var r=wrap.getBoundingClientRect(),h=grid.querySelector('.day-header-cell'),m=grid.querySelector('.day-reminder-cell');return{left:r.left+(window.KetimeAndroid?42:56),right:r.right,top:r.top+(h?h.getBoundingClientRect().height:0)+(m?m.getBoundingClientRect().height:0),bottom:r.bottom}}
 function column(date){return Array.from(grid.querySelectorAll('.day-col-overlay')).find(function(c){return c.dataset.date===date})}
 function offsetAt(c,y){return Math.max(0,Math.min(1440,Math.round((y-c.getBoundingClientRect().top)/api.hourHeight*60/15)*15))}
 function hit(x,y){var b=bounds();if(x<b.left||x>b.right||y<b.top||y>b.bottom)return null;var c=Array.from(grid.querySelectorAll('.day-col-overlay')).find(function(c){var r=c.getBoundingClientRect();return x>=r.left&&x<r.right});return c?{date:c.dataset.date,start:Math.min(1425,offsetAt(c,y))}:null}
 function preview(date,start,end){var c=column(date);if(!c)return;var node=drag.preview;if(!node){node=document.createElement('div');node.className='timeline-range-preview inbox-drop-preview';drag.preview=node}if(node.parentNode!==c)c.appendChild(node);node.style.top=start/60*api.hourHeight+'px';node.style.height=Math.max(15,end-start)/60*api.hourHeight+'px';node.textContent='';}
 function draw(){if(!drag||drag.phase==='pending'||drag.phase==='resize-pending')return;ghost.style.left=Math.max(8,Math.min(innerWidth-ghost.offsetWidth-8,drag.x+12))+'px';ghost.style.top=Math.max(8,Math.min(innerHeight-ghost.offsetHeight-8,drag.y-ghost.offsetHeight-16))+'px';
  if(drag.phase==='dragging'){drag.target=hit(drag.x,drag.y);if(drag.target)preview(drag.target.date,drag.target.start,drag.target.start+15);else if(drag.preview){drag.preview.remove();drag.preview=null}}
  else if(drag.phase==='resizing'&&editor){var c=column(editor.date);if(c){drag.end=Math.max(editor.start+15,offsetAt(c,drag.y));preview(editor.date,editor.start,drag.end)}}
 }
 function scrollTick(){scrollFrame=null;if(!drag||!['dragging','resizing'].includes(drag.phase))return;var b=bounds();if(drag.x>=b.left&&drag.x<=b.right&&drag.y>=b.top-24&&drag.y<=b.bottom+24){var dy=drag.y<b.top+32?-3:drag.y>b.bottom-32?3:0,dx=drag.phase==='dragging'?(drag.x<b.left+24?-3:drag.x>b.right-24?3:0):0;wrap.scrollTop+=dy;wrap.scrollLeft+=dx;if(dx||dy)draw()}scrollFrame=requestAnimationFrame(scrollTick)}
 function cleanupDrag(){clearTimeout(hold);hold=null;if(scrollFrame!==null)cancelAnimationFrame(scrollFrame);scrollFrame=null;if(drag&&drag.row)drag.row.classList.remove('inbox-lifted');if(drag&&drag.preview)drag.preview.remove();ghost.hidden=true;document.documentElement.classList.remove('timeline-selecting');drag=null;}
 function finishEditor(){var had=!!editor;editor=null;lastTap=null;tools.hidden=true;grid.querySelectorAll('.inbox-drop-active').forEach(function(c){c.classList.remove('inbox-drop-active');c.querySelectorAll('.inbox-duration-handle').forEach(function(n){n.remove()})});return had}
 function cancel(){var had=!!drag||!!editor;if(drag&&drag.phase!=='pending')suppressUntil=performance.now()+700;cleanupDrag();finishEditor();return had}
 window.KetimeInboxDrag={busy:function(){return !!drag||!!editor},cancel:cancel};
 function decorate(){if(!editor)return;var c=Array.from(grid.querySelectorAll('.event-block')).find(function(c){return c.dataset.eventId===editor.id});if(!c){finishEditor();return}c.classList.add('inbox-drop-active');if(!c.querySelector('.inbox-duration-handle')){var handle=document.createElement('button');handle.type='button';handle.className='inbox-duration-handle';handle.setAttribute('aria-label','拖动调整结束时间，双击改为无尾日程');c.appendChild(handle)}var b=bounds();tools.hidden=false;tools.style.left=Math.max(8,b.left)+'px';tools.style.top=Math.max(8,b.top+4)+'px';}
 function activate(){hold=null;if(!drag||drag.phase!=='pending')return;drag.phase='dragging';drag.row.classList.add('inbox-lifted');document.documentElement.classList.add('timeline-selecting');ghost.textContent=drag.item.name;ghost.hidden=false;try{if(window.KetimeNative&&window.__ketimeAndroidToken)window.KetimeNative.haptic(window.__ketimeAndroidToken)}catch(_){}draw();scrollFrame=requestAnimationFrame(scrollTick)}
 function start(event,p,kind){
  if(!document.getElementById('view-schedule').classList.contains('active')||document.querySelector('.overlay.visible')||window.KetimeTimelineScale&&window.KetimeTimelineScale.active)return;
  var row=event.target.closest('.untimed-item'),card=event.target.closest('.inbox-drop-active');
  if(card&&editor&&!event.target.closest('.event-check')){drag={phase:'resize-pending',kind:kind,pointerId:event.pointerId,touchId:p.identifier,startX:p.clientX,startY:p.clientY,x:p.clientX,y:p.clientY};return}
  if(!row||event.target.closest('.untimed-toggle,.untimed-delete,.inbox-organize,input,textarea'))return;var item=api.inboxItem(row.dataset.todoId);if(!item)return;
  finishEditor();drag={phase:'pending',kind:kind,pointerId:event.pointerId,touchId:p.identifier,startX:p.clientX,startY:p.clientY,x:p.clientX,y:p.clientY,row:row,item:item};hold=setTimeout(activate,350);
 }
 function move(event,p){if(!drag)return;drag.x=p.clientX;drag.y=p.clientY;var distance=Math.hypot(drag.x-drag.startX,drag.y-drag.startY);
  if(drag.phase==='pending'){if(distance>9)cleanupDrag();return}
  if(drag.phase==='resize-pending'){if(distance<7)return;drag.phase='resizing';document.documentElement.classList.add('timeline-selecting');scrollFrame=requestAnimationFrame(scrollTick)}
  if(event.cancelable)event.preventDefault();event.stopPropagation();draw();
 }
 function noTail(){if(!editor)return;try{api.setDroppedEnd(editor.id,editor.date,editor.start,null);finishEditor();api.notify('已改为无尾日程')}catch(e){api.notify(e.message);decorate()}}
 function finish(event){if(!drag)return;var current=drag;if(current.phase==='pending'){cleanupDrag();return}if(event.cancelable)event.preventDefault();event.stopPropagation();suppressUntil=performance.now()+700;
  if(current.phase==='resize-pending'){cleanupDrag();var now=performance.now();if(lastTap&&now-lastTap.time<360&&Math.hypot(current.x-lastTap.x,current.y-lastTap.y)<24){lastTap=null;noTail()}else lastTap={time:now,x:current.x,y:current.y};return}
  if(current.phase==='resizing'){var edit=editor,end=current.end;cleanupDrag();lastTap=null;try{if(edit&&Number.isInteger(end))api.setDroppedEnd(edit.id,edit.date,edit.start,end);decorate()}catch(e){api.notify(e.message);decorate()}return}
  var target=current.target,item=current.item;cleanupDrag();if(!target){api.notify('未放入日程表，事项仍在待收纳');return}
  try{var eventData=api.quickCreate(target.date,target.start,target.start+15,item.name,item.id);editor={id:eventData.id,date:target.date,start:target.start};decorate();api.notify('已放入日程表：拖动色块设结束，双击变为无尾日程')}catch(e){api.notify(e.message)}
 }
 document.addEventListener('pointerdown',function(e){if(e.pointerType==='touch'||e.button!==0)return;if(drag)return;start(e,e,'pointer')},true);
 document.addEventListener('pointermove',function(e){if(drag&&drag.kind==='pointer'&&drag.pointerId===e.pointerId)move(e,e)},{capture:true,passive:false});
 document.addEventListener('pointerup',function(e){if(drag&&drag.kind==='pointer'&&drag.pointerId===e.pointerId)finish(e)},{capture:true,passive:false});
 document.addEventListener('pointercancel',function(){if(drag&&drag.kind==='pointer')cancel()},true);
 document.addEventListener('touchstart',function(e){if(e.touches.length!==1){if(drag||editor)cancel();return}if(!drag)start(e,e.touches[0],'touch')},{capture:true,passive:true});
 document.addEventListener('touchmove',function(e){if(!drag||drag.kind!=='touch')return;if(e.touches.length!==1){cancel();return}var p=Array.from(e.touches).find(function(t){return t.identifier===drag.touchId});if(p)move(e,p)},{capture:true,passive:false});
 document.addEventListener('touchend',function(e){if(drag&&drag.kind==='touch'&&Array.from(e.changedTouches).some(function(t){return t.identifier===drag.touchId}))finish(e)},{capture:true,passive:false});
 document.addEventListener('touchcancel',function(){if(drag)cancel()},{capture:true,passive:true});
 document.addEventListener('click',function(e){if(performance.now()<suppressUntil&&(wrap.contains(e.target)||panel.contains(e.target))){e.preventDefault();e.stopImmediatePropagation();return}if(editor){if(e.target.closest('.inbox-drop-active')&&!e.target.closest('.event-check')){e.preventDefault();e.stopImmediatePropagation()}else if(!tools.contains(e.target))finishEditor()}},true);
 document.addEventListener('dblclick',function(e){if(editor&&e.target.closest('.inbox-drop-active')&&!e.target.closest('.event-check')){e.preventDefault();e.stopImmediatePropagation();noTail()}},true);
 panel.addEventListener('contextmenu',function(e){if(drag){e.preventDefault();e.stopPropagation()}});
 panel.addEventListener('dragstart',function(e){e.preventDefault()});
 document.addEventListener('visibilitychange',function(){if(document.hidden)cancel()});window.addEventListener('blur',cancel);window.addEventListener('resize',function(){if(drag)cancel();else decorate()});wrap.addEventListener('scroll',function(){if(drag)draw();if(editor)decorate()},{passive:true});
 new MutationObserver(function(){if(editor)decorate()}).observe(grid,{childList:true});
})();
