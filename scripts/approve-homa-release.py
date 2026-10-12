#!/usr/bin/env python3
"""Explicit root CLI approval; deliberately not exposed through the MCP bridge."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

SHA = re.compile(r"[a-f0-9]{40}\Z")


def private_read(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022:
            raise ValueError(f"Unsafe management file: {path}")
        data = handle.read(262145)
        if len(data) > 262144:
            raise ValueError("Management file is too large")
        return data


@contextlib.contextmanager
def locked(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def atomic_write(path, content, mode):
    fd, temporary = tempfile.mkstemp(prefix=".approval-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            os.fchmod(handle.fileno(), mode)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def approve(config_path, installer_path, state, deploy_lock, release, expected, installer):
    if not SHA.fullmatch(release) or not SHA.fullmatch(expected):
        raise ValueError("Both revisions must be full lowercase commit SHAs")
    subprocess.run(["bash", "-n"], input=installer, check=True)
    with locked(state / "requests.lock"), locked(state / "worker.lock"), locked(deploy_lock):
        for path in state.glob("*.json"):
            if re.fullmatch(r"[a-f0-9]{32}\.json", path.name):
                if json.loads(private_read(path)).get("state") in ("queued", "running"):
                    raise ValueError("A management job is pending; inspect its status first")
        original_config = private_read(config_path)
        config = json.loads(original_config)
        original_installer = private_read(installer_path)
        if config.get("approved_release") == release and original_installer == installer:
            print(f"Already approved: {release}")
            return
        if config.get("approved_release") != expected:
            raise ValueError("Approved release changed; inspect current status before approving")
        backup = Path(tempfile.mkdtemp(prefix="approval-backup-", dir=config_path.parent))
        atomic_write(backup / "config.json", original_config, 0o600)
        atomic_write(backup / "deploy-zibal.sh", original_installer, 0o600)
        config["approved_release"] = release
        # Install the reviewed deployer first. A failed config write restores it.
        atomic_write(installer_path, installer, 0o644)
        try:
            atomic_write(config_path, (json.dumps(config, indent=2) + "\n").encode(), 0o600)
        except BaseException:
            atomic_write(installer_path, original_installer, 0o644)
            raise
        print(f"Approved: {release}\nManagement backup: {backup}\nNo application deployment was started.")


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError("Run this approval command as root")
    if len(sys.argv) != 3 or not all(SHA.fullmatch(value) for value in sys.argv[1:]):
        raise ValueError("Usage: approve-homa-release.py NEW_SHA EXPECTED_APPROVED_SHA")
    release, expected = sys.argv[1:]
    git = ["git", "-c", "safe.directory=/opt/homay/app", "-C", "/opt/homay/app"]
    subprocess.run(git + ["merge-base", "--is-ancestor", expected, release], check=True)
    installer = subprocess.check_output(git + ["show", f"{release}:scripts/deploy-zibal.sh"])
    approve(Path("/etc/homa-mcp/config.json"), Path("/usr/local/lib/homa-mcp/deploy-zibal.sh"),
            Path("/var/lib/homa-mcp-jobs"), Path("/opt/homay/deploy-zibal.lock"),
            release, expected, installer)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not print config or subprocess arguments that might later contain secrets.
        print(f"Approval stopped: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
