"""Android-only host; reuse every existing API without desktop credentials."""
import base64
import hmac
from http.cookies import CookieError, SimpleCookie
from pathlib import Path
import secrets
import threading
from urllib.parse import urlsplit

_lock = threading.Lock()
_server = None


def session_allowed(cookie, expected):
    """Loopback is shared by Android apps; Origin/CSRF alone is not isolation."""
    if not expected or not isinstance(cookie, str) or len(cookie) > 4096:
        return False
    try:
        parsed = SimpleCookie()
        parsed.load(cookie)
        value = parsed.get('ketime_session')
        return bool(value and hmac.compare_digest(value.value, expected))
    except (CookieError, ValueError, TypeError):
        return False


def get_session_token():
    # Called only by the native Application; never returned through HTTP/JS.
    if _server is None:
        raise RuntimeError('Local service is not ready')
    return _server.session_token


def android_response(status, body, content_type, request_path):
    # The desktop host only has inline CSS and defaults static files to HTML.
    # WebView enforces nosniff, so the Android stylesheet needs its actual MIME.
    if status == 200 and urlsplit(request_path).path == '/android-mobile.css':
        return body, 'text/css; charset=utf-8'
    if isinstance(body, dict) and 'csrfToken' in body:
        return dict(body, version='1.0.29', platform='android', credentialStorage='Android Keystore'), content_type
    if status == 200 and content_type.startswith('text/html') and isinstance(body, bytes):
        page = body.decode('utf-8')
        page = page.replace('</head>', '<script>window.KetimeAndroid=true</script><link rel="stylesheet" href="/android-mobile.css"></head>', 1)
        page = page.replace('</body>', '<script src="/android-mobile.js"></script></body>', 1)
        body = page.encode('utf-8')
    return body, content_type


def configure_storage(private_root, crypto):
    import local_settings
    root = Path(private_root).resolve()
    root.mkdir(parents=True, exist_ok=True)

    def crypt(data, decrypt=False):
        try:
            method = crypto.decryptBase64 if decrypt else crypto.encryptBase64
            return base64.b64decode(str(method(base64.b64encode(data).decode('ascii'))), validate=True)
        except Exception:
            from bupt_sync import SyncError
            raise SyncError('Android 本机加密失败，原凭据未修改。', 'SETTINGS_CRYPTO') from None

    local_settings.crypt = crypt
    local_settings.VAULT_PATH = root / 'school.aes'
    local_settings.MAGIC = b'KETIME-ANDROID-SCHOOL-1\n'
    import chatgpt_client
    chatgpt_client.crypt = crypt
    chatgpt_client.VAULT_PATH = root / 'chatgpt.aes'
    chatgpt_client.MAGIC = b'KETIME-ANDROID-CHATGPT-1\n'
    import deepseek_client
    deepseek_client.crypt = crypt
    deepseek_client.VAULT_PATH = root / 'deepseek.aes'
    deepseek_client.MAGIC = b'KETIME-ANDROID-DEEPSEEK-1\n'
    import api_clients
    api_clients.crypt = crypt
    for provider in ('kimi', 'minimax'):
        api_clients.VAULT_PATHS[provider] = root / (provider + '.aes')
        api_clients.MAGICS[provider] = ('KETIME-ANDROID-' + provider.upper() + '-1\n').encode()
    if crypt(crypt(b'ketime-keystore-check'), decrypt=True) != b'ketime-keystore-check':
        raise RuntimeError('Keystore verification failed')


def start(private_root, web_root, crypto):
    global _server
    with _lock:
        if _server is not None:
            return 'http://127.0.0.1:8766/'
        configure_storage(private_root, crypto)
        import ketime_server
        ketime_server.ROOT = Path(web_root).resolve()
        ketime_server.STATIC_FILES |= {'android-mobile.js', 'android-mobile.css'}

        class AndroidHandler(ketime_server.Handler):
            def do_GET(self):
                # System-browser OAuth callbacks use the existing one-use state
                # checks. Every other endpoint needs the native HttpOnly cookie.
                if urlsplit(self.path).path != '/auth/callback' and not session_allowed(self.headers.get('Cookie', ''), self.server.session_token):
                    self.send(403, {'error': '仅允许刻时应用内页面访问本机服务。'})
                    return
                super().do_GET()

            def do_POST(self):
                if not session_allowed(self.headers.get('Cookie', ''), self.server.session_token):
                    self.send(403, {'error': '应用会话无效，请重新打开刻时。'})
                    return
                super().do_POST()

            def send(self, status, body, content_type='application/json; charset=utf-8'):
                body, content_type = android_response(status, body, content_type, self.path)
                super().send(status, body, content_type)

        # Stable origin is essential for WebView localStorage; never fall back to
        # another app's listener, or a random port which hides the user's data.
        class AndroidHTTPServer(ketime_server.LocalHTTPServer):
            # Reopen after process death despite TCP TIME_WAIT. Linux still
            # rejects a second live listener; SO_REUSEPORT is never enabled.
            allow_reuse_address = True
        _server = AndroidHTTPServer(('127.0.0.1', 8766), AndroidHandler)
        _server.session_token = secrets.token_urlsafe(32)
        thread = threading.Thread(target=_server.serve_forever, name='ketime-local-api', daemon=True)
        thread.start()
        return 'http://127.0.0.1:8766/'
