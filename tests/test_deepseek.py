import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import deepseek_client as ds
import ketime_server
from bupt_sync import SyncError

KEY='sk-deepseek-synthetic-only-key'
MODELS={'data':[{'id':'deepseek-flash','name':'DeepSeek-V4.1-Flash','effort':{'supported_levels':['low','high','max']}},{'id':'deepseek-v4-pro','name':'DeepSeek-V4-Pro','effort':{'supported_levels':['low','high','max']}}]}
def response(content='收到测试消息。',finish='stop'):
    return {'choices':[{'finish_reason':finish,'message':{'content':content,'reasoning_content':'DO NOT DISPLAY'}}]}
def context():
    return {'today':'2026-10-08','now':'2026-10-08T09:46:00','timezone':'Asia/Shanghai','projects':[],'password':'must-not-leak','schedules':[{'private':'must-not-leak'}]}
def event(**changes):
    return dict(dict(name='学习',date='2026-10-09',start='09:00',end='10:00',repeat='none',endDate=None,location=None,notes=None,color=None,projectId=None,nodeId=None),**changes)

class DeepSeekTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        aes=AESGCM(AESGCM.generate_key(256))
        def crypt(data,decrypt=False):
            if decrypt:return aes.decrypt(data[:12],data[12:],None)
            import secrets
            nonce=secrets.token_bytes(12);return nonce+aes.encrypt(nonce,data,None)
        for guard in [patch.object(ds,'VAULT_PATH',Path(temp.name)/'vault'),patch.object(ds,'crypt',crypt)]:
            guard.start();self.addCleanup(guard.stop)
        self.client=ds.DeepSeekClient()
        ds.write_vault({'apiKey':KEY,'model':'deepseek-flash','reasoningEffort':'none'})
    def test_encrypted_roundtrip_public_no_key(self):
        self.assertNotIn(KEY.encode(),ds.VAULT_PATH.read_bytes())
        self.assertEqual(ds.read_vault()['apiKey'],KEY)
        self.assertTrue(self.client.status()['encrypted'])
        self.assertNotIn(KEY,json.dumps(self.client.status()))
    def test_connect_validates_before_replacing_key(self):
        original=ds.VAULT_PATH.read_bytes()
        with patch.object(ds,'request',side_effect=SyncError('无效密钥','DEEPSEEK_HTTP_401')):
            with self.assertRaises(SyncError):self.client.connect({'apiKey':'sk-different-synthetic-key'})
        self.assertEqual(ds.VAULT_PATH.read_bytes(),original)
        with patch.object(ds,'request',return_value=MODELS) as call:
            result=self.client.connect({'apiKey':KEY});self.assertTrue(result['saved'])
            call.assert_called_once_with('/models',KEY)
    def test_catalog_current_legacy_filter(self):
        rows=ds.catalog(MODELS);self.assertEqual(rows[0]['version'],'4.1');self.assertEqual(rows[0]['reasoningEfforts'],['none','low','high','max'])
        rows=ds.catalog({'data':[{'id':'deepseek-chat'},{'id':'deepseek-reasoner'},{'id':'unsafe/id'},{'id':'deepseek-chat'}]})
        self.assertEqual([r['reasoningEfforts'] for r in rows],[['none'],['auto']])
        with self.assertRaises(SyncError):ds.catalog({'data':[]})
    def test_configure_stale_model_and_effort_fail_closed(self):
        with patch.object(ds,'request',return_value=MODELS):
            result=self.client.configure({'model':'deepseek-v4-pro','reasoningEffort':'low'});self.assertTrue(result['saved'])
            for payload in [{'model':'missing','reasoningEffort':'low'},{'model':'deepseek-flash','reasoningEffort':'medium'},{'model':None,'reasoningEffort':'none'}]:
                with self.assertRaises(SyncError):self.client.configure(payload)
            self.assertEqual(ds.read_vault()['model'],'deepseek-v4-pro')
    def test_test_message_only_and_nonthinking_payload(self):
        with patch.object(ds,'request',side_effect=[MODELS,response()]) as call:
            result=self.client.test({'message':' 你好 '})
        self.assertEqual(result['reply'],'收到测试消息。');self.assertTrue(result['completed'])
        endpoint,key,body=call.call_args.args
        self.assertEqual(endpoint,'/chat/completions');self.assertEqual(key,KEY)
        self.assertEqual(body['messages'],[{'role':'user','content':'你好'}]);self.assertEqual(body['reasoning_effort'],'none');self.assertEqual(body['max_tokens'],2048)
    def test_legacy_model_does_not_send_unsupported_effort(self):
        ds.write_vault({'apiKey':KEY,'model':'deepseek-chat','reasoningEffort':'none'})
        with patch.object(ds,'request',side_effect=[{'data':[{'id':'deepseek-chat'}]},response()]) as call:self.client.test({'message':'你好'})
        self.assertNotIn('reasoning_effort',call.call_args.args[2])
    def test_truncated_empty_reasoning_only_fail(self):
        for raw in [response(finish='length'),response(''),{'choices':[{'finish_reason':'stop','message':{'reasoning_content':'not a reply'}}]}]:
            with self.assertRaises(SyncError):ds.complete(raw)
    def test_assistant_json_and_safe_context(self):
        raw={'eventCount':2,'message':'已提取','events':[event(name='晚上学习',start='20:00',end='21:00'),event()]}
        with patch.object(ds,'request',side_effect=[MODELS,response(json.dumps(raw))]) as call:
            result=self.client.assistant({'messages':[{'role':'user','content':'明天学习'}],'context':context()})
        self.assertEqual(result['events'][0]['start'],'09:00')
        body=call.call_args.args[2];self.assertEqual(body['response_format'],{'type':'json_object'})
        self.assertNotIn('must-not-leak',json.dumps(body));self.assertNotIn(KEY,json.dumps(body));self.assertIn('JSON',body['messages'][0]['content'])
    def test_invalid_assistant_plan_no_creation(self):
        for content in ['not json',json.dumps({'eventCount':1,'message':'test','events':[event(date='2026-02-30')]})]:
            with patch.object(ds,'request',side_effect=[MODELS,response(content)]):
                with self.assertRaises(SyncError):self.client.assistant({'messages':[{'role':'user','content':'学习'}],'context':context()})
    def test_disconnect_and_corrupt_vault(self):
        self.assertFalse(self.client.disconnect()['connected'])
        ds.VAULT_PATH.write_bytes(b'invalid')
        with self.assertRaises(SyncError):self.client.status()
        self.assertFalse(self.client.disconnect()['hasKey'])
    def test_busy_and_blank_message(self):
        for value in ['',None,'x'*2001]:
            with self.assertRaises(SyncError):self.client.test({'message':value})
        self.client.busy.acquire()
        try:
            with self.assertRaises(SyncError):self.client.test({'message':'hello'})
        finally:self.client.busy.release()
    def test_transport_redacts_http_error_and_redirects(self):
        error=HTTPError(ds.API+'/models',401,'Bad key',{},io.BytesIO(KEY.encode()))
        with patch.object(ds,'build_opener') as opener:
            opener.return_value.open.side_effect=error
            with self.assertRaises(SyncError) as caught:ds.request('/models',KEY)
        self.assertNotIn(KEY,str(caught.exception));self.assertEqual(caught.exception.code,'DEEPSEEK_HTTP_401')
        self.assertIsNone(ds.NoRedirect().redirect_request())

