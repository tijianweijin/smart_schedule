"""ChatGPT plan OAuth + minimal Responses test. No browser-visible credentials."""
import base64
import hashlib
import hmac
import json
import os
import re
from pathlib import Path
import secrets
import tempfile
import threading
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from bupt_sync import SyncError
from local_settings import crypt

AUTH = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
AUTHORIZE = AUTH + "/api/accounts/authorize"
TOKEN = AUTH + "/api/accounts/oauth/token"
REVOKE = AUTH + "/api/accounts/oauth/revoke"
JWKS = AUTH + "/.well-known/jwks.json"
PERMISSION = "chatgpt.tokens.use.direct"
SCOPES = "openid profile email offline_access resource.invoke " + PERMISSION
SOL_PRIORITY = ("gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-sol")
REASONING_EFFORT = "low"
API_EFFORTS = ("none", "minimal", "low", "medium", "high", "xhigh", "max")
VAULT_PATH = Path(__file__).resolve().parent / ".local" / "chatgpt.dpapi"
MAGIC = b"KETIME-CHATGPT-DPAPI-1\n"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        # Never forward a bearer credential or OAuth grant to a redirect target.
        return None


def request(url, payload=None, bearer=None, form=False, stream=False):
    headers = {"Accept": "text/event-stream" if stream else "application/json", "User-Agent": "Ketime/0.6"}
    body = None
    if payload is not None:
        body = (urlencode(payload) if form else json.dumps(payload)).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    try:
        response = build_opener(NoRedirect()).open(Request(url, data=body, headers=headers), timeout=60 if stream else 25)
        if stream:
            return response
        with response:
            data = json.loads(response.read(2 * 1024 * 1024 + 1))
        if not isinstance(data, dict):
            raise ValueError
        return data
    except HTTPError as exc:
        # Surface only a bounded error code, never remote messages/raw token responses.
        code = "HTTP_" + str(exc.code)
        try:
            error = json.loads(exc.read(16384)).get("error")
            candidate = error.get("code") or error.get("type") if isinstance(error, dict) else error
            if isinstance(candidate, str) and len(candidate) <= 80 and all(c.isalnum() or c in "_-" for c in candidate):
                code = candidate
        except (ValueError, AttributeError):
            pass
        messages = {401: "授权已失效，请重新连接 ChatGPT。", 403: "账户或当前网络不允许此请求，请核对授权与账户资格。", 429: "ChatGPT 额度或请求频率受限，请稍后再试。"}
        raise SyncError(messages.get(exc.code, "OpenAI 请求未成功，请稍后重试。") + "（" + code + "）", code, 502) from None
    except (URLError, TimeoutError, OSError):
        raise SyncError("无法连接 OpenAI，请检查网络后重试。", "CHATGPT_NETWORK", 502) from None
    except (ValueError, UnicodeError):
        raise SyncError("OpenAI 返回的数据格式不正确。", "CHATGPT_RESPONSE", 502) from None


def read_vault():
    if not VAULT_PATH.exists():
        return {"hostId": "urn:uuid:" + str(uuid.uuid4()), "profiles": [], "active": ""}
    try:
        data = VAULT_PATH.read_bytes()
        if not data.startswith(MAGIC) or len(data) > 1024 * 1024:
            raise ValueError
        result = json.loads(crypt(data[len(MAGIC):], decrypt=True))
        if not isinstance(result, dict) or not str(result.get("hostId", "")).startswith("urn:uuid:") or not isinstance(result.get("profiles"), list):
            raise ValueError
        return result
    except SyncError:
        raise
    except (OSError, ValueError, UnicodeError):
        raise SyncError("ChatGPT 本机授权文件损坏或不可读取，原数据未修改。", "CHATGPT_VAULT") from None


