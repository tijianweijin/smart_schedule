"""Generate only Harmony package assets from shared Android/mobile sources, no user data."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import re

ROOT = Path(__file__).resolve().parents[1]
HARMONY = ROOT / 'harmony'
RAW = HARMONY / 'entry/src/main/resources/rawfile/web'
NATIVE = HARMONY / 'entry/src/main/ets/runtime'

def main():
    RAW.mkdir(parents=True, exist_ok=True)
    NATIVE.mkdir(parents=True, exist_ok=True)
    # The Python module only declares extraction rules/validators; importing it
    # does not read credentials or send any requests.
    spec = importlib.util.spec_from_file_location('schedule_rules', ROOT / 'schedule_assistant.py')
    rules = importlib.util.module_from_spec(spec)
    import sys
    sys.path.insert(0, str(ROOT))
    spec.loader.exec_module(rules)
    modules = [(name, (ROOT / 'harmony-runtime' / name).read_text(encoding='utf-8')) for name in ('school.js', 'runtime.js')]
    service = "import url from '@ohos.url';\nconst URL=url.URL; const URLSearchParams=url.URLSearchParams;\n"
    service += 'const schoolModule={exports:{}};\n(function(module){\n' + modules[0][1] + '\n})(schoolModule);\n'
    service += 'const runtimeModule={exports:{}};\n(function(module,require){\n' + modules[1][1] + '\n})(runtimeModule,function(){return schoolModule.exports});\n'
    service += 'const rules=' + json.dumps({'instructions':rules.INSTRUCTIONS,'schema':rules.OUTPUT_SCHEMA},ensure_ascii=False) + ';\n'
    service += 'export class Runtime extends runtimeModule.exports.Runtime { constructor(port){super(port,rules)} }\n'
    (NATIVE / 'Service.js').write_text(service, encoding='utf-8')
    page = (ROOT / 'ketime _demo_0.1.html').read_text(encoding='utf-8')
    page = page.replace('</head>', '<script>window.KetimeAndroid=true;window.KetimeHarmony=true</script><script src="/harmony-bridge.js"></script><link rel="stylesheet" href="/android-mobile.css"></head>', 1)
    page = page.replace('</body>', '<script src="/android-mobile.js"></script><script>document.title="刻时 HarmonyOS 1.0";</script></body>', 1)
    (RAW / 'index.html').write_text(page,encoding='utf-8')
    shutil.copyfile(ROOT / 'harmony-runtime/web-bridge.js', RAW / 'harmony-bridge.js')
    for name in ('android-mobile.js','android-mobile.css'):
        shutil.copyfile(ROOT / 'android/app/src/main/web' / name, RAW / name)
    # Main file embeds all shared modules. Never copy arbitrary root files/vaults.
    for directory in (HARMONY / 'AppScope/resources/base/media', HARMONY / 'entry/src/main/resources/base/media'):
        shutil.copyfile(ROOT / '.local/font-icon/icon-512.png', directory / 'ketime_icon.png')
    android_version=re.search(r"versionName '([^']+)'",(ROOT/'android/app/build.gradle').read_text(encoding='utf-8')).group(1)
    manifest={'androidBaseline':android_version,'platform':'HarmonyOS','sharedMainSha256':hashlib.sha256((ROOT/'ketime _demo_0.1.html').read_bytes()).hexdigest(),'rawFiles':sorted(p.name for p in RAW.iterdir() if p.is_file()),'nativeModules':[name for name,_ in modules]}
    (HARMONY / 'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False))

if __name__=='__main__':
    main()
