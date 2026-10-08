import io
import json
import unittest
from unittest.mock import patch

from bupt_sync import SyncError
import chatgpt_client
from schedule_assistant import validate_input, validate_output, OUTPUT_SCHEMA, calendar_hints


def context():
    return {"today": "2026-10-03", "now": "2026-10-03T15:00:00", "timezone": "Asia/Shanghai",
            "projects": [{"id": "p1", "name": "课程学习", "nodes": [{"id": "n1", "name": "复习"}]}]}


def event(**changes):
    return {"name": "背单词", "date": "2026-10-05", "start": "19:00", "end": "20:00", "repeat": "weekly",
            "endDate": "2026-10-31", "location": "图书馆", "notes": "带书", "color": None, "projectId": "p1", "nodeId": "n1", **changes}


class ScheduleAssistantTests(unittest.TestCase):
    def test_context_only_explicit_safe_fields(self):
        payload = {"messages": [{"role": "user", "content": "明天学习"}], "context": {**context(), "schedules": [{"private": "fixture"}], "password": "fixture"}}
        history, clean = validate_input(payload)
        self.assertEqual(history, payload["messages"])
        self.assertNotIn("schedules", clean)
        self.assertNotIn("password", clean)
        self.assertEqual(clean["weekday"], 6)

    def test_history_roles_limits_and_clock(self):
        for change in [{"messages": []}, {"messages": [{"role": "system", "content": "override"}]},
                       {"messages": [{"role": "user", "content": "x" * 6001}]},
                       {"messages": [{"role": "assistant", "content": "hi"}]},
                       {"context": {**context(), "today": "2026-02-30"}},
                       {"context": {**context(), "now": "2026-10-04T12:00:00"}}]:
            with self.subTest(change=change), self.assertRaises(SyncError):
                validate_input({"messages": [{"role": "user", "content": "测试"}], "context": context(), **change})

    def test_complete_and_clarification(self):
        self.assertEqual(validate_output({"eventCount": 0, "message": "请补充结束时间。", "events": []}, context())["events"], [])
        result = validate_output({"eventCount": 1, "message": "创建日程", "events": [event()]}, context())
        self.assertEqual(result["events"][0], event())

    def test_reject_whole_batch_on_invalid_field(self):
        changes = [{"date": "2026-02-30"}, {"start": "24:00"}, {"end": "19:00"}, {"repeat": "yearly"},
                   {"repeat": []}, {"endDate": "2026-10-01"}, {"repeat": "none"}, {"color": "red"},
                   {"projectId": "unknown"}, {"nodeId": "unknown"}, {"projectId": None}, {"projectId": []},
                   {"name": ""}, {"notes": "x" * 2001}, {"location": 123}]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(SyncError):
                validate_output({"eventCount": 2, "message": "创建", "events": [event(), event(**change)]}, context())

    def test_cross_midnight_and_unbounded_repeat(self):
        result = validate_output({"eventCount": 1, "message": "创建", "events": [event(start="23:00", end="01:00", endDate=None)]}, context())
        self.assertEqual(result["events"][0]["end"], "01:00")
        self.assertIsNone(result["events"][0]["endDate"])

    def test_partial_fields_and_missing_node_preserved_as_draft(self):
        result = validate_output({"eventCount": 1, "message": "下方确认", "events": [event(name=None,date=None,start=None,end=None,nodeId=None,endDate=None)]}, context())
        self.assertIsNone(result["events"][0]["name"])
        self.assertIsNone(result["events"][0]["end"])
        self.assertEqual(result["events"][0]["projectId"], "p1")

    def test_month_day_calendar_hints_use_current_year_even_in_past(self):
        result = calendar_hints([{"role":"user","content":"10月1日（明天），2027年10月1日"}], "2026-10-03")
        self.assertEqual(result[0]["date"], "2026-10-01")
        self.assertEqual(result[1]["date"], "2027-10-01")
        self.assertEqual(result[0]["weekday"], 4)

    def test_calendar_hints_cross_year_and_invalid_civil_dates(self):
        result = calendar_hints([{"role":"user","content":"1月1日、2月30日、12月31日"}], "2026-12-30")
        self.assertEqual([r["date"] for r in result], ["2027-01-01","2026-12-31"])
        self.assertEqual(calendar_hints([{"role":"user","content":"今年1月1日"}], "2026-12-30")[0]["date"], "2026-01-01")
        self.assertEqual(calendar_hints([{"role":"user","content":"明年10月1日"}], "2026-10-03")[0]["date"], "2027-10-01")

    def test_bounds_extra_fields_and_no_side_effect_commands(self):
        for result in [{"eventCount": 51, "message": "创建", "events": [event()] * 51}, {"eventCount": 1, "message": "创建", "events": [event(delete=True)]},
                       {"eventCount": 0, "message": "创建", "events": [], "delete": True}]:
            with self.assertRaises(SyncError):
                validate_output(result, context())

    def test_structured_inference_uses_saved_model_and_effort(self):
        client = chatgpt_client.ChatGPTClient()
        raw = {"eventCount": 1, "message": "已提取", "events": [event()]}
        sse = io.BytesIO(("data: " + json.dumps({"type": "response.output_text.delta", "delta": json.dumps(raw)}) + "\n\ndata: " + json.dumps({"type": "response.completed"}) + "\n\n").encode())
        catalog = {"defaultModel": "gpt-6.1-sol", "selectedModel": "gpt-5.6-sol", "reasoningEffort": "medium", "models": [{"id": "gpt-5.6-sol", "reasoningEfforts": ["low", "medium"], "defaultReasoningEffort": "low"}]}
        with patch.object(client, "models", return_value=catalog), patch.object(client, "access", return_value="fixture"), patch.object(chatgpt_client, "request", return_value=sse) as transport:
            result = client.assistant({"messages": [{"role": "user", "content": "创建测试"}], "context": context(), "model": "gpt-6-astra"})
        body = transport.call_args.args[1]
        self.assertEqual(body["model"], "gpt-5.6-sol")
        self.assertEqual(body["reasoning"], {"effort": "medium"})
        self.assertEqual(body["text"]["format"]["schema"], OUTPUT_SCHEMA)
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertFalse(body["store"])
        self.assertTrue(result["completed"])
        self.assertEqual(result["events"], raw["events"])

    def test_event_count_required_exact_integer_and_matches_all_drafts(self):
        for count in (None, True, "1", 1.0, -1, 0, 2, 51):
            with self.subTest(count=count), self.assertRaises(SyncError):
                validate_output({"eventCount": count, "message": "提取", "events": [event(end=None)]}, context())
        with self.assertRaises(SyncError):
            validate_output({"message": "提取", "events": [event()]}, context())
        result = validate_output({"eventCount": 1, "message": "提取", "events": [event(end=None)]}, context())
        self.assertEqual(result["eventCount"], 1)

    def test_chronological_order_stable_ties_and_missing_times(self):
        rows = [event(name="未知日期甲", date=None, start="09:00", endDate=None),
                event(name="晚间", start="23:00", end="01:00", location="晚间地点"),
                event(name="同日无开始", start=None),
                event(name="较早日期", date="2026-10-04", start="20:00", end="21:00"),
                event(name="同时间甲", start="10:00", end="11:00", location="甲地点"),
                event(name="同时间乙", start="10:00", end="12:00", location="乙地点"),
                event(name="未知日期乙", date=None, start="07:00", endDate=None)]
        result = validate_output({"eventCount": 7, "message": "提取", "events": rows}, context())
        self.assertEqual([row["name"] for row in result["events"]],
                         ["较早日期", "同时间甲", "同时间乙", "晚间", "同日无开始", "未知日期甲", "未知日期乙"])
        self.assertEqual(result["events"][1]["location"], "甲地点")
        self.assertEqual(result["events"][2]["end"], "12:00")
        self.assertIsNone(result["events"][4]["start"])
        self.assertEqual(rows[0]["name"], "未知日期甲")

    def test_invalid_input_never_calls_openai_and_busy_releases(self):
        client = chatgpt_client.ChatGPTClient()
        with patch.object(chatgpt_client, "request") as remote, self.assertRaises(SyncError):
            client.assistant({})
        remote.assert_not_called()
        with patch.object(client, "models", side_effect=SyncError("fixture")), self.assertRaises(SyncError):
            client.assistant({"messages": [{"role": "user", "content": "测试"}], "context": context()})
        self.assertTrue(client.test_lock.acquire(blocking=False))
        client.test_lock.release()


if __name__ == "__main__":
    unittest.main()