def write_vault(data):
    encoded = MAGIC + crypt(json.dumps(data, ensure_ascii=False).encode())
    temporary = None
    try:
        VAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=VAULT_PATH.parent, prefix="chatgpt-", suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, VAULT_PATH)
    except OSError:
        raise SyncError("ChatGPT 授权保存失败，原授权未修改。", "CHATGPT_VAULT") from None
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def validate_identity(encoded, client_id, nonce):
    try:
        import jwt
    except ImportError:
        raise SyncError("缺少授权验证库，请运行 python -m pip install -r requirements-chatgpt.txt。", "CHATGPT_DEPENDENCY") from None
    try:
        header = jwt.get_unverified_header(encoded)
        if header.get("alg") not in ("RS256", "ES256") or not header.get("kid"):
            raise ValueError
        keys = request(JWKS).get("keys", [])
        key = next(key for key in keys if key.get("kid") == header["kid"])
        public_key = jwt.PyJWK.from_dict(key, algorithm=header["alg"]).key
        claims = jwt.decode(encoded, public_key, algorithms=[header["alg"]], audience=client_id, issuer=AUTH,
                            options={"require": ["exp", "iat", "iss", "aud", "sub", "nonce"]})
        if not isinstance(claims["sub"], str) or not claims["sub"] or not isinstance(claims["nonce"], str) or not hmac.compare_digest(claims["nonce"], nonce):
            raise ValueError
        return claims
    except SyncError:
        raise
    except Exception:
        raise SyncError("ChatGPT 身份验证未通过，未保存授权，请重新连接。", "CHATGPT_IDENTITY") from None


def token_fields(data, previous=None):
    previous = previous or {}
    scopes = str(data.get("scope", " ".join(previous.get("scopes", [])))).split()
    access, refresh = data.get("access_token"), data.get("refresh_token", previous.get("refresh_token"))
    try:
        expiry = int(data.get("expires_in", 0))
    except (TypeError, ValueError):
        expiry = 0
    if PERMISSION not in scopes:
        raise SyncError("尚未授权使用 ChatGPT 套餐，请重新连接并允许使用套餐额度。", "CHATGPT_PERMISSION")
    if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh or expiry <= 0 or str(data.get("token_type", "")).lower() != "bearer":
        raise SyncError("ChatGPT 未返回完整授权，未保存，请重新连接。", "CHATGPT_TOKEN")
    return {"access_token": access, "refresh_token": refresh, "scopes": scopes, "expiresAt": time.time() + expiry}


def parse_stream(response):
    chunks, completed, count, started = [], False, 0, time.monotonic()
    def event(lines):
        nonlocal completed
        if not lines:
            return
        value = "\n".join(lines)
        if value == "[DONE]":
            return
        try:
            data = json.loads(value)
        except ValueError:
            raise SyncError("回复流格式不正确。", "CHATGPT_STREAM", 502) from None
        kind = data.get("type")
        if kind == "response.output_text.delta":
            delta = data.get("delta", "")
            if not isinstance(delta, str):
                raise SyncError("回复文字格式不正确。", "CHATGPT_STREAM", 502)
            chunks.append(delta)
        elif kind == "response.completed":
            completed = True
            if not chunks:
                for item in data.get("response", {}).get("output", []):
                    for part in item.get("content", []):
                        if part.get("type") == "output_text":
                            chunks.append(part.get("text", ""))
        elif kind in ("response.failed", "response.incomplete", "error"):
            raise SyncError("OpenAI 未完成回复，可能是额度、授权或服务限制。请稍后重试。", "CHATGPT_INFERENCE_FAILED", 502)
    with response:
        lines = []
        while True:
            raw = response.readline(262145)
            if not raw:
                event(lines)
                break
            count += len(raw)
            if count > 2 * 1024 * 1024 or len(raw) > 262144 or time.monotonic() - started > 120:
                raise SyncError("回复超过测试长度或时间限制。", "CHATGPT_STREAM_LIMIT", 502)
            line = raw.decode("utf-8").rstrip("\r\n")
            if not line:
                event(lines)
                lines = []
                if completed:
                    break
            elif line.startswith("data:"):
                lines.append(line[5:].lstrip(" "))
    text = "".join(chunks).strip()
    if not completed or not text:
        raise SyncError("未收到完整的文字回复，测试尚未成功。", "CHATGPT_INCOMPLETE", 502)
    return text


