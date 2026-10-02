#!/usr/bin/env python3
"""Configure the existing Homay VPS without deploying or sending a test SMS.

Run as root in a real SSH terminal. Credentials travel only through the terminal,
private subprocess pipes, and the fixed Kavenegar HTTPS API. No app modules are
imported: opening the existing SQLite database must never run schema migrations.
"""

import getpass
import json
import os
from pathlib import Path
import pwd
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
import warnings

APP = Path('/opt/homay/app')
HOST = 'vps-astra-1758'
ORIGIN = 'https://homanets.com'
TEMPLATE = 'HomanetsOTP'
UNITS = ('homay.service', 'homay-worker.service')
ENV_FILES = ('.env.production.local', '.env.local', '.env.production', '.env')


class SetupError(Exception):
    pass


NODE = r'''
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const safe = code => { const e = new Error(); e.safeCode = code; throw e; };
let db, committed = false;
try {
  const arg = JSON.parse(fs.readFileSync(0, 'utf8'));
  require('@next/env').loadEnvConfig(process.cwd(), false,
    {info() {}, error() {}}, true);
  const master = process.env.PLATFORM_MASTER_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(master)) safe('master_key_missing');
  if (process.env.APP_ORIGIN !== 'https://homanets.com') safe('origin_mismatch');
  const file = fs.realpathSync(path.resolve(process.env.DATABASE_PATH || './data/homay.sqlite'));
  const stat = fs.statSync(file, {bigint: true});
  if (!stat.isFile()) safe('database_missing');
  const context = {file, master, dev: String(stat.dev), ino: String(stat.ino)};
  if (arg.op === 'context') {
    process.stdout.write(JSON.stringify({context}));
  } else {
    if (!arg.expected || JSON.stringify(context) !== JSON.stringify(arg.expected))
      safe('context_changed');
    const Database = require('better-sqlite3');
    db = new Database(file, {fileMustExist: true, readonly: arg.op === 'inspect', timeout: 5000});
    function databaseIdentity() {
      const current = fs.statSync(file, {bigint: true});
      if (String(current.dev) !== context.dev || String(current.ino) !== context.ino)
        safe('database_changed');
      const ownsFile = fs.readdirSync('/proc/self/fd').some(fd => {
        try {
          const opened = fs.statSync('/proc/self/fd/' + fd, {bigint: true});
          return String(opened.dev) === context.dev && String(opened.ino) === context.ino;
        } catch { return false; }
      });
      if (!ownsFile) safe('database_changed');
    }
    databaseIdentity();
    const columns = db.pragma('table_info(p_settings)');
    if (columns.length !== 4 || columns.map(c => c.name).join(',') !== 'key,value,secret,updated_at'
      || columns[0].pk !== 1) safe('settings_schema_mismatch');
    const names = ['kavenegar_key', 'sms_template', 'sms_sender'];
    const rows = () => names.map(key => db.prepare(
      'SELECT key,value,secret,updated_at FROM p_settings WHERE key=?').get(key) || null);
    function decrypt(value) {
      const parts = value.split('.');
      if (parts.length !== 3 || !/^[a-f0-9]{24}$/i.test(parts[0])
        || !/^(?:[a-f0-9]{2})*$/i.test(parts[1]) || !/^[a-f0-9]{32}$/i.test(parts[2]))
        safe('encrypted_value_invalid');
      const c = crypto.createDecipheriv('aes-256-gcm', Buffer.from(master, 'hex'), Buffer.from(parts[0], 'hex'));
      c.setAuthTag(Buffer.from(parts[2], 'hex'));
      try { return c.update(parts[1], 'hex', 'utf8') + c.final('utf8'); }
      catch { safe('master_key_mismatch'); }
    }
    function encrypt(value) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(master, 'hex'), iv);
      return [iv.toString('hex'), c.update(value, 'utf8', 'hex') + c.final('hex'),
        c.getAuthTag().toString('hex')].join('.');
    }
    // Read known ciphertext only; never select or return account identity data.
    for (const row of db.prepare('SELECT value FROM p_settings WHERE secret=1').all()) decrypt(row.value);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='p_users'").get()) {
      const cols = db.pragma('table_info(p_users)').map(c => c.name);
      if (cols.includes('otp_secret')) {
        const row = db.prepare("SELECT otp_secret FROM p_users WHERE otp_secret IS NOT NULL AND otp_secret<>'' LIMIT 1").get();
        if (row) decrypt(row.otp_secret);
      }
    }
    const current = rows();
    if (current[0] && current[0].secret !== 1) safe('existing_key_not_encrypted');
    if (arg.op === 'inspect') {
      const sender = current[2] ? (current[2].secret ? decrypt(current[2].value) : current[2].value) : '';
      process.stdout.write(JSON.stringify({snapshot: current, notificationsConfigured: Boolean(sender)}));
    } else if (arg.op === 'save') {
      if (!/^[a-f0-9]{32,256}$/i.test(arg.key || '') || arg.template !== 'HomanetsOTP') safe('invalid_input');
      db.exec('BEGIN IMMEDIATE');
      try {
        databaseIdentity();
        if (JSON.stringify(rows()) !== JSON.stringify(arg.snapshot)) safe('settings_changed');
        const previous = rows();
        const already = previous[0] && decrypt(previous[0].value) === arg.key
          && previous[1] && previous[1].secret === 0 && previous[1].value === arg.template;
        if (!already) {
          const stamp = new Date().toISOString();
          const save = db.prepare('INSERT INTO p_settings(key,value,secret,updated_at) VALUES(?,?,?,?) '
            + 'ON CONFLICT(key) DO UPDATE SET value=excluded.value,secret=excluded.secret,updated_at=excluded.updated_at');
          save.run('kavenegar_key', encrypt(arg.key), 1, stamp);
          save.run('sms_template', arg.template, 0, stamp);
        }
        const result = rows();
        if (!result[0] || result[0].secret !== 1 || decrypt(result[0].value) !== arg.key
          || !result[1] || result[1].secret !== 0 || result[1].value !== arg.template
          || JSON.stringify(result[2]) !== JSON.stringify(previous[2])) safe('readback_failed');
        db.exec('COMMIT');
        committed = true;
        process.stdout.write(JSON.stringify({saved: true, already: Boolean(already)}));
      } catch (e) { if (!committed) db.exec('ROLLBACK'); throw e; }
    } else safe('invalid_operation');
  }
} catch (e) {
  process.stdout.write(JSON.stringify({error: committed ? 'save_outcome_uncertain' : (e.safeCode || 'local_check_failed')}));
  process.exitCode = 1;
} finally { if (db) { try { db.close(); } catch {} } }
'''


