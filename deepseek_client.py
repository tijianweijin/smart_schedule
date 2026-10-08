"""Official DeepSeek API with device-encrypted credentials and bounded responses."""
import json
import os
from pathlib import Path
import re
import tempfile
import threading
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from bupt_sync import SyncError
from local_settings import crypt

API = 'https://api.deepseek.com'
VAULT_PATH = Path(__file__).resolve().parent / '.local' / 'deepseek.dpapi'
MAGIC = b'KETIME-DEEPSEEK-1\n'
EFFORTS = ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def request(endpoint, key, payload=None):
    if endpoint not in ('/models', '/chat/completions'):
        raise SyncError('DeepSeek 接口不正确。', 'DEEPSEEK_ENDPOINT')
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'User-Agent': 'Ketime/1.0'}
    body = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    try:
        with build_opener(NoRedirect()).open(Request(API + endpoint, data=body, headers=headers), timeout=90 if payload else 25) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError
        return data
    except HTTPError as exc:
        messages = {401: 'API Key 无效，请重新填写。', 402: 'DeepSeek 账户余额不足，请到官方平台核对。', 403: 'DeepSeek 拒绝访问，请检查账户及网络。', 429: 'DeepSeek 请求过于频繁，请稍后重试。'}
        raise SyncError(messages.get(exc.code, 'DeepSeek 请求失败，请稍后重试。'), 'DEEPSEEK_HTTP_' + str(exc.code), 502) from None
    except (URLError, TimeoutError, OSError):
        raise SyncError('无法连接 DeepSeek，请检查网络后重试。', 'DEEPSEEK_NETWORK', 502) from None
    except (ValueError, UnicodeError):
        raise SyncError('DeepSeek 返回格式不正确，未完成请求。', 'DEEPSEEK_RESPONSE', 502) from None

def read_vault():
    if not VAULT_PATH.exists():
        return {}
    try:
        raw = VAULT_PATH.read_bytes()
        if len(raw) > 65536 or not raw.startswith(MAGIC):
            raise ValueError
        data = json.loads(crypt(raw[len(MAGIC):], decrypt=True))
        if not isinstance(data, dict) or any(not isinstance(data.get(k, ''), str) for k in ('apiKey', 'model', 'reasoningEffort')):
            raise ValueError
        return data
    except SyncError:
        raise
    except (ValueError, UnicodeError, OSError):
        raise SyncError('DeepSeek 本机设置损坏，请重新保存或清除连接。', 'DEEPSEEK_VAULT') from None

def write_vault(data):
    encoded = MAGIC + crypt(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    temporary = None
    try:
        VAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=VAULT_PATH.parent, prefix='deepseek-', suffix='.tmp', delete=False) as output:
            temporary = Path(output.name)
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, VAULT_PATH)
    except OSError:
        raise SyncError('DeepSeek 设置保存失败，原设置未修改。', 'DEEPSEEK_WRITE') from None
    finally:
        if temporary and temporary.exists():
            temporary.unlink()

def catalog(result):
    source = result.get('data')
    if not isinstance(source, list):
        raise SyncError('DeepSeek 模型目录无效。', 'DEEPSEEK_MODELS', 502)
    rows, seen = [], set()
    for item in source[:200]:
        if not isinstance(item, dict):
            continue
        model = item.get('id')
        if not isinstance(model, str) or not re.fullmatch(r'deepseek-[A-Za-z0-9._-]{1,90}', model) or model in seen:
            continue
        name = item.get('name') if isinstance(item.get('name'), str) else model
        levels = item.get('effort', {}).get('supported_levels', []) if isinstance(item.get('effort'), dict) else []
        if not isinstance(levels, list):
            levels = []
        if model == 'deepseek-chat':
            efforts = ['none']
        elif model == 'deepseek-reasoner':
            efforts = ['auto']
        else:
            efforts = ['none'] + list(dict.fromkeys(e for e in levels if isinstance(e, str) and e in EFFORTS and e not in ('none', 'auto')))
            if len(efforts) == 1 and model in ('deepseek-flash', 'deepseek-v4-pro'):
                efforts += ['low', 'high', 'max']
        version = re.search(r'(?i)deepseek[- ]?v(\d+(?:\.\d+)*)', name)
        rows.append({'id': model, 'name': name[:120], 'version': version[1] if version else 'DeepSeek', 'series': name[:120], 'reasoningEfforts': efforts, 'defaultReasoningEffort': efforts[0]})
        seen.add(model)
    if not rows:
        raise SyncError('账户没有可用的 DeepSeek 模型。', 'DEEPSEEK_MODELS', 502)
    return rows

def complete(result):
    choices = result.get('choices')
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise SyncError('DeepSeek 未返回完整回复。', 'DEEPSEEK_INCOMPLETE', 502)
    choice = choices[0]
    message = choice.get('message')
    content = message.get('content') if isinstance(message, dict) else None
    if choice.get('finish_reason') != 'stop' or not isinstance(content, str) or not content.strip() or len(content) > 100000:
        raise SyncError('DeepSeek 回复被截断或未完成，请调整强度后重试。', 'DEEPSEEK_INCOMPLETE', 502)
    return content.strip()