def model_catalog(raw):
    """Only account-visible, API-capable GPT text models; never expose raw catalog."""
    rows = raw.get("models") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        raise SyncError("模型目录格式无效，请点击更新模型后重试。", "CHATGPT_NO_MODELS", 502)
    models, seen = [], set()
    for row in rows[:500]:
        if not isinstance(row, dict) or row.get("visibility") != "list" or row.get("supported_in_api") is False:
            continue
        slug = row.get("slug")
        match = re.fullmatch(r"gpt-(\d+(?:\.\d+)?)(?:-([a-z]+))?(?:-[a-zA-Z0-9.-]+)?", slug) if isinstance(slug, str) and len(slug) <= 120 else None
        modalities = row.get("input_modalities", ["text"])
        if not match or slug in seen or not isinstance(modalities, list) or "text" not in modalities:
            continue
        seen.add(slug)
        version, series = match.groups()
        levels = row.get("supported_reasoning_levels")
        if isinstance(levels, list):
            offered = [item.get("effort") if isinstance(item, dict) else item for item in levels if isinstance(item, (dict, str))]
            efforts = [effort for effort in API_EFFORTS if effort in offered]
        elif version in ("5", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "6", "6.0", "6.1"):
            # Compatibility for older catalogs; newer metadata takes precedence.
            efforts = ["low", "medium", "high"]
        else:
            efforts = []
        if isinstance(levels, list) and levels and not efforts:
            continue  # Catalog-only effort modes aren't assumed to work in public Responses.
        default = REASONING_EFFORT if REASONING_EFFORT in efforts else row.get("default_reasoning_level")
        if default not in efforts:
            default = efforts[0] if efforts else "auto"
        models.append({"id": slug, "name": str(row.get("display_name") or slug)[:200], "provider": "GPT",
                       "version": version if "." in version else version + ".0", "series": (series or "默认").capitalize(),
                       "reasoningEfforts": efforts or ["auto"], "defaultReasoningEffort": default})
    if not models:
        raise SyncError("当前账户没有可调用的 GPT 文字模型，请更新模型或检查账户授权。", "CHATGPT_NO_MODELS", 502)
    return models


def resolve_selection(catalog, model=None, effort=None):
    selected = model if model is not None else catalog.get("selectedModel", catalog["defaultModel"])
    row = next((item for item in catalog["models"] if item["id"] == selected), None)
    if not row:
        raise SyncError("所选模型已不可用，请在设置中更新模型并重新保存选择；未改用其他模型。", "CHATGPT_MODEL")
    if effort is None:
        effort = catalog.get("reasoningEffort", REASONING_EFFORT) if selected == catalog.get("selectedModel", catalog["defaultModel"]) else row["defaultReasoningEffort"]
    if not isinstance(effort, str) or effort not in row["reasoningEfforts"]:
        raise SyncError("此模型不支持所选推理强度，请重新选择并保存；未自动降低或提高强度。", "CHATGPT_EFFORT")
    return selected, effort


