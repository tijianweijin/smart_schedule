"""Read-only BUPT teaching-cloud adapter. All authentication lives in memory."""
import base64
import hashlib
import json
import re
import secrets
import threading
import time
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
from urllib.request import HTTPCookieProcessor, HTTPRedirectHandler, ProxyHandler, Request, build_opener

from bupt_sync import SHANGHAI, SyncError

AUTH = "https://auth.bupt.edu.cn/authserver/login?service=https://ucloud.bupt.edu.cn"
API = "https://apiucloud.bupt.edu.cn"
BASIC = "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ="
SESSIONS = {}
SESSION_LOCK = threading.Lock()


class ManualRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class LoginFields(HTMLParser):
    def __init__(self):
        super().__init__()
        self.execution = ""

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "input" and values.get("name") == "execution":
            self.execution = values.get("value", "")


def request(client, url, form=None, headers=None):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ("auth.bupt.edu.cn", "apiucloud.bupt.edu.cn"):
        raise SyncError("教学云请求地址不受支持。", "CLOUD_HOST")
    defaults = {"User-Agent": "Mozilla/5.0", "Referer": "https://ucloud.bupt.edu.cn/"}
    defaults.update(headers or {})
    body = urlencode(form).encode() if form is not None else None
    if body is not None:
        defaults["Content-Type"] = "application/x-www-form-urlencoded"
    try:
        response = client.open(Request(url, data=body, headers=defaults), timeout=25)
    except HTTPError as exc:
        response = exc
    except (URLError, TimeoutError, OSError):
        raise SyncError("无法连接教学云，请检查网络后重试。", "CLOUD_NETWORK", 502) from None
    with response:
        content = response.read(4 * 1024 * 1024 + 1)
        if len(content) > 4 * 1024 * 1024:
            raise SyncError("教学云返回数据过大。", "CLOUD_SIZE", 502)
        return response.status, response.headers, content


def api_json(client, path, token="", identity="", form=None):
    if not path.startswith(("/ykt-basics/", "/ykt-site/")):
        raise SyncError("教学云接口不受支持。")
    headers = {"Authorization": BASIC, "Tenant-Id": "000000", "Accept": "application/json"}
    if token:
        headers["Blade-Auth"] = token
    if identity:
        headers["Identity"] = identity
    status, _, body = request(client, API + path, form=form, headers=headers)
    if status in (401, 403):
        raise SyncError("教学云登录失效或无学生权限，请重新登录。", "CLOUD_AUTH", 401)
    if status != 200:
        raise SyncError("教学云服务暂时不可用。", "CLOUD_HTTP", 502)
    try:
        data = json.loads(body)
    except (ValueError, UnicodeError):
        raise SyncError("教学云接口格式已变化。", "CLOUD_FORMAT", 502) from None
    if not isinstance(data, dict):
        raise SyncError("教学云接口格式已变化。", "CLOUD_FORMAT", 502)
    if data.get("error") or data.get("success") is False or str(data.get("code", 200)) not in ("200", "0"):
        raise SyncError("教学云请求失败，请重新登录或稍后重试。", "CLOUD_AUTH", 401)
    return data


def prepare_login():
    client = build_opener(ProxyHandler({}), HTTPCookieProcessor(CookieJar()), ManualRedirect())
    status, _, body = request(client, AUTH)
    if status != 200:
        raise SyncError("统一认证登录页暂时不可用。", "CLOUD_LOGIN_PAGE", 502)
    html = body.decode("utf-8", "replace")
    fields = LoginFields()
    fields.feed(html)
    if not fields.execution:
        raise SyncError("统一认证页面已变化，无法读取登录表单。", "CLOUD_LOGIN_FORMAT", 502)
    captcha_match = re.search(r"config\.captcha[^{]*\{[^}]*id:\s*['\"]([^'\"]+)['\"]", html)
    captcha_image = ""
    if captcha_match:
        url = "https://auth.bupt.edu.cn/authserver/captcha?" + urlencode({"captchaId": captcha_match[1]})
        code, headers, image = request(client, url)
        mime = headers.get("Content-Type", "").split(";")[0]
        if code != 200 or mime not in ("image/png", "image/jpeg", "image/gif") or len(image) > 512000:
            raise SyncError("验证码暂时不可用，请稍后重试。", "CLOUD_CAPTCHA", 502)
        captcha_image = "data:" + mime + ";base64," + base64.b64encode(image).decode()
    login_id = secrets.token_urlsafe(32)
    with SESSION_LOCK:
        now = time.monotonic()
        for old in list(SESSIONS):
            if now - SESSIONS[old][0] > 300:
                del SESSIONS[old]
        if len(SESSIONS) >= 8:
            del SESSIONS[next(iter(SESSIONS))]
        SESSIONS[login_id] = (now, client, fields.execution)
    return {"loginId": login_id, "captchaImage": captcha_image, "expiresIn": 300}


