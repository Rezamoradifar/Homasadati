import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'homa-install-check', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: '/usr/bin/node',
    args: ['/usr/local/lib/homa-mcp/server.mjs'], env: { PATH: '/usr/bin:/bin' }, stderr: 'pipe' }));
  if ((await client.listTools()).tools.length !== 6) throw new Error('MCP tool discovery failed');
  const result = await client.callTool({ name: 'homa_status', arguments: {} }, undefined, { timeout: 45000 });
  if (result.isError) throw new Error('Privileged helper check failed');
  console.log('HOMA_MCP_LOCAL_CHECK_OK');
} finally { await client.close(); }
