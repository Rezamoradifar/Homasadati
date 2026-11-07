#!/usr/bin/env python3
"""Authenticate and privately save DigiPay API credentials without enabling checkout."""
import contextlib
import fcntl
import getpass
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import tempfile
import warnings

BEGIN = "# BEGIN HOMA DIGIPAY API"
END = "# END HOMA DIGIPAY API"
APP = Path("/opt/homay/app")
FIELDS = (
    ("DIGIPAY_CLIENT_ID", "Client ID"),
    ("DIGIPAY_CLIENT_SECRET", "Client secret"),
    ("DIGIPAY_USERNAME", "API username"),
    ("DIGIPAY_PASSWORD", "API password"),
)


class SetupError(Exception):
    pass


def dotenv_value(value):
    if not isinstance(value, str) or not value or len(value) > 4096 or not value.strip():
        raise SetupError("An input is empty or too long; nothing was saved.")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise SetupError("An input contains control characters; nothing was saved.")
    quote = next((q for q in ("'", "`", '"') if q not in value and
                  (q != '"' or ("\\n" not in value and "\\r" not in value))), None)
    if quote is None:
        raise SetupError("An input cannot be represented losslessly in this environment file; nothing was saved.")
    return quote + value.replace("$", "\\$") + quote


def render_config(original, values):
    if original.count(BEGIN) > 1 or original.count(END) > 1 or original.count(BEGIN) != original.count(END):
        raise SetupError("The existing DigiPay configuration block needs review; nothing was saved.")
    block = BEGIN + "\n" + "\n".join(f"{key}={dotenv_value(value)}" for key, value in values.items()) + "\n" + END
    if BEGIN in original:
        pattern = re.compile(r"(?m)^" + re.escape(BEGIN) + r"\r?\n[\s\S]*?^" + re.escape(END) + r"(?=\r?$)")
        result, count = pattern.subn(lambda _: block, original)
        if count != 1:
            raise SetupError("The existing DigiPay configuration block needs review; nothing was saved.")
        return result
    return original + ("\n" if original and not original.endswith("\n") else "") + block + "\n"


def child_env(overrides=None):
    env = os.environ.copy()
    env.pop("__NEXT_PROCESSED_ENV", None)
    for name in ("DIGIPAY_ENABLED", "DIGIPAY_ENVIRONMENT", *(key for key, _ in FIELDS)):
        env.pop(name, None)
    env["NODE_ENV"] = "production"
    env.update(overrides or {})
    return env


def roundtrip_config(app_dir, content, values):
    # Parse the actual final file in memory with Next's own dotenv implementation.
    # Its captured output is compared privately, never forwarded to the terminal.
    source = """
const fs = require('node:fs');
const nextEnv = require('@next/env');
const contents = fs.readFileSync(0, 'utf8');
const parsed = nextEnv.processEnv([{path: '.env.production.local', contents, env: {}}], process.cwd(), {info() {}, error() {}}, true)[1];
process.stdout.write(JSON.stringify(parsed));
"""
    try:
        result = subprocess.run(["node", "-e", source], cwd=app_dir, env=child_env(),
                                input=content, text=True, capture_output=True, timeout=15)
        parsed = json.loads(result.stdout)
        if result.returncode or any(parsed.get(key) != value for key, value in values.items()):
            raise ValueError()
    except (OSError, subprocess.TimeoutExpired, ValueError, TypeError, AttributeError):
        raise SetupError("Environment serialization check failed; nothing was saved.") from None


def run_diagnostic(app_dir, script, overrides=None):
    try:
        # The initial readiness check must see any real inherited service values;
        # only the serializer probe intentionally removes values from its process.
        env = os.environ.copy()
        env.pop("__NEXT_PROCESSED_ENV", None)
        env["NODE_ENV"] = "production"
        env.update(overrides or {})
        result = subprocess.run(["node", "--import", "tsx", "scripts/" + script], cwd=app_dir,
                                env=env, stdin=subprocess.DEVNULL,
                                text=True, capture_output=True, timeout=30)
        data = json.loads(result.stdout)
        if not isinstance(data, dict):
            raise ValueError()
        return result.returncode, data
    except (OSError, subprocess.TimeoutExpired, ValueError):
        raise SetupError("The private diagnostic could not finish; nothing was saved.") from None


