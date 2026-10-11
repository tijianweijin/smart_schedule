(function(){
 'use strict';
 function nativeCall(method,args){if(!window.KetimeNative||!window.__ketimeAndroidToken)throw Error('Android 功能尚未就绪，请稍后重试。');window.KetimeNative[method].apply(window.KetimeNative,[window.__ketimeAndroidToken].concat(args));}
 window.KetimeAndroid={
  openAuth:function(url){nativeCall('openAuth',[url]);},
  exportBackup:function(json,name){nativeCall('exportBackup',[json,name]);},
  back:function(){
   if(window.KetimeAndroidControls&&window.KetimeAndroidControls.close())return true;
   if(window.KetimeTimeline&&window.KetimeTimeline.cancel())return true;
   var overlays=Array.from(document.querySelectorAll('.overlay.visible')).reverse();
   if(overlays.length){var overlay=overlays[0],cancel=Array.from(overlay.querySelectorAll('button')).find(function(b){return /取消|关闭|返回日程/.test(b.textContent)&&!b.disabled&&b.getClientRects().length;});if(cancel)cancel.click();else overlay.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;}
   var assistant=document.getElementById('schedule-assistant');if(assistant&&!assistant.hidden){document.getElementById('assistant-close').click();return true;}
   var pop=document.querySelector('.context-menu.visible,.calendar-popup.visible');if(pop){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));pop.classList.remove('visible');return true;}
   var settingsView=document.getElementById('view-settings');if(settingsView&&settingsView.classList.contains('active')&&window.KetimeAccount){window.KetimeAccount.close();return true;}
   return false;
  }
 };
 document.title='刻时 Android 1.0';
 var tabs=document.querySelector('.view-tabs'),addEvent=document.getElementById('add-event-btn'),settingsButton=document.getElementById('settings-btn');
 if(tabs){
  tabs.classList.add('android-bottom-nav');
  var scheduleTab=tabs.querySelector('[data-view="schedule"]'),leftTabs=document.createElement('div'),rightTabs=document.createElement('div');leftTabs.className='android-nav-left';rightTabs.className='android-nav-right';
  if(settingsButton){settingsButton.textContent='设置';settingsButton.classList.add('android-nav-settings','view-tab');settingsButton.dataset.view='settings';leftTabs.appendChild(settingsButton);}
  ['projects','growth'].forEach(function(view){var tab=tabs.querySelector('[data-view="'+view+'"]');if(tab)rightTabs.appendChild(tab);});
  if(scheduleTab)leftTabs.appendChild(scheduleTab);tabs.appendChild(leftTabs);
  if(addEvent){
   addEvent.classList.add('android-add-event');addEvent.type='button';addEvent.setAttribute('aria-label','添加日程');
   var addLabel=addEvent.querySelector('.label');if(addLabel)addLabel.remove();
   addEvent.querySelector('span').setAttribute('aria-hidden','true');tabs.appendChild(addEvent);
   addEvent.addEventListener('click',function(){var assistant=document.getElementById('schedule-assistant');if(assistant&&!assistant.hidden)document.getElementById('assistant-close').click();if(scheduleTab)scheduleTab.click();},true);
  }
  tabs.appendChild(rightTabs);document.body.appendChild(tabs);
  var topNav=document.querySelector('.app-nav');if(topNav)topNav.remove();
 }
 var settingsBox=document.getElementById('settings-overlay'),settingsOrigin='schedule',leavingSettings=false;
 if(settingsBox&&settingsButton){
  var settingsView=document.createElement('section');settingsView.id='view-settings';settingsView.className='view';settingsView.setAttribute('aria-label','设置');
  settingsBox.classList.remove('overlay');settingsBox.classList.add('settings-page');var settingsContent=settingsBox.querySelector('.modal');
  if(settingsContent){settingsContent.setAttribute('role','region');settingsContent.removeAttribute('aria-modal');}
  settingsView.appendChild(settingsBox);document.querySelector('main').appendChild(settingsView);
  var settingsFirstVisit=true,settingsScroll=0,actions=settingsContent.querySelector('.modal-actions');
  function settingsGroup(id,title,elements){var details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('div');details.id=id;details.className='android-settings-section';summary.textContent=title;content.className='android-settings-content';settingsContent.insertBefore(details,elements[0]);elements.forEach(function(element){if(element)content.appendChild(element)});details.append(summary,content);return details;}
  var accountNote=settingsContent.querySelector(':scope>.bupt-note'),accountGroup=settingsGroup('settings-account-section','账号信息',[accountNote,document.getElementById('settings-local-hint'),document.getElementById('settings-form'),document.getElementById('settings-status')]);
  var holidayButton=document.getElementById('settings-holidays'),holidayGroup=settingsGroup('settings-holiday-section','节假日与调休',[holidayButton,holidayButton.nextElementSibling]),holidayEditor=document.getElementById('holiday-overlay');
  if(holidayEditor){holidayEditor.classList.remove('overlay','visible');holidayEditor.classList.add('holiday-inline');var holidayModal=holidayEditor.querySelector('.modal');holidayModal.classList.remove('modal');holidayModal.classList.add('holiday-editor');holidayModal.setAttribute('role','region');holidayModal.removeAttribute('aria-modal');holidayGroup.querySelector('.android-settings-content').prepend(holidayEditor);document.getElementById('holiday-cancel').textContent='重置未保存修改';window.KetimeSchoolUI.prepareInlineHolidays();}
  holidayButton.remove();
  var important=settingsContent.querySelector('.important-days-settings'),importantGroup=null;
  if(important){importantGroup=settingsGroup('settings-important-section','重要日',[important]);var heading=important.querySelector('h3');if(heading)heading.remove();}
  [accountGroup,holidayGroup,importantGroup,document.getElementById('chatgpt-panel'),settingsContent.querySelector('.bupt-backup'),document.getElementById('settings-data-privacy')].forEach(function(section){if(section){section.classList.add('android-settings-section');if(!section.querySelector(':scope>.android-settings-content')){var content=document.createElement('div');content.className='android-settings-content';Array.from(section.childNodes).forEach(function(node){if(node.nodeType!==1||node.tagName!=='SUMMARY')content.appendChild(node)});section.appendChild(content);}settingsContent.insertBefore(section,actions);}});
  window.KetimeAndroid.settingsPage={
   show:function(){
    if(window.KetimeSchoolUI.prepareInlineHolidays)window.KetimeSchoolUI.prepareInlineHolidays();
    if(settingsFirstVisit){settingsContent.querySelectorAll('details').forEach(function(section){section.open=false});settingsFirstVisit=false;settingsScroll=0;}
    if(!settingsView.classList.contains('active')){var current=document.querySelector('.view.active');settingsOrigin=current&&current.id.replace('view-','')||'schedule';}
    var assistant=document.getElementById('schedule-assistant');if(assistant&&!assistant.hidden)document.getElementById('assistant-close').click();
    document.querySelectorAll('.view').forEach(function(view){view.classList.toggle('active',view===settingsView);});
    document.querySelectorAll('.view-tab').forEach(function(tab){tab.classList.toggle('active',tab===settingsButton);});
    requestAnimationFrame(function(){settingsView.scrollTop=settingsScroll});
   },
   hide:function(){settingsScroll=settingsView.scrollTop;settingsView.classList.remove('active');settingsButton.classList.remove('active');if(!leavingSettings){var target=document.querySelector('.view-tab[data-view="'+settingsOrigin+'"]')||document.querySelector('.view-tab[data-view="schedule"]');if(target){target.click();target.focus();}}}
  };
  document.querySelectorAll('.view-tab:not([data-view="settings"])').forEach(function(tab){tab.addEventListener('click',function(){if(settingsView.classList.contains('active')){leavingSettings=true;window.KetimeAccount.close();leavingSettings=false;}},true);});
 }
 var quickRecord=document.getElementById('add-untimed-todo');if(quickRecord){quickRecord.textContent='＋';quickRecord.setAttribute('aria-label','快速记录待收纳事项');quickRecord.title='快速记录';}
 var calendarButton=document.getElementById('date-picker-btn'),calendarMonthLabel=null,lastCalendarRange='',pickedCalendarDate='';
 if(calendarButton){calendarButton.setAttribute('aria-label','选择日期');calendarButton.title='选择日期';var calendarIcon=calendarButton.querySelector('.calendar-icon');if(calendarIcon)calendarIcon.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2"/></svg>';}
 if(calendarButton){calendarMonthLabel=document.createElement('span');calendarMonthLabel.className='android-calendar-month';calendarButton.appendChild(calendarMonthLabel);}
 var dayStartLabel=document.querySelector('.daystart-group>span');if(dayStartLabel){dayStartLabel.textContent='每日起始自';dayStartLabel.classList.add('android-daystart-label');}
 var calendarDays=document.getElementById('calendar-days');if(calendarDays)calendarDays.addEventListener('click',function(e){var day=e.target.closest('.calendar-day');if(day){pickedCalendarDate=day.dataset.date||'';positionDate=pickedCalendarDate;centerDatePending=true;timePositionPending=true;queueDatePosition();}},true);
 var scheduleGrid=document.getElementById('schedule-grid');
 function updateCalendarMonth(){
  if(!calendarMonthLabel)return;var range=document.getElementById('week-range-label').textContent;
  if(!pickedCalendarDate&&range===lastCalendarRange&&calendarMonthLabel.textContent)return;
  var date=pickedCalendarDate;pickedCalendarDate='';
  if(!date){var today=scheduleGrid.querySelector('.day-header-cell.today');if(today){var index=Number(today.style.gridColumn)-2,columns=scheduleGrid.querySelectorAll('.day-col-overlay');if(columns[index])date=columns[index].dataset.date;}}
  var match=date&&date.match(/^(\d{4})-(\d{2})-/)||range.match(/(\d{4})年(\d+)月/);
  if(match)calendarMonthLabel.textContent=match[1]+'年'+Number(match[2])+'月';lastCalendarRange=range;
 }
 function compactDateHeaders(){if(!scheduleGrid)return;updateCalendarMonth();scheduleGrid.querySelectorAll('.day-header-cell').forEach(function(head){var month=head.querySelector('.day-date-label'),number=head.querySelector('.day-num'),weekday=head.querySelector('.day-name');if(month&&number&&weekday){head.replaceChildren(month,number,weekday);head.setAttribute('aria-label',month.textContent+number.textContent+'日 '+weekday.textContent);}});}
 if(scheduleGrid){new MutationObserver(compactDateHeaders).observe(scheduleGrid,{childList:true});compactDateHeaders();}
 var scheduleWrap=document.getElementById('schedule-wrap'),positionDate='',centerDatePending=true,timePositionPending=true,positionFrame=null;
 var selectedCalendarDate='',calendarSelectionFrame=null;
 function updateCalendarSelection(){
  calendarSelectionFrame=null;
  if(scheduleWrap&&scheduleWrap.clientWidth&&scheduleGrid){
   var rect=scheduleWrap.getBoundingClientRect(),middle=rect.left+scheduleWrap.clientWidth/2;
   var head=Array.from(scheduleGrid.querySelectorAll('.day-header-cell')).find(function(cell){var bounds=cell.getBoundingClientRect();return bounds.left<=middle&&bounds.right>middle;});
   if(head){var column=Array.from(scheduleGrid.querySelectorAll('.day-col-overlay')).find(function(cell){return cell.style.gridColumn===head.style.gridColumn;});if(column)selectedCalendarDate=column.dataset.date;}
  }
  if(selectedCalendarDate){window.KetimeAndroid.selectedScheduleDate=selectedCalendarDate;var parts=selectedCalendarDate.split('-');if(calendarMonthLabel)calendarMonthLabel.textContent=parts[0]+'年'+Number(parts[1])+'月';}
  if(calendarDays)calendarDays.querySelectorAll('.calendar-day').forEach(function(day){var selected=day.dataset.date===selectedCalendarDate;day.classList.toggle('android-calendar-selected',selected);day.setAttribute('aria-pressed',String(selected));});
 }
 function queueCalendarSelection(){if(calendarSelectionFrame===null)calendarSelectionFrame=requestAnimationFrame(updateCalendarSelection);}
 if(calendarDays)new MutationObserver(queueCalendarSelection).observe(calendarDays,{childList:true});
 if(scheduleGrid)new MutationObserver(queueCalendarSelection).observe(scheduleGrid,{childList:true});
 if(scheduleWrap)scheduleWrap.addEventListener('scroll',queueCalendarSelection,{passive:true});
 // Keep three weeks in memory and compensate for the replaced week in pixels.
 var cacheFrame=null,shiftingCache=false;
 function queueWeekCache(){if(cacheFrame===null)cacheFrame=requestAnimationFrame(extendWeekCache);}
 function extendWeekCache(){
  cacheFrame=null;
  if(shiftingCache||centerDatePending||timePositionPending||!scheduleWrap||!scheduleWrap.clientWidth||!document.getElementById('view-schedule').classList.contains('active')||!window.__ketimeDemo||window.KetimeTimeline&&window.KetimeTimeline.hasDraft())return;
  var width=(scheduleWrap.clientWidth-42)/3,remaining=scheduleWrap.scrollWidth-scheduleWrap.clientWidth-scheduleWrap.scrollLeft;
  var direction=scheduleWrap.scrollLeft<width*3?-1:remaining<width*3?1:0;if(!direction)return;
  var left=scheduleWrap.scrollLeft,top=scheduleWrap.scrollTop;
  shiftingCache=true;
  if(window.__ketimeDemo.shiftScheduleWeek(direction)){scheduleWrap.scrollLeft=left-direction*7*width;scheduleWrap.scrollTop=top;}
  shiftingCache=false;queueCalendarSelection();
 }
 if(scheduleWrap)scheduleWrap.addEventListener('scroll',queueWeekCache,{passive:true});
 if(calendarButton)calendarButton.addEventListener('click',queueCalendarSelection);
 function queueDatePosition(){
  if(positionFrame!==null)return;
  positionFrame=requestAnimationFrame(function(){
   positionFrame=null;
   if((!centerDatePending&&!timePositionPending)||!scheduleWrap||!scheduleWrap.clientWidth)return;
   var today=scheduleGrid.querySelector('.day-header-cell.today'),focusDay=today,center=centerDatePending,positionTime=timePositionPending;
   if(positionDate){var column=scheduleGrid.querySelector('.day-col-overlay[data-date="'+positionDate+'"]');focusDay=column&&Array.from(scheduleGrid.querySelectorAll('.day-header-cell')).find(function(head){return head.style.gridColumn===column.style.gridColumn;});}
   centerDatePending=false;timePositionPending=false;if(!focusDay)return;
   if(center){var wrap=scheduleWrap.getBoundingClientRect(),day=focusDay.getBoundingClientRect(),gutter=42;var target=wrap.left+gutter+(scheduleWrap.clientWidth-gutter)/2;scheduleWrap.scrollLeft+=day.left+day.width/2-target;}
   if(positionTime){
    var hourCell=scheduleGrid.querySelector('.day-click-cell'),startSelect=document.getElementById('daystart-select');
    if(hourCell&&startSelect){
     var now=new Date(),startMinutes=Number(startSelect.value)*60;
     // Sticky date/reminder rows remain visible; scroll only the time-grid offset.
     var offset=focusDay===today?Math.max(0,now.getHours()*60+now.getMinutes()-120-startMinutes)/60*hourCell.getBoundingClientRect().height:0;
     scheduleWrap.scrollTop=Math.min(offset,Math.max(0,scheduleWrap.scrollHeight-scheduleWrap.clientHeight));
    }
   }
   updateCalendarSelection();
  });
 }
 function resizeDays(){if(!scheduleWrap||!scheduleWrap.clientWidth)return;var gutter=42;document.documentElement.style.setProperty('--android-day-width',((scheduleWrap.clientWidth-gutter)/3)+'px');queueDatePosition();queueCalendarSelection();}
 if(scheduleGrid)new MutationObserver(queueDatePosition).observe(scheduleGrid,{childList:true});
 var scheduleTabForCenter=document.querySelector('.view-tab[data-view="schedule"]');if(scheduleTabForCenter)scheduleTabForCenter.addEventListener('click',function(){if(!document.getElementById('view-schedule').classList.contains('active')){positionDate='';centerDatePending=true;timePositionPending=true;var now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');if(window.__ketimeDemo)window.__ketimeDemo.navigateScheduleDate(today);}queueDatePosition();},true);
 var dayStartForPosition=document.getElementById('daystart-select');if(dayStartForPosition)dayStartForPosition.addEventListener('change',function(){positionDate=selectedCalendarDate;timePositionPending=true;queueDatePosition();},true);
 if(scheduleWrap){new ResizeObserver(resizeDays).observe(scheduleWrap);resizeDays();}window.addEventListener('resize',resizeDays);
 var inboxList=document.getElementById('untimed-list');
 function compactDeadlines(){
  if(!inboxList||!window.__ketimeDemo)return;var todos=window.__ketimeDemo.getState().inbox||[],byId={};todos.forEach(function(todo){byId[todo.id]=todo;});
  inboxList.querySelectorAll('.homework-due').forEach(function(label){var todo=byId[label.closest('.untimed-item').dataset.todoId],raw=todo&&todo.source&&todo.source.dueAt||'',parts=raw.match(/^\d{4}-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/),text=parts?Number(parts[1])+'月'+Number(parts[2])+'日 '+parts[3]+':'+parts[4]:'未提供截止时间';if(label.textContent!==text)label.textContent=text;label.setAttribute('aria-label','截止时间：'+(raw||'未提供'));});
 }
 if(inboxList){new MutationObserver(compactDeadlines).observe(inboxList,{childList:true,subtree:true});compactDeadlines();}
 var projectsList=document.getElementById('projects-list'),projectFrame=null;
 function layoutProjects(){
  projectFrame=null;if(!projectsList||!document.getElementById('view-projects').classList.contains('active'))return;
  projectsList.querySelectorAll('.timeline').forEach(function(timeline){
   var nodes=Array.from(timeline.querySelectorAll('.node-group'));if(!nodes.length||!timeline.clientWidth)return;
   timeline.style.setProperty('--android-node-width',(timeline.clientWidth/3)+'px');
   var target=nodes.find(function(node){return !node.querySelector('.node-circle').classList.contains('done');})||nodes[nodes.length-1];
   nodes.forEach(function(node){node.classList.toggle('android-current-node',node===target&&!node.querySelector('.node-circle').classList.contains('done'));});
   var rect=timeline.getBoundingClientRect(),focus=target.getBoundingClientRect();timeline.scrollLeft+=focus.left+focus.width/2-rect.left-timeline.clientWidth/2;
  });
 }
 function queueProjects(){if(projectFrame===null)projectFrame=requestAnimationFrame(layoutProjects);}
 if(projectsList){new MutationObserver(queueProjects).observe(projectsList,{childList:true});new ResizeObserver(queueProjects).observe(projectsList);queueProjects();}
 var growthStage=document.getElementById('growth-chart-stage'),growthSize='';
 if(growthStage)new ResizeObserver(function(){var key=growthStage.clientWidth+'x'+growthStage.clientHeight;if(key!==growthSize&&growthStage.clientWidth&&document.getElementById('view-growth').classList.contains('active')){growthSize=key;requestAnimationFrame(function(){if(window.__ketimeDemo&&window.__ketimeDemo.renderGrowth)window.__ketimeDemo.renderGrowth();});}}).observe(growthStage);
 var note=document.querySelector('#settings-account-section .bupt-note');if(note)note.textContent='账号、教务密码、教学云密码及 ChatGPT 授权仅保存在此手机的应用私有目录，使用 Android Keystore 加密。备份不包含这些凭据；换手机或卸载后需重新登录。';
 var timer=null,target=null,point=null,longPressed=false;
 document.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;target=e.target.closest('.node-circle');if(!target)return;point={x:e.touches[0].clientX,y:e.touches[0].clientY};timer=setTimeout(function(){longPressed=true;target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:point.x,clientY:point.y}));if(navigator.vibrate)navigator.vibrate(20);},550);},{passive:true});
 document.addEventListener('touchmove',function(e){if(point&&(Math.abs(e.touches[0].clientX-point.x)>10||Math.abs(e.touches[0].clientY-point.y)>10))clearTimeout(timer);},{passive:true});
 document.addEventListener('touchend',function(){clearTimeout(timer);point=null;},{passive:true});document.addEventListener('touchcancel',function(){clearTimeout(timer);point=null;longPressed=false;},{passive:true});
 document.addEventListener('click',function(e){if(longPressed){longPressed=false;if(target&&target.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}}},true);
})();

