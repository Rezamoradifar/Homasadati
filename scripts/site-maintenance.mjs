#!/usr/bin/env node
import {mkdirSync, writeFileSync, renameSync, unlinkSync, lstatSync, chmodSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {siteMaintenanceState} from '../src/platform/site-maintenance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['on', 'off', 'status'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/site-maintenance.mjs on|off|status');
  process.exit(2);
}
const previous = siteMaintenanceState(root);
if (mode === 'status') {
  console.log(JSON.stringify(previous));
  if (previous.source === 'invalid') process.exitCode = 1;
} else {
  const directory = dirname(previous.path);
  const created = mkdirSync(directory, {recursive: true, mode: 0o755});
  // Only set permissions on a newly created directory; an existing data
  // directory can contain private application data with its own policy.
  if (created) chmodSync(directory, 0o755);
  try {
    const info = lstatSync(previous.path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Maintenance state must be a regular file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = join(dirname(previous.path), `.site-maintenance-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({enabled: mode === 'on', updatedAt: new Date().toISOString()})}\n`, {flag: 'wx', mode: 0o644});
    // Root deployment shells can use umask 077. This flag contains no secrets
    // and must remain readable by the separate application service user.
    chmodSync(temporary, 0o644);
    renameSync(temporary, previous.path);
  } finally {
    try {unlinkSync(temporary);} catch (error) {if (error.code !== 'ENOENT') throw error;}
  }
  console.log(JSON.stringify(siteMaintenanceState(root)));
}
