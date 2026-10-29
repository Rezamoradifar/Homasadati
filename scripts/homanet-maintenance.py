#!/usr/bin/env python3
"""Reversible public-page maintenance for homanets.com; run locally as root.

Does not stop the app/worker or edit application code, environment, or data.
API, admin, assets and certificate renewal routes remain available. This is a
page maintenance switch, NOT a transaction/API freeze. Nginx config is backed up,
validated and rolled back on installation/reload/probe failure.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

HOSTS = {"homanets.com", "www.homanets.com"}
STATE = Path("/var/lib/homanet-maintenance")
FLAG = STATE / "enabled"
SNIPPET = Path("/etc/nginx/snippets/homanet-maintenance.conf")
COMMAND = Path("/usr/local/sbin/homanet-maintenance")
MARKER = "HOMANET_MAINTENANCE_V1"
HTML = '''<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>هما نت | در حال به‌روزرسانی</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#142130;color:#eef3f8;font-family:Tahoma,Arial,sans-serif;text-align:center}.card{max-width:640px;padding:54px 28px;border:1px solid #ffffff24;border-radius:26px;background:#ffffff07}.brand{color:#d7bd85;font-size:22px;letter-spacing:2px}h1{font-size:clamp(25px,5vw,38px);line-height:1.7;margin:28px 0 16px}p{color:#c3cbd5;line-height:2.1;margin:0}.line{width:70px;height:3px;background:#d7bd85;margin:25px auto}small{display:block;margin-top:28px;color:#95a2b4}</style><main class="card"><div class="brand">هما نت</div><div class="line"></div><h1>در حال به‌روزرسانی هستیم</h1><p>برای بهترشدن خدمات، سایت موقتاً در دسترس نیست.<br>لطفاً کمی بعد دوباره مراجعه کنید.</p><small>از همراهی شما سپاسگزاریم.</small></main><!-- HOMANET_MAINTENANCE_V1 --></html>'''

def snippet_text() -> str:
    escaped = HTML.replace("\\", "\\\\").replace("'", "\\'").replace("$", "\\$")
    return f'''# Managed public-page maintenance; APIs and the worker stay online.
set $homanet_public_maintenance 0;
if (-f {FLAG}) {{ set $homanet_public_maintenance 1; }}
if ($uri ~ "^/(api(/|$)|admin(/|$)|_next(/|$)|assets(/|$)|\\.well-known(/|$))") {{ set $homanet_public_maintenance 0; }}
error_page 597 =503 @homanet_maintenance;
if ($homanet_public_maintenance = 1) {{ return 597; }}
location @homanet_maintenance {{
    recursive_error_pages off;
    default_type text/html;
    charset utf-8;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header Retry-After "300" always;
    add_header X-Homanet-Maintenance "enabled" always;
    add_header X-Content-Type-Options "nosniff" always;
    return 503 '{escaped}';
}}
'''

def tokens(text: str):
    """Read Nginx tokens, ignoring comments and quoted structural characters."""
    i, n = 0, len(text)
    while i < n:
        if text[i].isspace(): i += 1; continue
        if text[i] == '#':
            j = text.find('\n', i); i = n if j < 0 else j + 1; continue
        start = i
        if text[i] in '{};':
            yield (text[i], i, i + 1, True); i += 1; continue
        value = ''
        while i < n and not text[i].isspace() and text[i] not in '{};#':
            ch = text[i]
            if ch in "\"'":
                quote = ch; i += 1
                while i < n and text[i] != quote:
                    if text[i] == '\\' and i + 1 < n:
                        value += text[i + 1]; i += 2
                    else: value += text[i]; i += 1
                if i == n: raise ValueError('Unterminated Nginx string')
                i += 1
            elif ch == '\\' and i + 1 < n:
                value += text[i + 1]; i += 2
            elif text.startswith('${', i):
                j = text.find('}', i + 2)
                if j < 0: raise ValueError('Unterminated Nginx variable')
                value += text[i:j + 1]; i = j + 1
            else: value += ch; i += 1
        if i == start: raise ValueError('Unsupported Nginx token')
        yield (value, start, i, False)

def patch_config(text: str) -> tuple[str, int]:
    stack, pending, servers = [], [], []
    for value, start, end, symbol in tokens(text):
        if not symbol: pending.append(value); continue
        if value == '{':
            block = {'kind': pending[0] if pending else '', 'open': end,
                     'names': [], 'includes': [], 'error597': False, 'name_count': 0,
                     'named_collision': False, 'server': None}
            parent = next((x for x in reversed(stack) if x['kind'] == 'server'), None)
            if block['kind'] == 'location' and '@homanet_maintenance' in pending and parent:
                parent['named_collision'] = True
            if block['kind'] == 'server':
                block['server'] = block; servers.append(block)
            else: block['server'] = parent
            stack.append(block); pending = []
        elif value == ';':
            if stack and pending:
                block = stack[-1]; server = block['server']
                if block['kind'] == 'server' and pending[0] == 'server_name':
                    block['names'] += pending[1:]; block['name_count'] += 1
                if block['kind'] == 'server' and pending[0] == 'include':
                    block['includes'] += pending[1:]
                if server and pending[0] == 'error_page' and '597' in pending[1:]:
                    server['error597'] = True
            pending = []
        else:
            if not stack or pending: raise ValueError('Unrecognized Nginx block structure')
            stack.pop()
    if stack or pending: raise ValueError('Incomplete Nginx configuration')
    inserts, count = [], 0
    for server in servers:
        names = set(server['names'])
        if not names.intersection(HOSTS): continue
        if names - HOSTS or server['name_count'] != 1:
            raise ValueError('Homa shares a virtual host with other names; manual review required')
        count += 1
        if str(SNIPPET) in server['includes']: continue
        if server['error597'] or server['named_collision']:
            raise ValueError('Existing maintenance/error-page handler; manual review required')
        inserts.append(server['open'])
    for offset in sorted(inserts, reverse=True):
        text = text[:offset] + '\n    include ' + str(SNIPPET) + ';\n' + text[offset:]
    return text, count

def run(args: list[str], *, check: bool = True):
    result = subprocess.run(args, capture_output=True, text=True, timeout=40)
    if check and result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args[:2]) + '; inspect it locally')
    return result

def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def snapshot(path: Path):
    if path.is_symlink(): raise ValueError('Refusing symlink: ' + str(path))
    if not path.exists(): return None
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Unsafe ownership or permissions: ' + str(path))
    return path.read_bytes(), stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid

def write(path: Path, content: bytes, mode=0o644, uid=0, gid=0):
    if path.is_symlink(): raise ValueError('Refusing symlink: ' + str(path))
    fd, temporary = tempfile.mkstemp(prefix='.homanet-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as file:
            os.fchmod(file.fileno(), mode); os.fchown(file.fileno(), uid, gid)
            file.write(content); file.flush(); os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def probe() -> bool:
    result = run(['curl', '--silent', '--show-error', '--noproxy', '*',
                  '--max-time', '10', '--resolve', 'homanets.com:443:127.0.0.1',
                  'https://homanets.com/', '--write-out', '\n%{http_code}'], check=False)
    return result.returncode == 0 and result.stdout.endswith('\n503') and MARKER in result.stdout

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['on', 'off', 'status', 'check'])
    args = parser.parse_args()
    if os.geteuid() != 0: raise ValueError('Run as root with sudo')
    if not Path('/opt/homay/app').is_dir(): raise ValueError('This is not the Homa app server')
    for name in ['nginx', 'systemctl', 'curl']:
        if not shutil.which(name): raise ValueError('Required command missing: ' + name)
    if STATE.is_symlink(): raise ValueError('Unsafe state directory')
    STATE.mkdir(mode=0o755, parents=True, exist_ok=True)
    info = STATE.stat()
    if info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Unsafe state directory ownership')
    lock = os.open(STATE / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock, 'w') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy_fd = os.open('/opt/homay/deploy-zibal.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        fcntl.flock(deploy_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(['nginx', '-t']); run(['systemctl', 'is-active', '--quiet', 'nginx'])
        if args.action == 'status':
            print('FLAG=' + ('ON' if FLAG.exists() else 'OFF'))
            print('PUBLIC_PAGE=' + ('MAINTENANCE' if probe() else 'NOT_CONFIRMED'))
            return
        if args.action == 'off':
            old = snapshot(FLAG)
            if old is not None:
                FLAG.unlink()
                try: run(['systemctl', 'reload', 'nginx'])
                except Exception:
                    write(FLAG, *old); raise
            print('HOMANET_MAINTENANCE_OFF')
            return
        dump = run(['nginx', '-T'])
        if 'conflicting server name' in dump.stderr.lower():
            raise ValueError('Conflicting Nginx hosts; resolve them before maintenance')
        files = {}
        for name in re.findall(r'^# configuration file (.+):$', dump.stdout, re.M):
            path = Path(name).resolve()
            if not path.is_relative_to('/etc/nginx') or path in files or path == SNIPPET: continue
            original = snapshot(path)
            if original is None: continue
            proposed, hosts = patch_config(original[0].decode('utf-8'))
            if hosts: files[path] = (original, proposed.encode('utf-8'))
        if not files: raise ValueError('No supported Homa virtual host found; nothing changed')
        if args.action == 'check':
            print('HOMANET_MAINTENANCE_PREFLIGHT_OK; matched_files=' + str(len(files)))
            return
        if not SNIPPET.parent.is_dir() or SNIPPET.parent.is_symlink():
            raise ValueError('Nginx snippets directory is unavailable; nothing changed')
        prior_snippet = snapshot(SNIPPET)
        desired_snippet = snippet_text().encode('utf-8')
        if prior_snippet is not None and prior_snippet[0] != desired_snippet:
            raise ValueError('A different maintenance snippet exists; refusing overwrite')
        changes = {p: (old, new) for p, (old, new) in files.items() if old[0] != new}
        originals = {p: old for p, (old, _) in changes.items()}
        originals[SNIPPET] = prior_snippet
        originals[FLAG] = snapshot(FLAG)
        originals[COMMAND] = snapshot(COMMAND)
        if originals[COMMAND] is not None and b'HOMANET_MAINTENANCE_V1' not in originals[COMMAND][0]:
            raise ValueError('A different helper exists; refusing overwrite')
        backup = Path(tempfile.mkdtemp(prefix='backup-', dir=STATE))
        manifest = {}
        for index, (path, old) in enumerate(originals.items()):
            if old is not None:
                write(backup / str(index), old[0], 0o600)
                manifest[str(path)] = {'file': str(index), 'sha256': digest(old[0]),
                                       'mode': old[1], 'uid': old[2], 'gid': old[3]}
            else: manifest[str(path)] = None
        write(backup / 'manifest.json', json.dumps(manifest, indent=2).encode(), 0o600)
        touched, reloaded = [], False
        try:
            for path, (old, new) in changes.items():
                if snapshot(path) != old: raise RuntimeError('Configuration changed concurrently')
                touched.append(path); write(path, new, old[1], old[2], old[3])
            touched.append(SNIPPET); write(SNIPPET, desired_snippet)
            run(['nginx', '-t'])
            touched.append(FLAG); write(FLAG, b'enabled\n')
            reloaded = True; run(['systemctl', 'reload', 'nginx'])
            for _ in range(5):
                if probe(): break
                time.sleep(1)
            else: raise RuntimeError('Maintenance page not confirmed at the HTTPS origin')
            if Path(__file__).resolve() != COMMAND:
                touched.append(COMMAND); write(COMMAND, Path(__file__).read_bytes(), 0o700)
        except Exception:
            for path in reversed(list(dict.fromkeys(touched))):
                old = originals[path]
                if old is None: path.unlink(missing_ok=True)
                else: write(path, *old)
            run(['nginx', '-t'])
            if reloaded: run(['systemctl', 'reload', 'nginx'])
            print('HOMANET_MAINTENANCE_ROLLED_BACK; backup=' + str(backup), file=sys.stderr)
            raise
        print('HOMANET_MAINTENANCE_ON')
        print('ORIGIN_HTTP=503; PAGE_MARKER=VERIFIED')
        print('BACKUP=' + str(backup))
        print('ROLLBACK_COMMAND=sudo python3 /usr/local/sbin/homanet-maintenance off')
        print('API_ADMIN_WORKER=UNCHANGED')

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('HOMANET_MAINTENANCE_STOPPED: ' + str(error), file=sys.stderr)
        sys.exit(1)
