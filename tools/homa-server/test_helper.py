import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('helper', Path(__file__).with_name('helper.py'))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
RELEASE = 'ca3c7e7d57a9070e9e9584f238f9830702c3d364'


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for attr, path in [('APP', self.root / 'app'), ('STATE', self.root / 'state'), ('LOG_ROOT', self.root / 'logs')]:
            path.mkdir()
            p = patch.object(h, attr, path)
            p.start(); self.addCleanup(p.stop)
        p = patch.object(h, 'CONFIG', self.root / 'config.json')
        p.start(); self.addCleanup(p.stop)
        h.CONFIG.write_text(json.dumps({'approved_release': RELEASE}))

    def test_strict_root_validation_rejects_injections_and_unknown_fields(self):
        bad = [None, [], {'op': 'shell', 'command': 'id'}, {'op': 'status', 'path': '/etc/shadow'},
               {'op': 'log', 'name': '../homa-ops.abcdef.log'}, {'op': 'log', 'lines': True},
               {'op': 'log', 'lines': 151}, {'op': 'upgrade', 'release': 'f'*40, 'request_id': 'a'*32},
               {'op': 'restart', 'service': 'ssh.service', 'request_id': 'a'*32},
               {'op': 'backup', 'request_id': '$(id)'}, {'op': 'job', 'job_id': '../config'}]
        with patch.object(h, 'run') as run:
            for request in bad:
                with self.subTest(request=request), self.assertRaises(ValueError): h.dispatch(request)
            run.assert_not_called()

    def test_symlinks_and_pipes_are_not_read(self):
        secret = self.root / 'secret'; secret.write_text('private')
        link = h.LOG_ROOT / 'homa-ops.abcdef.log'; link.symlink_to(secret)
        with self.assertRaises(OSError): h.dispatch({'op': 'log', 'name': link.name})
        link.unlink(); os.mkfifo(link)
        with self.assertRaises(ValueError): h.dispatch({'op': 'log', 'name': link.name})

    def test_log_selection_limits_and_redacts(self):
        (h.APP / '.env').write_text('SECRET=known-private-value\n')
        log = h.LOG_ROOT / 'homa-ops.f6GjDt4u.log'
        log.write_text('old\n'*200 + 'password=hidden known-private-value sk-test123456789\nreza@example.com +989123456789\n')
        result = h.dispatch({'op': 'log', 'lines': 10})
        self.assertEqual(result['name'], log.name)
        self.assertEqual(len(result['text'].splitlines()), 10)
        for value in ['hidden', 'known-private-value', 'sk-test123456789', 'reza@example.com', '+989123456789']:
            self.assertNotIn(value, result['text'])

    def test_read_only_status_does_not_start_process_job(self):
        with patch.object(h, 'run', return_value=subprocess.CompletedProcess([], 0, 'active')) as run:
            result = h.dispatch({'op': 'status'})
        self.assertEqual(result['approved_release'], RELEASE)
        self.assertFalse(any('/usr/bin/systemd-run' in c.args[0] for c in run.call_args_list))
        self.assertFalse(list(h.STATE.glob('*.json')))

    def test_launch_deduplicates_same_request_and_blocks_overlap(self):
        request = {'op': 'backup', 'request_id': 'a'*32}
        with patch.object(h, 'run', return_value=subprocess.CompletedProcess([], 0, 'active')) as run:
            first = h.dispatch(request)
            second = h.dispatch(request)
            self.assertEqual(first['job_id'], second['job_id'])
            self.assertTrue(second['reused'])
            with self.assertRaises(ValueError): h.dispatch({'op': 'backup', 'request_id': 'b'*32})
            with self.assertRaises(ValueError): h.dispatch({'op': 'restart', 'request_id': 'a'*32, 'service': 'homay.service'})
            starts = [c.args[0] for c in run.call_args_list if c.args[0][0] == '/usr/bin/systemd-run']
            self.assertEqual(len(starts), 1)
            self.assertIn('--worker', starts[0])
            self.assertNotIn('sh', starts[0])

    def test_launch_failure_is_reported_and_not_retried_implicitly(self):
        request = {'op': 'backup', 'request_id': 'a'*32}
        with patch.object(h, 'run', return_value=subprocess.CompletedProcess([], 1, '')) as run:
            self.assertFalse(h.dispatch(request)['ok'])
            result = h.dispatch(request)
            self.assertEqual(result['state'], 'failed')
            self.assertEqual(run.call_count, 1)

    def test_reboot_or_killed_worker_becomes_interrupted(self):
        job_id = 'a'*32
        h.write_json(h.STATE / (job_id+'.json'), {'job_id': job_id, 'state': 'running', 'created': time.time()-100})
        with patch.object(h, 'run', return_value=subprocess.CompletedProcess([], 0, 'inactive')):
            self.assertEqual(h.dispatch({'op': 'job', 'job_id': job_id})['state'], 'interrupted')

    def test_live_worker_is_not_misreported_interrupted(self):
        job_id = 'a'*32
        h.write_json(h.STATE / (job_id+'.json'), {'job_id': job_id, 'state': 'running', 'created': time.time()-100})
        with patch.object(h, 'run', return_value=subprocess.CompletedProcess([], 0, 'active')):
            self.assertEqual(h.dispatch({'op': 'job', 'job_id': job_id})['state'], 'running')

    def test_upgrade_uses_exact_pin_and_preserves_settings(self):
        job_id = 'a'*32
        h.write_json(h.STATE / (job_id+'.json'), {'job_id': job_id, 'state': 'queued', 'created': time.time(),
                     'request': {'op': 'upgrade', 'request_id': job_id, 'release': RELEASE}})
        with patch.object(h, 'run', return_value=subprocess.CompletedProcess([], 0, '')) as run:
            h.worker(job_id)
        commands = [c.args[0] for c in run.call_args_list]
        installer = next(c for c in commands if c[0] == '/usr/bin/bash')
        self.assertEqual(installer[-3:], [RELEASE, '--skip-merchant', '--preserve-schedule'])
        self.assertEqual(h.read_job(job_id)['state'], 'succeeded')

    def test_failed_upgrade_is_not_reported_success(self):
        job_id = 'b'*32
        h.write_json(h.STATE / (job_id+'.json'), {'job_id': job_id, 'state': 'queued', 'created': time.time(),
                     'request': {'op': 'upgrade', 'request_id': job_id, 'release': RELEASE}})
        with patch.object(h, 'run', side_effect=RuntimeError('Command failed with exit code 3')):
            h.worker(job_id)
        self.assertEqual(h.read_job(job_id)['state'], 'failed')
        self.assertIn('exit code 3', (h.STATE / (job_id+'.log')).read_text())


if __name__ == '__main__': unittest.main()
