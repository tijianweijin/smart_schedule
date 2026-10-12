const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','ketime _demo_0.1.html'),'utf8'),context=vm.createContext({});
vm.runInContext(html.match(/^function splitGrowthSegments.*$/m)[0]+'\n'+html.match(/^function monotoneGrowthPath.*$/m)[0],context);
const curve=context.monotoneGrowthPath;
test('empty and single data are not rendered as a curve',()=>{assert.equal(curve([]),'');assert.equal(curve([{x:10,y:20}]),'M 10 20');});
test('missing dates join real observations without synthesizing points',()=>{
 const records=[{date:'2026-10-08',completion:70},{date:'2026-10-01',completion:5},{date:'2026-10-04',completion:30}],segments=context.splitGrowthSegments(records);
 assert.equal(segments.length,1);assert.equal(segments[0].length,3);assert.equal(segments[0][0].date,'2026-10-01');assert.equal(records[0].date,'2026-10-08','Input is not reordered');
});
test('monotone cubic is locally bounded for uneven spacing, plateaus and reversals',()=>{
 for(const data of [[0,20,50,100],[0,100,0,100],[100,50,50,0],[10,10,10,10],[0,1,99,100]]){
  const points=data.map((value,i)=>({x:[0,1,11,30][i],y:value})),d=curve(points),commands=d.split(' C ').slice(1);
  assert.equal(commands.length,3);
  commands.forEach((command,i)=>{const values=command.split(/[ ,]+/).map(Number),start=points[i],end=points[i+1];let previous=start.y;
   for(let step=0;step<=100;step++){const t=step/100,u=1-t,y=u*u*u*start.y+3*u*u*t*values[1]+3*u*t*t*values[3]+t*t*t*values[5],x=u*u*u*start.x+3*u*u*t*values[0]+3*u*t*t*values[2]+t*t*t*values[4];assert(y>=Math.min(start.y,end.y)-1e-8&&y<=Math.max(start.y,end.y)+1e-8);assert(x>=start.x-1e-8&&x<=end.x+1e-8);assert(end.y>=start.y?y>=previous-1e-8:y<=previous+1e-8);previous=y;}
  });
 }
});