class DeepSeekServerTests(unittest.TestCase):
    def setUp(self):
        self.server=ThreadingHTTPServer(('127.0.0.1',0),ketime_server.Handler)
        threading.Thread(target=self.server.serve_forever,daemon=True).start();self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.url='http://127.0.0.1:'+str(self.server.server_port)
    def post(self,path,payload,token=True):
        headers={'Content-Type':'application/json','Origin':self.url}
        if token:headers['X-Ketime-Token']=ketime_server.BOOT_TOKEN
        return urlopen(Request(self.url+path,json.dumps(payload).encode(),headers),timeout=5)
    def test_deepseek_csrf_dispatch_no_key_echo(self):
        with patch.object(ketime_server.DEEPSEEK,'connect',return_value={'saved':True,'connected':True}) as call:
            with self.assertRaises(HTTPError) as caught:self.post('/api/deepseek/connect',{'apiKey':KEY},False)
            self.assertEqual(caught.exception.code,403);call.assert_not_called()
            with self.post('/api/deepseek/connect',{'apiKey':KEY}) as response:self.assertNotIn(KEY,response.read().decode())
            call.assert_called_once()
    def test_assistant_provider_dispatch_and_no_fallback(self):
        with patch.object(ketime_server.DEEPSEEK,'assistant',return_value={'completed':True}) as ds_call,patch.object(ketime_server.CHATGPT,'assistant') as gpt:
            with self.post('/api/chatgpt/assistant',{'provider':'deepseek','messages':[],'context':{}}):pass
            ds_call.assert_called_once();gpt.assert_not_called()
            with self.assertRaises(HTTPError):self.post('/api/chatgpt/assistant',{'provider':'kimi'})
            gpt.assert_not_called();self.assertEqual(ds_call.call_count,1)
    def test_no_download_of_vault(self):
        for path in ['/.local/deepseek.dpapi','/deepseek.aes','/deepseek_client.py']:
            with self.assertRaises(HTTPError) as caught:urlopen(self.url+path,timeout=5)
            self.assertEqual(caught.exception.code,404)

if __name__=='__main__':unittest.main()
