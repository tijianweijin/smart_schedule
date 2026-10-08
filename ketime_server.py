"""Local-only API; persistent credentials protected by current-user Windows DPAPI."""
import argparse
import hmac
import json
import secrets
import socket
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from bupt_sync import SyncError, fetch_timetable
from ucloud_sync import prepare_login, fetch_homework
from local_settings import public_settings, save_settings, stored_credentials
from chatgpt_client import CLIENT as CHATGPT
from deepseek_client import CLIENT as DEEPSEEK

ROOT = Path(__file__).resolve().parent
MAIN_FILE = "ketime _demo_0.1.html"
STATIC_FILES = {MAIN_FILE, "刻时 小样.html", "bupt-import.js", "bupt-ui.js", "school-tools.js", "school-ui.js", "schedule-overlap.js", "daily-reminders.js", "chatgpt-ui.js", "ai-providers.js", "schedule-assistant.js"}
BOOT_TOKEN = secrets.token_urlsafe(32)
SYNC_LOCK = threading.Lock()
LAST_REQUEST = 0.0
LAST_CLOUD_REQUESTS = {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def safe_origin(self):
        expected = f"http://127.0.0.1:{self.server.server_port}"
        return self.headers.get("Host") == expected.split("://")[1] and self.headers.get("Origin", expected) == expected and self.headers.get("Sec-Fetch-Site", "same-origin") not in ("cross-site", "same-site")

    def send(self, status, body, content_type="application/json; charset=utf-8"):
        if isinstance(body, dict):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == "/auth/callback":
            # Top-level OAuth navigation is cross-site, but must target our loopback
            # Host and pass a one-use cryptographic state. Never log the callback URL.
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}" or len(self.path) > 16384:
                self.send(403, {"error": "授权回调地址不正确。"})
                return
            try:
                CHATGPT.callback(parse_qs(urlsplit(self.path).query, keep_blank_values=True, max_num_fields=20))
                text = "ChatGPT 已连接。请返回刻时的设置 → 智能模型选择 → GPT，选择模型并发送消息。"
                status = 200
            except SyncError as exc:
                if exc.code == "invalid_grant":
                    try:
                        recovery_url = CHATGPT.recover_grant(self.server.server_port)
                    except Exception:
                        recovery_url = None
                    if recovery_url:
                        self.send_response(303)
                        self.send_header("Location", recovery_url)
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("Referrer-Policy", "no-referrer")
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                        return
                text, status = str(exc), 400
            except Exception:
                text, status = "授权未完成，请返回刻时重新连接。", 500
            # No code/token echoed. Removes the callback query from browser history.
            from html import escape
            self.send(status, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>刻时 ChatGPT 授权</title><script>history.replaceState(null,"","/auth/callback")</script><body><h1>' + escape(text) + '</h1><p>可以关闭此标签页，返回原刻时页面。</p><a href="/">返回刻时</a></body></html>', "text/html; charset=utf-8")
            return
        if not self.safe_origin():
            self.send(403, {"error": "仅允许刻时本机页面访问。"})
            return
        path = unquote(urlsplit(self.path).path)
        if path == "/api/config":
            self.send(200, {"csrfToken": BOOT_TOKEN, "version": "0.9.0", "provider": "bupt", "chatgpt": True, "deepseek": True, "modelSettings": True, "scheduleAssistant": True, "assistantDrafts": True})
            return
        name = MAIN_FILE if path == "/" else path[1:]
        if name not in STATIC_FILES or not (ROOT / name).is_file():
            self.send(404, {"error": "页面不存在。"})
            return
        content_type = "text/javascript; charset=utf-8" if name.endswith(".js") else "text/html; charset=utf-8"
        self.send(200, (ROOT / name).read_bytes(), content_type)

    def do_POST(self):
        global LAST_REQUEST
        if not self.safe_origin() or not hmac.compare_digest(self.headers.get("X-Ketime-Token", ""), BOOT_TOKEN):
            self.send(403, {"error": "请求验证失败，请刷新刻时页面。"})
            return
        if self.path not in ("/api/bupt/timetable", "/api/ucloud/prepare", "/api/ucloud/homework", "/api/settings/read", "/api/settings/save", "/api/chatgpt/status", "/api/chatgpt/connect", "/api/chatgpt/models", "/api/chatgpt/configure", "/api/chatgpt/test", "/api/chatgpt/assistant", "/api/chatgpt/disconnect", "/api/chatgpt/select", "/api/deepseek/status", "/api/deepseek/connect", "/api/deepseek/models", "/api/deepseek/configure", "/api/deepseek/test", "/api/deepseek/disconnect"):
            self.send(404, {"error": "接口不存在。"})
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send(415, {"error": "请求格式不正确。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= (131072 if self.path == "/api/chatgpt/assistant" else 16384):
                raise ValueError
        except ValueError:
            self.send(413, {"error": "请求数据大小不正确。"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError
        except (ValueError, UnicodeError):
            self.send(400, {"error": "请求格式不正确。"})
            return
        if self.path.startswith('/api/deepseek/'):
            try:
                action = self.path.rsplit('/', 1)[1]
                result = DEEPSEEK.status() if action == 'status' else DEEPSEEK.models() if action == 'models' else DEEPSEEK.disconnect() if action == 'disconnect' else getattr(DEEPSEEK, action)(payload)
                self.send(200, result)
            except SyncError as exc:
                self.send(exc.status, {'error': str(exc), 'code': exc.code})
            except Exception:
                self.send(502, {'error': 'DeepSeek 请求未完成，请检查连接后重试。', 'code': 'DEEPSEEK_FAILED'})
            finally:
                payload.clear()
            return
        if self.path.startswith("/api/chatgpt/"):
            try:
                action = self.path.rsplit("/", 1)[1]
                if action == "connect":
                    result = CHATGPT.begin(self.server.server_port, payload.get("newAccount") is True)
                elif action == "models":
                    result = CHATGPT.models()
                elif action == "test":
                    result = CHATGPT.test(payload.get("message"), payload.get("model"), payload.get("reasoningEffort"))
                elif action == "configure":
                    result = CHATGPT.configure(payload)
                elif action == "assistant":
                    provider = payload.pop('provider', 'gpt')
                    if provider not in ('gpt', 'deepseek'):
                        raise SyncError('此提供方尚未接入，未调用其他模型。', 'AI_PROVIDER')
                    result = (DEEPSEEK if provider == 'deepseek' else CHATGPT).assistant(payload)
                elif action == "disconnect":
                    result = CHATGPT.disconnect()
                elif action == "select":
                    result = CHATGPT.select(payload.get("account"))
                else:
                    result = CHATGPT.status()
                self.send(200, result)
            except SyncError as exc:
                self.send(exc.status, {"error": str(exc), "code": exc.code})
            except Exception:
                self.send(502, {"error": "ChatGPT 请求未完成，请重新连接或稍后重试。", "code": "CHATGPT_FAILED"})
            finally:
                payload.clear()
            return
        if self.path.startswith("/api/settings/"):
            try:
                result = public_settings() if self.path.endswith("/read") else save_settings(payload)
                self.send(200, result)
            except SyncError as exc:
                self.send(exc.status, {"error": str(exc), "code": exc.code})
            except Exception:
                self.send(500, {"error": "本机设置读取或保存失败。", "code": "SETTINGS_FAILED"})
            finally:
                payload.clear()
            return
        if not SYNC_LOCK.acquire(blocking=False):
            self.send(429, {"error": "正在获取课表，请等待。"})
            return
        try:
            last = LAST_REQUEST if self.path == "/api/bupt/timetable" else LAST_CLOUD_REQUESTS.get(self.path, 0)
            if time.monotonic() - last < 5:
                self.send(429, {"error": "请等待几秒后再同步。"})
                return
            if self.path == "/api/bupt/timetable":
                LAST_REQUEST = time.monotonic()
            else:
                LAST_CLOUD_REQUESTS[self.path] = time.monotonic()
            if self.path == "/api/ucloud/prepare":
                result = prepare_login()
            elif self.path == "/api/ucloud/homework":
                if payload.get("stored") is True:
                    account, password, _ = stored_credentials(cloud=True)
                else:
                    account, password = str(payload.pop("account", "")).strip(), str(payload.pop("password", ""))
                result = fetch_homework(str(payload.pop("loginId", "")), account, password, str(payload.pop("captcha", "")))
            else:
                if payload.get("stored") is True:
                    account, password, term_start = stored_credentials()
                else:
                    account, password, term_start = str(payload.pop("account", "")).strip(), str(payload.pop("password", "")), str(payload.get("termStart", ""))
                result = fetch_timetable(account, password, term_start)
            self.send(200, result)
        except SyncError as exc:
            self.send(exc.status, {"error": str(exc), "code": exc.code})
        except Exception:
            self.send(502, {"error": "学校数据同步失败，请稍后重试。", "code": "SYNC_FAILED"})
        finally:
            payload.clear()
            SYNC_LOCK.release()


class LocalHTTPServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can otherwise permit old and new services on one port.
    allow_reuse_address = False
    allow_reuse_port = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--no-browser", action="store_true")
    options = parser.parse_args()
    try:
        server = LocalHTTPServer(("127.0.0.1", options.port), Handler)
    except OSError:
        print("刻时启动失败：端口已占用。请关闭旧的刻时服务或使用 --port 指定其他端口。")
        return 1
    url = f"http://127.0.0.1:{server.server_port}/"
    print("刻时已启动：" + url)
    print("此窗口关闭后停止课表同步；课程数据保存在本机浏览器。")
    if not options.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
