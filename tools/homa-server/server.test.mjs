import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from './server.mjs';

test('real MCP negotiation, discovery, validation, annotations, and helper dispatch', async () => {
  const calls = [];
  const server = createServer(async r => { calls.push(r); return { ok: true, accepted: r.op }; });
  const client = new Client({ name: 'homa-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert.equal(tools.find(t => t.name === 'homa_status').annotations.readOnlyHint, true);
    assert.equal(tools.find(t => t.name === 'homa_upgrade').annotations.destructiveHint, true);
    assert.equal(tools.find(t => t.name === 'homa_backup').annotations.readOnlyHint, false);
    const status = await client.callTool({ name: 'homa_status', arguments: {} });
    assert.equal(status.isError, false);
    assert.deepEqual(calls.pop(), { op: 'status' });
    for (const [name, args] of [
      ['homa_status', { op: 'upgrade' }],
      ['homa_deploy_log', { name: '../../etc/shadow' }],
      ['homa_deploy_log', { lines: 10000 }],
      ['homa_restart', { request_id: 'a'.repeat(32), service: 'ssh.service' }],
      ['homa_upgrade', { release: '$(id)', request_id: 'a'.repeat(32) }],
      ['homa_backup', {}],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, true, name);
    }
    assert.equal(calls.length, 0, 'invalid requests must never reach root boundary');
    await client.callTool({ name: 'homa_backup', arguments: { request_id: 'f'.repeat(32) } });
    assert.deepEqual(calls.pop(), { op: 'backup', request_id: 'f'.repeat(32) });
    await client.callTool({ name: 'homa_deploy_log', arguments: {} });
    assert.deepEqual(calls.pop(), { op: 'log', lines: 80 });
  } finally { await client.close(); await server.close(); }
});

test('production stdio entrypoint initializes and lists tools without stdout noise', async () => {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [new URL('./server.mjs', import.meta.url).pathname], stderr: 'pipe',
    env: { PATH: process.env.PATH } });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 6);
  } finally { await client.close(); }
});
