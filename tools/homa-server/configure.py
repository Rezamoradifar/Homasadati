"""Run on the VPS console only. No secret is accepted in command-line arguments."""
import getpass
import json
import os
from pathlib import Path
import re
import sys

os.umask(0o077)
root = Path('/etc/homa-mcp')
root.mkdir(mode=0o700, exist_ok=True)
if (root / 'config.json').exists() and (root / 'runtime-key').exists():
    print('Keeping existing tunnel configuration and approved release.')
    raise SystemExit(0)
if not sys.stdin.isatty():
    raise SystemExit('Run from the interactive VPS terminal; tunnel credentials must be entered there.')
print('Create the tunnel in the same organization/workspace used by ChatGPT:')
print('https://platform.openai.com/settings/organization/tunnels')
tunnel_id = input('Tunnel ID: ').strip()
if not re.fullmatch(r'[A-Za-z0-9_-]{10,160}', tunnel_id):
    raise SystemExit('Invalid tunnel ID')
key = getpass.getpass('Runtime API key (hidden; Tunnels Read + Use): ').strip()
if not re.fullmatch(r'sk-[A-Za-z0-9_-]{16,512}', key):
    raise SystemExit('Invalid runtime API key')
(root / 'runtime-key').write_text(key + '\n')
(root / 'config.json').write_text(json.dumps({
    'tunnel_id': tunnel_id,
    'approved_release': 'ca3c7e7d57a9070e9e9584f238f9830702c3d364',
}, indent=2) + '\n')
print('Tunnel credentials stored privately on this VPS.')
