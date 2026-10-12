// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Run the real installer with only its absolute installation root redirected.
// Git, services and runuser are test doubles: no real deployment/database calls.
function deployment(options, failWorker = false, failDiagnostics = false) {
  const root = mkdtempSync(join(tmpdir(), 'homay-deploy-'));
  try {
    const app = join(root, 'app'), bin = join(root, 'bin'), log = join(root, 'calls');
    mkdirSync(join(app, 'src/platform'), { recursive: true });
    mkdirSync(join(app, 'app')); mkdirSync(join(app, 'scripts'));
    mkdirSync(bin); writeFileSync(log, '');
    writeFileSync(join(app, '.env.local'), 'PRIVATE_TEST_FIXTURE=yes\n', { mode: 0o600 });
    const stub = (name, body) => writeFileSync(join(bin, name), '#!/bin/bash\nset -eu\n' + body, { mode: 0o755 });
    stub('id', 'echo 0\n');
    stub('chown', 'exit 0\n');
    stub('sleep', 'exit 0\n');
    stub('systemctl', `
printf "service %s\\n" "$*" >> "$HOMAY_DEPLOY_TEST_LOG"
if [[ "$1" == start ]]; then touch "$HOMAY_DEPLOY_TEST_APP/started"; fi
if [[ "$HOMAY_DEPLOY_TEST_FAIL_WORKER" == 1 && "$*" == 'is-active --quiet homay-worker.service' && -f "$HOMAY_DEPLOY_TEST_APP/started" ]]; then exit 1; fi
`);
    stub('runuser', `
printf "runuser %s\\n" "$*" >> "$HOMAY_DEPLOY_TEST_LOG"
if [[ "$*" == *platform:backup* ]]; then : > "$HOMAY_DEPLOY_TEST_APP/private-backup.probe"; fi
if [[ "$HOMAY_DEPLOY_TEST_FAIL_DIAGNOSTICS" == 1 && "$*" == *services:check* ]]; then exit 1; fi
`);
    stub('git', `
repo="$PWD"
while [[ "$1" == -c || "$1" == -C ]]; do
  if [[ "$1" == -C ]]; then repo="$2"; fi
  shift 2
done
case "$1" in
  rev-parse) printf '%s\\n' "$HOMAY_DEPLOY_TEST_HEAD" ;;
  worktree)
    if [[ "$2" == add ]]; then mkdir -p "$4/node_modules" "$4/.next"; fi ;;
  merge)
    if [[ "$2" == --ff-only ]]; then
      mkdir -p "$repo/src/new-modules"
      printf 'export const value = 1;\\n' > "$repo/src/new-modules/worker.ts"
      printf 'export const provider = 1;\\n' > "$repo/src/platform/providers.ts"
    fi ;;
  reset) printf 'source rollback\\n' >> "$HOMAY_DEPLOY_TEST_LOG" ;;
esac
`);
    const installer = join(root, 'installer.sh');
    writeFileSync(installer, readFileSync(new URL('./deploy-zibal.sh', import.meta.url), 'utf8').replaceAll('/opt/homay', root));
    const result = spawnSync('bash', ['-c', 'umask 077; exec bash "$@"', 'deployment-test', installer, 'a'.repeat(40), ...options], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, HOMAY_DEPLOY_TEST_LOG: log, HOMAY_DEPLOY_TEST_HEAD: 'b'.repeat(40), HOMAY_DEPLOY_TEST_APP: app, HOMAY_DEPLOY_TEST_FAIL_WORKER: String(Number(failWorker)), HOMAY_DEPLOY_TEST_FAIL_DIAGNOSTICS: String(Number(failDiagnostics)) },
    });
    const mode = path => existsSync(join(app, path)) ? statSync(join(app, path)).mode & 0o777 : null;
    return { ...result, calls: readFileSync(log, 'utf8'), modes: {
      source: mode('src/platform/providers.ts'), directory: mode('src/new-modules'),
      newSource: mode('src/new-modules/worker.ts'), environment: mode('.env.local'), backup: mode('private-backup.probe'),
    } };
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

it('keeps new checkout files readable under the private management job umask without widening secrets or backups', () => {
  const result = deployment(['--skip-merchant', '--preserve-schedule']);
  expect(result.status, result.stderr).toBe(0);
  expect(result.modes).toEqual({ source: 0o644, directory: 0o755, newSource: 0o644, environment: 0o600, backup: 0o600 });
  expect(result.calls).toContain('Unreadable runtime file');
  expect(result.calls.indexOf('Unreadable runtime file')).toBeLessThan(result.calls.indexOf('npm run platform:setup'));
});

it.each([[true, false], [false, true]])('rolls back source and build if worker startup or module diagnostics fail', (worker, diagnostics) => {
  const result = deployment(['--skip-merchant', '--preserve-schedule'], worker, diagnostics);
  expect(result.status).not.toBe(0);
  expect(result.calls).toContain('source rollback');
  expect(result.calls.lastIndexOf('service stop homay.service homay-worker.service')).toBeLessThan(result.calls.indexOf('source rollback'));
  expect(result.calls.lastIndexOf('service stop homay.service homay-worker.service')).toBeGreaterThan(result.calls.indexOf('service start homay.service homay-worker.service'));
  expect(result.stdout).toContain('Previous code/build restored');
  expect(result.stdout).not.toContain('Homay release installed.');
});
