"""Synthetic test server; only the explicit --live mode connects to BUPT."""
import hashlib
import json
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ketime_server


def fixture(*args):
    day = date.today()
    events = [{"sourceId": hashlib.sha256(f"fixture-{i}".encode()).hexdigest()[:32], "courseId": f"course-{i}", "name": "测试课程" if i else "课程 <img src=x onerror=alert(1)>", "date": (day + timedelta(days=7 * i)).isoformat(), "start": "09:50", "end": "11:25", "teacher": "测试教师", "location": "测试教学楼 101", "week": i + 1, "sections": "3-4"} for i in range(3)]
    return {"provider": "bupt", "accountKey": "a" * 24, "termId": "2026-2027-1", "termStart": "2026-08-31", "complete": True, "warnings": [], "fetchedAt": "2026-10-02T00:00:00+08:00", "events": events, "courses": [{"name": e["name"], "weekday": day.weekday() + 1, "weeks": [1, 2, 3], "start": e["start"], "end": e["end"], "teacher": e["teacher"], "location": e["location"]} for e in events]}


if __name__ == "__main__":
    if "--live" not in sys.argv:
        fixture_account = {"account": "", "password": "", "cloudPassword": "", "termStart": ""}
        def public_fixture():
            return {"account": fixture_account["account"], "hasPassword": bool(fixture_account["password"]), "hasCloudPassword": bool(fixture_account["cloudPassword"]), "termStart": fixture_account["termStart"], "encrypted": True}
        def save_fixture(payload):
            if payload.get("clear"):
                fixture_account.update(account="", password="", cloudPassword="", termStart="")
            else:
                fixture_account.update({key: value for key, value in payload.items() if key in fixture_account and value})
            return public_fixture()
        def stored_fixture(cloud=False):
            from bupt_sync import SyncError
            password = fixture_account["cloudPassword" if cloud else "password"]
            if not fixture_account["account"] or not password:
                raise SyncError("请先在设置中保存账号。", "SETTINGS_REQUIRED")
            return fixture_account["account"], password, fixture_account["termStart"]
        ketime_server.public_settings = public_fixture
        ketime_server.save_settings = save_fixture
        ketime_server.stored_credentials = stored_fixture
        ketime_server.fetch_timetable = fixture
        ketime_server.prepare_login = lambda: {"loginId": "fixture-login", "captchaImage": "", "expiresIn": 300}
        ketime_server.fetch_homework = lambda *args: {"provider": "bupt-ucloud", "accountKey": "a" * 24, "ignored": 0, "fetchedAt": "2026-10-02T00:00:00+08:00", "assignments": [{"sourceId": "work_123", "title": "实验一 <img src=x>", "courseName": "测试课程", "name": "测试课程：实验一 <img src=x>", "dueAt": "2026-10-10T23:59+08:00", "url": "https://ucloud.bupt.edu.cn/"}]}
    service = ThreadingHTTPServer(("127.0.0.1", 0), ketime_server.Handler)
    print(json.dumps({"url": f"http://127.0.0.1:{service.server_port}"}), flush=True)
    service.serve_forever()
