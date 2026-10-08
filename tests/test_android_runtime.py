"""Portable Android host tests with synthetic crypto and no real credentials."""
import base64
import importlib.util
import json
from pathlib import Path
import secrets
import tempfile
import unittest
from unittest.mock import patch
import local_settings
import chatgpt_client
import deepseek_client
from bupt_sync import SyncError

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('android_runtime',ROOT/'android/app/src/main/python/android_runtime.py')
runtime=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class FakeCrypto:
    def __init__(self):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        self.aes=AESGCM(AESGCM.generate_key(256))
    def encryptBase64(self,data):
        nonce=secrets.token_bytes(12)
        return base64.b64encode(nonce+self.aes.encrypt(nonce,base64.b64decode(data),b'android-fixture')).decode()
    def decryptBase64(self,data):
        raw=base64.b64decode(data)
        return base64.b64encode(self.aes.decrypt(raw[:12],raw[12:],b'android-fixture')).decode()

class AndroidRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for module in (local_settings,chatgpt_client,deepseek_client):
            for attr in ('crypt','VAULT_PATH','MAGIC'):
                guard=patch.object(module,attr,getattr(module,attr));guard.start();self.addCleanup(guard.stop)
        runtime.configure_storage(self.temp.name,FakeCrypto())
    def test_school_roundtrip_and_private_storage(self):
        self.assertEqual(local_settings.read_settings()['account'],'')
        public=local_settings.save_settings({'account':'fixture123','password':'synthetic-school','cloudPassword':'synthetic-cloud','termStart':'2026-08-31'})
        self.assertTrue(public['encrypted'])
        self.assertNotIn('password',public)
        self.assertEqual(local_settings.stored_credentials()[1],'synthetic-school')
        self.assertEqual(local_settings.stored_credentials(cloud=True)[1],'synthetic-cloud')
        raw=local_settings.VAULT_PATH.read_bytes()
        self.assertTrue(raw.startswith(b'KETIME-ANDROID-SCHOOL-1\n'))
        self.assertNotIn(b'synthetic-school',raw)
        self.assertEqual(local_settings.VAULT_PATH.parent,Path(self.temp.name))
        local_settings.save_settings({'clear':True})
        self.assertEqual(local_settings.read_settings()['password'],'')
    def test_oauth_vault_model_settings_roundtrip(self):
        vault={'hostId':'urn:uuid:fixture','profiles':[{'id':'fixture','inferenceConfig':{'model':'gpt-5.6-terra','reasoningEffort':'low'}}],'active':'fixture'}
        chatgpt_client.write_vault(vault)
        self.assertEqual(chatgpt_client.read_vault(),vault)
        self.assertTrue(chatgpt_client.VAULT_PATH.read_bytes().startswith(b'KETIME-ANDROID-CHATGPT-1\n'))
    def test_tampering_and_windows_blob_fail_closed(self):
        local_settings.save_settings({'account':'fixture123','password':'synthetic','cloudPassword':'synthetic'})
        raw=bytearray(local_settings.VAULT_PATH.read_bytes());raw[-1]^=1;local_settings.VAULT_PATH.write_bytes(raw)
        with self.assertRaises(SyncError):local_settings.read_settings()
        local_settings.VAULT_PATH.write_bytes(b'KETIME-DPAPI-1\nnot-an-android-vault')
        with self.assertRaises(SyncError):local_settings.read_settings()
    def test_deepseek_vault_uses_android_encryption(self):
        data={'apiKey':'sk-android-synthetic-key','model':'deepseek-flash','reasoningEffort':'none'}
        deepseek_client.write_vault(data)
        self.assertEqual(deepseek_client.read_vault(),data)
        raw=deepseek_client.VAULT_PATH.read_bytes()
        self.assertTrue(raw.startswith(b'KETIME-ANDROID-DEEPSEEK-1\n'))
        self.assertNotIn(data['apiKey'].encode(),raw)
        self.assertNotIn('apiKey',deepseek_client.CLIENT.status())
        raw=bytearray(raw);raw[-1]^=1;deepseek_client.VAULT_PATH.write_bytes(raw)
        with self.assertRaises(SyncError):deepseek_client.read_vault()
    def test_no_private_material_in_packaging_rules(self):
        rules=(ROOT/'android/app/build.gradle').read_text(encoding='utf-8')
        self.assertNotIn("include '**'",rules)
        for source in ('bupt_sync.py','ucloud_sync.py','chatgpt_client.py','schedule_assistant.py'):
            self.assertIn(source,rules)
        manifest=(ROOT/'android/app/src/main/AndroidManifest.xml').read_text(encoding='utf-8')
        self.assertIn('android:allowBackup="false"',manifest)
        java=(ROOT/'android/app/src/main/java/cn/ketime/app/MainActivity.java').read_text(encoding='utf-8')
        self.assertIn('setAllowFileAccess(false)',java)
        self.assertNotIn('addJavascriptInterface(new AndroidVault',java)

    def test_android_stylesheet_mime_and_html_injection(self):
        css=b'body{color:green}'
        for path in ('/android-mobile.css','/android-mobile.css?v=1.0.1'):
            body,mime=runtime.android_response(200,css,'text/html; charset=utf-8',path)
            self.assertEqual(body,css)
            self.assertEqual(mime,'text/css; charset=utf-8')
        html=b'<html><head></head><body></body></html>'
        body,mime=runtime.android_response(200,html,'text/html; charset=utf-8','/')
        self.assertIn(b'android-mobile.css',body)
        self.assertIn(b'android-mobile.js',body)
        body,mime=runtime.android_response(404,{'error':'missing'},'application/json','/android-mobile.css')
        self.assertEqual(mime,'application/json')

if __name__=='__main__':unittest.main()