/* Product-owned pickers, with native values/events retained for existing data and forms. */
(function(){
 'use strict';
 var controls=new Map(),sequence=0,queued=false,active=null,restoreFocus=null;
 var overlay=document.createElement('div');overlay.id='android-picker-overlay';overlay.className='overlay android-picker-overlay';
 overlay.innerHTML='<section class="android-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="android-picker-title"><header class="android-picker-head"><h2 id="android-picker-title"></h2><button type="button" class="android-picker-cancel" aria-label="取消选择">取消</button></header><div id="android-picker-content"></div><footer id="android-picker-actions"></footer></section>';
 document.body.appendChild(overlay);
 var title=document.getElementById('android-picker-title'),content=document.getElementById('android-picker-content'),actions=document.getElementById('android-picker-actions');
 function pad(value){return String(value).padStart(2,'0')}
 function dateString(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())}
 function label(source){if(source.getAttribute('aria-label'))return source.getAttribute('aria-label');var node=source.labels&&source.labels[0];if(node){var copy=node.cloneNode(true);copy.querySelectorAll('button,input,select,textarea,.ketime-control').forEach(function(child){child.remove()});return copy.textContent.trim()||'选择'}return '选择'}
 function kind(source){return source.tagName==='SELECT'?'select':source.type}
 function display(source){if(kind(source)==='select'){var option=source.options[source.selectedIndex];return option?option.textContent:'请选择'}if(!source.value)return kind(source)==='time'?'选择时间':'选择日期';if(kind(source)==='date'){var parts=source.value.split('-');return source.closest('.holiday-card')?parts[0]+'/'+Number(parts[1])+'/'+Number(parts[2]):parts[0]+'年'+Number(parts[1])+'月'+Number(parts[2])+'日'}return source.value}
 function sync(source){var control=controls.get(source);if(!control)return;var text=display(source),name=label(source)+'，'+text;if(control.value.textContent!==text)control.value.textContent=text;if(control.button.disabled!==source.disabled)control.button.disabled=source.disabled;if(control.button.getAttribute('aria-label')!==name)control.button.setAttribute('aria-label',name);control.button.classList.toggle('is-empty',!source.value);}
 function syncAll(){queued=false;controls.forEach(function(control,source){if(!source.isConnected){controls.delete(source);return}sync(source)});}
 function scheduleSync(){if(!queued){queued=true;requestAnimationFrame(syncAll)}}
 function close(){if(!active)return false;var source=active.source;active=null;overlay.classList.remove('visible');controls.forEach(function(control){control.button.setAttribute('aria-expanded','false')});var focus=restoreFocus;restoreFocus=null;if(focus&&focus.isConnected&&!focus.disabled&&focus.getClientRects().length)focus.focus();sync(source);return true;}
 window.KetimeAndroidControls={close:close};
 function commit(value){if(!active)return;var source=active.source;if(source.disabled){close();return}source.value=value;close();source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}));syncAll();}
 function button(text,className,onClick){var node=document.createElement('button');node.type='button';node.className=className;node.textContent=text;node.addEventListener('click',onClick);return node;}
 function footer(confirm){actions.replaceChildren();var clear=button('清空','btn android-picker-clear',function(){commit('')});clear.hidden=kind(active.source)==='select'||active.source.required;actions.appendChild(clear);if(confirm)actions.appendChild(button('完成','btn btn-primary',confirm));}
 function focusSelected(){requestAnimationFrame(function(){var chosen=content.querySelector('[aria-pressed="true"]:not(:disabled)')||content.querySelector('button:not(:disabled)');if(chosen){chosen.focus({preventScroll:true});chosen.scrollIntoView({block:'nearest',inline:'nearest'})}});}
 function selectPicker(){content.className='android-picker-content';var list=document.createElement('div');list.className='android-choice-list';var group='';Array.from(active.source.options).forEach(function(option,index){if(option.hidden)return;var parent=option.parentElement;if(parent.tagName==='OPTGROUP'&&parent.label!==group){group=parent.label;var heading=document.createElement('p');heading.className='android-choice-group';heading.textContent=group;list.appendChild(heading)}var item=button(option.textContent,'android-choice',function(){commit(option.value)});item.dataset.choice=String(index);item.disabled=option.disabled||parent.tagName==='OPTGROUP'&&parent.disabled;item.setAttribute('aria-pressed',String(index===active.source.selectedIndex));list.appendChild(item)});if(!list.children.length){var empty=document.createElement('p');empty.className='bupt-note';empty.textContent='暂无可选项';list.appendChild(empty)}content.replaceChildren(list);actions.replaceChildren();focusSelected();}
 function timePicker(){
  content.className='android-picker-content';var parts=active.source.value.split(':'),now=new Date();active.hour=parts[0]!==''?Number(parts[0]):now.getHours();active.minute=parts.length===2?Number(parts[1]):now.getMinutes();
  var preview=document.createElement('div');preview.className='android-time-preview';preview.setAttribute('aria-live','polite');content.appendChild(preview);var columns=document.createElement('div');columns.className='android-time-columns';content.appendChild(columns);
  function update(){preview.textContent=pad(active.hour)+':'+pad(active.minute);columns.querySelectorAll('[data-time-unit]').forEach(function(item){item.setAttribute('aria-pressed',String(Number(item.dataset.timeValue)===active[item.dataset.timeUnit]))});}
  ['hour','minute'].forEach(function(unit){var column=document.createElement('section'),heading=document.createElement('h3'),list=document.createElement('div');column.className='android-time-column';heading.textContent=unit==='hour'?'小时':'分钟';list.className='android-time-list';list.setAttribute('aria-label',heading.textContent);for(var i=0;i<(unit==='hour'?24:60);i++){(function(value){var item=button(pad(value),'android-time-option',function(){active[unit]=value;update()});item.dataset.timeUnit=unit;item.dataset.timeValue=String(value);item.setAttribute('aria-label',pad(value)+(unit==='hour'?'时':'分'));list.appendChild(item)})(i);}column.append(heading,list);columns.appendChild(column)});
  update();footer(function(){commit(pad(active.hour)+':'+pad(active.minute))});requestAnimationFrame(function(){columns.querySelectorAll('[aria-pressed="true"]').forEach(function(item){item.parentElement.scrollTop=Math.max(0,item.offsetTop-item.parentElement.clientHeight/2+item.offsetHeight/2)});var item=columns.querySelector('[data-time-unit="hour"][aria-pressed="true"]');if(item)item.focus({preventScroll:true})});
 }
 function allowedDate(value){return (!active.source.min||value>=active.source.min)&&(!active.source.max||value<=active.source.max)}
 function datePicker(){
  content.className='android-picker-content';var parts=(active.source.value||dateString(new Date())).split('-');active.year=Number(parts[0]);active.month=Number(parts[1])-1;
  function draw(){content.replaceChildren();var head=document.createElement('div'),month=document.createElement('strong'),grid=document.createElement('div');head.className='android-date-head';grid.className='android-date-grid';month.textContent=active.year+'年'+(active.month+1)+'月';function move(delta){var date=new Date(active.year,active.month+delta,1,12);active.year=date.getFullYear();active.month=date.getMonth();draw()}var prev=button('‹','android-date-nav',function(){move(-1)}),next=button('›','android-date-nav',function(){move(1)});prev.setAttribute('aria-label','上个月');next.setAttribute('aria-label','下个月');head.append(prev,month,next);content.append(head,grid);['一','二','三','四','五','六','日'].forEach(function(day){var label=document.createElement('span');label.className='android-date-weekday';label.textContent=day;grid.appendChild(label)});var offset=(new Date(active.year,active.month,1,12).getDay()+6)%7,last=new Date(active.year,active.month+1,0,12).getDate(),today=dateString(new Date());for(var i=0;i<offset;i++){var blank=document.createElement('span');blank.setAttribute('aria-hidden','true');grid.appendChild(blank)}for(var day=1;day<=last;day++){(function(day){var value=dateString(new Date(active.year,active.month,day,12)),item=button(String(day),'android-date-day',function(){commit(value)});item.dataset.date=value;item.setAttribute('aria-label',value);item.setAttribute('aria-pressed',String(active.source.value===value));item.classList.toggle('is-today',value===today);item.disabled=!allowedDate(value);grid.appendChild(item)})(day);}}
  draw();footer();var today=button('今天','btn btn-primary',function(){commit(dateString(new Date()))});today.disabled=!allowedDate(dateString(new Date()));actions.appendChild(today);focusSelected();
 }
 function open(source){if(source.disabled)return;close();restoreFocus=document.activeElement;active={source:source};content.replaceChildren();title.textContent=label(source);overlay.classList.add('visible');controls.get(source).button.setAttribute('aria-expanded','true');if(kind(source)==='select')selectPicker();else if(kind(source)==='time')timePicker();else datePicker();}
 overlay.querySelector('.android-picker-cancel').addEventListener('click',close);overlay.addEventListener('click',function(event){if(event.target===overlay)close()});
 overlay.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}var current=document.activeElement;if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&current.matches('.android-choice,.android-time-option')){var items=Array.from(current.parentElement.querySelectorAll('button:not(:disabled)')),index=items.indexOf(current),next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowDown'?1:-1)));event.preventDefault();items[next].focus();return}if(event.key==='Tab'){var nodes=Array.from(overlay.querySelectorAll('button')).filter(function(node){return !node.disabled&&!node.hidden&&node.getClientRects().length}),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&current===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&current===last){event.preventDefault();first.focus()}}});
 function wrap(source){
  if(controls.has(source)||source.multiple)return;var wrapper=document.createElement('span'),trigger=document.createElement('button'),value=document.createElement('span');wrapper.className='ketime-control ketime-control-'+kind(source);wrapper.dataset.controlFor=source.id||('android-control-'+(++sequence));trigger.type='button';trigger.className=source.className+' ketime-control-trigger';trigger.id=wrapper.dataset.controlFor+'-picker';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',overlay.id);trigger.setAttribute('aria-expanded','false');value.className='ketime-control-value';trigger.appendChild(value);source.parentElement.insertBefore(wrapper,source);wrapper.append(source,trigger);controls.set(source,{wrapper:wrapper,button:trigger,value:value});source.classList.add('ketime-control-source');source.setAttribute('aria-hidden','true');source.tabIndex=-1;
  trigger.addEventListener('click',function(){open(source)});trigger.addEventListener('keydown',function(event){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open(source)}});
  source.addEventListener('change',function(){sync(source)});source.addEventListener('input',function(){sync(source)});source.addEventListener('invalid',function(event){event.preventDefault();sync(source);trigger.focus();open(source)});
  ['value','selectedIndex'].forEach(function(property){var proto=source.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,property);if(!descriptor||!descriptor.get||!descriptor.set)return;Object.defineProperty(source,property,{configurable:true,get:function(){return descriptor.get.call(this)},set:function(value){descriptor.set.call(this,value);sync(this)}})});
  sync(source);
 }
 function scan(node){if(node.nodeType!==1)return;if(node.matches('select,input[type="time"],input[type="date"]'))wrap(node);node.querySelectorAll('select,input[type="time"],input[type="date"]').forEach(wrap)}
 scan(document.body);new MutationObserver(function(records){records.forEach(function(record){if(record.type==='childList')record.addedNodes.forEach(scan)});scheduleSync();if(active&&(!active.source.isConnected||active.source.disabled))close();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','selected','value','aria-label','label','required']});
 document.addEventListener('reset',function(){setTimeout(syncAll,0)},true);document.addEventListener('click',function(event){var target=event.target.closest('label'),source=target&&(target.control||document.getElementById(target.htmlFor));if(controls.has(source)&&!event.target.closest('button')){event.preventDefault();controls.get(source).button.focus()}},true);
})();
