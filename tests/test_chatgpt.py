import base64
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer

from bupt_sync import SyncError
import chatgpt_client as api
import ketime_server


def stream(*events):
    return io.BytesIO(b"".join(("data: " + json.dumps(e) + "\n\n").encode() for e in events))


class StreamTests(unittest.TestCase):
    def test_success_requires_terminal_event_and_preserves_unicode(self):
        result = api.parse_stream(stream({"type": "response.output_text.delta", "delta": "你好"}, {"type": "response.output_text.delta", "delta": "刻时"}, {"type": "response.completed"}))
        self.assertEqual(result, "你好刻时")

    def test_partial_failure_empty_and_malformed_not_success(self):
        cases = [stream({"type": "response.output_text.delta", "delta": "partial"}), stream({"type": "response.completed"}),
                 stream({"type": "response.output_text.delta", "delta": "partial"}, {"type": "response.failed"}),
                 stream({"type": "response.incomplete"}), io.BytesIO(b"data: not-json\n\n")]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(SyncError):
                api.parse_stream(value)

    def test_completed_output_fallback(self):
        self.assertEqual(api.parse_stream(stream({"type": "response.completed", "response": {"output": [{"content": [{"type": "output_text", "text": "ok"}]}]}})), "ok")

    def test_limit(self):
        with self.assertRaises(SyncError):
            api.parse_stream(io.BytesIO(b"data: " + b"x" * 262145))

    def test_token_permission_and_required_fields(self):
        valid = {"access_token": "fixture_access", "refresh_token": "fixture_refresh", "token_type": "Bearer", "expires_in": 3600, "scope": api.SCOPES}
        self.assertTrue(api.token_fields(valid)["expiresAt"] > time.time())
        for change in [{"scope": "openid"}, {"access_token": None}, {"expires_in": 0}, {"token_type": "not_bearer"}]:
            with self.assertRaises(SyncError):
                api.token_fields({**valid, **change})


class ModelCatalogTests(unittest.TestCase):
    def test_metadata_controls_efforts_and_versions(self):
        rows = [{"slug": "gpt-6-astra", "visibility": "list", "supported_reasoning_levels": [{"effort": "low"}, {"effort": "medium"}, {"effort": "ultra"}, {"effort": []}]},
                {"slug": "gpt-5.6-terra", "visibility": "list", "supported_reasoning_levels": ["high"], "default_reasoning_level": "high"},
                {"slug": "gpt-4.1", "visibility": "list", "supported_reasoning_levels": []}]
        result = api.model_catalog({"models": rows})
        self.assertEqual(result[0]["version"], "6.0")
        self.assertEqual(result[0]["series"], "Astra")
        self.assertEqual(result[0]["reasoningEfforts"], ["low", "medium"])
        self.assertEqual(result[1]["defaultReasoningEffort"], "high")
        self.assertEqual(result[2]["reasoningEfforts"], ["auto"])

    def test_hidden_non_gpt_non_api_and_non_text_are_excluded(self):
        rows = [{"slug": "gpt-5.6-sol", "visibility": "list"}, {"slug": "gpt-5.6-sol", "visibility": "list"},
                {"slug": "gpt-6-astra", "visibility": "hide"}, {"slug": "gpt-7-sol", "visibility": "list", "supported_in_api": False},
                {"slug": "gpt-8-sol", "visibility": "list", "input_modalities": ["audio"]},
                {"slug": "gpt-9-sol", "visibility": "list", "input_modalities": None},
                {"slug": "unknown", "visibility": "list"}]
        self.assertEqual([row["id"] for row in api.model_catalog({"models": rows})], ["gpt-5.6-sol"])
        with self.assertRaises(SyncError):
            api.model_catalog({"models": []})

    def test_invalid_selection_or_effort_does_not_silently_fallback(self):
        catalog = {"models": api.model_catalog({"models": [{"slug": "gpt-5.6-sol", "visibility": "list"}]}), "defaultModel": "gpt-5.6-sol", "selectedModel": "gpt-5.6-sol", "reasoningEffort": "medium"}
        self.assertEqual(api.resolve_selection(catalog), ("gpt-5.6-sol", "medium"))
        for model, effort in (("gpt-6-astra", "low"), ("gpt-5.6-sol", "max"), ("gpt-5.6-sol", [])):
            with self.assertRaises(SyncError):
                api.resolve_selection(catalog, model, effort)


try:
    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False


