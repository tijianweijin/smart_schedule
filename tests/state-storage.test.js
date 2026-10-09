const test=require('node:test'),assert=require('node:assert/strict'),Data=require('../state-storage.js');
const base=()=>({version:'0.5',projects:[],schedules:[],inbox:[]});
function memory(initial={}){
 const values=new Map(Object.entries(initial));return{getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),values};
}
test('old versions may omit every new optional feature',()=>{
 for(const version of ['0.1','0.2','0.3','0.4','0.5']){
  const s={version,projects:[],schedules:[]};assert.deepEqual(Data.prepare(s),s);
 }
});
test('standalone legacy backups preserve the other collection on import',()=>{
 const old={...base(),schedules:[{id:'event',date:'2026-10-09'}]};
 assert.equal(Data.prepare([{id:'project'}],old).schedules[0].id,'event');
 assert.equal(Data.prepare({events:[]},{...old,projects:[{id:'project'}]}).projects[0].id,'project');
});
test('single upgrade snapshots and original split-app snapshots can be restored',()=>{
 const old={...base(),todos:[{name:'old'}]};assert.deepEqual(Data.prepare({format:'ketime-protection-snapshots',snapshots:[{kind:'upgrade',raw:JSON.stringify(old)}]}),old);
 const split={format:'ketime-legacy-snapshot',entries:[{kind:'projects',raw:'[{"id":1}]'},{kind:'schedules',raw:'{"events":[{"id":2,"date":"2026-10-09"}],"dayStartHour":0}'}]};
 const restored=Data.prepare({format:'ketime-protection-snapshots',snapshots:[{raw:JSON.stringify(split)}]});
 assert.equal(restored.projects[0].id,1);assert.equal(restored.schedules[0].id,2);assert.equal(restored.dayStartHour,0);
 assert.throws(()=>Data.prepare({format:'ketime-protection-snapshots',snapshots:[{raw:'{broken'}]}));
 assert.throws(()=>Data.prepare({format:'ketime-protection-snapshots',snapshots:[{raw:'{}'},{raw:'{}'}]}));
});
test('unknown, malformed and future schemas are refused without conversion',()=>{
 for(const s of [null,{},[],{projects:null,schedules:[]},{...base(),schemaVersion:999},{...base(),version:'0.6'},{...base(),projects:[null]}]){
  if(Array.isArray(s))continue;assert.throws(()=>Data.prepare(s));
 }
});
test('invalid dates times duplicate task IDs and bad growth records are protected',()=>{
 for(const extra of [
  {schedules:[{date:'2026-02-31'}]},
  {schedules:[{date:'2026-10-09',start:'25:01'}]},
  {schedules:[{date:'2026-10-09',occurrenceStates:[{date:'invalid'}]}]},
  {projects:[{nodes:[{checklist:[{id:'t'}]},{checklist:[{id:'t'}]}]}]},
  {growth:{series:[{projectId:'p',points:[{date:'2026-10-09',completion:101}]}]}},
  {importantDays:[{date:'2026-02-31',name:'x'}]}
 ])assert.throws(()=>Data.prepare({...base(),...extra}));
});
test('upgrade retains byte-for-byte original JSON and stable primary key',()=>{
 const raw=JSON.stringify(base(),null,2),storage=memory({data:raw}),store=Data.create(storage,'data');
 store.read();store.write({...base(),schemaVersion:1,importantDays:[]});
 assert.equal(storage.getItem('data-before-schema-1'),raw);assert.equal(storage.getItem('data-last-good'),raw);
 const checkpoint=storage.getItem('data-before-schema-1');store.write({...base(),schemaVersion:1,reminders:[]});assert.equal(storage.getItem('data-before-schema-1'),checkpoint);
});
test('a future schema update reuses schema-1 data and snapshots it before schema-2',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),scope={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(require.resolve('../state-storage.js'),'utf8').replace('var SCHEMA=1;','var SCHEMA=2;'),scope);
 const Next=scope.module.exports,raw=JSON.stringify({...base(),schemaVersion:1,inbox:[{id:'kept',name:'原记录'}]}),storage=memory({data:raw}),store=Next.create(storage,'data'),loaded=store.read();
 assert.equal(loaded.data.inbox[0].id,'kept');store.write({...loaded.data,schemaVersion:2});assert.equal(storage.getItem('data-before-schema-2'),raw);assert.equal(JSON.parse(storage.getItem('data')).inbox[0].id,'kept');
});
test('corrupt primary record stays intact even when a healthy fallback is present',()=>{
 const storage=memory({data:'{broken','data-last-good':JSON.stringify(base())}),store=Data.create(storage,'data'),loaded=store.read();
 assert(loaded.blocked);assert.deepEqual(loaded.data,base());assert.throws(()=>store.write({...base(),schemaVersion:1}));assert.equal(storage.getItem('data'),'{broken');
 assert(store.snapshots().some(x=>x.kind==='current'&&x.raw==='{broken'));
});
test('unsupported future primary is protected even if fallback is older',()=>{
 const raw=JSON.stringify({...base(),schemaVersion:2,importantDays:[{date:'2026-10-09',name:'new'}]}),storage=memory({data:raw}),store=Data.create(storage,'data');
 assert(store.read().blocked);assert.throws(()=>store.write({...base(),schemaVersion:1}));assert.equal(storage.getItem('data'),raw);
});
test('explicit recovery checkpoints damaged primary before replacing it',()=>{
 const storage=memory({data:'{broken','data-last-good':JSON.stringify(base())}),store=Data.create(storage,'data');store.read();
 store.write({...store.latest(),schemaVersion:1},{replace:true});
 assert.equal(storage.getItem('data-protected-original'),'{broken');assert.equal(storage.getItem('data-before-restore'),'{broken');assert(!store.isBlocked());
});
test('quota or permission failure during checkpoints does not replace primary',()=>{
 const raw=JSON.stringify(base()),storage=memory({data:raw}),store=Data.create(storage,'data');store.read();storage.setItem=(key,value)=>{if(key.includes('before-schema'))throw Error('quota');storage.values.set(key,value)};
 assert.throws(()=>store.write({...base(),schemaVersion:1}),/quota/);assert.equal(storage.getItem('data'),raw);
});
test('failure at final primary commit keeps old primary and last-good snapshot',()=>{
 const raw=JSON.stringify({...base(),schemaVersion:1}),storage=memory({data:raw}),store=Data.create(storage,'data');store.read();storage.setItem=(key,value)=>{if(key==='data')throw Error('quota');storage.values.set(key,value)};
 assert.throws(()=>store.write({...base(),schemaVersion:1,reminders:[]}),/quota/);assert.equal(storage.getItem('data'),raw);assert.equal(storage.getItem('data-last-good'),raw);
});
test('stale tab may not overwrite a newer commit',()=>{
 const storage=memory({data:JSON.stringify({...base(),schemaVersion:1})}),a=Data.create(storage,'data'),b=Data.create(storage,'data');a.read();b.read();
 a.write({...base(),schemaVersion:1,inbox:[{id:'new',name:'new'}]});assert.throws(()=>b.write({...base(),schemaVersion:1}),/另一页面/);assert.equal(JSON.parse(storage.getItem('data')).inbox.length,1);
});
test('legacy snapshot is retained once and original old keys are untouched',()=>{
 const storage=memory({legacy:'raw'}),store=Data.create(storage,'data');
 store.snapshotLegacy([{kind:'projects',raw:'[]'}]);store.snapshotLegacy([{kind:'projects',raw:'new'}]);
 assert.equal(JSON.parse(storage.getItem('data-before-schema-1')).entries[0].raw,'[]');assert.equal(storage.getItem('legacy'),'raw');
});
test('storage access failures return a recoverable protected view',()=>{
 const store=Data.create({getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){}},'data');
 assert(store.read().blocked);assert.throws(()=>store.write({...base(),schemaVersion:1}));
});
