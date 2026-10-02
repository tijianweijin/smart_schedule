"""Local-only launcher and API. No credential persistence, third-party proxy or logs."""
import argparse
import hmac
import json
import secrets
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from bupt_sync import SyncError, fetch_timetable

ROOT = Path(__file__).resolve().parent
MAIN_FILE = "ketime _demo_0.1.html"
STATIC_FILES = {MAIN_FILE, "刻时 小样.html", "bupt-import.js", "bupt-ui.js"}
BOOT_TOKEN = secrets.token_urlsafe(32)
SYNC_LOCK = threading.Lock()
LAST_REQUEST = 0.0


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
        if not self.safe_origin():
            self.send(403, {"error": "仅允许刻时本机页面访问。"})
            return
        path = unquote(urlsplit(self.path).path)
        if path == "/api/config":
            self.send(200, {"csrfToken": BOOT_TOKEN, "version": "0.3.0", "provider": "bupt"})
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
        if self.path != "/api/bupt/timetable":
            self.send(404, {"error": "接口不存在。"})
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send(415, {"error": "请求格式不正确。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16384:
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
        if not SYNC_LOCK.acquire(blocking=False):
            self.send(429, {"error": "正在获取课表，请等待。"})
            return
        try:
            if time.monotonic() - LAST_REQUEST < 5:
                self.send(429, {"error": "请等待几秒后再同步。"})
                return
            LAST_REQUEST = time.monotonic()
            result = fetch_timetable(str(payload.pop("account", "")).strip(),
                                     str(payload.pop("password", "")), str(payload.get("termStart", "")))
            self.send(200, result)
        except SyncError as exc:
            self.send(exc.status, {"error": str(exc), "code": exc.code})
        except Exception:
            self.send(502, {"error": "课表同步失败，请稍后重试。", "code": "SYNC_FAILED"})
        finally:
            payload.clear()
            SYNC_LOCK.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--no-browser", action="store_true")
    options = parser.parse_args()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", options.port), Handler)
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
