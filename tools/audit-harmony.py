"""Inspect only the generated HAP. No real data or vaults are read."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile
import re

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('hap',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    with zipfile.ZipFile(args.hap) as archive:
        names=archive.namelist()
        assert len(names)==len(set(names)), 'Duplicate package entry'
        assert all(not p.startswith(('/','\\')) and '..' not in Path(p).parts for p in names)
        assert not any(re.search(r'(?:\.dpapi|\.p12|\.jks|\.keystore|\.key|\.zip)$',p,re.I) for p in names)
        module=json.loads(archive.read('module.json'))
        assert module['app']['bundleName']=='cn.ketime.app'
        assert module['app']['minAPIVersion']==50000012
        assert not module['module'].get('extensionAbilities'), 'No system backup of credential stores'
        assert sorted(p['name'] for p in module['module']['requestPermissions'])==['ohos.permission.INTERNET','ohos.permission.VIBRATE']
        resources=[p for p in names if p.startswith('resources/rawfile/')]
        assert set(p.split('/')[-1] for p in resources)=={'index.html','harmony-bridge.js','android-mobile.js','android-mobile.css'}
        assert archive.read('resources/rawfile/web/android-mobile.js')==(root/'android/app/src/main/web/android-mobile.js').read_bytes()
        assert archive.read('resources/rawfile/web/android-mobile.css')==(root/'android/app/src/main/web/android-mobile.css').read_bytes()
        assert archive.read('resources/base/media/ketime_icon.png')==(root/'.local/font-icon/icon-512.png').read_bytes()
        page=archive.read('resources/rawfile/web/index.html').decode('utf-8').replace('\r\n','\n')
        original=(root/'ketime _demo_0.1.html').read_text(encoding='utf-8')
        expected=original.replace('</head>','<script>window.KetimeAndroid=true;window.KetimeHarmony=true</script><script src="/harmony-bridge.js"></script><link rel="stylesheet" href="/android-mobile.css"></head>',1).replace('</body>','<script src="/android-mobile.js"></script><script>document.title="刻时 HarmonyOS 1.0";</script></body>',1)
        assert page==expected, 'Shared app source must be unchanged except platform bootstrap'
        native=archive.read('ets/modules.abc')
        assert all(text in native for text in (b'chatgpt.tokens.use.direct',b'ketime-bupt:',b'vault.read',b'postMessage',b'RS256'))
        web_scripts=b'\n'.join(archive.read(p) for p in resources)
        assert b'code_verifier' not in web_scripts, 'OAuth internals must stay native'
        assert b'private_key' not in web_scripts
    report={'package':args.hap.name,'sha256':hashlib.sha256(args.hap.read_bytes()).hexdigest(),'bytes':args.hap.stat().st_size,'bundleName':module['app']['bundleName'],'versionName':module['app']['versionName'],'minAPI':'HarmonyOS 5.0.0(12)','debug':module['app']['debug'],'nativeBytecodePresent':True,'sameAndroidMobileAssets':True,'sameSharedAppLogic':True,'sameSingleCharacterIcon':True,'automaticSystemBackup':False,'rawFiles':[p.split('/')[-1] for p in resources],'passed':True,'notVerified':['real-device installation','native credential/file/network behavior on device','live university and paid model calls']}
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if args.output:
        args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