class ChatGPTClient:
    def __init__(self):
        self.lock = threading.RLock()
        self.test_lock = threading.Lock()
        self.pending = None
        self.last_error = ""

    def profile(self, data):
        return next((p for p in data["profiles"] if p["client_id"] == data.get("active")), None)

    def status(self):
        with self.lock:
            data = read_vault()
            profile = self.profile(data)
            if self.pending and self.pending["expiresAt"] < time.time():
                self.pending = None
                self.last_error = "登录已超时，请重新连接。"
            return {"connected": bool(profile and profile.get("access_token")), "email": profile.get("email", "") if profile else "",
                    "pending": bool(self.pending), "error": self.last_error,
                    "accounts": [{"id": p["client_id"], "email": p.get("email", ""), "active": p["client_id"] == data.get("active")} for p in data["profiles"]]}

    def begin(self, port, new_account=False, recovery=False):
        # Dependency checks precede opening the browser or obtaining credentials.
        try:
            import jwt
            from cryptography.hazmat.primitives import serialization
        except ImportError:
            raise SyncError("请先运行 python -m pip install -r requirements-chatgpt.txt。", "CHATGPT_DEPENDENCY") from None
        with self.lock:
            data = read_vault()
            if not VAULT_PATH.exists():
                write_vault(data)  # Stable host ID exists before first authorization.
            # Registration is not authenticated identity. Keep it separate from
            # profiles so a failed exchange neither loses its client ID nor
            # replaces any previously validated/active account.
            registration = None if new_account else data.get("registrationAttempt")
            profile = None if new_account or registration else self.profile(data)
            verifier, state, nonce = (secrets.token_urlsafe(48) for _ in range(3))
            callback = f"http://127.0.0.1:{port}/auth/callback"
            client_id = registration["client_id"] if registration else profile["client_id"] if profile else "dynamic_agent_client"
            params = {"client_id": client_id, "ext_agent_host_id": data["hostId"], "redirect_uri": callback, "response_type": "code",
                      "scope": SCOPES, "resource": RESOURCE, "state": state, "nonce": nonce,
                      "code_challenge_method": "S256", "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")}
            if client_id == "dynamic_agent_client":
                params["agent_name_hint"] = "刻时 Ketime"
            # Omit id_token_hint: no identity token in any browser-visible URL.
            self.pending = {"state": state, "nonce": nonce, "verifier": verifier, "callback": callback,
                            "client_id": client_id, "subject": registration.get("subject") if registration else profile.get("subject") if profile else None,
                            "retryCount": registration.get("retryCount", 0) + 1 if recovery and registration else 0,
                            "expiresAt": time.time() + 600}
            self.last_error = ""
            return {"authorizationUrl": AUTHORIZE + "?" + urlencode(params), "expiresIn": 600}

    def callback(self, params):
        with self.lock:
            attempt = self.pending
            state = params.get("state", [""])
            if not attempt or attempt["expiresAt"] < time.time() or len(state) != 1 or not hmac.compare_digest(state[0].encode(), attempt["state"].encode()):
                raise SyncError("登录请求无效或已超时，请返回刻时重新连接。", "CHATGPT_STATE")
            self.pending = None  # Valid state is consumed once, including errors.
            phase = "回调参数"
            try:
                if params.get("error"):
                    raise SyncError("登录或套餐授权已取消，请返回刻时重新连接。", "CHATGPT_DENIED")
                ids, codes = params.get("client_id", []), params.get("code", [])
                if len(ids) > 1 or len(codes) != 1 or not codes[0]:
                    raise SyncError("授权回调不完整，请重新连接。", "CHATGPT_CALLBACK")
                issued = ids[0] if ids else attempt["client_id"]
                if not isinstance(issued, str) or not issued.startswith("oaiapp_") or len(issued) > 256 or (attempt["client_id"] != "dynamic_agent_client" and issued != attempt["client_id"]):
                    raise SyncError("授权客户端编号不匹配，请重新连接。", "CHATGPT_CLIENT")
                # Persist the issued registration BEFORE exchanging a one-use code.
                # If the code expires/is rejected, the next attempt must reuse it.
                data = read_vault()
                data["registrationAttempt"] = {"client_id": issued, "subject": attempt["subject"], "retryCount": attempt["retryCount"]}
                write_vault(data)
                phase = "授权交换"
                tokens = request(TOKEN, {"grant_type": "authorization_code", "client_id": issued, "code": codes[0],
                                         "code_verifier": attempt["verifier"], "redirect_uri": attempt["callback"], "resource": RESOURCE}, form=True)
                fields = token_fields(tokens)
                phase = "身份验证"
                claims = validate_identity(tokens.get("id_token", ""), issued, attempt["nonce"])
                if attempt["subject"] and claims["sub"] != attempt["subject"]:
                    raise SyncError("返回账户与选定账户不一致，请使用“添加其他账户”。", "CHATGPT_ACCOUNT")
                data = read_vault()
                profile = {"client_id": issued, "subject": claims["sub"], "email": str(claims.get("email", "")), "id_token": tokens["id_token"], **fields}
                previous_profile = next((p for p in data["profiles"] if p["client_id"] == issued and p.get("subject") == claims["sub"]), None)
                if previous_profile and isinstance(previous_profile.get("inferenceConfig"), dict):
                    profile["inferenceConfig"] = previous_profile["inferenceConfig"]
                data["profiles"] = [p for p in data["profiles"] if p["client_id"] != issued] + [profile]
                data["active"] = issued
                data.pop("registrationAttempt", None)
                phase = "本机保存"
                write_vault(data)
                self.last_error = ""
            except SyncError as exc:
                self.last_error = str(exc)
                raise
            except Exception:
                self.last_error = "ChatGPT " + phase + "未完成，请重新连接。"
                raise SyncError(self.last_error, "CHATGPT_CALLBACK_FAILED", 502) from None

    def recover_grant(self, port):
        with self.lock:
            registration = read_vault().get("registrationAttempt")
            if not registration or registration.get("retryCount", 0) >= 1:
                return None
            # New verifier/state/nonce and new authorization code, never retry
            # token exchange with a consumed or rejected code. At most one auto
            # recovery before returning control and the actual error to the user.
            return self.begin(port, recovery=True)["authorizationUrl"]

    def access(self):
        with self.lock:
            data = read_vault()
            profile = self.profile(data)
            if not profile or not profile.get("access_token"):
                raise SyncError("请先连接 ChatGPT。", "CHATGPT_REQUIRED", 401)
            if profile["expiresAt"] <= time.time() + 60:
                result = request(TOKEN, {"grant_type": "refresh_token", "client_id": profile["client_id"],
                                         "refresh_token": profile["refresh_token"], "resource": RESOURCE}, form=True)
                profile.update(token_fields(result, profile))
                write_vault(data)
            return profile["access_token"]

    def models(self):
        with self.lock:
            models = model_catalog(request(RESOURCE + "/models", bearer=self.access()))
            available = {row["id"] for row in models}
            preferred = next((model for model in SOL_PRIORITY if model in available), models[0]["id"])
            profile = self.profile(read_vault()) or {}
            saved = profile.get("inferenceConfig", {})
            if not isinstance(saved, dict):
                saved = {}
            selected = saved.get("model", preferred)
            row = next((item for item in models if item["id"] == selected), None)
            effort = saved.get("reasoningEffort", row["defaultReasoningEffort"] if row else REASONING_EFFORT)
            valid = bool(row and isinstance(effort, str) and effort in row["reasoningEfforts"])
            return {"models": models, "defaultModel": preferred, "selectedModel": selected, "reasoningEffort": effort,
                    "selectionValid": valid, "selectionWarning": "" if valid else "已保存的模型或强度不可用，请重新选择并保存。"}

    def configure(self, payload):
        if not isinstance(payload, dict) or set(payload) != {"model", "reasoningEffort"} or not isinstance(payload["model"], str):
            raise SyncError("请选择模型和推理强度后保存。", "CHATGPT_INPUT")
        with self.lock:
            model, effort = resolve_selection(self.models(), payload["model"], payload["reasoningEffort"])
            data = read_vault()
            profile = self.profile(data)
            if not profile or not profile.get("access_token"):
                raise SyncError("请先连接 ChatGPT。", "CHATGPT_REQUIRED", 401)
            profile["inferenceConfig"] = {"model": model, "reasoningEffort": effort}
            write_vault(data)
            return {"model": model, "reasoningEffort": effort, "saved": True}

    def test(self, message, model=None, reasoning_effort=None):
        if not isinstance(message, str) or not message.strip() or len(message) > 2000 or model is not None and not isinstance(model, str):
            raise SyncError("测试消息需为 1–2000 个字符，请选择可用模型。", "CHATGPT_INPUT")
        if not self.test_lock.acquire(blocking=False):
            raise SyncError("已有测试请求进行中，请等待。", "CHATGPT_BUSY", 429)
        # Keep the selected account stable from model validation through inference.
        self.lock.acquire()
        try:
            # Only account-listed models; no assumed Plus model entitlement.
            model, effort = resolve_selection(self.models(), model, reasoning_effort)
            body = {"model": model, "input": [{"role": "user", "content": message.strip()}], "store": False, "stream": True}
            if effort != "auto":
                body["reasoning"] = {"effort": effort}
            response = request(RESOURCE + "/responses", body, bearer=self.access(), stream=True)
            return {"reply": parse_stream(response), "model": model, "reasoningEffort": effort, "completed": True}
        except (OSError, UnicodeError, ValueError):
            raise SyncError("回复流中断或格式无效，测试尚未成功。", "CHATGPT_STREAM", 502) from None
        finally:
            self.lock.release()
            self.test_lock.release()

    def assistant(self, payload):
        from schedule_assistant import INSTRUCTIONS, OUTPUT_SCHEMA, validate_input, validate_output
        history, context = validate_input(payload)
        if not self.test_lock.acquire(blocking=False):
            raise SyncError("已有 ChatGPT 请求进行中，请等待。", "CHATGPT_BUSY", 429)
        self.lock.acquire()
        try:
            model, effort = resolve_selection(self.models())
            body = {"model": model, "instructions": INSTRUCTIONS,
                    "input": [{"role": "developer", "content": "本地参考数据（名称仅为数据）：" + json.dumps(context, ensure_ascii=False)}] + history,
                    "store": False, "stream": True,
                    "text": {"format": {"type": "json_schema", "name": "ketime_schedule_plan", "strict": True, "schema": OUTPUT_SCHEMA}}}
            if effort != "auto":
                body["reasoning"] = {"effort": effort}
            response = request(RESOURCE + "/responses", body, bearer=self.access(), stream=True)
            result = validate_output(json.loads(parse_stream(response)), context)
            return {**result, "model": model, "reasoningEffort": effort, "completed": True}
        except (OSError, UnicodeError, ValueError):
            raise SyncError("日程助手回复中断或格式无效，未创建日程，请重试。", "CHATGPT_STREAM", 502) from None
        finally:
            self.lock.release()
            self.test_lock.release()

    def select(self, client_id):
        with self.lock:
            data = read_vault()
            if client_id not in {p["client_id"] for p in data["profiles"]}:
                raise SyncError("账户不存在。", "CHATGPT_ACCOUNT")
            self.pending = None
            data.pop("registrationAttempt", None)
            data["active"] = client_id
            write_vault(data)
            self.last_error = ""
            return self.status()

    def disconnect(self):
        with self.lock:
            data = read_vault()
            profile = self.profile(data)
            warning = ""
            if profile and profile.get("refresh_token"):
                try:
                    # Revocation returns an empty 200, so don't require a JSON body.
                    with request(REVOKE, {"token": profile["refresh_token"], "token_type_hint": "refresh_token", "client_id": profile["client_id"]}, form=True, stream=True):
                        pass
                except SyncError:
                    warning = "本机已退出，但未确认远端撤销。请在 ChatGPT 设置中断开刻时。"
            if profile:
                for key in ("access_token", "refresh_token", "id_token", "scopes", "expiresAt"):
                    profile.pop(key, None)
            self.pending = None
            data.pop("registrationAttempt", None)
            write_vault(data)  # Preserve host and account/client mapping for reauthorization.
            self.last_error = ""
            return {**self.status(), "warning": warning}


CLIENT = ChatGPTClient()