def authenticate(login_id, account, password, captcha=""):
    if not re.fullmatch(r"[A-Za-z0-9._-]{4,32}", account) or not password or len(password) > 256 or len(captcha) > 32:
        raise SyncError("请填写有效的统一认证账号与密码。", "CLOUD_INPUT")
    with SESSION_LOCK:
        session = SESSIONS.pop(login_id, None)
    if not session or time.monotonic() - session[0] > 300:
        raise SyncError("登录准备已过期，请重新点击准备登录。", "CLOUD_EXPIRED")
    _, client, execution = session
    form = {"username": account, "password": password, "type": "username_password", "execution": execution, "_eventId": "submit", "submit": "登录"}
    if captcha:
        form["captcha"] = captcha
    status, headers, _ = request(client, AUTH, form=form, headers={"Referer": AUTH})
    form.clear()
    if status != 302:
        raise SyncError("统一认证登录失败；请检查密码或重新准备登录并填写验证码。", "CLOUD_LOGIN_FAILED", 401)
    redirect = urlsplit(urljoin(AUTH, headers.get("Location", "")))
    if redirect.scheme != "https" or redirect.hostname != "ucloud.bupt.edu.cn":
        raise SyncError("统一认证返回了非教学云跳转地址。", "CLOUD_REDIRECT", 502)
    ticket = parse_qs(redirect.query).get("ticket", [""])[0]
    if not ticket or len(ticket) > 8192:
        raise SyncError("统一认证未返回有效登录票据。", "CLOUD_TICKET", 502)
    initial = api_json(client, "/ykt-basics/oauth/token", form={"ticket": ticket, "grant_type": "third"})
    refresh_token = initial.get("refresh_token", "")
    if not refresh_token or not isinstance(refresh_token, str):
        raise SyncError("教学云未返回有效会话。", "CLOUD_TOKEN", 502)
    roles = api_json(client, "/ykt-basics/userroledomaindept/listByUserId", token=refresh_token).get("data")
    if not isinstance(roles, list):
        raise SyncError("无法读取教学云学生身份。", "CLOUD_ROLE", 502)
    role = next((r for r in roles if isinstance(r, dict) and (r.get("roleName") == "学生" or r.get("roleCode") == "JS005")), None)
    if not role or not role.get("id"):
        raise SyncError("当前账号没有教学云学生身份。", "CLOUD_ROLE", 403)
    user = api_json(client, "/ykt-basics/oauth/token", form={"grant_type": "refresh_token", "refresh_token": refresh_token, "identity": str(role["id"])})
    token, user_id = user.get("access_token"), user.get("user_id")
    if not isinstance(token, str) or not token or not user_id:
        raise SyncError("教学云学生会话无效。", "CLOUD_TOKEN", 502)
    return client, token, str(user_id), "JS005:" + str(role["id"])


def plain(value, maximum=200):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]*>", " ", str(value or "")))).strip()[:maximum]


def convert_homework(payload, account_key):
    root = payload.get("data")
    records = root.get("undoneList") if isinstance(root, dict) else None
    if not isinstance(records, list) or len(records) > 10000:
        raise SyncError("教学云作业列表格式已变化。", "CLOUD_FORMAT", 502)
    assignments, seen, ignored = [], set(), 0
    for raw in records:
        if not isinstance(raw, dict):
            raise SyncError("教学云作业条目格式异常。", "CLOUD_FORMAT", 502)
        if str(raw.get("type")) != "3":
            ignored += 1
            continue
        source_id = str(raw.get("activityId", ""))
        title = plain(raw.get("activityName"))
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", source_id) or not title:
            raise SyncError("教学云作业缺少名称或编号，未导入任何条目。", "CLOUD_FORMAT", 502)
        if source_id in seen:
            continue
        seen.add(source_id)
        due = str(raw.get("endTime") or "").strip()
        if due:
            try:
                parsed = datetime.fromisoformat(due.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=SHANGHAI)
                due = parsed.astimezone(SHANGHAI).isoformat(timespec="minutes")
            except ValueError:
                due = ""
        course = plain(raw.get("siteName"))
        name = ((course + "：") if course else "") + title
        assignments.append({"sourceId": source_id, "title": title, "courseName": course, "name": name[:200], "dueAt": due, "url": "https://ucloud.bupt.edu.cn/"})
    assignments.sort(key=lambda a: (a["dueAt"] or "9999", a["name"]))
    return {"provider": "bupt-ucloud", "accountKey": account_key, "assignments": assignments, "ignored": ignored, "fetchedAt": datetime.now(SHANGHAI).isoformat(timespec="seconds")}


def fetch_homework(login_id, account, password, captcha=""):
    client, token, user_id, identity = authenticate(login_id, account, password, captcha)
    result = api_json(client, "/ykt-site/site/student/undone?" + urlencode({"userId": user_id}), token=token, identity=identity)
    account_key = hashlib.sha256(("ketime-ucloud:" + account).encode()).hexdigest()[:24]
    return convert_homework(result, account_key)
