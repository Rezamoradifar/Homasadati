#!/usr/bin/env python3
"""Enable the installed single-merchant DigiPay checkout after real readiness checks."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import time
import urllib.request

SPEC = importlib.util.spec_from_file_location("homa_digipay_setup", Path(__file__).with_name("configure-digipay.py"))
setup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(setup)
BEGIN = "# BEGIN HOMA DIGIPAY CHECKOUT"
END = "# END HOMA DIGIPAY CHECKOUT"
METHODS_URL = "https://homanets.com/api/platform/payment/methods"


def restart_services():
    try:
        result = subprocess.run(["systemctl", "restart", "homay.service", "homay-worker.service"],
                                stdin=subprocess.DEVNULL, capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        raise setup.SetupError("The application services could not restart.") from None
    if result.returncode:
        raise setup.SetupError("The application services could not restart.")


def check_services():
    try:
        result = subprocess.run(["systemctl", "is-active", "homay.service", "homay-worker.service"],
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
        return result.returncode == 0 and result.stdout.splitlines() == ["active", "active"]
    except (OSError, subprocess.TimeoutExpired):
        return False


def probe_site():
    try:
        request = urllib.request.Request(METHODS_URL, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.loads(response.read(8193))
            return response.status == 200 and response.geturl() == METHODS_URL and isinstance(data, dict) and data.get("digipay") is True
    except Exception:
        return False


def activate(app_dir, uid, gid):
    _, current = setup.run_diagnostic(app_dir, "digipay-preflight.ts")
    if current.get("environment") != "production":
        raise setup.SetupError("Production API configuration is incomplete; checkout was not enabled.")
    overrides = {"DIGIPAY_ENABLED": "1"}
    code, auth = setup.run_diagnostic(app_dir, "digipay-auth-check.ts", overrides)
    print(json.dumps(setup.safe_auth_result(auth), indent=2))
    if code or auth.get("authenticated") is not True or auth.get("environment") != "production":
        raise setup.SetupError("Production authentication was not confirmed; checkout was not enabled.")
    code, candidate = setup.run_diagnostic(app_dir, "digipay-preflight.ts", overrides)
    if code or candidate.get("readyForCheckout") is not True:
        raise setup.SetupError("The installed checkout is not ready; no configuration was changed.")
    if current.get("readyForCheckout") is True and check_services() and probe_site():
        return {"enabled": True, "alreadyEnabled": True, "paymentAttempted": False}

    target = app_dir / ".env.production.local"
    original_bytes = setup.read_private_file(target)
    try:
        original = original_bytes.decode("utf8") if original_bytes is not None else ""
    except UnicodeDecodeError:
        raise setup.SetupError("The environment file is not UTF-8; checkout was not enabled.") from None
    content = setup.render_config(original, overrides, begin=BEGIN, end=END)
    setup.roundtrip_config(app_dir, content, overrides)
    backup = setup.save_config(app_dir, content, original_bytes, uid, gid)
    print(f"Private activation backup: {backup}")
    try:
        restart_services()
        for attempt in range(3):
            if check_services() and probe_site():
                if attempt < 2:
                    time.sleep(2)
                    continue
                return {"enabled": True, "sitePaymentMethodVisible": True, "paymentAttempted": False}
            if attempt < 2:
                time.sleep(2)
        raise setup.SetupError("The live payment-method check did not confirm DigiPay.")
    except Exception:
        try:
            rollback = original if original_bytes is not None else "DIGIPAY_ENABLED='0'\n"
            setup.save_config(app_dir, rollback, content.encode("utf8"), uid, gid)
            restart_services()
        except Exception:
            raise setup.SetupError("Activation verification failed; configuration rollback needs review. Use the private backup shown above.") from None
        raise setup.SetupError("Activation verification failed; the previous configuration was restored.") from None


def main():
    os.umask(0o077)
    if len(sys.argv) != 1 or os.geteuid() != 0:
        raise setup.SetupError("Run this activation as root, without arguments.")
    runtime = pwd.getpwnam("homay")
    with setup.deployment_lock(setup.APP):
        result = activate(setup.APP, runtime.pw_uid, runtime.pw_gid)
    print(json.dumps(result, indent=2))
    print("DIGIPAY_CHECKOUT_ENABLED=1")


if __name__ == "__main__":
    try:
        main()
    except setup.SetupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Activation could not finish; no success is confirmed.", file=sys.stderr)
        sys.exit(1)