@unittest.skipUnless(JWT_AVAILABLE, "Optional JWT libraries required")
class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
        self.jwk["kid"] = "fixture-key"
        self.mock = patch.object(api, "request", return_value={"keys": [self.jwk]})
        self.mock.start()
        self.claims = {"iss": api.AUTH, "aud": "oaiapp_fixture", "sub": "fixture-subject", "nonce": "fixture-nonce", "iat": int(time.time()), "exp": int(time.time()) + 600}

    def tearDown(self):
        self.mock.stop()

    def encode(self, changes=None, key=None):
        return jwt.encode({**self.claims, **(changes or {})}, key or self.key, algorithm="RS256", headers={"kid": "fixture-key"})

    def test_valid_signature_and_claims(self):
        self.assertEqual(api.validate_identity(self.encode(), "oaiapp_fixture", "fixture-nonce")["sub"], "fixture-subject")

    def test_bad_signature_issuer_audience_expiry_nonce_rejected(self):
        bad = [self.encode({"iss": "https://invalid.example"}), self.encode({"aud": "other"}), self.encode({"exp": 1}), self.encode({"nonce": "other"}), self.encode(key=rsa.generate_private_key(public_exponent=65537, key_size=2048))]
        for value in bad:
            with self.subTest(value=value[:20]), self.assertRaises(SyncError):
                api.validate_identity(value, "oaiapp_fixture", "fixture-nonce")


