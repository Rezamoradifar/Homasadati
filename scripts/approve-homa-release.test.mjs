// @vitest-environment node
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

it('preserves root approval, locking, private configuration and rollback guarantees', () => {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./approve_homa_release_test.py', import.meta.url))], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toContain('Ran 6 tests');
});