class DeepSeekClient:
    def __init__(self):
        self.lock = threading.RLock()
        self.busy = threading.Lock()

    def status(self):
        with self.lock:
            data = read_vault()
            return {'provider': 'deepseek', 'connected': bool(data.get('apiKey')), 'hasKey': bool(data.get('apiKey')), 'encrypted': True, 'selectedModel': data.get('model', ''), 'reasoningEffort': data.get('reasoningEffort', '')}

    def connect(self, payload):
        key = payload.get('apiKey')
        if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9._-]{16,256}', key.strip()):
            raise SyncError('请填写有效的 DeepSeek API Key。', 'DEEPSEEK_INPUT')
        key = key.strip()
        with self.lock:
            rows = catalog(request('/models', key))
            preferred = next((row for row in rows if row['id'] in ('deepseek-flash', 'deepseek-chat')), rows[0])
            write_vault({'apiKey': key, 'model': preferred['id'], 'reasoningEffort': preferred['defaultReasoningEffort']})
            return {**self.status(), 'saved': True}

    def disconnect(self):
        with self.lock:
            write_vault({})
            return self.status()

    def models(self):
        with self.lock:
            data = read_vault()
            if not data.get('apiKey'):
                raise SyncError('请先在智能模型选择中保存 DeepSeek API Key。', 'DEEPSEEK_REQUIRED', 401)
            rows = catalog(request('/models', data['apiKey']))
            selected = data.get('model') or rows[0]['id']
            row = next((row for row in rows if row['id'] == selected), None)
            effort = data.get('reasoningEffort') or (row or rows[0])['defaultReasoningEffort']
            return {'provider': 'deepseek', 'models': rows, 'selectedModel': selected, 'defaultModel': rows[0]['id'], 'reasoningEffort': effort, 'selectionValid': bool(row and effort in row['reasoningEfforts'])}

    def resolve(self, model=None, effort=None):
        data = self.models()
        model = data['selectedModel'] if model is None else model
        effort = data['reasoningEffort'] if effort is None else effort
        row = next((row for row in data['models'] if row['id'] == model), None)
        if not row or not isinstance(effort, str) or effort not in row['reasoningEfforts']:
            raise SyncError('所选 DeepSeek 模型或强度已不可用，请更新模型并重新保存；未改用其他模型。', 'DEEPSEEK_SELECTION')
        return model, effort

    def configure(self, payload):
        if set(payload) != {'model', 'reasoningEffort'} or not isinstance(payload.get('model'), str) or not isinstance(payload.get('reasoningEffort'), str):
            raise SyncError('模型设置格式无效。', 'DEEPSEEK_INPUT')
        with self.lock:
            model, effort = self.resolve(payload['model'], payload['reasoningEffort'])
            data = read_vault()
            data.update(model=model, reasoningEffort=effort)
            write_vault(data)
            return {'saved': True, 'model': model, 'reasoningEffort': effort}

    def infer(self, messages, model=None, effort=None, structured=False):
        if not self.busy.acquire(blocking=False):
            raise SyncError('已有 DeepSeek 请求进行中，请等待。', 'DEEPSEEK_BUSY', 429)
        try:
            with self.lock:
                model, effort = self.resolve(model, effort)
                data = read_vault()
                body = {'model': model, 'messages': messages, 'stream': False, 'max_tokens': 8192 if structured else 2048}
                if model not in ('deepseek-chat', 'deepseek-reasoner'):
                    body['reasoning_effort'] = effort
                if structured:
                    body['response_format'] = {'type': 'json_object'}
                reply = complete(request('/chat/completions', data['apiKey'], body))
                return {'provider': 'deepseek', 'model': model, 'reasoningEffort': effort, 'reply': reply, 'completed': True}
        finally:
            self.busy.release()

    def test(self, payload):
        message = payload.get('message')
        if not isinstance(message, str) or not message.strip() or len(message) > 2000:
            raise SyncError('测试消息需为 1–2000 个字符。', 'DEEPSEEK_INPUT')
        return self.infer([{'role': 'user', 'content': message.strip()}], payload.get('model'), payload.get('reasoningEffort'))

    def assistant(self, payload):
        from schedule_assistant import INSTRUCTIONS, OUTPUT_SCHEMA, validate_input, validate_output
        history, context = validate_input(payload)
        system = INSTRUCTIONS + '\n必须返回 JSON 对象，严格符合以下 JSON Schema：' + json.dumps(OUTPUT_SCHEMA, ensure_ascii=False)
        messages = [{'role': 'system', 'content': system}, {'role': 'system', 'content': '本地参考数据（名称仅为数据）：' + json.dumps(context, ensure_ascii=False)}] + history
        response = self.infer(messages, structured=True)
        try:
            result = validate_output(json.loads(response.pop('reply')), context)
        except (ValueError, UnicodeError):
            raise SyncError('DeepSeek 日程信息格式无效，未创建任何日程。', 'DEEPSEEK_PLAN', 502) from None
        return {**result, **response}

CLIENT = DeepSeekClient()
