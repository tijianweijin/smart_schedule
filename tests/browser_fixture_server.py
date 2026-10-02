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
        ketime_server.fetch_timetable = fixture
    service = ThreadingHTTPServer(("127.0.0.1", 0), ketime_server.Handler)
    print(json.dumps({"url": f"http://127.0.0.1:{service.server_port}"}), flush=True)
    service.serve_forever()
