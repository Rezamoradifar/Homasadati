import json
import os
from pathlib import Path

credentials = Path(os.environ['CREDENTIALS_DIRECTORY'])
config = json.loads((credentials / 'config').read_text())
env = {'PATH': '/usr/bin:/bin', 'HOME': '/var/lib/homa-mcp', 'LANG': 'C.UTF-8',
       'CONTROL_PLANE_API_KEY': (credentials / 'runtime-key').read_text().strip(),
       'CONTROL_PLANE_TUNNEL_ID': config['tunnel_id']}
binary = '/usr/local/lib/homa-mcp/tunnel-client'
# The MCP child receives a clean environment, without the tunnel runtime key.
os.execve(binary, [binary, 'run', '--mcp.command',
          '/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node /usr/local/lib/homa-mcp/server.mjs',
          '--health.listen-addr', '127.0.0.1:18793'], env)
