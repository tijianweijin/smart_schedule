"""Device-local BUPT timetable adapter, independently implemented with stdlib.

Only the published mobile academic request/response protocol is referenced.
Credentials and upstream tokens exist only during a single sync request.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

ORIGIN = "https://jwglweixin.bupt.edu.cn"
LOGIN_URL = ORIGIN + "/bjyddx/login"
CURRICULUM_URL = ORIGIN + "/bjyddx/student/curriculum"
SLOTS = [
    ("08:00", "08:45"), ("08:50", "09:35"), ("09:50", "10:35"),
    ("10:40", "11:25"), ("11:30", "12:15"), ("13:00", "13:45"),
    ("13:50", "14:35"), ("14:45", "15:30"), ("15:40", "16:25"),
    ("16:35", "17:20"), ("17:25", "18:10"), ("18:30", "19:15"),
    ("19:20", "20:05"), ("20:10", "20:55"),
]
SHANGHAI = timezone(timedelta(hours=8))


class SyncError(Exception):
    def __init__(self, message: str, code: str = "SYNC_FAILED", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SyncError("学校接口发生跳转，请稍后重试。", "UPSTREAM_REDIRECT", 502)


def upstream_json(url: str, *, form: dict | None = None, token: str = "",
                  limit: int = 4 * 1024 * 1024) -> dict:
    if url.split("?")[0] not in (LOGIN_URL, CURRICULUM_URL):
        raise SyncError("不支持的学校接口。")
    headers = {"User-Agent": "Mozilla/5.0", "Origin": ORIGIN,
               "Referer": ORIGIN + "/sjd/", "Accept": "application/json"}
    if token:
        headers["token"] = token
    data = urlencode(form).encode("utf-8") if form is not None else b""
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = Request(url, data=data, headers=headers, method="POST")
    # Bypass system proxies so school credentials go directly to the HTTPS host.
    client = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with client.open(request, timeout=25) as response:
            body = response.read(limit + 1)
    except HTTPError as exc:
        if exc.code == 401:
            raise SyncError("教务登录已失效，请重新获取课表。", "AUTH_EXPIRED", 401) from None
        raise SyncError("学校服务暂时不可用，请稍后重试。", "UPSTREAM_HTTP", 502) from None
    except (URLError, TimeoutError, OSError):
        raise SyncError("无法连接北邮教务，请检查网络或稍后重试。", "NETWORK", 502) from None
    if len(body) > limit:
        raise SyncError("学校返回数据过大。", "UPSTREAM_SIZE", 502)
    try:
        result = json.loads(body)
    except (ValueError, UnicodeError):
        raise SyncError("学校接口返回格式已变化。", "UPSTREAM_FORMAT", 502) from None
    if not isinstance(result, dict):
        raise SyncError("学校接口返回格式已变化。", "UPSTREAM_FORMAT", 502)
    if str(result.get("code")) == "401":
        raise SyncError("教务登录已失效，请重新获取课表。", "AUTH_EXPIRED", 401)
    if str(result.get("code")) != "1":
        # Never expose upstream messages: they can echo sensitive fields.
        message = "账号或教务密码不正确，或学校要求额外验证。" if form else "学校未返回有效课表，请稍后重试。"
        raise SyncError(message, "LOGIN_FAILED" if form else "UPSTREAM_DATA", 401 if form else 502)
    return result


def root_data(payload: dict) -> dict:
    data = payload.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise SyncError("学校课表数据结构已变化。", "UPSTREAM_FORMAT", 502)
    return data[0]


def parse_weeks(value) -> list[int]:
    text = str(value or "").replace("，", ",").replace("（", "(").replace("）", ")")
    parts = re.split(r"[,;；、]", re.sub(r"\s|周", "", text))
    weeks = set()
    for part in parts:
        parity = "单" if "单" in part else "双" if "双" in part else ""
        for match in re.finditer(r"(\d+)(?:[-~至—–](\d+))?", part):
            first = int(match[1])
            last = int(match[2] or first)
            if not (1 <= first <= last <= 60):
                continue
            for number in range(first, last + 1):
                if parity == "单" and number % 2 == 0 or parity == "双" and number % 2 == 1:
                    continue
                weeks.add(number)
    return sorted(weeks)


def course_items(value, depth=0):
    if depth > 40:
        raise SyncError("课表层级异常。", "UPSTREAM_FORMAT", 502)
    if isinstance(value, dict):
        if "courseName" in value or "jx0408id" in value:
            yield value
        else:
            for child in value.values():
                yield from course_items(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            yield from course_items(child, depth + 1)


def school_term(root: dict, fallback_start: str = "") -> tuple[str, date, bool]:
    info = root.get("topInfo") or []
    info = info[0] if isinstance(info, list) and info and isinstance(info[0], dict) else {}
    term = next((str(obj.get(key)).strip() for obj in (root, info)
                 for key in ("semesterId", "xnxq01id") if obj.get(key)), "")
    # The API may omit the term ID; derive only the label from the current date.
    if not term:
        today = datetime.now(SHANGHAI).date()
        start_year = today.year if today.month >= 8 else today.year - 1
        term = f"{start_year}-{start_year + 1}-{'1' if today.month >= 8 or today.month < 2 else '2'}"
    if not re.fullmatch(r"\d{4}-\d{4}-[12]", term):
        raise SyncError("学校返回的学期编号无法识别。", "TERM_FORMAT", 502)
    for item in root.get("date", []):
        if not isinstance(item, dict) or not item.get("mxrq"):
            continue
        raw_week = next((v for v in (item.get("zc"), root.get("week"), info.get("week"))
                         if re.fullmatch(r"\d{1,2}", str(v))), None)
        if raw_week is None or int(raw_week) > 60:
            continue
        try:
            day = date.fromisoformat(str(item["mxrq"])[:10])
        except ValueError:
            continue
        return term, day - timedelta(days=day.weekday(), weeks=int(raw_week) - 1), True
    if fallback_start:
        try:
            start = date.fromisoformat(fallback_start)
        except ValueError:
            raise SyncError("请填写有效的第一教学周周一日期。") from None
        if start.weekday() != 0:
            raise SyncError("第一教学周开始日期必须为周一。")
        return term, start, False
    raise SyncError("学校未返回学期开始日期，请填写第一教学周周一后重试。", "TERM_START_REQUIRED")


def clock(value, default: str) -> str:
    candidate = str(value or "").strip()[:5]
    return candidate if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", candidate) else default


def convert_timetable(current: dict, full: dict, account_key: str, fallback_start: str = "") -> dict:
    term, start, inferred = school_term(root_data(current), fallback_start)
    all_data = root_data(full)
    if not any(key in all_data for key in ("item", "courses")):
        raise SyncError("学校课表数据结构已变化，未更改本地课表。", "UPSTREAM_FORMAT", 502)
    raw = list(course_items(all_data.get("item", all_data.get("courses", []))))
    if len(raw) > 1500:
        raise SyncError("学校课表条目数量异常。", "UPSTREAM_SIZE", 502)
    events = {}
    courses = {}
    skipped = 0
    conflicts = 0
    for item in raw:
        name = str(item.get("courseName") or "").strip()
        class_time = str(item.get("classTime") or "")
        weekday = str(item.get("weekDay") or class_time[:1])
        sections = [int(n) for n in re.findall(r"\d{2}", class_time[1:])]
        if not sections:
            sections = [int(n) for n in re.findall(r"\d+", str(item.get("weekNoteDetail") or ""))]
        weeks = parse_weeks(item.get("classWeek")) or parse_weeks(item.get("classWeekDetails"))
        if not name or not weekday.isdigit() or not 1 <= int(weekday) <= 7 or not sections or not weeks:
            skipped += 1
            continue
        low, high = min(sections), max(sections)
        if low < 1 or high > len(SLOTS):
            skipped += 1
            continue
        begin = clock(item.get("startTime"), SLOTS[low - 1][0])
        end = clock(item.get("endTIme") or item.get("endTime"), SLOTS[high - 1][1])
        teacher = str(item.get("teacherName") or "").strip()[:160]
        room = str(item.get("classroomName") or item.get("location") or "").strip()[:160]
        building = str(item.get("buildingName") or "").strip()[:160]
        location = f"{building} {room}".strip() if building and building not in room else room or building
        school_id = str(item.get("jx0408id") or "").strip()
        course_key = school_id or hashlib.sha256((name + "|" + teacher).encode()).hexdigest()[:20]
        # Stable per teaching block and teaching week, unaffected by time/room changes.
        block_key = f"{course_key}|{weekday}|{low}-{high}"
        courses[block_key] = {"name": name[:200], "teacher": teacher, "location": location,
                              "weekday": int(weekday), "sections": f"{low}-{high}",
                              "weeks": weeks, "start": begin, "end": end}
        for week in weeks:
            occurrence_date = start + timedelta(weeks=week - 1, days=int(weekday) - 1)
            source_id = hashlib.sha256(f"{term}|{block_key}|{week}".encode()).hexdigest()[:32]
            event = {"sourceId": source_id, "name": name[:200], "date": occurrence_date.isoformat(),
                     "start": begin, "end": end, "courseId": course_key[:160], "teacher": teacher,
                     "location": location, "week": week, "sections": f"{low}-{high}"}
            if source_id in events and events[source_id] != event:
                conflicts += 1
            events[source_id] = event
    if raw and not events:
        raise SyncError("课程数据无法解析，未生成课表。请检查学校接口变化。", "COURSE_FORMAT", 502)
    warnings = []
    if skipped:
        warnings.append(f"有 {skipped} 条课程缺少日期或节次，未导入。")
    if conflicts:
        warnings.append(f"有 {conflicts} 条排课存在冲突，请核对课表。")
    if not inferred:
        warnings.append("本次使用手动填写的学期开始日期。")
    return {"provider": "bupt", "accountKey": account_key, "termId": term,
            "termStart": start.isoformat(), "termStartInferred": inferred,
            "fetchedAt": datetime.now(SHANGHAI).isoformat(timespec="seconds"),
            "courses": list(courses.values()),
            "events": sorted(events.values(), key=lambda e: (e["date"], e["start"], e["name"])),
            "warnings": warnings, "complete": skipped == 0 and conflicts == 0}


def fetch_timetable(account: str, password: str, fallback_start: str = "") -> dict:
    if not re.fullmatch(r"[A-Za-z0-9._-]{4,32}", account) or not password or len(password) > 256:
        raise SyncError("请填写有效账号与教务密码。")
    login = upstream_json(LOGIN_URL, form={"userNo": account, "pwd": password}, limit=65536)
    login_data = login.get("data")
    token = login_data.get("token", "") if isinstance(login_data, dict) else ""
    if not isinstance(token, str) or not token.strip() or len(token) > 8192:
        raise SyncError("教务登录没有返回有效会话。", "LOGIN_FORMAT", 502)
    current = upstream_json(CURRICULUM_URL + "?week=", token=token)
    full = upstream_json(CURRICULUM_URL + "?week=all", token=token)
    account_key = hashlib.sha256(("ketime-bupt:" + account).encode()).hexdigest()[:24]
    return convert_timetable(current, full, account_key, fallback_start)