def run_checked(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=12)
    if result.returncode:
        raise SetupError('بررسی سرویس سرور انجام نشد؛ خروجی خطا را بدون کلید ارسال کنید.')
    return result.stdout


def process_info(pid):
    base = Path('/proc') / str(pid)
    raw = (base / 'stat').read_text()
    ticks = int(raw[raw.rfind(')') + 2:].split()[19])
    boot = next(int(line.split()[1]) for line in Path('/proc/stat').read_text().splitlines()
                if line.startswith('btime '))
    started = boot + ticks / os.sysconf('SC_CLK_TCK')
    env = {}
    for item in (base / 'environ').read_bytes().split(b'\0'):
        if b'=' in item:
            key, value = item.split(b'=', 1)
            env[os.fsdecode(key)] = os.fsdecode(value)
    return {'pid': pid, 'ticks': ticks, 'started': started, 'env': env,
            'cwd': str((base / 'cwd').resolve(strict=True)),
            'exe': str((base / 'exe').resolve(strict=True)), 'uid': base.stat().st_uid}


def env_fingerprint(started):
    result = []
    for name in ENV_FILES:
        file = APP / name
        if file.exists():
            stat = file.stat()
            link = file.lstat()
            if max(stat.st_mtime, stat.st_ctime, link.st_mtime, link.st_ctime) > started:
                raise SetupError('فایل تنظیمات بعد از شروع سرویس تغییر کرده است؛ ابتدا وضعیت سرویس باید بررسی شود.')
            result.append((name, stat.st_dev, stat.st_ino, stat.st_mtime_ns,
                           stat.st_ctime_ns, stat.st_size, link.st_ino, link.st_ctime_ns))
        else:
            result.append((name, None))
    return result


