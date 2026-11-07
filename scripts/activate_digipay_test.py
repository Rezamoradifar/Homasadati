"""Verify activation and rollback with isolated files and non-secret fixtures."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("activate-digipay.py")
spec = importlib.util.spec_from_file_location("digipay_activation", SCRIPT)
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)

ORIGINAL = (
    "APP_ORIGIN=https://homanets.com\n"
    "UNRELATED_SETTING='leave this alone'\n"
    "# BEGIN HOMA DIGIPAY API\n"
    "DIGIPAY_ENVIRONMENT='production'\n"
    "DIGIPAY_ENABLED='0'\n"
    "DIGIPAY_CLIENT_ID='fixture-client'\n"
    "DIGIPAY_CLIENT_SECRET='fixture-secret'\n"
    "DIGIPAY_USERNAME='fixture-user'\n"
    "DIGIPAY_PASSWORD='fixture-private-password'\n"
    "# END HOMA DIGIPAY API\n"
).encode("utf8")

CURRENT = {
    "environment": "production", "enabled": False, "configured": False,
    "readyForCheckout": False,
    "callbackUrl": "https://homanets.com/api/platform/payment/digipay/callback",
}
AUTH = {"authenticated": True, "environment": "production", "purchaseAttempted": False}
CANDIDATE = {**CURRENT, "enabled": True, "configured": True, "readyForCheckout": True}


@contextlib.contextmanager
def app_fixture():
    with tempfile.TemporaryDirectory() as directory:
        app = Path(directory) / "app"
        app.mkdir()
        target = app / ".env.production.local"
        target.write_bytes(ORIGINAL)
        target.chmod(0o600)
        yield app, target


@contextlib.contextmanager
def mocked_boundaries(responses, probe=True, services=True):
    with contextlib.ExitStack() as stack:
        diagnostic = stack.enter_context(patch.object(activation.setup, "run_diagnostic", side_effect=responses))
        roundtrip = stack.enter_context(patch.object(activation.setup, "roundtrip_config"))
        restart = stack.enter_context(patch.object(activation, "restart_services"))
        site = stack.enter_context(patch.object(activation, "probe_site", return_value=probe))
        active = stack.enter_context(patch.object(activation, "check_services", return_value=services))
        if hasattr(activation, "time"):
            stack.enter_context(patch.object(activation.time, "sleep", return_value=None))
        output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        yield diagnostic, roundtrip, restart, site, active, output


class ActivationTest(unittest.TestCase):
    def test_success_keeps_api_credentials_and_unrelated_settings_then_verifies_live_visibility(self):
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, CURRENT), (0, AUTH), (0, CANDIDATE)]) as boundary:
                diagnostic, roundtrip, restart, site, active, output = boundary
                result = activation.activate(app, os.getuid(), os.getgid())
                self.assertIsInstance(result, dict)
                self.assertEqual(diagnostic.call_count, 3)
                roundtrip.assert_called_once()
                restart.assert_called_once()
                self.assertTrue(site.called)
                self.assertTrue(active.called)
                self.assertNotIn("fixture-private-password", output.getvalue())
                self.assertNotIn("fixture-secret", output.getvalue())
            saved = target.read_bytes()
            self.assertTrue(saved.startswith(ORIGINAL))
            self.assertEqual(saved.count(b"# BEGIN HOMA DIGIPAY API"), 1)
            self.assertEqual(saved.count(b"# BEGIN HOMA DIGIPAY CHECKOUT"), 1)
            self.assertIn(b"DIGIPAY_ENABLED='1'", saved)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            backups = list(app.parent.glob("digipay-config-backup-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual((backups[0] / ".env.production.local").read_bytes(), ORIGINAL)

    def test_nonproduction_configuration_stops_before_authentication_or_write(self):
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, {**CURRENT, "environment": "sandbox"})]) as boundary:
                diagnostic, _, restart, site, _, _ = boundary
                with patch.object(activation.setup, "save_config") as save:
                    with self.assertRaises(activation.setup.SetupError):
                        activation.activate(app, os.getuid(), os.getgid())
                    save.assert_not_called()
                self.assertEqual(diagnostic.call_count, 1)
                restart.assert_not_called()
                site.assert_not_called()
            self.assertEqual(target.read_bytes(), ORIGINAL)

    def test_authentication_failure_leaves_checkout_disabled_and_never_saves(self):
        failure = {"authenticated": False, "environment": "production", "errorCode": "digipay_authentication_failed"}
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, CURRENT), (2, failure)]) as boundary:
                diagnostic, _, restart, site, _, _ = boundary
                with patch.object(activation.setup, "save_config") as save:
                    with self.assertRaises(activation.setup.SetupError):
                        activation.activate(app, os.getuid(), os.getgid())
                    save.assert_not_called()
                self.assertEqual(diagnostic.call_count, 2)
                restart.assert_not_called()
                site.assert_not_called()
            self.assertEqual(target.read_bytes(), ORIGINAL)

    def test_incomplete_checkout_readiness_does_not_enable_the_gateway(self):
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, CURRENT), (0, AUTH), (0, {**CANDIDATE, "readyForCheckout": False})]) as boundary:
                _, _, restart, site, _, _ = boundary
                with patch.object(activation.setup, "save_config") as save:
                    with self.assertRaises(activation.setup.SetupError):
                        activation.activate(app, os.getuid(), os.getgid())
                    save.assert_not_called()
                restart.assert_not_called()
                site.assert_not_called()
            self.assertEqual(target.read_bytes(), ORIGINAL)

    def test_failed_environment_roundtrip_does_not_save_or_restart(self):
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, CURRENT), (0, AUTH), (0, CANDIDATE)]) as boundary:
                _, roundtrip, restart, site, _, _ = boundary
                roundtrip.side_effect = activation.setup.SetupError("Fixture serialization failure")
                with patch.object(activation.setup, "save_config") as save:
                    with self.assertRaises(activation.setup.SetupError):
                        activation.activate(app, os.getuid(), os.getgid())
                    save.assert_not_called()
                restart.assert_not_called()
                site.assert_not_called()
            self.assertEqual(target.read_bytes(), ORIGINAL)

    def test_failed_live_visibility_restores_the_previous_configuration_and_restarts(self):
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, CURRENT), (0, AUTH), (0, CANDIDATE)], probe=False) as boundary:
                _, _, restart, site, _, output = boundary
                with self.assertRaises(activation.setup.SetupError):
                    activation.activate(app, os.getuid(), os.getgid())
                self.assertEqual(restart.call_count, 2)
                self.assertTrue(site.called)
                self.assertNotIn("fixture-private-password", output.getvalue())
            self.assertEqual(target.read_bytes(), ORIGINAL)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_failed_worker_health_restores_the_previous_configuration(self):
        with app_fixture() as (app, target):
            with mocked_boundaries([(0, CURRENT), (0, AUTH), (0, CANDIDATE)], services=False) as boundary:
                _, _, restart, _, active, _ = boundary
                with self.assertRaises(activation.setup.SetupError):
                    activation.activate(app, os.getuid(), os.getgid())
                self.assertEqual(restart.call_count, 2)
                self.assertTrue(active.called)
            self.assertEqual(target.read_bytes(), ORIGINAL)


if __name__ == "__main__":
    unittest.main()
