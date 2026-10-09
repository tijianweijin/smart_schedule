"""Audit helpers use only synthetic package bytes, never personal credentials."""
import importlib.util
from pathlib import Path
import struct
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("release_audit", Path(__file__).parents[1] / "tools/release-audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ReleaseAuditTests(unittest.TestCase):
    def elf(self, bits, alignment):
        raw = bytearray(128)
        raw[:6] = b"\x7fELF" + bytes([bits, 1])
        if bits == 2:
            struct.pack_into("<Q", raw, 32, 64)
            struct.pack_into("<HH", raw, 54, 56, 1)
            struct.pack_into("<IIQQQQQQ", raw, 64, 1, 4, 0, 0, 0, 128, 128, alignment)
        else:
            struct.pack_into("<I", raw, 28, 64)
            struct.pack_into("<HH", raw, 42, 32, 1)
            struct.pack_into("<IIIIIIII", raw, 64, 1, 0, 0, 0, 128, 128, 4, alignment)
        return raw

    def test_elf32_and_elf64_alignment(self):
        for bits in (1, 2):
            for alignment in (4096, 16384, 65536):
                self.assertEqual(audit.elf_load_alignment(self.elf(bits, alignment)), alignment)
        with self.assertRaises(ValueError):
            audit.elf_load_alignment(b"not ELF")

    def test_java_zip_chinese_name_without_utf8_flag(self):
        name = "assets/web/刻时 小样.html"
        entry = zipfile.ZipInfo(name.encode("utf-8").decode("cp437"))
        self.assertEqual(audit.zip_name(entry), name)
        entry = zipfile.ZipInfo(name)
        entry.flag_bits = 0x800
        self.assertEqual(audit.zip_name(entry), name)

    def test_key_parser_marker_is_not_private_key(self):
        marker = b"-----BEGIN OPENSSH PRIVATE KEY-----"
        self.assertFalse(audit.SECRET_PATTERNS["private-key"].search(marker))
        fake = marker + b"\n" + b"A" * 100 + b"\n-----END OPENSSH PRIVATE KEY-----"
        self.assertTrue(audit.SECRET_PATTERNS["private-key"].search(fake))

    def test_sensitive_paths_and_key_patterns(self):
        for name in ("assets/.local/account.dpapi", "assets/vault/school.aes", "secret.p12", ".env.production"):
            self.assertTrue(audit.FORBIDDEN.search(name))
        self.assertFalse(audit.FORBIDDEN.search("assets/web/bupt-ui.js"))
        self.assertTrue(audit.SECRET_PATTERNS["api-key"].search(b"sk-" + b"a" * 40))
        self.assertFalse(audit.SECRET_PATTERNS["api-key"].search(b"sk-synthetic-test-only"))

    def test_android_26_style_and_export_executor_lifecycle(self):
        root = Path(__file__).parents[1]
        base = (root / "android/app/src/main/res/values/styles.xml").read_text(encoding="utf-8")
        modern = (root / "android/app/src/main/res/values-v27/styles.xml").read_text(encoding="utf-8")
        self.assertNotIn("windowLightNavigationBar", base)
        self.assertIn("windowLightNavigationBar", modern)
        java = (root / "android/app/src/main/java/cn/ketime/app/MainActivity.java").read_text(encoding="utf-8")
        self.assertEqual(java.count("newSingleThreadExecutor()"), 1)
        self.assertIn("exportExecutor.shutdown()", java)
        self.assertIn("Arrays.fill(pendingExport", java)


if __name__ == "__main__":
    unittest.main()