def bridge(account, process, request):
    env = dict(process['env'])
    if env.get('NODE_ENV') not in (None, '', 'production'):
        raise SetupError('محیط سرویس production نیست؛ تنظیمی ذخیره نشد.')
    env['NODE_ENV'] = 'production'
    uncertain = 'نتیجه ثبت تنظیمات مشخص نشد؛ همین دستور را دوباره اجرا کنید. اجرای تکراری امن است.'
    try:
        result = subprocess.run([process['exe'], '-e', NODE], cwd=APP, env=env,
                                input=json.dumps(request), capture_output=True, text=True,
                                timeout=20, user=account.pw_uid, group=account.pw_gid,
                                extra_groups=[], umask=0o077)
    except (subprocess.TimeoutExpired, OSError):
        raise SetupError(uncertain if request.get('op') == 'save' else 'بررسی محلی سرور کامل نشد.') from None
    try:
        value = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise SetupError(uncertain if request.get('op') == 'save' else 'بررسی محلی تنظیمات ناموفق بود؛ جزئیات خصوصی نمایش داده نشد.') from None
    if result.returncode or not isinstance(value, dict) or value.get('error'):
        code = value.get('error', 'local_check_failed') if isinstance(value, dict) else 'local_check_failed'
        if not re.fullmatch(r'[a-z_]{1,50}', str(code)):
            code = 'local_check_failed'
        if request.get('op') == 'save' and (code in ('local_check_failed', 'save_outcome_uncertain') or value.get('saved')):
            raise SetupError(uncertain)
        raise SetupError('تنظیمات ذخیره نشد. کد بررسی محلی: ' + code)
    return value


def has_database_fd(pid, context):
    for fd in (Path('/proc') / str(pid) / 'fd').iterdir():
        try:
            stat = fd.stat()
            if (str(stat.st_dev), str(stat.st_ino)) == (context['dev'], context['ino']):
                return True
        except (OSError, FileNotFoundError):
            continue
    return False


def service_context(unit, account):
    raw = run_checked(['systemctl', 'show', unit, '-p', 'ActiveState', '-p', 'MainPID', '-p', 'ControlGroup'])
    props = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
    if props.get('ActiveState') != 'active' or not re.fullmatch(r'[1-9][0-9]*', props.get('MainPID', '')):
        raise SetupError('سرویس ' + unit + ' فعال نیست؛ تنظیمی ذخیره نشد.')
    main = process_info(int(props['MainPID']))
    fingerprints = env_fingerprint(main['started'])
    group = props.get('ControlGroup', '')
    if not group.startswith('/') or '..' in Path(group).parts:
        raise SetupError('مسیر سرویس قابل تأیید نیست؛ تنظیمی ذخیره نشد.')
    cgroup = Path('/sys/fs/cgroup') / group.lstrip('/')
    if not (cgroup / 'cgroup.procs').is_file():
        raise SetupError('ساختار systemd این سرور نیاز به بررسی دارد؛ تنظیمی ذخیره نشد.')
    pids = set()
    for file in [cgroup / 'cgroup.procs', *cgroup.glob('**/cgroup.procs')]:
        pids.update(int(x) for x in file.read_text().split() if x.isdigit())
    matches = []
    for pid in sorted(pids):
        try:
            process = process_info(pid)
            if process['uid'] != account.pw_uid or Path(process['cwd']) != APP.resolve():
                continue
            if Path(process['exe']).name not in ('node', 'nodejs'):
                continue
            # Node processes that own the database prove which DB is actually live.
            context = bridge(account, process, {'op': 'context'})['context']
            if has_database_fd(pid, context):
                matches.append((process, context))
        except (OSError, ProcessLookupError):
            continue
    if not matches:
        raise SetupError('دیتابیس بازِ سرویس ' + unit + ' پیدا نشد؛ صفحه سایت را باز کنید و دوباره اجرا کنید.')
    if any(item[1] != matches[0][1] for item in matches):
        raise SetupError('پردازش‌های سرویس تنظیمات یکسان ندارند؛ تنظیمی ذخیره نشد.')
    process, context = matches[0]
    return {'unit': unit, 'main_pid': main['pid'], 'main_ticks': main['ticks'],
            'started': main['started'], 'files': fingerprints, 'process': process, 'context': context}


