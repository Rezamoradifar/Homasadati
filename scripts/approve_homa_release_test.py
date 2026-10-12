import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("approval", Path(__file__).with_name("approve-homa-release.py"))
approval = importlib.util.module_from_spec(spec)
spec.loader.exec_module(approval)


class ApprovalTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.config = self.root / "config.json"
        self.installer = self.root / "deploy-zibal.sh"
        self.state = self.root / "jobs"
        self.state.mkdir()
        self.lock = self.root / "deploy.lock"
        self.before = {"approved_release": "a" * 40, "tunnel_id": "private-test-value", "keep": {"future": True}}
        self.config.write_text(json.dumps(self.before))
        self.config.chmod(0o600)
        self.old_script = b"#!/bin/bash\necho old\n"
        self.new_script = b"#!/bin/bash\necho new\n"
        self.installer.write_bytes(self.old_script)
        self.installer.chmod(0o644)

    def approve(self, **changes):
        values = dict(config_path=self.config, installer_path=self.installer, state=self.state,
                      deploy_lock=self.lock, release="b" * 40, expected="a" * 40, installer=self.new_script)
        values.update(changes)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            approval.approve(**values)
        return output.getvalue()

    def test_updates_only_release_and_installer_keeps_private_backup(self):
        output = self.approve()
        self.assertEqual(json.loads(self.config.read_text()), {**self.before, "approved_release": "b" * 40})
        self.assertEqual(self.installer.read_bytes(), self.new_script)
        self.assertEqual(self.config.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.installer.stat().st_mode & 0o777, 0o644)
        backup, = self.root.glob("approval-backup-*")
        self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
        self.assertEqual(json.loads((backup / "config.json").read_text()), self.before)
        self.assertEqual((backup / "config.json").stat().st_mode & 0o777, 0o600)
        self.assertEqual((backup / "deploy-zibal.sh").read_bytes(), self.old_script)
        self.assertNotIn("private-test-value", output)
        self.assertIn("Already approved", self.approve())
        self.assertEqual(len(list(self.root.glob("approval-backup-*"))), 1)

    def test_rejects_changed_approval(self):
        with self.assertRaises(ValueError):
            self.approve(expected="c" * 40)
        self.assertEqual(self.installer.read_bytes(), self.old_script)
        self.assertEqual(json.loads(self.config.read_text()), self.before)

    def test_rejects_queued_or_running_jobs(self):
        job = self.state / ("d" * 32 + ".json")
        for state in ("queued", "running"):
            job.write_text(json.dumps({"state": state}))
            with self.assertRaises(ValueError):
                self.approve()
        self.assertEqual(self.installer.read_bytes(), self.old_script)

    def test_rejects_busy_worker_or_request_or_deployment(self):
        for path in (self.state / "requests.lock", self.state / "worker.lock", self.lock):
            with approval.locked(path):
                with self.assertRaises(BlockingIOError):
                    self.approve()
        self.assertEqual(self.installer.read_bytes(), self.old_script)

    def test_rejects_symlinked_config(self):
        actual = self.root / "actual.json"
        self.config.rename(actual)
        self.config.symlink_to(actual)
        with self.assertRaises(OSError):
            self.approve()
        self.assertEqual(json.loads(actual.read_text()), self.before)

    def test_rolls_back_installer_when_config_write_fails(self):
        write = approval.atomic_write
        def fail_config(path, content, mode):
            if path == self.config:
                raise OSError("simulated config write failure")
            write(path, content, mode)
        with patch.object(approval, "atomic_write", side_effect=fail_config):
            with self.assertRaises(OSError):
                self.approve()
        self.assertEqual(self.installer.read_bytes(), self.old_script)
        self.assertEqual(json.loads(self.config.read_text()), self.before)


if __name__ == "__main__":
    unittest.main()
