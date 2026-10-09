"""Release staging never touches an existing APK before verification succeeds."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "ketime_sign_release", Path(__file__).parents[1] / "android/tools/sign-release.py"
)
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class AndroidSigningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        identity = self.root / ".local/android-signing"
        identity.mkdir(parents=True)
        (identity / "password.dpapi").write_bytes(b"mock-vault")
        (identity / "ketime-release.p12").write_bytes(b"mock-existing-identity")
        source = self.root / "android/app/build/outputs/apk/release/app-release-unsigned.apk"
        source.parent.mkdir(parents=True)
        source.write_bytes(b"unsigned-fixture")
        self.destination = self.root / "android/dist/刻时-Android-1.0.apk"
        self.destination.parent.mkdir(parents=True)
        self.destination.write_bytes(b"previous-working-package")
        self.signature = self.destination.with_suffix(".apk.idsig")
        self.signature.write_bytes(b"previous-signature")
        for target, value in [("ROOT", self.root)]:
            mocking = patch.object(signing, target, value)
            mocking.start()
            self.addCleanup(mocking.stop)
        mocking = patch.object(signing, "crypt", return_value=b"fake-test-password")
        mocking.start()
        self.addCleanup(mocking.stop)

    def runner(self, fail=None):
        def run(args, **kwargs):
            action = args[1]
            self.assertEqual(self.destination.read_bytes(), b"previous-working-package")
            if action == fail:
                raise subprocess.CalledProcessError(1, args)
            if action == "sign":
                staged = Path(args[args.index("--out") + 1])
                self.assertNotEqual(staged, self.destination)
                staged.write_bytes(b"new-verified-package")
                staged.with_suffix(".apk.idsig").write_bytes(b"new-signature")
            elif action == "verify":
                self.assertEqual(Path(args[-1]).read_bytes(), b"new-verified-package")
            else:
                self.fail("Must reuse the existing signing identity")
        return run

    def test_success_publishes_verified_package_and_sidecar(self):
        with patch.object(signing.subprocess, "run", side_effect=self.runner()):
            signing.main()
        self.assertEqual(self.destination.read_bytes(), b"new-verified-package")
        self.assertEqual(self.signature.read_bytes(), b"new-signature")
        self.assertEqual(list(self.destination.parent.glob("release-sign-*")), [])

    def test_sign_failure_preserves_previous_package(self):
        with patch.object(signing.subprocess, "run", side_effect=self.runner("sign")):
            with self.assertRaises(subprocess.CalledProcessError):
                signing.main()
        self.assertEqual(self.destination.read_bytes(), b"previous-working-package")
        self.assertEqual(self.signature.read_bytes(), b"previous-signature")

    def test_verify_failure_preserves_previous_package(self):
        with patch.object(signing.subprocess, "run", side_effect=self.runner("verify")):
            with self.assertRaises(subprocess.CalledProcessError):
                signing.main()
        self.assertEqual(self.destination.read_bytes(), b"previous-working-package")
        self.assertEqual(self.signature.read_bytes(), b"previous-signature")

    def test_publish_lock_does_not_truncate_previous_package(self):
        with patch.object(signing.subprocess, "run", side_effect=self.runner()):
            with patch.object(Path, "replace", side_effect=PermissionError("fixture lock")):
                with self.assertRaises(PermissionError):
                    signing.main()
        self.assertEqual(self.destination.read_bytes(), b"previous-working-package")
        self.assertEqual(self.signature.read_bytes(), b"previous-signature")
