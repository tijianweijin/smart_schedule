import copy
import io
import json
import threading
import time
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen

import assistant_metrics as metrics
import chatgpt_client as api
import ketime_server
from bupt_sync import SyncError


def sse(*events):
    return io.BytesIO(b''.join(('data: '+json.dumps(e)+'\n\n').encode() for e in events))


class LatencyTests(unittest.TestCase):
    def setUp(self):
        self.client = api.ChatGPTClient()
        self.vault = {'active': 'fixture-client', 'profiles': [{'client_id': 'fixture-client', 'access_token': 'synthetic-access',
            'refresh_token': 'synthetic-refresh', 'expiresAt': time.time()+3600,
            'inferenceConfig': {'model': 'gpt-6.1-sol', 'reasoningEffort': 'low'}}]}
        self.calls = []
        self.event = {'name':'测试日程','date':'2026-10-16','start':'09:00','end':'10:00','repeat':'none',
            'endDate':None,'location':None,'notes':None,'color':None,'projectId':None,'nodeId':None}
        self.payload = {'messages':[{'role':'user','content':'2026年10月16日9点到10点测试日程'}],
            'context':{'today':'2026-10-16','now':'2026-10-16T08:00:00','timezone':'Asia/Shanghai','projects':[]}}
        self.read_patch = patch.object(api, 'read_vault', side_effect=lambda:copy.deepcopy(self.vault));self.read_patch.start();self.addCleanup(self.read_patch.stop)

    def request(self, url, payload=None, **kwargs):
        self.calls.append(url)
        if url.endswith('/models'):
            return {'models':[{'visibility':'list','slug':'gpt-6.1-sol','supported_reasoning_levels':['low','medium']}]}
        self.assertEqual(payload['model'],'gpt-6.1-sol');self.assertEqual(payload['reasoning'],{'effort':'low'})
        reply=json.dumps({'eventCount':1,'message':'已整理','events':[self.event]})
        return sse({'type':'response.output_text.delta','delta':reply}, {'type':'response.completed','response':{'usage':{
            'input_tokens':123,'output_tokens':45,'output_tokens_details':{'reasoning_tokens':12}}}})

    def test_warm_cache_manual_refresh_expiry_and_account_isolation(self):
        with patch.object(api,'request',side_effect=self.request):
            self.client.assistant(self.payload);self.client.assistant(self.payload)
            self.assertEqual(self.calls.count(api.RESOURCE+'/models'),1)
            self.client.models();self.assertEqual(self.calls.count(api.RESOURCE+'/models'),2)
            with patch.object(api.time,'monotonic',return_value=time.monotonic()+301):self.client.models(force=False)
            self.assertEqual(self.calls.count(api.RESOURCE+'/models'),3)
            self.vault['profiles'][0]['access_token']='different-synthetic-token'
            self.client.models(force=False);self.assertEqual(self.calls.count(api.RESOURCE+'/models'),4)
            self.assertTrue(all(url.endswith(('/models','/responses')) for url in self.calls))

    def test_failed_refresh_never_uses_stale_cache(self):
        with patch.object(api,'request',side_effect=self.request):self.client.models()
        with patch.object(api,'request',side_effect=SyncError('fixture error','HTTP_403',502)):
            with self.assertRaises(SyncError):self.client.models()
        self.assertIsNone(self.client._models_cache)
        with patch.object(api,'request',side_effect=self.request):self.client.models(force=False)
        self.assertEqual(self.calls.count(api.RESOURCE+'/models'),2)

    def test_timings_usage_progress_and_no_content_or_credentials(self):
        request_id='a'*32
        with metrics._lock:metrics._records.pop(request_id,None)
        with patch.object(api,'request',side_effect=self.request),metrics.session(request_id) as trace:
            result=self.client.assistant(self.payload);report=trace.finish(True)
        self.assertEqual(result['events'][0]['name'],'测试日程')
        self.assertEqual(report['stage'],'complete');self.assertFalse(report['catalogCacheHit'])
        for key in ['catalogMs','headersMs','firstTextMs','inferenceMs','validationMs']:self.assertGreaterEqual(report['timings'][key],0)
        self.assertEqual(report['usage'],{'inputTokens':123,'outputTokens':45,'reasoningTokens':12})
        serialized=json.dumps(metrics.progress(request_id),ensure_ascii=False)
        for secret in ['synthetic-access','synthetic-refresh','fixture-client','测试日程','2026年']:self.assertNotIn(secret,serialized)
        with patch.object(api,'request',side_effect=self.request),metrics.session() as warm:
            self.client.assistant(self.payload);self.assertTrue(warm.finish(True)['catalogCacheHit'])

    def test_failures_do_not_turn_partial_output_into_success(self):
        request_id='b'*32
        with metrics._lock:metrics._records.pop(request_id,None)
        def fake(url,*args,**kwargs):
            if url.endswith('/models'):return self.request(url,*args,**kwargs)
            return sse({'type':'response.output_text.delta','delta':'{"events":['})
        with patch.object(api,'request',side_effect=fake),self.assertRaises(SyncError),metrics.session(request_id):
            self.client.assistant(self.payload)
        self.assertEqual(metrics.progress(request_id)['stage'],'failed');self.assertIsNone(self.client._models_cache)


class ProgressRouteTests(unittest.TestCase):
    def test_authenticated_progress_is_independent_of_inference_lock(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),ketime_server.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            request_id='c'*32
            with metrics._lock:metrics._records.pop(request_id,None)
            with metrics.session(request_id) as trace:
                trace.phase('waiting_output')
                with ketime_server.CHATGPT.lock:
                    req=Request(f'http://127.0.0.1:{server.server_port}/api/assistant/progress',
                        data=json.dumps({'requestId':request_id}).encode(),headers={'Content-Type':'application/json','X-Ketime-Token':ketime_server.BOOT_TOKEN})
                    with urlopen(req,timeout=2) as response:data=json.load(response)
                self.assertTrue(data['found']);self.assertEqual(data['stage'],'waiting_output')
                trace.finish(True)
        finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