@unittest.skipUnless(os.name == "nt" and JWT_AVAILABLE, "Windows and optional JWT libraries required")
class ClientTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="ketime-chatgpt-test-")
        self.path = Path(self.folder.name) / "chatgpt.dpapi"
        self.mock = patch.object(api, "VAULT_PATH", self.path)
        self.mock.start()
        self.client = api.ChatGPTClient()
        self.tokens = {"access_token": "fixture_access", "refresh_token": "fixture_refresh", "id_token": "fixture_identity", "token_type": "Bearer", "expires_in": 3600, "scope": api.SCOPES}

    def tearDown(self):
        self.mock.stop()
        self.folder.cleanup()

    def authorize(self):
        self.client.begin(8766)
        params = {"state": [self.client.pending["state"]], "code": ["fixture-code"], "client_id": ["oaiapp_fixture"]}
        with patch.object(api, "request", return_value=self.tokens), patch.object(api, "validate_identity", return_value={"sub": "fixture-sub", "email": "fixture@example.invalid"}):
            self.client.callback(params)
        return params

    def test_pkce_scopes_stable_host_loopback_no_secret(self):
        first = parse_qs(urlsplit(self.client.begin(8766)["authorizationUrl"]).query)
        pending = self.client.pending.copy()
        second = parse_qs(urlsplit(self.client.begin(8767)["authorizationUrl"]).query)
        self.assertEqual(first["ext_agent_host_id"], second["ext_agent_host_id"])
        self.assertNotEqual(first["state"], second["state"])
        self.assertEqual(first["redirect_uri"], ["http://127.0.0.1:8766/auth/callback"])
        self.assertEqual(first["client_id"], ["dynamic_agent_client"])
        self.assertIn(api.PERMISSION, first["scope"][0])
        digest = base64.urlsafe_b64encode(hashlib.sha256(pending["verifier"].encode()).digest()).decode().rstrip("=")
        self.assertEqual(first["code_challenge"], [digest])
        self.assertNotIn("client_secret", first)
        self.assertNotIn("id_token_hint", first)

    def test_callback_exchange_encryption_and_public_redaction(self):
        params = self.authorize()
        self.assertTrue(self.client.status()["connected"])
        public = json.dumps(self.client.status())
        encoded = self.path.read_bytes()
        for key in ("access_token", "refresh_token", "id_token"):
            self.assertNotIn(key, public)
            self.assertNotIn(self.tokens[key].encode(), encoded)
        with self.assertRaises(SyncError):
            self.client.callback(params)
        query = parse_qs(urlsplit(self.client.begin(8766)["authorizationUrl"]).query)
        self.assertEqual(query["client_id"], ["oaiapp_fixture"])
        self.assertNotIn("agent_name_hint", query)

    def test_invalid_state_does_not_consume_valid_pending(self):
        self.client.begin(8766)
        with self.assertRaises(SyncError), patch.object(api, "request") as transport:
            self.client.callback({"state": ["wrong"], "code": ["fixture"]})
        transport.assert_not_called()
        self.assertIsNotNone(self.client.pending)

    def test_denial_expiry_missing_client_and_permission(self):
        for extra in ({"error": ["access_denied"]}, {"code": ["fixture"]}, {"code": ["fixture"], "client_id": ["dynamic_agent_client"]}):
            self.client.begin(8766)
            with self.assertRaises(SyncError), patch.object(api, "request") as transport:
                self.client.callback({"state": [self.client.pending["state"]], **extra})
            transport.assert_not_called()
            self.assertIsNone(self.client.pending)
        self.client.begin(8766)
        self.client.pending["expiresAt"] = 0
        self.assertFalse(self.client.status()["pending"])
        self.assertIn("超时", self.client.status()["error"])

    def test_refresh_is_serial_and_atomic(self):
        self.authorize()
        data = api.read_vault()
        data["profiles"][0]["expiresAt"] = 0
        api.write_vault(data)
        replacement = {**self.tokens, "access_token": "fixture_new_access", "refresh_token": "fixture_new_refresh"}
        replacement.pop("scope")  # Omitted scope retains grant.
        with patch.object(api, "request", return_value=replacement) as transport:
            self.assertEqual(self.client.access(), "fixture_new_access")
            self.assertEqual(self.client.access(), "fixture_new_access")
        self.assertEqual(transport.call_count, 1)
        self.assertNotIn("scope", transport.call_args.args[1])
        self.assertEqual(api.read_vault()["profiles"][0]["refresh_token"], "fixture_new_refresh")

    def test_models_test_only_message_and_completed_response(self):
        self.authorize()
        def fake(url, payload=None, **kwargs):
            if url.endswith("/models"):
                return {"models": [{"visibility": "list", "slug": "gpt-5.6-sol", "display_name": "Fixture Sol"}, {"visibility": "hide", "slug": "hidden"}]}
            self.assertEqual(url, api.RESOURCE + "/responses")
            self.assertEqual(payload, {"model": "gpt-5.6-sol", "input": [{"role": "user", "content": "测试"}], "reasoning": {"effort": "low"}, "store": False, "stream": True})
            self.assertTrue(kwargs["stream"])
            return stream({"type": "response.output_text.delta", "delta": "收到"}, {"type": "response.completed"})
        with patch.object(api, "request", side_effect=fake):
            result = self.client.test("测试", "gpt-5.6-sol")
            self.assertEqual(result, {"completed": True, "reply": "收到", "model": "gpt-5.6-sol", "reasoningEffort": "low"})
            with self.assertRaises(SyncError):
                self.client.test("测试", "unlisted")

    def test_sol_priority_is_version_based_not_catalog_order(self):
        self.authorize()
        catalog = [{"visibility": "list", "slug": name} for name in ["gpt-6-astra", "gpt-5.6-sol", "gpt-6-sol", "gpt-6.1-sol"]]
        with patch.object(api, "request", return_value={"models": catalog}):
            result = self.client.models()
        self.assertEqual(result["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(result["reasoningEffort"], "low")
        self.assertIn("gpt-6-astra", {model["id"] for model in result["models"]})
        for expected, names in [("gpt-6-sol", ["gpt-5.6-sol", "gpt-6-sol"]), ("gpt-5.6-sol", ["gpt-5.6-sol"])]:
            with patch.object(api, "request", return_value={"models": [{"visibility": "list", "slug": name} for name in names]}):
                self.assertEqual(self.client.models()["defaultModel"], expected)
        with patch.object(api, "request", return_value={"models": [{"visibility": "list", "slug": "gpt-6-astra"}]}):
            self.assertEqual(self.client.models()["defaultModel"], "gpt-6-astra")

    def test_explicit_astra_and_medium_are_allowed_when_account_lists_them(self):
        self.authorize()
        captured = []
        def fake(url, payload=None, **kwargs):
            if url.endswith('/models'):
                return {"models": [{"slug": "gpt-6-astra", "visibility": "list", "supported_reasoning_levels": [{"effort": "low"}, {"effort": "medium"}]}]}
            captured.append(payload)
            return stream({"type": "response.output_text.delta", "delta": "收到"}, {"type": "response.completed"})
        with patch.object(api, "request", side_effect=fake):
            result = self.client.test("测试", "gpt-6-astra", "medium")
        self.assertEqual(captured[0]["model"], "gpt-6-astra")
        self.assertEqual(captured[0]["reasoning"], {"effort": "medium"})
        self.assertEqual(result["reasoningEffort"], "medium")

    def test_saved_model_effort_persist_and_accounts_are_isolated(self):
        self.authorize()
        catalog = {"models": [{"slug": "gpt-5.6-sol", "visibility": "list", "supported_reasoning_levels": [{"effort": "low"}, {"effort": "medium"}]}]}
        with patch.object(api, "request", return_value=catalog):
            result = self.client.configure({"model": "gpt-5.6-sol", "reasoningEffort": "medium"})
            self.assertTrue(result["saved"])
            self.assertEqual(api.ChatGPTClient().models()["reasoningEffort"], "medium")
            data = api.read_vault()
            second = {**data["profiles"][0], "client_id": "oaiapp_second"}
            second.pop("inferenceConfig")
            data["profiles"].append(second)
            api.write_vault(data)
            self.client.select("oaiapp_second")
            self.assertEqual(self.client.models()["reasoningEffort"], "low")
            self.client.select("oaiapp_fixture")
            self.assertEqual(self.client.models()["reasoningEffort"], "medium")
            before = self.path.read_bytes()
            for payload in ({"model": "unlisted", "reasoningEffort": "medium"}, {"model": "gpt-5.6-sol", "reasoningEffort": "max"}, {"model": [], "reasoningEffort": "low"}):
                with self.assertRaises(SyncError):
                    self.client.configure(payload)
                self.assertEqual(self.path.read_bytes(), before)

    def test_saved_selection_disappearance_stops_inference_without_fallback(self):
        self.authorize()
        data = api.read_vault()
        data["profiles"][0]["inferenceConfig"] = {"model": "gpt-5.6-sol", "reasoningEffort": "medium"}
        api.write_vault(data)
        with patch.object(api, "request", return_value={"models": [{"slug": "gpt-6-astra", "visibility": "list"}]}) as remote:
            catalog = self.client.models()
            self.assertFalse(catalog["selectionValid"])
            with self.assertRaises(SyncError):
                self.client.test("测试")
            self.assertTrue(all(call.args[0].endswith('/models') for call in remote.call_args_list))

    def test_reauthorization_preserves_existing_model_preferences(self):
        self.authorize()
        data = api.read_vault()
        data["profiles"][0]["inferenceConfig"] = {"model": "gpt-5.6-sol", "reasoningEffort": "medium"}
        api.write_vault(data)
        self.client.begin(8766)
        with patch.object(api, "request", return_value=self.tokens), patch.object(api, "validate_identity", return_value={"sub": "fixture-sub", "email": "fixture@example.invalid"}):
            self.client.callback({"state": [self.client.pending["state"]], "code": ["fixture-new-code"]})
        self.assertEqual(api.read_vault()["profiles"][0]["inferenceConfig"], {"model": "gpt-5.6-sol", "reasoningEffort": "medium"})

    def test_disconnect_revocation_and_local_tokens_cleared(self):
        self.authorize()
        with patch.object(api, "request", return_value=io.BytesIO()) as transport:
            self.assertFalse(self.client.disconnect()["connected"])
        self.assertEqual(transport.call_args.args[0], api.REVOKE)
        data = api.read_vault()
        self.assertEqual(data["profiles"][0]["client_id"], "oaiapp_fixture")
        self.assertNotIn("access_token", data["profiles"][0])

    def test_revocation_network_failure_reports_unconfirmed(self):
        self.authorize()
        with patch.object(api, "request", side_effect=SyncError("fixture network failure")):
            result = self.client.disconnect()
        self.assertFalse(result["connected"])
        self.assertIn("未确认", result["warning"])

    def test_returning_wrong_client_or_identity_leaves_previous_account(self):
        self.authorize()
        before = self.path.read_bytes()
        self.client.begin(8766)
        with self.assertRaises(SyncError):
            self.client.callback({"state": [self.client.pending["state"]], "code": ["fixture"], "client_id": ["oaiapp_other"]})
        self.assertEqual(self.path.read_bytes(), before)
        self.client.begin(8766)
        with patch.object(api, "request", return_value=self.tokens), patch.object(api, "validate_identity", return_value={"sub": "other-sub"}), self.assertRaises(SyncError):
            self.client.callback({"state": [self.client.pending["state"]], "code": ["fixture"]})
        # Unverified registration may be retained, but validated tokens/identity
        # and the active account are never overwritten by the failed attempt.
        self.assertEqual(api.read_vault()["profiles"][0]["subject"], "fixture-sub")
        self.assertEqual(api.read_vault()["profiles"][0]["access_token"], "fixture_access")

    def test_invalid_grant_retains_client_and_one_fresh_recovery(self):
        self.client.begin(8766)
        params = {"state": [self.client.pending["state"]], "code": ["fixture-code"], "client_id": ["oaiapp_registered"]}
        previous = self.client.pending.copy()
        with patch.object(api, "request", side_effect=SyncError("fixture invalid grant", "invalid_grant", 502)), self.assertRaises(SyncError):
            self.client.callback(params)
        self.assertEqual(api.read_vault()["registrationAttempt"]["client_id"], "oaiapp_registered")
        self.assertFalse(self.client.status()["connected"])
        query = parse_qs(urlsplit(self.client.recover_grant(8766)).query)
        self.assertEqual(query["client_id"], ["oaiapp_registered"])
        self.assertNotIn("agent_name_hint", query)
        self.assertNotEqual(self.client.pending["state"], previous["state"])
        self.assertNotEqual(self.client.pending["verifier"], previous["verifier"])
        params = {"state": [self.client.pending["state"]], "code": ["fresh-fixture-code"]}
        with patch.object(api, "request", side_effect=SyncError("fixture invalid grant", "invalid_grant", 502)), self.assertRaises(SyncError):
            self.client.callback(params)
        self.assertIsNone(self.client.recover_grant(8766))
        query = parse_qs(urlsplit(self.client.begin(8766)["authorizationUrl"]).query)
        self.assertEqual(query["client_id"], ["oaiapp_registered"])


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ketime_server.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def post(self, action, payload, token=True):
        headers = {"Content-Type": "application/json", "Origin": self.url}
        if token:
            headers["X-Ketime-Token"] = ketime_server.BOOT_TOKEN
        return urlopen(Request(self.url + "/api/chatgpt/" + action, data=json.dumps(payload).encode(), headers=headers))

    def test_csrf_required_and_test_roundtrip(self):
        with patch.object(ketime_server.CHATGPT, "test", return_value={"reply": "fixture reply", "completed": True}) as fake:
            with self.assertRaises(HTTPError) as error:
                self.post("test", {"message": "fixture", "model": "fixture"}, token=False)
            self.assertEqual(error.exception.code, 403)
            fake.assert_not_called()
            with self.post("test", {"message": "fixture", "model": "fixture"}) as response:
                self.assertEqual(json.load(response)["reply"], "fixture reply")

    def test_cross_site_callback_state_checked_no_echo(self):
        with patch.object(ketime_server.CHATGPT, "callback", side_effect=SyncError("授权无效")) as callback:
            request = Request(self.url + "/auth/callback?code=fixture-secret-code&state=wrong", headers={"Sec-Fetch-Site": "cross-site"})
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertNotIn(b"fixture-secret-code", error.exception.read())
            callback.assert_called_once()

    def test_assistant_csrf_and_dispatch(self):
        captured = []
        def reply(payload):
            captured.append(json.loads(json.dumps(payload)))
            return {"message": "请补充时间", "events": [], "completed": True}
        with patch.object(ketime_server.CHATGPT, "assistant", side_effect=reply) as fake:
            with self.assertRaises(HTTPError) as error:
                self.post("assistant", {"messages": []}, token=False)
            self.assertEqual(error.exception.code, 403)
            fake.assert_not_called()
            with self.post("assistant", {"messages": []}) as response:
                self.assertEqual(json.load(response)["events"], [])
            fake.assert_called_once()
            self.assertEqual(captured, [{"messages": []}])

    def test_configuration_and_effort_dispatch(self):
        captured = []
        def configured(payload):
            captured.append(dict(payload))
            return {"saved": True}
        with patch.object(ketime_server.CHATGPT, "configure", side_effect=configured) as save:
            with self.assertRaises(HTTPError):
                self.post("configure", {"model": "gpt-5.6-sol", "reasoningEffort": "medium"}, token=False)
            save.assert_not_called()
            with self.post("configure", {"model": "gpt-5.6-sol", "reasoningEffort": "medium"}) as response:
                self.assertTrue(json.load(response)["saved"])
            save.assert_called_once()
            self.assertEqual(captured, [{"model": "gpt-5.6-sol", "reasoningEffort": "medium"}])
        with patch.object(ketime_server.CHATGPT, "test", return_value={"completed": True}) as inference:
            with self.post("test", {"message": "测试", "model": "gpt-5.6-sol", "reasoningEffort": "medium"}):
                pass
            inference.assert_called_once_with("测试", "gpt-5.6-sol", "medium")

    def test_vault_cannot_be_downloaded(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.url + "/.local/chatgpt.dpapi")
        self.assertEqual(error.exception.code, 404)

    def test_main_server_port_is_exclusive(self):
        service = ketime_server.LocalHTTPServer(("127.0.0.1", 0), ketime_server.Handler)
        try:
            with self.assertRaises(OSError):
                ketime_server.LocalHTTPServer(service.server_address, ketime_server.Handler)
        finally:
            service.server_close()


if __name__ == "__main__":
    unittest.main()
