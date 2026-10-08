(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KetimeOverlap=api})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  function minutes(time){var parts=time.split(':').map(Number);return parts[0]*60+parts[1]}
  // Use real time, not the minimum visual height of very short event blocks.
  function segmentRange(occ,dayStartHour){
    // One-sided events explicitly use their 30-minute visual band for conflicts.
    if(!occ.start||!occ.end){
      if(Number.isFinite(occ.visualStartMinutes)&&Number.isFinite(occ.visualEndMinutes))return{start:occ.visualStartMinutes,end:occ.visualEndMinutes};
      var point=(minutes(occ.start||occ.end)-dayStartHour*60+1440)%1440;
      if(occ.segment==='continuation')return occ.start?{start:0,end:Math.max(0,point+30-1440)}:{start:Math.max(0,point-30+1440),end:1440};
      return{start:Math.max(0,point-(occ.start?0:30)),end:Math.min(1440,point+(occ.start?30:0))};
    }
    var start=(minutes(occ.start)-dayStartHour*60+1440)%1440,duration=minutes(occ.end)-minutes(occ.start);
    if(duration<=0)duration+=1440;
    return occ.segment==='continuation'?{start:0,end:Math.max(0,start+duration-1440)}:{start:start,end:Math.min(1440,start+duration)};
  }
  function mergeRanges(ranges){
    var merged=[];
    ranges.sort(function(a,b){return a.start-b.start||a.end-b.end}).forEach(function(range){var last=merged[merged.length-1];if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({start:range.start,end:range.end})});
    return merged;
  }
  function plan(items){
    var result=items.map(function(){return{ranges:[],lane:0,lanes:1}}),sorted=items.map(function(item,index){return{start:item.start,end:item.end,identity:item.identity,index:index}}).filter(function(item){return Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start}).sort(function(a,b){return a.start-b.start||a.end-b.end||a.index-b.index}),active=[],groups=[],group=null;
    sorted.forEach(function(item){
      active=active.filter(function(other){return other.end>item.start});
      active.forEach(function(other){if(item.identity&&item.identity===other.identity)return;var range={start:Math.max(item.start,other.start),end:Math.min(item.end,other.end)};result[item.index].ranges.push(range);result[other.index].ranges.push(range)});
      active.push(item);
      if(!group||item.start>=group.end){group={end:item.end,items:[]};groups.push(group)}
      group.end=Math.max(group.end,item.end);group.items.push(item);
    });
    groups.forEach(function(cluster){
      var ends=[];
      cluster.items.forEach(function(item){var lane=ends.findIndex(function(end){return end<=item.start});if(lane<0)lane=ends.length;ends[lane]=item.end;result[item.index].lane=lane});
      cluster.items.forEach(function(item){result[item.index].lanes=ends.length});
    });
    result.forEach(function(item){item.ranges=mergeRanges(item.ranges)});
    return result;
  }
  function background(ranges,visualStart,visualDuration){
    if(!ranges.length||visualDuration<=0)return'';
    var stops=['transparent 0%'];
    ranges.forEach(function(range){var from=Math.max(0,Math.min(100,(range.start-visualStart)/visualDuration*100)),to=Math.max(0,Math.min(100,(range.end-visualStart)/visualDuration*100));if(to<=from)return;stops.push('transparent '+from+'%','#ef6b64 '+from+'%','#ef6b64 '+to+'%','transparent '+to+'%')});
    stops.push('transparent 100%');return'linear-gradient(to bottom, '+stops.join(', ')+')';
  }
  return{segmentRange:segmentRange,plan:plan,background:background};
});
