// Generated offline preview: same HTML, Android CSS and Android UI logic as APK.
// Only source files are read; no user data, vaults, keys or .local files included.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),preview=path.join(root,'android/preview'),mobile=path.join(root,'android/app/src/main/web');
let app=fs.readFileSync(path.join(root,'ketime _demo_0.1.html'),'utf8');
for(const key of ['ketime-demo-v0.1','project-tracker-data-v5','project-tracker-data-v4','keshi-schedule-v4','keshi-schedule-v3','ketime-ai-provider-v1']){
 const replacement=key==='ketime-demo-v0.1'?'ketime-android-edge-preview-v1':'ketime-edge-preview-'+key;app=app.replaceAll(key,replacement);
}
// A desktop mouse should still render the Android coarse-pointer touch targets.
const runtime=fs.readFileSync(path.join(preview,'preview-runtime.js'),'utf8'),androidJS=fs.readFileSync(path.join(mobile,'android-mobile.js'),'utf8'),androidCSS=fs.readFileSync(path.join(mobile,'android-mobile.css'),'utf8').replace('@media(pointer:coarse)','@media all');
for(const code of [runtime,androidJS])if(/<\/script/i.test(code))throw Error('Unsafe embedded script');
app=app.replace('<head>','<head>\n<script>window.KetimeAndroid=true;\n'+runtime+'\n</script>');
app=app.replace('</head>','<style data-ketime-android-style>\n'+androidCSS+'\n</style></head>');
app=app.replace('</body>','<script data-ketime-android-mobile>\n'+androidJS+'\n</script></body>');
const version=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8').match(/versionName '([^']+)'/)[1];
const shell=fs.readFileSync(path.join(preview,'shell.html'),'utf8').replaceAll('__KETIME_ANDROID_VERSION__',version),payload=JSON.stringify(app).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'),output=shell.replace('__KETIME_PREVIEW_JSON__',()=>payload);
const dist=path.join(root,'android/dist');fs.mkdirSync(dist,{recursive:true});
fs.writeFileSync(path.join(dist,'刻时-Android-Edge预览.html'),output,'utf8');
console.log('Standalone Android Edge preview generated. No service or emulator required.');
