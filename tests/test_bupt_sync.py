import json
import threading
import unittest
from datetime import date
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch
from http.server import ThreadingHTTPServer

import bupt_sync as adapter
import ketime_server as server


def current(week=5, day="2026-10-02"):
    return {"code": 1, "data": [{"semesterId": "2026-2027-1", "date": [{"mxrq": day, "zc": week}]}]}


def course(**changes):
    item = {"courseName": "测试课程", "jx0408id": "test-course", "weekDay": "1", "classTime": "10304", "classWeek": "1-5(单)", "teacherName": "测试教师", "buildingName": "教学楼", "classroomName": "101"}
    item.update(changes)
    return item


def full(items):
    return {"code": "1", "data": [{"item": {"morning": items}}]}


class AdapterTests(unittest.TestCase):
    def test_weeks_mixed(self):
        self.assertEqual(adapter.parse_weeks("1-5(单)，6-10（双），12"), [1, 3, 5, 6, 8, 10, 12])
        self.assertEqual(adapter.parse_weeks("1-3(单),4-6"), [1, 3, 4, 5, 6])
        self.assertEqual(adapter.parse_weeks("0,99,4-2"), [])

    def test_term_date_and_week_zero(self):
        self.assertEqual(adapter.school_term(current()["data"][0])[1], date(2026, 8, 31))
        self.assertEqual(adapter.school_term(current(0, "2026-08-26")["data"][0])[1], date(2026, 8, 31))

    def test_manual_start(self):
        root = {"semesterId": "2026-2027-1"}
        with self.assertRaises(adapter.SyncError):
            adapter.school_term(root)
        self.assertEqual(adapter.school_term(root, "2026-08-31")[1:], (date(2026, 8, 31), False))
        with self.assertRaises(adapter.SyncError):
            adapter.school_term(root, "2026-09-01")

    def test_expand_weeks_slots_and_stable_ids(self):
        first = adapter.convert_timetable(current(), full([course()]), "a" * 24)
        self.assertEqual([e["date"] for e in first["events"]], ["2026-08-31", "2026-09-14", "2026-09-28"])
        self.assertEqual((first["events"][0]["start"], first["events"][0]["end"]), ("09:50", "11:25"))
        second = adapter.convert_timetable(current(), full([course(startTime="10:00", classroomName="102")]), "a" * 24)
        self.assertEqual([e["sourceId"] for e in first["events"]], [e["sourceId"] for e in second["events"]])
        self.assertTrue(first["complete"])

    def test_dedupe(self):
        result = adapter.convert_timetable(current(), full([course(), course()]), "a" * 24)
        self.assertEqual(len(result["events"]), 3)
        self.assertTrue(result["complete"])

    def test_partial_and_conflict(self):
        result = adapter.convert_timetable(current(), full([course(), course(courseName="缺少周次", classWeek="")]), "a" * 24)
        self.assertFalse(result["complete"])
        self.assertEqual(len(result["warnings"]), 1)
        result = adapter.convert_timetable(current(), full([course(), course(classroomName="102")]), "a" * 24)
        self.assertFalse(result["complete"])

    def test_empty_vs_unknown_schema(self):
        self.assertEqual(adapter.convert_timetable(current(), full([]), "a" * 24)["events"], [])
        with self.assertRaises(adapter.SyncError):
            adapter.convert_timetable(current(), {"data": [{}]}, "a" * 24)
        with self.assertRaises(adapter.SyncError):
            adapter.convert_timetable(current(), full([course(classWeek="")]), "a" * 24)

    @patch("bupt_sync.upstream_json")
    def test_no_credentials_in_result(self, upstream):
        upstream.side_effect = [{"code": 1, "data": {"token": "test-secret-token"}}, current(), full([course()])]
        result = adapter.fetch_timetable("test_account", "test_secret_password")
        encoded = json.dumps(result)
        for secret in ("test_account", "test_secret_password", "test-secret-token"):
            self.assertNotIn(secret, encoded)

    def test_credentials_validation(self):
        for account, password in (("", "x"), ("valid", ""), ("user/../", "x")):
            with self.assertRaises(adapter.SyncError):
                adapter.fetch_timetable(account, password)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.url = f"http://127.0.0.1:{cls.http.server_port}"
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def request(self, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.url + path, data=data, headers=headers or {})
        try:
            with urlopen(request) as result:
                return result.status, result.headers, result.read()
        except HTTPError as result:
            return result.code, result.headers, result.read()

    def test_main_and_static_allowlist(self):
        for path in ("/", "/bupt-import.js", "/bupt-ui.js"):
            code, headers, body = self.request(path)
            self.assertEqual(code, 200)
            self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        for path in ("/.git/config", "/bupt_sync.py", "/../README.md", "/.env"):
            self.assertEqual(self.request(path)[0], 404)

    def test_host_origin_and_csrf(self):
        self.assertEqual(self.request("/api/config", headers={"Host": "evil.invalid"})[0], 403)
        self.assertEqual(self.request("/api/config", headers={"Origin": "https://evil.invalid"})[0], 403)
        self.assertEqual(self.request("/api/config", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("/api/bupt/timetable", {"account": "test", "password": "secret"})[0], 403)
        self.assertEqual(self.request("/api/settings/read", {})[0], 403)
        self.assertEqual(self.request("/api/settings/save", {"clear": True})[0], 403)

    @patch("ketime_server.fetch_timetable")
    def test_success_and_rate_limit(self, fetch):
        server.LAST_REQUEST = 0
        fetch.return_value = {"provider": "bupt", "events": []}
        headers = {"Origin": self.url, "Content-Type": "application/json", "X-Ketime-Token": server.BOOT_TOKEN}
        code, _, body = self.request("/api/bupt/timetable", {"account": "test", "password": "test-secret"}, headers)
        self.assertEqual(code, 200)
        self.assertNotIn(b"test-secret", body)
        self.assertEqual(self.request("/api/bupt/timetable", {"account": "test", "password": "test-secret"}, headers)[0], 429)

    @patch("ketime_server.fetch_timetable", side_effect=Exception("test-secret-never-echo"))
    def test_errors_do_not_echo_credentials(self, fetch):
        server.LAST_REQUEST = 0
        headers = {"Content-Type": "application/json", "X-Ketime-Token": server.BOOT_TOKEN}
        code, _, body = self.request("/api/bupt/timetable", {"account": "test", "password": "secret"}, headers)
        self.assertEqual(code, 502)
        self.assertNotIn(b"test-secret", body)

    @patch("ketime_server.public_settings", return_value={"account": "test_account", "hasPassword": True, "hasCloudPassword": True})
    def test_read_settings_no_password_response(self, read):
        headers = {"Content-Type": "application/json", "X-Ketime-Token": server.BOOT_TOKEN}
        code, _, body = self.request("/api/settings/read", {}, headers)
        self.assertEqual(code, 200)
        self.assertNotIn("password", json.loads(body))

    @patch("ketime_server.stored_credentials", return_value=("test_account", "stored_secret", "2026-08-31"))
    @patch("ketime_server.fetch_timetable", return_value={"provider": "bupt", "events": []})
    def test_timetable_uses_stored_credentials(self, fetch, stored):
        server.LAST_REQUEST = 0
        headers = {"Content-Type": "application/json", "X-Ketime-Token": server.BOOT_TOKEN}
        self.assertEqual(self.request("/api/bupt/timetable", {"stored": True}, headers)[0], 200)
        fetch.assert_called_once_with("test_account", "stored_secret", "2026-08-31")

    @patch("ketime_server.stored_credentials", return_value=("test_account", "stored_cloud_secret", ""))
    @patch("ketime_server.fetch_homework", return_value={"provider": "bupt-ucloud", "assignments": []})
    def test_homework_uses_cloud_password(self, fetch, stored):
        server.LAST_CLOUD_REQUESTS.clear()
        headers = {"Content-Type": "application/json", "X-Ketime-Token": server.BOOT_TOKEN}
        self.assertEqual(self.request("/api/ucloud/homework", {"stored": True, "loginId": "fixture"}, headers)[0], 200)
        stored.assert_called_once_with(cloud=True)
        fetch.assert_called_once_with("fixture", "test_account", "stored_cloud_secret", "")


if __name__ == "__main__":
    unittest.main()
