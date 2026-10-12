// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Run the real installer with only its absolute installation root redirected.
// Git, services and runuser are test doubles: no real deployment/database calls.
function deployment(options) {
  const root = mkdtempSync(join(tmpdir(), 'homay-deploy-'));
  try {
    const app = join(root, 'app'), bin = join(root, 'bin'), log = join(root, 'calls');
    mkdirSync(app); mkdirSync(bin); writeFileSync(log, '');
    const stub = (name, body) => writeFileSync(join(bin, name), '#!/bin/bash\nset -eu\n' + body, { mode: 0o755 });
    stub('id', 'echo 0\n');
    stub('chown', 'exit 0\n');
    stub('systemctl', 'printf "service %s\\n" "$*" >> "$HOMAY_DEPLOY_TEST_LOG"\n');
    stub('runuser', 'printf "runuser %s\\n" "$*" >> "$HOMAY_DEPLOY_TEST_LOG"\n');
    stub('git', `
if [[ "$1" == -c ]]; then shift 2; fi
if [[ "$1" == -C ]]; then shift 2; fi
if [[ "$1" == -c ]]; then shift 2; fi
case "$1" in
  rev-parse) printf '%s\\n' "$HOMAY_DEPLOY_TEST_HEAD" ;;
  worktree)
    if [[ "$2" == add ]]; then mkdir -p "$4/node_modules" "$4/.next"; fi ;;
esac
`);
    const installer = join(root, 'installer.sh');
    writeFileSync(installer, readFileSync(new URL('./deploy-zibal.sh', import.meta.url), 'utf8').replaceAll('/opt/homay', root));
    const result = spawnSync('bash', [installer, 'a'.repeat(40), ...options], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, HOMAY_DEPLOY_TEST_LOG: log, HOMAY_DEPLOY_TEST_HEAD: 'b'.repeat(40) },
    });
    return { ...result, calls: readFileSync(log, 'utf8') };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

it.each([
  ['--skip-merchant', '--preserve-schedule'],
  ['--preserve-schedule', '--skip-merchant'],
])('preserves payment and schedule settings with option order %s %s', (...options) => {
  const result = deployment(options);
  expect(result.status, result.stderr).toBe(0);
  expect(result.calls).not.toContain('configure-card-schedule.ts');
  expect(result.calls).not.toContain('configure-zibal.ts');
  expect(result.calls).toContain('platform:backup');
  expect(result.calls).toContain('service start homay.service homay-worker.service');
});

it('retains the existing explicit full-deployment schedule behavior', () => {
  const result = deployment(['--skip-merchant']);
  expect(result.status, result.stderr).toBe(0);
  expect(result.calls).toContain('configure-card-schedule.ts');
});

it('rejects unknown options before touching services or configuration', () => {
  const result = deployment(['--preserve-schedul']);
  expect(result.status).toBe(2);
  expect(result.calls).toBe('');
  expect(result.stdout).toContain('Unknown deployment option');
});
