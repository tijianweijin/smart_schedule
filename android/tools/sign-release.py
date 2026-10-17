"""Generate a persistent project signing identity. Never print private passwords."""
import os
import argparse
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from local_settings import crypt

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-name',default='刻时-Android-1.0.apk')
    parser.add_argument('--source',type=Path)
    args=parser.parse_args()
    if Path(args.output_name).name!=args.output_name or '/' in args.output_name or '\\' in args.output_name or not args.output_name.endswith('.apk'):
        parser.error('Output must be a simple APK filename within android/dist.')
    tools=ROOT/'.local/android-tools'
    signing=ROOT/'.local/android-signing'
    signing.mkdir(parents=True,exist_ok=True)
    vault=signing/'password.dpapi'
    if vault.exists():
        password=crypt(vault.read_bytes(),decrypt=True).decode('ascii')
    else:
        password=secrets.token_urlsafe(40)
        vault.write_bytes(crypt(password.encode('ascii')))
    env=dict(os.environ,KETIME_SIGN_PASSWORD=password,JAVA_HOME=str(tools/'jdk'))
    key=signing/'ketime-release.p12'
    if not key.exists():
        subprocess.run([str(tools/'jdk/bin/keytool.exe'),'-genkeypair','-keystore',str(key),'-storetype','PKCS12','-storepass:env','KETIME_SIGN_PASSWORD','-keypass:env','KETIME_SIGN_PASSWORD','-alias','ketime','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Ketime Android, OU=Local App, O=Ketime, C=CN'],env=env,check=True)
    source=(args.source or ROOT/'android/app/build/outputs/apk/release/app-release-unsigned.apk').resolve()
    standard=(ROOT/'android/app/build/outputs/apk/release/app-release-unsigned.apk').resolve()
    isolated=(ROOT/'.local/android-tools/isolated-builds').resolve()
    if source != standard and (not source.is_relative_to(isolated) or source.name != 'app-release-unsigned.apk'):
        parser.error('Source must be a Ketime generated release APK.')
    destination=ROOT/'android/dist'/args.output_name
    destination.parent.mkdir(parents=True,exist_ok=True)
    # Sign a new file first: scanners/cloud-sync may memory-map the previous APK,
    # preventing truncation. Never damage a working package on signing failure.
    with tempfile.TemporaryDirectory(prefix='release-sign-',dir=destination.parent) as staging:
        staged=Path(staging)/'ketime-signed.apk'
        subprocess.run([str(tools/'sdk/build-tools/35.0.0/apksigner.bat'),'sign','--ks',str(key),'--ks-key-alias','ketime','--ks-pass','env:KETIME_SIGN_PASSWORD','--key-pass','env:KETIME_SIGN_PASSWORD','--out',str(staged),str(source)],env=env,check=True)
        subprocess.run([str(tools/'sdk/build-tools/35.0.0/apksigner.bat'),'verify','--verbose',str(staged)],env=env,check=True)
        staged.replace(destination)
        staged_idsig=staged.with_suffix('.apk.idsig')
        if staged_idsig.exists():
            staged_idsig.replace(destination.with_suffix('.apk.idsig'))
    print('Signed Android 1.0 release APK. Keep .local/android-signing backed up privately; never commit it.')

if __name__=='__main__':main()
