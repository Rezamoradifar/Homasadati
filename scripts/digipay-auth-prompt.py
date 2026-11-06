"""Run the auth-only check with hidden terminal input; never write credentials."""
import getpass
import os
from pathlib import Path
import subprocess
import sys
import warnings

warnings.simplefilter("error", getpass.GetPassWarning)
if len(sys.argv) != 1:
    raise SystemExit("This command accepts no arguments; use its hidden prompts.")

try:
    values = {}
    for name, label in [
        ("DIGIPAY_CLIENT_ID", "Client ID"),
        ("DIGIPAY_CLIENT_SECRET", "Client secret"),
        ("DIGIPAY_USERNAME", "API username"),
        ("DIGIPAY_PASSWORD", "API password"),
    ]:
        value = getpass.getpass(label + " (hidden): ")
        if not value or len(value) > 4096:
            raise ValueError()
        values[name] = value
except (getpass.GetPassWarning, EOFError, KeyboardInterrupt, ValueError):
    raise SystemExit("Input cancelled or no private terminal available. Nothing was saved.")

env = os.environ.copy()
env.update(values)
env.update({"NODE_ENV": "production", "DIGIPAY_ENVIRONMENT": "production", "DIGIPAY_ENABLED": "0",
            "APP_ORIGIN": os.environ.get("APP_ORIGIN") or "https://homanets.com"})
try:
    result = subprocess.run(["node", "--import", "tsx", "scripts/digipay-auth-check.ts"],
                            cwd=Path(__file__).resolve().parents[1], env=env, timeout=25)
    raise SystemExit(result.returncode)
except (OSError, subprocess.TimeoutExpired):
    raise SystemExit("Authentication check could not finish. Nothing was saved.")
