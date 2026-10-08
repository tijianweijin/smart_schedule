(function(){
 'use strict';
 function nativeCall(method,args){if(!window.KetimeNative||!window.__ketimeAndroidToken)throw Error('Android 功能尚未就绪，请稍后重试。');window.KetimeNative[method].apply(window.KetimeNative,[window.__ketimeAndroidToken].concat(args));}
 window.KetimeAndroid={
  openAuth:function(url){nativeCall('openAuth',[url]);},
  exportBackup:function(json,name){nativeCall('exportBackup',[json,name]);},
  back:function(){
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
  window.KetimeAndroid.settingsPage={
   show:function(){
    if(!settingsView.classList.contains('active')){var current=document.querySelector('.view.active');settingsOrigin=current&&current.id.replace('view-','')||'schedule';}
    var assistant=document.getElementById('schedule-assistant');if(assistant&&!assistant.hidden)document.getElementById('assistant-close').click();
    document.querySelectorAll('.view').forEach(function(view){view.classList.toggle('active',view===settingsView);});
    document.querySelectorAll('.view-tab').forEach(function(tab){tab.classList.toggle('active',tab===settingsButton);});
   },
   hide:function(){settingsView.classList.remove('active');settingsButton.classList.remove('active');if(!leavingSettings){var target=document.querySelector('.view-tab[data-view="'+settingsOrigin+'"]')||document.querySelector('.view-tab[data-view="schedule"]');if(target){target.click();target.focus();}}}
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
  if(calendarDays)calendarDays.querySelectorAll('.calendar-day').forEach(function(day){var selected=day.dataset.date===selectedCalendarDate;day.classList.toggle('android-calendar-selected',selected);day.setAttribute('aria-pressed',String(selected));});
 }
 function queueCalendarSelection(){if(calendarSelectionFrame===null)calendarSelectionFrame=requestAnimationFrame(updateCalendarSelection);}
 if(calendarDays)new MutationObserver(queueCalendarSelection).observe(calendarDays,{childList:true});
 if(scheduleGrid)new MutationObserver(queueCalendarSelection).observe(scheduleGrid,{childList:true});
 if(scheduleWrap)scheduleWrap.addEventListener('scroll',queueCalendarSelection,{passive:true});
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
  });
 }
 function resizeDays(){if(!scheduleWrap||!scheduleWrap.clientWidth)return;var gutter=42;document.documentElement.style.setProperty('--android-day-width',((scheduleWrap.clientWidth-gutter)/3)+'px');queueDatePosition();queueCalendarSelection();}
 if(scheduleGrid)new MutationObserver(queueDatePosition).observe(scheduleGrid,{childList:true});
 var scheduleTabForCenter=document.querySelector('.view-tab[data-view="schedule"]');if(scheduleTabForCenter)scheduleTabForCenter.addEventListener('click',function(){if(!document.getElementById('view-schedule').classList.contains('active')){positionDate='';centerDatePending=true;timePositionPending=true;}queueDatePosition();},true);
 var dayStartForPosition=document.getElementById('daystart-select');if(dayStartForPosition)dayStartForPosition.addEventListener('change',function(){timePositionPending=true;queueDatePosition();},true);
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
 var note=document.querySelector('#settings-overlay .modal>.bupt-note');if(note)note.textContent='账号、教务密码、教学云密码及 ChatGPT 授权仅保存在此手机的应用私有目录，使用 Android Keystore 加密。备份不包含这些凭据；换手机或卸载后需重新登录。';
 var timer=null,target=null,point=null,longPressed=false;
 document.addEventListener('touchstart',function(e){if(e.touches.length!==1)return;target=e.target.closest('.node-circle');if(!target)return;point={x:e.touches[0].clientX,y:e.touches[0].clientY};timer=setTimeout(function(){longPressed=true;target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:point.x,clientY:point.y}));if(navigator.vibrate)navigator.vibrate(20);},550);},{passive:true});
 document.addEventListener('touchmove',function(e){if(point&&(Math.abs(e.touches[0].clientX-point.x)>10||Math.abs(e.touches[0].clientY-point.y)>10))clearTimeout(timer);},{passive:true});
 document.addEventListener('touchend',function(){clearTimeout(timer);point=null;},{passive:true});document.addEventListener('touchcancel',function(){clearTimeout(timer);point=null;longPressed=false;},{passive:true});
 document.addEventListener('click',function(e){if(longPressed){longPressed=false;if(target&&target.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}}},true);
})();