def verify_contexts(contexts):
    if contexts[0]['context'] != contexts[1]['context']:
        raise SetupError('تنظیمات دیتابیس یا رمزگذاری وب‌سایت و worker یکسان نیست؛ تنظیمی ذخیره نشد.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def approved_template(key):
    if not re.fullmatch(r'[a-fA-F0-9]{32,256}', key):
        raise SetupError('شکل کلید API درست نیست؛ خود کلید را کامل وارد کنید.')
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect(),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    for page in range(1, 11):
        url = 'https://api.kavenegar.com/v1/' + key + '/verify/templatelist.json?page=' + str(page)
        try:
            with opener.open(urllib.request.Request(url, headers={'Accept': 'application/json'}), timeout=15) as response:
                raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError()
            value = json.loads(raw)
        except urllib.error.HTTPError as error:
            raise SetupError('کاوه‌نگار درخواست را نپذیرفت. کد HTTP: ' + str(error.code)) from None
        except (OSError, ValueError, urllib.error.URLError):
            raise SetupError('ارتباط با کاوه‌نگار ناموفق بود؛ کلید و آدرس خصوصی نمایش داده نشد.') from None
        if not isinstance(value, dict) or not isinstance(value.get('return'), dict):
            raise SetupError('پاسخ کاوه‌نگار قابل تأیید نبود؛ تنظیمی ذخیره نشد.')
        status = value['return'].get('status')
        if status != 200:
            code = str(status) if isinstance(status, int) else 'unknown'
            raise SetupError('کاوه‌نگار درخواست را نپذیرفت. کد: ' + code)
        entries = value.get('entries')
        if not isinstance(entries, list):
            raise SetupError('فهرست الگوهای کاوه‌نگار قابل تأیید نبود.')
        selected = [row for row in entries if isinstance(row, dict) and row.get('name') == TEMPLATE]
        if len(selected) > 1:
            raise SetupError('نام الگو تکراری است؛ تنظیمی ذخیره نشد.')
        if selected:
            row = {str(k).lower(): v for k, v in selected[0].items()}
            state = row.get('approvalstatus')
            if state == 'PendingReview':
                raise SetupError('الگوی HomanetsOTP هنوز منتظر تأیید کاوه‌نگار است (PendingReview). پس از تأیید همین دستور را دوباره اجرا کنید.')
            if state != 'Approved':
                raise SetupError('الگوی HomanetsOTP تأیید نشده است؛ وضعیت را در پنل کاوه‌نگار بررسی کنید.')
            message = row.get('smsmessage')
            if row.get('sendpriority') != 'SMS' or not isinstance(message, str) or set(re.findall(r'%[A-Za-z][A-Za-z0-9]*', message)) != {'%token'}:
                raise SetupError('الگو باید پیامکی باشد و تنها پارامتر آن %token باشد؛ تنظیمی ذخیره نشد.')
            return
        # The endpoint serves 200 entries per page. Empty/short pages end the list.
        if len(entries) < 200:
            break
    raise SetupError('الگوی HomanetsOTP در این حساب پیدا نشد؛ تنظیمی ذخیره نشد.')


def main():
    if sys.version_info < (3, 9):
        raise SetupError('این ابزار به Python 3.9 یا جدیدتر نیاز دارد.')
    if len(sys.argv) != 1:
        raise SetupError('کلید را در آرگومان دستور نگذارید؛ ابزار آن را هنگام اجرا می‌پرسد.')
    if os.geteuid() != 0:
        raise SetupError('این دستور را با root یا sudo روی سرور هما اجرا کنید.')
    if socket.gethostname().split('.')[0] != HOST or not (APP / 'package.json').is_file():
        raise SetupError('این سرور هما نیست؛ دستور را روی vps-astra-1758 اجرا کنید.')
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise SetupError('این ابزار باید در ترمینال تعاملی SSH اجرا شود.')
    try:
        with open('/dev/tty', 'r+'):
            pass
    except OSError:
        raise SetupError('ترمینال خصوصی برای دریافت کلید در دسترس نیست.') from None
    os.umask(0o077)
    account = pwd.getpwnam('homay')
    print('در حال بررسی سرویس و دیتابیس فعلی هما…', flush=True)
    contexts = [service_context(unit, account) for unit in UNITS]
    verify_contexts(contexts)
    live = contexts[0]
    inspection = bridge(account, live['process'], {'op': 'inspect', 'expected': live['context']})
    if inspection['notificationsConfigured']:
        print('شماره فرستنده اعلان از قبل تنظیم شده است؛ ذخیره کلید، ارسال عادی اعلان‌های موجود را هم فعال می‌کند.')
    print('کلید را اینجا بچسبانید؛ هنگام تایپ چیزی نمایش داده نمی‌شود. سپس Enter بزنید.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        key = getpass.getpass('Kavenegar API key: ').strip()
    print('در حال بررسی الگوی HomanetsOTP در کاوه‌نگار؛ پیامک آزمایشی ارسال نمی‌شود…', flush=True)
    approved_template(key)
    # Reconstruct again after human input/network delay. Reject service or env drift.
    current = [service_context(unit, account) for unit in UNITS]
    verify_contexts(current)
    for before, after in zip(contexts, current):
        if (before['main_pid'], before['main_ticks'], before['files'], before['context'],
                before['process']['pid'], before['process']['ticks']) != (
                after['main_pid'], after['main_ticks'], after['files'], after['context'],
                after['process']['pid'], after['process']['ticks']):
            raise SetupError('وضعیت سرویس هنگام اجرا تغییر کرد؛ همین دستور را دوباره اجرا کنید.')
    result = bridge(account, current[0]['process'], {'op': 'save', 'expected': live['context'],
                    'snapshot': inspection['snapshot'], 'key': key, 'template': TEMPLATE})
    del key
    if result.get('saved') is not True:
        raise SetupError('ثبت تنظیمات تأیید نشد؛ برای بررسی خروجی را ارسال کنید.')
    print('KAVENEGAR_CONFIG_SAVED')
    print('کلید به‌صورت رمزگذاری‌شده و نام الگو HomanetsOTP ذخیره و بازخوانی شدند.')
    print('راه‌اندازی مجدد یا نصب لازم نیست. تحویل پیامک هنوز با شماره آزمایشی بررسی نشده است.')


if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nاجرا متوقف شد؛ پیامک آزمایشی ارسال نشد.', file=sys.stderr)
        sys.exit(1)
    except SetupError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('STOP: بررسی سرور ناموفق بود؛ جزئیات خصوصی نمایش داده نشد.', file=sys.stderr)
        sys.exit(1)
