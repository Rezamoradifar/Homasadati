"""Exercise private configuration with non-secret fixtures only."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("configure-digipay.py")
ROOT = SCRIPT.parent.parent
spec = importlib.util.spec_from_file_location("digipay_setup", SCRIPT)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

BEGIN = "# BEGIN HOMA DIGIPAY API"
END = "# END HOMA DIGIPAY API"


def fixture_values(**changes):
    values = {
        "DIGIPAY_ENVIRONMENT": "production",
        "DIGIPAY_ENABLED": "0",
        "DIGIPAY_CLIENT_ID": "fixture-client",
        "DIGIPAY_CLIENT_SECRET": "fixture-secret",
        "DIGIPAY_USERNAME": "fixture-user",
        "DIGIPAY_PASSWORD": "fixture-password",
    }
    values.update(changes)
    return values


class ConfigurationTest(unittest.TestCase):
    def test_appends_only_owned_block_without_rewriting_unrelated_lines(self):
        original = "# existing private configuration\nAPP_ORIGIN=https://homanets.test\nKEEP='unchanged # value'\n\nDIGIPAY_SELLER_ID=approved-seller\n"
        rendered = setup.render_config(original, fixture_values())
        self.assertTrue(rendered.startswith(original))
        self.assertEqual(rendered.count(BEGIN), 1)
        self.assertEqual(rendered.count(END), 1)
        self.assertIn("DIGIPAY_ENABLED=" + setup.dotenv_value("0"), rendered)
        self.assertIn("DIGIPAY_SELLER_ID=approved-seller", rendered)
        self.assertNotIn("DIGIPAY_ENABLED='1'", rendered)

    def test_replaces_one_owned_block_idempotently_and_preserves_surroundings(self):
        original = "KEEP_BEFORE=yes\n" + BEGIN + "\nDIGIPAY_PASSWORD=old-fixture\n" + END + "\nKEEP_AFTER=yes\n"
        values = fixture_values(DIGIPAY_PASSWORD="replacement-fixture")
        rendered = setup.render_config(original, values)
        self.assertTrue(rendered.startswith("KEEP_BEFORE=yes\n"))
        self.assertTrue(rendered.endswith("KEEP_AFTER=yes\n"))
        self.assertNotIn("old-fixture", rendered)
        self.assertEqual(rendered.count(BEGIN), 1)
        self.assertEqual(rendered.count(END), 1)
        self.assertEqual(setup.render_config(rendered, values), rendered)

    def test_rejects_repeated_or_incomplete_owned_blocks(self):
        invalid = [
            BEGIN + "\nDIGIPAY_PASSWORD=fixture\n",
            END + "\n",
            END + "\n" + BEGIN + "\n",
            BEGIN + "\n" + BEGIN + "\n" + END + "\n",
            BEGIN + "\n" + END + "\n" + END + "\n",
            (BEGIN + "\n" + END + "\n") * 2,
        ]
        for original in invalid:
            with self.subTest(original=original):
                with self.assertRaises(setup.SetupError):
                    setup.render_config(original, fixture_values())

    def test_actual_next_loader_roundtrips_sensitive_punctuation_exactly(self):
        fixtures = [
            "fixture-$variable-${OTHER}-$&-$$",
            " leading and trailing spaces ",
            "fixture # hash",
            "fixture'quote",
            'fixture"quote',
            "fixture`quote",
            "fixture'and\"quote",
            "fixture'and`quote",
            r"fixture\backslash\n_literal\r_literal",
            r"fixture\$variable\\$OTHER",
            "fixture-trailing-backslash\\",
            "نمونه # فارسی $fixture",
        ]
        for fixture in fixtures:
            with self.subTest(fixture=fixture):
                values = fixture_values(DIGIPAY_PASSWORD=fixture)
                content = setup.render_config("APP_ORIGIN=https://homanets.test\n", values)
                with contextlib.redirect_stdout(io.StringIO()) as output:
                    setup.roundtrip_config(ROOT, content, values)
                self.assertNotIn(fixture, output.getvalue())

    def test_next_roundtrip_rejects_mismatch_without_printing_the_fixture(self):
        values = fixture_values(DIGIPAY_PASSWORD="private-fixture-must-not-appear")
        content = setup.render_config("", fixture_values(DIGIPAY_PASSWORD="different-fixture"))
        with contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(setup.SetupError) as error:
                setup.roundtrip_config(ROOT, content, values)
        self.assertNotIn(values["DIGIPAY_PASSWORD"], str(error.exception))
        self.assertNotIn(values["DIGIPAY_PASSWORD"], output.getvalue())

    def test_rejects_control_characters_before_serialization(self):
        for character in ("\x00", "\n", "\r", "\t", "\x1f", "\x7f"):
            with self.subTest(character=repr(character)):
                with self.assertRaises(setup.SetupError):
                    setup.dotenv_value("fixture" + character + "value")

    def test_rejects_unrepresentable_delimiter_combination(self):
        with self.assertRaises(setup.SetupError):
            setup.dotenv_value("fixture'\"`#value")

    def test_saves_with_private_original_backup_and_runtime_ownership(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / "app"
            app.mkdir()
            target = app / ".env.production.local"
            original = "# untouched\nKEEP='مقدار خصوصی'\nDIGIPAY_SELLER_ID=approved-seller\n".encode("utf8")
            target.write_bytes(original)
            target.chmod(0o600)
            other = app / ".env.local"
            other.write_bytes(b"OTHER_SETTING=fixture-untouched\n")
            content = setup.render_config(original.decode("utf8"), fixture_values())

            backup = setup.save_config(app, content, original, os.getuid(), os.getgid())

            self.assertEqual(target.read_bytes(), content.encode("utf8"))
            self.assertTrue(target.read_bytes().startswith(original))
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual((target.stat().st_uid, target.stat().st_gid), (os.getuid(), os.getgid()))
            self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
            self.assertEqual((backup / ".env.production.local").read_bytes(), original)
            self.assertEqual((backup / ".env.production.local").stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads((backup / "state.json").read_text()), {"targetExisted": True})
            self.assertEqual((backup / "state.json").stat().st_mode & 0o777, 0o600)
            self.assertEqual(other.read_bytes(), b"OTHER_SETTING=fixture-untouched\n")

    def test_refuses_an_environment_changed_before_setup_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / "app"
            app.mkdir()
            target = app / ".env.production.local"
            target.write_bytes(b"OPERATOR_CHANGE=fixture\n")
            target.chmod(0o600)
            with self.assertRaises(setup.SetupError):
                setup.save_config(app, setup.render_config("", fixture_values()), b"PREVIOUS=fixture\n", os.getuid(), os.getgid())
            self.assertEqual(target.read_bytes(), b"OPERATOR_CHANGE=fixture\n")
            self.assertEqual(list(root.glob("digipay-config-backup-*")), [])

    def test_refuses_an_environment_changed_during_replacement_preparation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / "app"
            app.mkdir()
            target = app / ".env.production.local"
            original = b"KEEP=original-fixture\n"
            target.write_bytes(original)
            target.chmod(0o600)
            original_reader = setup.read_private_file
            reads = 0

            def operator_change(path):
                nonlocal reads
                reads += 1
                if reads == 2:
                    target.write_bytes(b"KEEP=concurrent-fixture\n")
                return original_reader(path)

            with patch.object(setup, "read_private_file", side_effect=operator_change):
                with self.assertRaises(setup.SetupError):
                    setup.save_config(app, setup.render_config("", fixture_values()), original, os.getuid(), os.getgid())
            self.assertEqual(target.read_bytes(), b"KEEP=concurrent-fixture\n")
            self.assertEqual(list(app.glob(".digipay-config-*")), [])

    def test_refuses_symlink_target_before_writing_or_backing_up(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / "app"
            app.mkdir()
            actual = root / "actual-private.env"
            original = b"KEEP=actual-fixture\n"
            actual.write_bytes(original)
            actual.chmod(0o600)
            target = app / ".env.production.local"
            target.symlink_to(actual)
            with self.assertRaises((setup.SetupError, OSError)):
                setup.save_config(app, setup.render_config("", fixture_values()), original, os.getuid(), os.getgid())
            self.assertTrue(target.is_symlink())
            self.assertEqual(actual.read_bytes(), original)
            self.assertEqual(list(root.glob("digipay-config-backup-*")), [])

    def test_safe_auth_result_excludes_arbitrary_provider_fields_and_echoes(self):
        fixture = "private-provider-fixture-never-printed"
        unsafe = {
            "authenticated": False, "purchaseAttempted": True,
            "environment": fixture, "httpStatus": 401, "providerStatus": 2001,
            "expiresInSeconds": True, "errorCode": fixture, "oauthError": fixture,
            "access_token": fixture, "refresh_token": fixture,
            "password": fixture, "message": fixture,
        }
        result = setup.safe_auth_result(unsafe)
        self.assertEqual(result, {"authenticated": False, "purchaseAttempted": False, "httpStatus": 401, "providerStatus": 2001})
        self.assertNotIn(fixture, json.dumps(result))

    def test_authentication_failure_does_not_save_or_print_raw_provider_details(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / "app"
            app.mkdir()
            original = b"KEEP=before-auth-fixture\n"
            target = app / ".env.production.local"
            target.write_bytes(original)
            target.chmod(0o600)
            provider_fixture = "private-provider-fixture-never-printed"
            auth = {"authenticated": False, "environment": "production", "errorCode": "digipay_authentication_failed",
                    "httpStatus": 401, "message": provider_fixture, "access_token": provider_fixture}
            with contextlib.ExitStack() as stack:
                stack.enter_context(patch.object(setup, "APP", app))
                stack.enter_context(patch.object(setup.sys, "argv", ["configure-digipay.py"]))
                stack.enter_context(patch.object(setup.os, "geteuid", return_value=0))
                stack.enter_context(patch.object(setup.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid())))
                stack.enter_context(patch.object(setup, "deployment_lock", return_value=contextlib.nullcontext()))
                stack.enter_context(patch.object(setup.getpass, "getpass", side_effect=["fixture-client", "fixture-secret", "fixture-user", "fixture-password"]))
                stack.enter_context(patch.object(setup, "roundtrip_config"))
                diagnostic = stack.enter_context(patch.object(setup, "run_diagnostic", side_effect=[(0, {"enabled": False}), (2, auth)]))
                save = stack.enter_context(patch.object(setup, "save_config"))
                output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                with self.assertRaises(setup.SetupError):
                    setup.main()
                save.assert_not_called()
                self.assertEqual(diagnostic.call_count, 2)
                self.assertNotIn(provider_fixture, output.getvalue())
                self.assertNotIn("fixture-password", output.getvalue())
            self.assertEqual(target.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
