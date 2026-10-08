const test=require('node:test'),assert=require('node:assert/strict'),api=require('../schedule-overlap');
function range(start,end,identity){return{start,end,identity}}
test('partial overlaps mark only the common interval and use separate lanes',()=>{
 const items=[range(540,660,'a'),range(600,720,'b')],original=JSON.stringify(items),result=api.plan(items);
 assert.deepEqual(result.map(x=>x.ranges),[[{start:600,end:660}],[{start:600,end:660}]]);assert.deepEqual(result.map(x=>x.lane),[0,1]);assert(result.every(x=>x.lanes===2));assert.equal(JSON.stringify(items),original);
 assert.match(api.background(result[0].ranges,540,120),/#ef6b64 50%, #ef6b64 100%/);
});
test('touching boundaries and separate events are not conflicts',()=>{assert(api.plan([range(540,600),range(600,660),range(720,780)]).every(x=>!x.ranges.length&&x.lanes===1))});
test('identical times and nested events receive exact ranges',()=>{const result=api.plan([range(540,780,'a'),range(600,660,'b'),range(600,660,'c')]);assert.deepEqual(result[0].ranges,[{start:600,end:660}]);assert(result.every(x=>x.lanes===3))});
test('disjoint overlaps keep the gap in the original color and reuse lanes',()=>{const result=api.plan([range(540,600,'a'),range(570,690,'b'),range(660,720,'c')]);assert.deepEqual(result[1].ranges,[{start:570,end:600},{start:660,end:690}]);assert.equal(result[0].lane,result[2].lane);assert.equal(result[1].lanes,2)});
test('multiple intersecting ranges merge without duplicate red overlays',()=>{assert.deepEqual(api.plan([range(540,720,'a'),range(570,660,'b'),range(630,690,'c')])[0].ranges,[{start:570,end:690}])});
test('one occurrence cannot conflict with itself but later occurrences can',()=>{assert(api.plan([range(0,60,'a:day1'),range(0,60,'a:day1')]).every(x=>!x.ranges.length));assert.equal(api.plan([range(0,60,'a:day1'),range(0,60,'a:day2')])[0].ranges.length,1)});
test('midnight and custom day boundaries split real intervals correctly',()=>{assert.deepEqual(api.segmentRange({start:'23:00',end:'02:00',segment:'start'},0),{start:1380,end:1440});assert.deepEqual(api.segmentRange({start:'23:00',end:'02:00',segment:'continuation'},0),{start:0,end:120});assert.deepEqual(api.segmentRange({start:'05:00',end:'07:00',segment:'start'},6),{start:1380,end:1440});assert.deepEqual(api.segmentRange({start:'05:00',end:'07:00',segment:'continuation'},6),{start:0,end:60})});
test('short event visual padding does not create false conflicts',()=>{assert.deepEqual(api.segmentRange({start:'09:00',end:'09:01',segment:'start'},0),{start:540,end:541});assert(api.plan([range(540,541),range(542,543)]).every(x=>!x.ranges.length));assert.equal(api.background([],0,60),'')});
test('zero-length or invalid ranges are ignored',()=>{assert(api.plan([range(60,60),range(NaN,120),range(120,60)]).every(x=>!x.ranges.length))});
test('one-sided events conflict over their half-hour visual bands',()=>{
 const start=api.segmentRange({start:'09:00',end:'',segment:'start'},6),end=api.segmentRange({start:'',end:'09:45',segment:'start'},6);
 assert.deepEqual(start,{start:180,end:210});assert.deepEqual(end,{start:195,end:225});
 assert.deepEqual(api.plan([start,end]).map(x=>x.ranges),[[{start:195,end:210}],[{start:195,end:210}]]);
 assert.deepEqual(api.segmentRange({start:'05:50',end:'',segment:'continuation'},6),{start:0,end:20});
 assert.deepEqual(api.segmentRange({start:'',end:'06:10',segment:'continuation'},6),{start:1420,end:1440});
 assert.deepEqual(api.segmentRange({start:'',end:'06:10',visualStartMinutes:0,visualEndMinutes:10},6),{start:0,end:10});
});
