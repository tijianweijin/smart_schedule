import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bupt_sync import SyncError
import local_settings as vault


@unittest.skipUnless(os.name == "nt", "Windows DPAPI required")
class VaultTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="ketime-vault-test-")
        self.path = Path(self.folder.name) / "account.dpapi"
        self.mock = patch.object(vault, "VAULT_PATH", self.path)
        self.mock.start()
        self.payload = {"account": "test_account", "password": "test_jw_password", "cloudPassword": "test_cloud_password", "termStart": "2026-08-31"}

    def tearDown(self):
        self.mock.stop()
        self.folder.cleanup()

    def test_encrypted_disk_roundtrip_and_public_redaction(self):
        public = vault.save_settings(self.payload)
        self.assertEqual(vault.read_settings(), self.payload)
        encoded = self.path.read_bytes()
        for value in self.payload.values():
            self.assertNotIn(value.encode(), encoded)
        self.assertEqual(public["account"], "test_account")
        self.assertTrue(public["hasPassword"])
        self.assertNotIn("password", public)
        self.assertNotIn("cloudPassword", public)
        self.assertEqual(vault.stored_credentials(cloud=True)[1], "test_cloud_password")

    def test_blank_password_keeps_saved_value(self):
        vault.save_settings(self.payload)
        vault.save_settings({"account": "test_account", "password": "", "cloudPassword": ""})
        self.assertEqual(vault.read_settings()["password"], self.payload["password"])

    def test_account_change_requires_both_passwords(self):
        vault.save_settings(self.payload)
        before = self.path.read_bytes()
        with self.assertRaises(SyncError):
            vault.save_settings({"account": "other_account", "password": "new_password"})
        self.assertEqual(self.path.read_bytes(), before)

    def test_clear_and_missing_credentials(self):
        vault.save_settings(self.payload)
        public = vault.save_settings({"clear": True})
        self.assertFalse(public["hasPassword"])
        self.assertFalse(public["hasCloudPassword"])
        with self.assertRaises(SyncError):
            vault.stored_credentials()

    def test_corrupt_file_no_plaintext_fallback(self):
        self.path.write_bytes(b"invalid-test-ciphertext")
        with self.assertRaises(SyncError):
            vault.read_settings()
        vault.save_settings({"clear": True})
        self.assertEqual(vault.read_settings()["account"], "")

    def test_invalid_term_start_preserves_file(self):
        vault.save_settings(self.payload)
        before = self.path.read_bytes()
        with self.assertRaises(SyncError):
            vault.save_settings({"account": "test_account", "termStart": "2026-09-01"})
        self.assertEqual(self.path.read_bytes(), before)
