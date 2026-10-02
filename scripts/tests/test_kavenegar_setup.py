"""Offline tests. All credentials/DBs/provider responses here are synthetic."""

import importlib.util
import errno
import io
import json
import os
from pathlib import Path
import pty
import select
import signal
import sqlite3
import subprocess
import tempfile
import termios
import time
import unittest
from unittest import mock
import urllib.error

SOURCE = Path(__file__).resolve().parents[2]
ROOT = Path(os.environ.get('HOMAY_TEST_PROJECT', '/opt/homay/app'))
spec = importlib.util.spec_from_file_location('homay_kavenegar_setup', SOURCE / 'scripts/kavenegar-setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
FAKE_MASTER = 'ab' * 32
FAKE_KEY = 'ef' * 44


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name)
        (self.app / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
        self.file = self.app / 'homay.sqlite'
        self.sql("CREATE TABLE p_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,secret INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)")
        self.sql("CREATE TABLE unrelated(id TEXT PRIMARY KEY,value TEXT NOT NULL)")
        self.sql("INSERT INTO unrelated VALUES('keep','unchanged')")
        self.sql("INSERT INTO p_settings VALUES('sms_sender','synthetic-sender',0,'original')")
        self.sql("INSERT INTO p_settings VALUES('site_name','Fixture',0,'original')")
        self.env = {**os.environ, 'NODE_ENV': 'production', 'PLATFORM_MASTER_KEY': FAKE_MASTER,
                    'DATABASE_PATH': str(self.file), 'APP_ORIGIN': setup.ORIGIN}
        self.context = self.node({'op': 'context'})['context']

    def sql(self, query, params=()):
        with sqlite3.connect(self.file) as db:
            result = db.execute(query, params).fetchall()
        return result

    def node(self, request, env=None, success=True):
        result = subprocess.run(['node', '-e', setup.NODE], input=json.dumps(request),
                                text=True, capture_output=True, cwd=self.app, env=env or self.env, timeout=12)
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr[:100])
        return json.loads(result.stdout)

    def inspect(self):
        return self.node({'op': 'inspect', 'expected': self.context})

    def save(self, snapshot=None, success=True, env=None):
        return self.node({'op': 'save', 'expected': self.context,
                          'snapshot': snapshot if snapshot is not None else self.inspect()['snapshot'],
                          'key': FAKE_KEY, 'template': setup.TEMPLATE}, success=success, env=env)

    def test_encrypts_only_key_preserves_other_data_and_decrypts_with_app(self):
        before = self.sql("SELECT * FROM p_settings WHERE key NOT IN ('kavenegar_key','sms_template') ORDER BY key")
        self.assertTrue(self.save()['saved'])
        rows = dict((key, (value, secret)) for key, value, secret in self.sql('SELECT key,value,secret FROM p_settings'))
        self.assertNotEqual(rows['kavenegar_key'][0], FAKE_KEY)
        self.assertEqual(rows['kavenegar_key'][1], 1)
        self.assertEqual(rows['sms_template'], (setup.TEMPLATE, 0))
        self.assertEqual(before, self.sql("SELECT * FROM p_settings WHERE key NOT IN ('kavenegar_key','sms_template') ORDER BY key"))
        self.assertEqual(self.sql('SELECT * FROM unrelated'), [('keep', 'unchanged')])
        # Compatibility check against the real application's decrypt implementation.
        code = "const fs=require('node:fs'); const {decrypt}=require('./src/platform/security.ts'); const x=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(JSON.stringify({matches:decrypt(x.cipher)===x.key}));"
        result = subprocess.run(['node', '--import', 'tsx', '-e', code], cwd=ROOT, env=self.env,
                                input=json.dumps({'cipher': rows['kavenegar_key'][0], 'key': FAKE_KEY}),
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr[:150])
        self.assertEqual(json.loads(result.stdout), {'matches': True})
        self.assertEqual(self.sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"), [('p_settings',), ('unrelated',)])

    def test_repeated_run_is_idempotent(self):
        self.save()
        before = self.sql('SELECT * FROM p_settings ORDER BY key')
        self.assertTrue(self.save()['already'])
        self.assertEqual(before, self.sql('SELECT * FROM p_settings ORDER BY key'))

    def test_concurrent_sender_change_blocks_both_writes(self):
        snapshot = self.inspect()['snapshot']
        self.sql("UPDATE p_settings SET value='changed' WHERE key='sms_sender'")
        result = self.save(snapshot, success=False)
        self.assertEqual(result['error'], 'settings_changed')
        self.assertEqual(self.sql("SELECT key FROM p_settings WHERE key IN ('kavenegar_key','sms_template')"), [])

    def test_second_write_failure_rolls_back_first(self):
        self.sql("CREATE TRIGGER prevent_template BEFORE INSERT ON p_settings WHEN NEW.key='sms_template' BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.save(success=False)
        self.assertEqual(self.sql("SELECT key FROM p_settings WHERE key IN ('kavenegar_key','sms_template')"), [])

    def test_changed_master_context_blocks_save(self):
        snapshot = self.inspect()['snapshot']
        result = self.save(snapshot, env={**self.env, 'PLATFORM_MASTER_KEY': 'cd' * 32}, success=False)
        self.assertEqual(result['error'], 'context_changed')
        self.assertEqual(self.sql("SELECT key FROM p_settings WHERE key='kavenegar_key'"), [])

    def test_existing_cipher_rejects_wrong_master(self):
        self.save()
        different = {**self.env, 'PLATFORM_MASTER_KEY': 'cd' * 32}
        context = self.node({'op': 'context'}, env=different)['context']
        result = self.node({'op': 'inspect', 'expected': context}, env=different, success=False)
        self.assertEqual(result['error'], 'master_key_mismatch')

    def test_absent_database_is_not_created(self):
        missing = self.app / 'missing.sqlite'
        self.node({'op': 'context'}, env={**self.env, 'DATABASE_PATH': str(missing)}, success=False)
        self.assertFalse(missing.exists())

    def test_absent_settings_table_is_not_created(self):
        self.sql('DROP TABLE p_settings')
        result = self.node({'op': 'inspect', 'expected': self.context}, success=False)
        self.assertEqual(result['error'], 'settings_schema_mismatch')
        self.assertEqual(self.sql("SELECT name FROM sqlite_master WHERE type='table'"), [('unrelated',)])

    def test_wrong_origin_is_rejected(self):
        result = self.node({'op': 'context'}, env={**self.env, 'APP_ORIGIN': 'https://example.invalid'}, success=False)
        self.assertEqual(result['error'], 'origin_mismatch')

    def test_database_replacement_between_stat_and_open_is_rejected(self):
        # Reproduce a DB rotation in the narrow window before the driver opens it.
        prelude = r"""
const Module = require('node:module');
const original = Module._load;
Module._load = function(name, ...args) {
  const real = original.call(this, name, ...args);
  if (name !== 'better-sqlite3') return real;
  return function(file, options) {
    const fs = require('node:fs');
    fs.renameSync(file, file + '.old');
    fs.copyFileSync(file + '.old', file);
    return new real(file, options);
  };
};
"""
        result = subprocess.run(['node', '-e', prelude + setup.NODE], cwd=self.app, env=self.env,
                                input=json.dumps({'op': 'inspect', 'expected': self.context}),
                                text=True, capture_output=True, timeout=12)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['error'], 'database_changed')


class ProviderTests(unittest.TestCase):
    def row(self, **changes):
        return {'name': setup.TEMPLATE, 'approvalstatus': 'Approved',
                'sendpriority': 'SMS', 'smsmessage': 'Synthetic code: %token', **changes}

    def call(self, entries, status=200):
        fake = mock.MagicMock()
        fake.open.return_value.__enter__.return_value.read.return_value = json.dumps(
            {'return': {'status': status}, 'entries': entries}).encode()
        with mock.patch.object(setup.urllib.request, 'build_opener', return_value=fake) as factory:
            setup.approved_template(FAKE_KEY)
        request = fake.open.call_args.args[0]
        self.assertEqual(request.get_method(), 'GET')
        self.assertEqual(request.host, 'api.kavenegar.com')
        self.assertIn('/verify/templatelist.json?', request.full_url)
        self.assertTrue(any(isinstance(x, setup.NoRedirect) for x in factory.call_args.args))

    def test_approved_sms(self):
        self.call([self.row()])

    def test_documented_camel_case_fields(self):
        self.call([{'name': setup.TEMPLATE, 'approvalStatus': 'Approved',
                    'sendPriority': 'SMS', 'smsMessage': 'Code: %token'}])

    def test_pending_rejected_unknown_voice_and_extra_tokens_rejected(self):
        for change in ({'approvalstatus': 'PendingReview'}, {'approvalstatus': 'Rejected'},
                       {'approvalstatus': None}, {'sendpriority': 'Call'},
                       {'smsmessage': 'Code %token and %token2'}, {'smsmessage': 'No token'}):
            with self.subTest(change=change), self.assertRaises(setup.SetupError):
                self.call([self.row(**change)])

    def test_missing_and_duplicate_templates_rejected(self):
        for rows in ([], [self.row(name='Different')], [self.row(), self.row()]):
            with self.subTest(rows=len(rows)), self.assertRaises(setup.SetupError):
                self.call(rows)

    def test_api_error_does_not_expose_credential(self):
        with self.assertRaises(setup.SetupError) as caught:
            self.call([], status=403)
        self.assertIn('403', str(caught.exception))
        self.assertNotIn(FAKE_KEY, str(caught.exception))

    def test_network_error_does_not_expose_credential_or_url(self):
        fake = mock.MagicMock()
        fake.open.side_effect = urllib.error.URLError('https://api.kavenegar.com/' + FAKE_KEY)
        with mock.patch.object(setup.urllib.request, 'build_opener', return_value=fake):
            with self.assertRaises(setup.SetupError) as caught:
                setup.approved_template(FAKE_KEY)
        self.assertNotIn(FAKE_KEY, str(caught.exception))
        self.assertNotIn('https://', str(caught.exception))

    def test_redirect_is_never_followed(self):
        self.assertIsNone(setup.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://example.invalid'))

    def test_invalid_key_never_reaches_network(self):
        with mock.patch.object(setup.urllib.request, 'build_opener') as build:
            with self.assertRaises(setup.SetupError):
                setup.approved_template('invalid/key')
            build.assert_not_called()


class TerminalTests(unittest.TestCase):
    def test_real_controlling_pty_accepts_preflight_and_hides_input(self):
        synthetic = b'terminal-fixture-only'
        pid, master = pty.fork()
        if pid == 0:
            try:
                original = termios.tcgetattr(0)
                setup.require_private_terminal()
                result = setup.read_api_key()
                restored = termios.tcgetattr(0) == original
                passed = result == synthetic.decode() and restored
                print('TTY_TEST_OK' if passed else 'TTY_TEST_FAILED', flush=True)
                os._exit(0 if passed else 1)
            except BaseException:
                print('TTY_TEST_FAILED', flush=True)
                os._exit(1)
        output = b''
        sent = False
        deadline = time.monotonic() + 8
        try:
            while time.monotonic() < deadline:
                if not select.select([master], [], [], max(0, deadline - time.monotonic()))[0]:
                    self.fail('terminal regression test timed out')
                try:
                    block = os.read(master, 4096)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not block:
                    break
                output += block
                if not sent and b'Kavenegar API key:' in output:
                    self.assertFalse(termios.tcgetattr(master)[3] & termios.ECHO)
                    os.write(master, synthetic + b'\n')
                    sent = True
            self.assertTrue(sent)
            self.assertIn(b'TTY_TEST_OK', output)
            self.assertNotIn(synthetic, output)
            waited, status = os.waitpid(pid, 0)
            self.assertEqual(waited, pid)
            pid = None
            self.assertTrue(os.WIFEXITED(status))
            self.assertEqual(os.WEXITSTATUS(status), 0)
        finally:
            os.close(master)
            if pid is not None:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                os.waitpid(pid, 0)

    def test_missing_controlling_terminal_stops_before_input(self):
        with mock.patch.object(setup.os, 'open', side_effect=OSError('fixture unavailable')):
            with self.assertRaises(setup.SetupError):
                setup.require_private_terminal()

    def test_echo_fallback_is_rejected_before_any_input_read(self):
        with mock.patch.object(setup.getpass.os, 'open', side_effect=OSError('fixture no tty')), \
             mock.patch.object(setup.getpass.termios, 'tcgetattr', side_effect=termios.error('fixture no echo control')), \
             mock.patch.object(setup.getpass, '_raw_input') as raw_input:
            with self.assertRaises(setup.SetupError):
                setup.read_api_key()
            raw_input.assert_not_called()


class ContextTests(unittest.TestCase):
    def test_mismatched_live_contexts_rejected(self):
        with self.assertRaises(setup.SetupError):
            setup.verify_contexts([{'context': {'master': 'one'}}, {'context': {'master': 'two'}}])

    def test_dotenv_created_after_process_start_rejected(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(setup, 'APP', Path(folder)):
            (Path(folder) / '.env.local').write_text('SYNTHETIC=1\n')
            with self.assertRaises(setup.SetupError):
                setup.env_fingerprint(0)

    def test_save_ipc_failure_reports_uncertain_not_unsaved(self):
        process = {'env': {}, 'exe': '/fake/node'}
        account = mock.Mock(pw_uid=1000, pw_gid=1000)
        result = mock.Mock(stdout='broken', returncode=1)
        with mock.patch.object(setup.subprocess, 'run', return_value=result):
            with self.assertRaises(setup.SetupError) as caught:
                setup.bridge(account, process, {'op': 'save'})
        self.assertIn('نتیجه ثبت تنظیمات مشخص نشد', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
