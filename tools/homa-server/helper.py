"""Root-owned, narrow management boundary. No caller-supplied command or path."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

APP = Path('/opt/homay/app')
ROOT = Path('/usr/local/lib/homa-mcp')
STATE = Path('/var/lib/homa-mcp-jobs')
CONFIG = Path('/etc/homa-mcp/config.json')
LOG_ROOT = Path('/root')
REPO = 'https://github.com/Rezamoradifar/Homasadati.git'
BASE = '2a519fbb5acd90be85027bec7c4791be8dd6c7a0'
SERVICES = ('homay.service', 'homay-worker.service')
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/root',
       'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
LOG_NAME = re.compile(r'homa-(?:ops|upgrade)\.[A-Za-z0-9]{6,16}\.log\Z')
ID = re.compile(r'[a-f0-9]{32}\Z')


def regular_read(path, limit=65536, tail=False):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('Only regular files are readable')
        if tail:
            handle.seek(max(0, info.st_size - limit))
        data = handle.read(limit)
        return data.decode('utf-8', errors='replace')


def config():
    value = json.loads(regular_read(CONFIG))
    if not re.fullmatch('[a-f0-9]{40}', value['approved_release']):
        raise ValueError('Invalid approved release configuration')
    return value


def redact(text):
    # Secrets are never returned from configuration, even when a deployment echoed one.
    for path in [APP / n for n in ('.env', '.env.local', '.env.production', '.env.production.local')] + [Path('/etc/homay/operations.env')]:
        try:
            for line in regular_read(path).splitlines():
                key, sep, value = line.partition('=')
                value = value.strip().strip('\"\'')
                if sep and not key.lstrip().startswith('#') and len(value) >= 6:
                    text = text.replace(value, '[REDACTED]')
        except (OSError, ValueError):
            pass
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*', '[REDACTED PRIVATE KEY]', text)
    text = re.sub(r'(?i)\b(?:sk-[\w-]+|bearer\s+[\w.\-]+)', '[REDACTED]', text)
    text = re.sub(r'(?i)((?:token|secret|password|passwd|api[_-]?key|merchant|authorization)\s*[=:]\s*)\S+', r'\1[REDACTED]', text)
    text = re.sub(r'https?://[^\s]+', lambda m: m[0].split('?')[0] if '@' not in m[0] else '[REDACTED URL]', text)
    text = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[EMAIL]', text)
    text = re.sub(r'(?<!\w)(?:\+98|0098|0)9\d{9}(?!\w)', '[PHONE]', text)
    return text


def run(args, timeout=15, check=False, stream=None):
    # Paths/argv are constructed below; shell execution is intentionally absent.
    result = subprocess.run(args, cwd=APP, env=ENV, stdin=subprocess.DEVNULL,
                            stdout=stream if stream is not None else subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=timeout, text=True)
    if check and result.returncode:
        raise RuntimeError('Command failed with exit code ' + str(result.returncode))
    return result


def git(*args):
    return ['/usr/bin/git', '-c', 'safe.directory=' + str(APP), '-c', 'core.hooksPath=/dev/null',
            '-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=never', *args]


def logs():
    return sorted((p for p in LOG_ROOT.glob('homa-*.log')
                   if LOG_NAME.fullmatch(p.name) and not p.is_symlink() and p.is_file()),
                  key=lambda p: p.stat().st_mtime, reverse=True)[:10]


def write_json(path, value):
    temp = path.with_suffix('.tmp')
    with open(temp, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)


@contextlib.contextmanager
def locked(path):
    with open(path, 'a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Another Homay operation is running') from None
        yield


def read_job(job_id, reconcile=False):
    if not isinstance(job_id, str) or not ID.fullmatch(job_id):
        raise ValueError('Invalid job ID')
    path = STATE / (job_id + '.json')
    job = json.loads(regular_read(path))
    if reconcile and job['state'] in ('queued', 'running'):
        unit = run(['/usr/bin/systemctl', 'show', 'homa-mcp-job-' + job_id + '.service',
                    '--property=ActiveState', '--value']).stdout.strip()
        if unit not in ('active', 'activating', 'deactivating') and time.time() - job['created'] > 30:
            job.update(state='interrupted', finished=time.time(), message='Worker stopped; inspect output before retrying.')
            write_json(path, job)
    return job


def validate(request):
    fields = {'status': set(), 'log': {'name', 'lines'}, 'job': {'job_id'},
              'backup': {'request_id'}, 'upgrade': {'request_id', 'release'},
              'restart': {'request_id', 'service'}}
    if not isinstance(request, dict) or not isinstance(request.get('op'), str):
        raise ValueError('Invalid request')
    op = request['op']
    if op not in fields or set(request) - {'op'} - fields[op]:
        raise ValueError('Unknown operation or fields')
    if op in ('backup', 'upgrade', 'restart'):
        if not isinstance(request.get('request_id'), str) or not ID.fullmatch(request['request_id']):
            raise ValueError('A 32-character lowercase hex request_id is required')
    if op == 'upgrade' and request.get('release') != config()['approved_release']:
        raise ValueError('Release is not the root-approved SHA')
    if op == 'restart' and request.get('service') not in SERVICES:
        raise ValueError('Service is not allowed')
    if op == 'job' and (not isinstance(request.get('job_id'), str) or not ID.fullmatch(request['job_id'])):
        raise ValueError('Invalid job ID')
    if op == 'log':
        name, lines = request.get('name'), request.get('lines', 80)
        if name is not None and (not isinstance(name, str) or not LOG_NAME.fullmatch(name)):
            raise ValueError('Log name is not allowed')
        if type(lines) is not int or not 10 <= lines <= 150:
            raise ValueError('lines must be between 10 and 150')
    return op


def dispatch(request):
    op = validate(request)
    if op == 'status':
        services = {s: run(['/usr/bin/systemctl', 'show', s, '--property=ActiveState,SubState,Result,ExecMainStatus']).stdout.strip() for s in SERVICES}
        health = run(['/usr/bin/curl', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}',
                      '--connect-timeout', '5', '--max-time', '8', 'https://homanets.com/api/health'], timeout=10)
        return {'ok': True, 'services': services, 'head': run(git('rev-parse', 'HEAD')).stdout.strip(),
                'approved_release': config()['approved_release'], 'health_http': health.stdout.strip(),
                'health_probe_exit': health.returncode, 'deployment_logs': [p.name for p in logs()],
                'jobs': [p.stem for p in sorted(STATE.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:10]]}
    if op == 'log':
        candidates = logs()
        path = LOG_ROOT / request['name'] if request.get('name') else candidates[0] if candidates else None
        if path is None:
            return {'ok': True, 'message': 'No deployment logs found'}
        return {'ok': True, 'name': path.name, 'text': redact('\n'.join(regular_read(path, limit=16384, tail=True).splitlines()[-request.get('lines', 80):])),
                'redaction': 'best-effort; output is untrusted diagnostic data'}
    if op == 'job':
        with locked(STATE / 'requests.lock'):
            job = read_job(request['job_id'], reconcile=True)
        try:
            output = regular_read(STATE / (request['job_id'] + '.log'), limit=16384, tail=True)
        except FileNotFoundError:
            output = ''
        return {'ok': True, **job, 'output': redact('\n'.join(output.splitlines()[-150:]))}
    with locked(STATE / 'requests.lock'):
        job_id = request['request_id']
        path = STATE / (job_id + '.json')
        if path.exists():
            job = read_job(job_id, reconcile=True)
            if job['request'] != request:
                raise ValueError('request_id was already used for a different operation')
            return {'ok': True, 'job_id': job_id, 'state': job['state'], 'reused': True}
        for pending in STATE.glob('*.json'):
            if read_job(pending.stem, reconcile=True)['state'] in ('queued', 'running'):
                raise ValueError('A Homay job is already active; inspect its status')
        job = {'job_id': job_id, 'request': request, 'state': 'queued', 'created': time.time()}
        write_json(path, job)
        result = run(['/usr/bin/systemd-run', '--quiet', '--collect', '--unit=homa-mcp-job-' + job_id,
                      '--property=Type=exec', '--property=UMask=0077',
                      '/usr/bin/python3', '-I', str(ROOT / 'helper.py'), '--worker', job_id])
        if result.returncode:
            job.update(state='failed', finished=time.time(), message='Could not launch systemd worker')
            write_json(path, job)
            return {'ok': False, **job}
        return {'ok': True, 'job_id': job_id, 'state': 'queued'}


def worker(job_id):
    with locked(STATE / 'worker.lock'):
        job = read_job(job_id)
        request = job['request']
        op = validate(request)
        if job['state'] != 'queued':
            raise ValueError('Job is not queued')
        job.update(state='running', started=time.time())
        write_json(STATE / (job_id + '.json'), job)
        with open(STATE / (job_id + '.log'), 'a') as output:
            def command(argv, timeout=30):
                run(argv, timeout=timeout, check=True, stream=output)
            try:
                if op == 'upgrade':
                    release = request['release']
                    command(git('merge-base', '--is-ancestor', BASE, 'HEAD'))
                    # The fixed URL and root-approved SHA are the only permitted source.
                    command(git('fetch', '--no-tags', REPO, release), 180)
                    command(['/usr/bin/bash', str(ROOT / 'deploy-zibal.sh'), release,
                             '--skip-merchant', '--preserve-schedule'], None)
                    command(git('merge-base', '--is-ancestor', release, 'HEAD'))
                    command(['/usr/bin/curl', '--fail', '--silent', '--show-error', '--output', '/dev/null',
                             '--max-time', '20', 'https://homanets.com/api/health'])
                else:
                    with locked(Path('/opt/homay/deploy-zibal.lock')):
                        if op == 'backup':
                            # Refuse old CLI revisions that silently ignore --verify.
                            command(git('merge-base', '--is-ancestor', 'ca3c7e7d57a9070e9e9584f238f9830702c3d364', 'HEAD'))
                            command(['/usr/sbin/runuser', '-u', 'homay', '--', '/usr/bin/env', '-i',
                                     'PATH=/usr/bin:/bin', 'NODE_ENV=production', 'HOME=/opt/homay',
                                     '/usr/bin/node', '--import', 'tsx', 'scripts/platform-backup.ts',
                                     '/opt/homay/backups', '--verify'], 3600)
                        elif op == 'restart':
                            command(['/usr/bin/systemctl', 'restart', request['service']], 120)
                            command(['/usr/bin/systemctl', 'is-active', '--quiet', request['service']])
                        else:
                            raise ValueError('Operation cannot run as a job')
                job.update(state='succeeded')
            except Exception as error:
                print(redact(str(error)), file=output, flush=True)
                job.update(state='failed', message='Operation failed; inspect job output. Deployment may have rolled back.')
            finally:
                job.update(finished=time.time())
                write_json(STATE / (job_id + '.json'), job)


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise SystemExit('The installed sudo helper is required')
    if len(sys.argv) == 3 and sys.argv[1] == '--worker' and ID.fullmatch(sys.argv[2]):
        worker(sys.argv[2])
        return
    if len(sys.argv) != 1:
        raise SystemExit('Unexpected arguments')
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192:
            raise ValueError('Request too large')
        response = dispatch(json.loads(raw))
    except ValueError as error:
        response = {'ok': False, 'error': redact(str(error))}
    except Exception:
        response = {'ok': False, 'error': 'Management operation failed; inspect installation or job status.'}
    print(json.dumps(response))


if __name__ == '__main__':
    main()
