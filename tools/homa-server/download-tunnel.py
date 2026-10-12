"""Download the current official Linux release, verify digest, extract only binary."""
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import sys
import urllib.request
import zipfile

arch = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(platform.machine())
if not arch:
    raise SystemExit('Unsupported architecture; use official OpenAI tunnel download')
with urllib.request.urlopen('https://api.github.com/repos/openai/tunnel-client/releases/latest', timeout=30) as response:
    release = json.load(response)
tag = release['tag_name']
if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', tag):
    raise SystemExit('Unexpected upstream release; review before installing')
name = f'tunnel-client-{tag}-linux-{arch}.zip'
asset = next(a for a in release['assets'] if a['name'] == name)
url = f'https://github.com/openai/tunnel-client/releases/download/{tag}/{name}'
if asset['browser_download_url'] != url or not re.fullmatch('sha256:[a-f0-9]{64}', asset.get('digest', '')):
    raise SystemExit('Release metadata lacks a valid digest')
with urllib.request.urlopen(url, timeout=120) as response:
    archive = response.read(150 * 1024 * 1024 + 1)
if len(archive) > 150 * 1024 * 1024 or 'sha256:' + hashlib.sha256(archive).hexdigest() != asset['digest']:
    raise SystemExit('Tunnel archive integrity check failed')
with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
    entries = [n for n in bundle.namelist() if n.split('/')[-1] == 'tunnel-client']
    if len(entries) != 1:
        raise SystemExit('Unexpected tunnel archive layout')
    binary = bundle.read(entries[0])
dest = Path(sys.argv[1])
dest.write_bytes(binary)
os.chmod(dest, 0o755)
dest.with_suffix('.release.json').write_text(json.dumps({'tag': tag, 'asset': name, 'digest': asset['digest']}))
print('Verified official tunnel client', tag)
