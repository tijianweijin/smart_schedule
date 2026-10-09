"""Synthetic provider checks: never read user vaults or contact a paid API."""
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
from bupt_sync import SyncError
import api_clients as api
import ketime_server as server

KEY = 'sk-synthetic-provider-key-only'
CATALOGS = {
    'kimi': {'data': [{'id': 'kimi-k3'}, {'id': 'kimi-k2.6'}, {'id': 'kimi-k2.7-code'}, {'id': 'moonshot-v1-8k'}]},
    'minimax': {'data': [{'id': 'MiniMax-M3.1-Flash-Preview'}, {'id': 'MiniMax-M3'}, {'id': 'MiniMax-M2.7'}]},
}


def response(model, content='收到刻时测试消息。', finish='stop'):
    return {'model': model, 'choices': [{'finish_reason': finish,
            'message': {'role': 'assistant', 'content': content, 'reasoning_content': 'private reasoning'}}]}


def context():
    return {'today': '2026-10-09', 'now': '2026-10-09T09:00:00', 'timezone': 'Asia/Shanghai',
            'projects': [], 'password': 'do-not-send-this', 'schedules': [{'secret': 'do-not-send-this'}]}


def event(name='学习', start='09:00', end='10:00'):
    return dict(name=name, date='2026-10-10', start=start, end=end, repeat='none', endDate=None,
                location=None, notes=None, color=None, projectId=None, nodeId=None)


class ProviderTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        aes = AESGCM(AESGCM.generate_key(256))
        def crypt(data, decrypt=False):
            if decrypt:
                return aes.decrypt(data[:12], data[12:], None)
            import secrets
            nonce = secrets.token_bytes(12)
            return nonce + aes.encrypt(nonce, data, None)
        for guard in (patch.dict(api.VAULT_PATHS, {p: Path(temp.name) / p for p in CATALOGS}), patch.object(api, 'crypt', crypt)):
            guard.start(); self.addCleanup(guard.stop)
        self.clients = {p: api.APIKeyClient(p) for p in CATALOGS}
        for p, model in (('kimi', 'kimi-k2.6'), ('minimax', 'MiniMax-M3')):
            api.write_vault(p, {'apiKey': KEY, 'model': model, 'reasoningEffort': 'none'})

    def test_vaults_separate_encrypted_and_public_has_no_key(self):
        for p in CATALOGS:
            self.assertNotIn(KEY.encode(), api.VAULT_PATHS[p].read_bytes())
            self.assertEqual(api.read_vault(p)['apiKey'], KEY)
            self.assertNotIn(KEY, json.dumps(self.clients[p].status()))
        self.clients['kimi'].disconnect()
        self.assertFalse(self.clients['kimi'].status()['connected'])
        self.assertTrue(self.clients['minimax'].status()['connected'])

    def test_failed_connection_preserves_existing_vault(self):
        for p in CATALOGS:
            original = api.VAULT_PATHS[p].read_bytes()
            with patch.object(api, 'request', side_effect=SyncError('invalid', 'HTTP_401')):
                with self.assertRaises(SyncError):
                    self.clients[p].connect({'apiKey': 'sk-another-synthetic-key'})
            self.assertEqual(original, api.VAULT_PATHS[p].read_bytes())
            with patch.object(api, 'request', return_value=CATALOGS[p]) as call:
                self.assertTrue(self.clients[p].connect({'apiKey': KEY})['saved'])
                call.assert_called_once_with(p, '/models', KEY)

    def test_capabilities_are_model_specific_and_catalog_is_live(self):
        expected = {'kimi-k3': ['low', 'high', 'max'], 'kimi-k2.6': ['none', 'auto'],
                    'MiniMax-M3': ['none', 'auto'], 'MiniMax-M3.1-Flash-Preview': ['low', 'medium', 'high', 'xhigh', 'max']}
        for p in CATALOGS:
            rows = api.catalog(p, CATALOGS[p])
            for row in rows:
                if row['id'] in expected:
                    self.assertEqual(row['reasoningEfforts'], expected[row['id']])
            with self.assertRaises(SyncError): api.catalog(p, {'data': []})
            self.assertEqual(len(api.catalog(p, {'data': CATALOGS[p]['data'] + [{'id': 'unsafe/id'}, CATALOGS[p]['data'][0]]})), len(rows))
        self.assertEqual(api.catalog('kimi', {'data': [{'id': 'kimi-k4-new'}]})[0]['reasoningEfforts'], ['auto'])

    def test_models_does_not_infer_and_does_not_silently_replace_removed_selection(self):
        for p in CATALOGS:
            original = api.read_vault(p)
            with patch.object(api, 'request', return_value={'data': [CATALOGS[p]['data'][0]]}) as call:
                result = self.clients[p].models()
                self.assertFalse(result['selectionValid'])
                self.assertEqual(result['selectedModel'], original['model'])
                call.assert_called_once_with(p, '/models', KEY)
                with self.assertRaises(SyncError): self.clients[p].test({'message': '你好'})
            self.assertEqual(original, api.read_vault(p))

    def test_invalid_effort_and_missing_model_fail_without_inference(self):
        for p in CATALOGS:
            with patch.object(api, 'request', return_value=CATALOGS[p]) as call:
                for payload in ({'model': 'missing', 'reasoningEffort': 'low'},
                                {'model': CATALOGS[p]['data'][0]['id'], 'reasoningEffort': 'none'},
                                {'model': 'kimi-k3', 'reasoningEffort': 'medium'}):
                    with self.assertRaises(SyncError): self.clients[p].configure(payload)
                self.assertTrue(all(c.args[1] == '/models' for c in call.call_args_list))

    def test_exact_native_request_parameters(self):
        cases = [('kimi', 'kimi-k2.6', 'none', {'thinking': {'type': 'disabled'}}),
                 ('kimi', 'kimi-k2.6', 'auto', {'thinking': {'type': 'enabled'}}),
                 ('kimi', 'kimi-k3', 'low', {'reasoning_effort': 'low'}),
                 ('kimi', 'kimi-k2.7-code', 'auto', {}),
                 ('minimax', 'MiniMax-M3', 'none', {'thinking': {'type': 'disabled'}}),
                 ('minimax', 'MiniMax-M3', 'auto', {'thinking': {'type': 'adaptive'}}),
                 ('minimax', 'MiniMax-M2.7', 'auto', {}),
                 ('minimax', 'MiniMax-M3.1-Flash-Preview', 'low', {'reasoning_effort': 'low'})]
        for p, model, effort, parameters in cases:
            with self.subTest(model=model, effort=effort):
                api.write_vault(p, {'apiKey': KEY, 'model': model, 'reasoningEffort': effort})
                with patch.object(api, 'request', side_effect=[CATALOGS[p], response(model)]) as call:
                    result = self.clients[p].test({'message': ' 你好 '})
                self.assertEqual(result['provider'], p); self.assertEqual(result['model'], model)
                self.assertEqual(result['reply'], '收到刻时测试消息。')
                actual_p, endpoint, key, body = call.call_args.args
                self.assertEqual((actual_p, endpoint, key), (p, '/chat/completions', KEY))
                self.assertEqual(body['messages'], [{'role': 'user', 'content': '你好'}])
                for field in ('thinking', 'reasoning_effort'):
                    if field in parameters: self.assertEqual(body[field], parameters[field])
                    else: self.assertNotIn(field, body)
                self.assertIn('max_tokens' if p == 'kimi' else 'max_completion_tokens', body)
                if p == 'minimax': self.assertTrue(body['reasoning_split'])

    def test_completion_rejects_truncation_empty_and_wrong_model(self):
        for p, model in (('kimi', 'kimi-k3'), ('minimax', 'MiniMax-M3')):
            for result in (response(model, finish='length'), response(model, ''), response('wrong'), response(model, '<think>private</think>答复')):
                with self.assertRaises(SyncError): api.complete(p, result, model)

    def test_assistant_sorted_schema_safe_context_and_conversation_reference(self):
        plan = {'eventCount': 2, 'message': '已提取', 'events': [event('晚自习', '20:00', '21:00'), event()]}
        for p in CATALOGS:
            model = api.read_vault(p)['model']
            history = [{'role': 'user', 'content': '明天学习'}, {'role': 'assistant', 'content': '请补充时间'}, {'role': 'user', 'content': '上午九点和晚上八点'}]
            with patch.object(api, 'request', side_effect=[CATALOGS[p], response(model, json.dumps(plan))]) as call:
                result = self.clients[p].assistant({'messages': history, 'context': context()})
            self.assertEqual(result['events'][0]['start'], '09:00')
            body = call.call_args.args[3]
            self.assertNotIn('do-not-send-this', json.dumps(body))
            self.assertNotIn('assistant', [m['role'] for m in body['messages']])
            self.assertIn('上午九点', body['messages'][-1]['content'])
            if p == 'kimi': self.assertEqual(body['response_format'], {'type': 'json_object'})
            else: self.assertNotIn('response_format', body)

    def test_invalid_assistant_reply_never_returns_events(self):
        for p in CATALOGS:
            model = api.read_vault(p)['model']
            for raw in ('not json', '{"events":[]}', json.dumps({'eventCount': 1, 'message': 'ok', 'events': [event(start='bad')]})):
                with patch.object(api, 'request', side_effect=[CATALOGS[p], response(model, raw)]):
                    with self.assertRaises(SyncError):
                        self.clients[p].assistant({'messages': [{'role': 'user', 'content': '明天学习'}], 'context': context()})

    def test_http_errors_are_sanitized_and_redirects_blocked(self):
        for p in CATALOGS:
            for status in (401, 402, 429):
                error = HTTPError('https://example.invalid', status, KEY, {}, io.BytesIO(KEY.encode()))
                with patch.object(api, 'build_opener') as opener:
                    opener.return_value.open.side_effect = error
                    with self.assertRaises(SyncError) as caught: api.request(p, '/models', KEY)
                self.assertNotIn(KEY, str(caught.exception))
                self.assertEqual(caught.exception.code, p.upper() + '_HTTP_' + str(status))
        self.assertIsNone(api.NoRedirect().redirect_request())
        with self.assertRaises(SyncError): api.request('kimi', '/not-allowed', KEY)

    def test_fixed_official_hosts_and_minimax_http200_api_errors(self):
        for p in CATALOGS:
            fake = io.BytesIO(json.dumps(CATALOGS[p]).encode())
            with patch.object(api, 'build_opener') as opener:
                opener.return_value.open.return_value = fake
                api.request(p, '/models', KEY)
                req = opener.return_value.open.call_args.args[0]
                self.assertEqual(req.full_url, api.PROVIDERS[p]['api'] + '/models')
        with patch.object(api, 'build_opener') as opener:
            opener.return_value.open.return_value = io.BytesIO(b'{"base_resp":{"status_code":1008,"status_msg":"private"}}')
            with self.assertRaises(SyncError) as caught: api.request('minimax', '/models', KEY)
            self.assertNotIn('private', str(caught.exception)); self.assertIn('余额', str(caught.exception))

    def test_invalid_key_and_busy_no_network(self):
        for p in CATALOGS:
            with patch.object(api, 'request') as call:
                for key in ('', 'a\r\nb', 'x' * 4097):
                    with self.assertRaises(SyncError): self.clients[p].connect({'apiKey': key})
                self.clients[p].busy.acquire()
                try:
                    with self.assertRaises(SyncError): self.clients[p].test({'message': 'hi'})
                finally: self.clients[p].busy.release()
                call.assert_not_called()


class ProviderServerTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close); self.addCleanup(self.server.shutdown)
        self.url = 'http://127.0.0.1:' + str(self.server.server_port)

    def post(self, path, payload, token=True):
        headers = {'Content-Type': 'application/json', 'Origin': self.url}
        if token: headers['X-Ketime-Token'] = server.BOOT_TOKEN
        return urlopen(Request(self.url + path, json.dumps(payload).encode(), headers), timeout=5)

    def test_config_and_provider_routes_require_csrf(self):
        data = json.load(urlopen(self.url + '/api/config'))
        self.assertTrue(data['kimi']); self.assertTrue(data['minimax'])
        for p in ('kimi', 'minimax'):
            with patch.object(server.API_CLIENTS[p], 'connect', return_value={'connected': True}) as call:
                with self.assertRaises(HTTPError) as caught: self.post('/api/' + p + '/connect', {'apiKey': KEY}, False)
                self.assertEqual(caught.exception.code, 403); call.assert_not_called()
                self.assertNotIn(KEY, self.post('/api/' + p + '/connect', {'apiKey': KEY}).read().decode())

    def test_assistant_dispatch_uses_selected_provider_without_fallback(self):
        for p in ('kimi', 'minimax'):
            with patch.object(server.API_CLIENTS[p], 'assistant', return_value={'completed': True}) as call, patch.object(server.CHATGPT, 'assistant') as gpt:
                self.post('/api/chatgpt/assistant', {'provider': p, 'messages': [], 'context': {}}).close()
                self.post('/api/' + p + '/assistant', {'messages': [], 'context': {}}).close()
                self.assertEqual(call.call_count, 2); gpt.assert_not_called()
        with self.assertRaises(HTTPError): self.post('/api/chatgpt/assistant', {'provider': 'unknown'})

    def test_private_files_and_unlisted_actions_cannot_be_requested(self):
        for path in ('/.local/kimi.dpapi', '/minimax.aes', '/api_clients.py'):
            with self.assertRaises(HTTPError) as caught: urlopen(self.url + path)
            self.assertEqual(caught.exception.code, 404)
        with self.assertRaises(HTTPError) as caught: self.post('/api/kimi/__dict__', {})
        self.assertEqual(caught.exception.code, 404)


if __name__ == '__main__': unittest.main()
