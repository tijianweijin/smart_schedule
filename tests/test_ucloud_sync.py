import json
import time
import unittest
from unittest.mock import patch

from bupt_sync import SyncError
import ucloud_sync as cloud


class CloudTests(unittest.TestCase):
    def data(self):
        return {"data": {"undoneList": [{"type": 3, "activityId": "work_123", "activityName": "<b>实验一</b>", "siteName": "测试课程", "endTime": "2026-10-10 23:59:00"}, {"type": 4, "activityId": "quiz", "activityName": "测验"}]}}

    def test_only_homework_and_dates_normalized(self):
        data = cloud.convert_homework(self.data(), "a" * 24)
        self.assertEqual(len(data["assignments"]), 1)
        self.assertEqual(data["ignored"], 1)
        self.assertEqual(data["assignments"][0]["title"], "实验一")
        self.assertEqual(data["assignments"][0]["name"], "测试课程：实验一")
        self.assertEqual(data["assignments"][0]["dueAt"], "2026-10-10T23:59+08:00")

    def test_duplicate_empty_missing_and_invalid(self):
        raw = self.data()
        raw["data"]["undoneList"].append(raw["data"]["undoneList"][0])
        self.assertEqual(len(cloud.convert_homework(raw, "a" * 24)["assignments"]), 1)
        self.assertEqual(cloud.convert_homework({"data": {"undoneList": []}}, "a" * 24)["assignments"], [])
        with self.assertRaises(SyncError):
            cloud.convert_homework({"data": {}}, "a" * 24)
        raw["data"]["undoneList"][0]["activityId"] = ""
        with self.assertRaises(SyncError):
            cloud.convert_homework(raw, "a" * 24)

    def test_invalid_deadline_not_fabricated(self):
        raw = self.data()
        raw["data"]["undoneList"][0]["endTime"] = "unrecognized"
        self.assertEqual(cloud.convert_homework(raw, "a" * 24)["assignments"][0]["dueAt"], "")

    @patch("ucloud_sync.request")
    def test_prepare_memory_session(self, request):
        request.return_value = (200, {}, b'<input value="test-execution" name="execution">')
        result = cloud.prepare_login()
        self.assertIn(result["loginId"], cloud.SESSIONS)
        self.assertNotIn("test-execution", json.dumps(result))
        cloud.SESSIONS.pop(result["loginId"])

    @patch("ucloud_sync.request")
    def test_manual_captcha_no_third_party(self, request):
        request.side_effect = [(200, {}, b'<input name="execution" value="test-execution"><script>config.captcha={id: \'test-id\'}</script>'), (200, {"Content-Type": "image/png"}, b"fixture-image")]
        result = cloud.prepare_login()
        self.assertTrue(result["captchaImage"].startswith("data:image/png;base64,"))
        self.assertTrue(request.call_args[0][1].startswith("https://auth.bupt.edu.cn/"))
        cloud.SESSIONS.pop(result["loginId"])

    def test_expired_session_and_host_allowlist(self):
        cloud.SESSIONS["expired"] = (time.monotonic() - 400, None, "test-execution")
        with self.assertRaises(SyncError):
            cloud.authenticate("expired", "test_user", "test_password")
        self.assertNotIn("expired", cloud.SESSIONS)
        with self.assertRaises(SyncError):
            cloud.request(None, "https://evil.invalid/")
        with self.assertRaises(SyncError):
            cloud.request(None, "http://auth.bupt.edu.cn/")

    @patch("ucloud_sync.request")
    def test_untrusted_redirect_rejected(self, request):
        cloud.SESSIONS["fixture"] = (time.monotonic(), None, "test-execution")
        request.return_value = (302, {"Location": "https://evil.invalid/?ticket=test"}, b"")
        with self.assertRaises(SyncError):
            cloud.authenticate("fixture", "test_user", "test_password")

    @patch("ucloud_sync.api_json")
    @patch("ucloud_sync.request")
    def test_student_role_and_one_use_session(self, request, api):
        cloud.SESSIONS["fixture"] = (time.monotonic(), None, "test-execution")
        request.return_value = (302, {"Location": "https://ucloud.bupt.edu.cn/?ticket=fixture"}, b"")
        api.side_effect = [{"refresh_token": "refresh-fixture"}, {"data": [{"roleName": "教师", "id": "1"}, {"roleName": "学生", "id": "2"}]}, {"access_token": "access-fixture", "user_id": "3"}]
        _, token, user_id, identity = cloud.authenticate("fixture", "test_user", "test_password")
        self.assertEqual(identity, "JS005:2")
        self.assertEqual(token, "access-fixture")
        self.assertNotIn("fixture", cloud.SESSIONS)


if __name__ == "__main__":
    unittest.main()