def safe_auth_result(data):
    result = {"authenticated": data.get("authenticated") is True, "purchaseAttempted": False}
    if data.get("environment") in ("sandbox", "production"):
        result["environment"] = data["environment"]
    for key in ("httpStatus", "providerStatus", "expiresInSeconds"):
        if type(data.get(key)) is int:
            result[key] = data[key]
    errors = {"digipay_not_configured", "digipay_sandbox_forbidden", "digipay_timeout", "digipay_unavailable",
              "digipay_authentication_failed", "digipay_invalid_response", "diagnostic_failed"}
    if data.get("errorCode") in errors:
        result["errorCode"] = data["errorCode"]
    return result


def read_private_file(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o022:
            raise SetupError("The existing environment file has unsafe permissions; nothing was saved.")
        data = handle.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise SetupError("The existing environment file is too large; nothing was saved.")
        return data


@contextlib.contextmanager
def deployment_lock(app_dir):
    fd = os.open(app_dir.parent / "deploy-zibal.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SetupError("A deployment is running; wait for it to finish before configuring DigiPay.") from None
        yield


def save_config(app_dir, content, original_bytes, uid, gid):
    target = app_dir / ".env.production.local"
    if read_private_file(target) != original_bytes:
        raise SetupError("The environment file changed during setup; nothing was saved.")
    backup = Path(tempfile.mkdtemp(prefix="digipay-config-backup-", dir=app_dir.parent))
    if original_bytes is not None:
        descriptor = os.open(backup / ".env.production.local", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(original_bytes)
            handle.flush()
            os.fsync(handle.fileno())
    (backup / "state.json").write_text(json.dumps({"targetExisted": original_bytes is not None}) + "\n")
    os.chmod(backup / "state.json", 0o600)
    descriptor, temporary = tempfile.mkstemp(prefix=".digipay-config-", dir=app_dir)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            os.fchown(handle.fileno(), uid, gid)
            handle.write(content.encode("utf8"))
            handle.flush()
            os.fsync(handle.fileno())
        # Check again after preparing the backup and replacement.
        if read_private_file(target) != original_bytes:
            raise SetupError("The environment file changed during setup; nothing was saved.")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return backup


def main():
    os.umask(0o077)
    if len(sys.argv) != 1 or os.geteuid() != 0:
        raise SetupError("Run this setup as root, without arguments.")
    runtime = pwd.getpwnam("homay")
    with deployment_lock(APP):
        _, current = run_diagnostic(APP, "digipay-preflight.ts")
        if current.get("enabled") is not False:
            raise SetupError("New DigiPay checkout is already enabled or its status is unknown; review before rotating credentials.")
        target = APP / ".env.production.local"
        original_bytes = read_private_file(target)
        try:
            original = original_bytes.decode("utf8") if original_bytes is not None else ""
        except UnicodeDecodeError:
            raise SetupError("The environment file is not UTF-8; nothing was saved.") from None
        print("Enter the four production API values. Input is hidden; new checkout stays disabled.")
        warnings.simplefilter("error", getpass.GetPassWarning)
        values = {"DIGIPAY_ENVIRONMENT": "production", "DIGIPAY_ENABLED": "0"}
        for key, label in FIELDS:
            value = getpass.getpass(label + " (hidden): ")
            dotenv_value(value)
            if key == "DIGIPAY_CLIENT_ID" and ":" in value:
                raise SetupError("The Client ID is invalid; nothing was saved.")
            values[key] = value
        content = render_config(original, values)
        roundtrip_config(APP, content, values)
        code, auth = run_diagnostic(APP, "digipay-auth-check.ts", values)
        print(json.dumps(safe_auth_result(auth), indent=2))
        if code or auth.get("authenticated") is not True or auth.get("environment") != "production":
            raise SetupError("Authentication was not confirmed; nothing was saved.")
        backup = save_config(APP, content, original_bytes, runtime.pw_uid, runtime.pw_gid)
        print(f"API credentials saved privately. Private configuration backup: {backup}")
        print("DIGIPAY_API_SAVED=1\nDIGIPAY_ENABLED=0")
        print("Merchant basket settings and payment acceptance testing are still required before enabling checkout.")


if __name__ == "__main__":
    try:
        main()
    except SetupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (getpass.GetPassWarning, EOFError, KeyboardInterrupt):
        print("Input cancelled or no private terminal available; nothing was saved.", file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Never print raw provider output, credentials or unexpected exception details.
        print("Setup could not finish. No success is confirmed; inspect private configuration before retrying.", file=sys.stderr)
        sys.exit(1)
