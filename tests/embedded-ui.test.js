const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const entry of ['ketime _demo_0.1.html','刻时 小样.html']){
  test(entry+' embeds all UI modules without external script requests',()=>{
    const html=fs.readFileSync(path.join(root,entry),'utf8').replace(/\r/g,'');
    assert(!/<script[^>]+src\s*=/.test(html));
    for(const file of ['bupt-import.js','bupt-ui.js','school-tools.js','school-ui.js','schedule-overlap.js','daily-reminders.js','chatgpt-ui.js','schedule-assistant.js']){
      const marker='<script data-ketime-module="'+file+'">\n',index=html.indexOf(marker);assert(index>=0);
      const start=index+marker.length,end=html.indexOf('\n</script>',start),source=html.slice(start,end);
      assert.equal(source,fs.readFileSync(path.join(root,file),'utf8').replace(/\r/g,'').trimEnd());new vm.Script(source);
    }
    const inline=Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g));assert.equal(inline.length,9);inline.forEach(m=>new vm.Script(m[1]));
  });
}
test('both local entry points identical',()=>assert.equal(fs.readFileSync(path.join(root,'ketime _demo_0.1.html'),'utf8'),fs.readFileSync(path.join(root,'刻时 小样.html'),'utf8')));
