// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bypassSiteMaintenance, siteMaintenanceHtml, siteMaintenanceState} from './site-maintenance.mjs';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'homa-maintenance-'));
  roots.push(root);
  mkdirSync(join(root, 'data'));
  return root;
}
afterEach(() => {for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});});

describe('public site maintenance', () => {
  it('keeps the page available if the branded HTML is missing', () => {
    const root = fixture();
    expect(siteMaintenanceHtml(root)).toContain('در حال به‌روزرسانی هما نت هستیم');
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public/site-maintenance.html'), '<h1>Branded maintenance page</h1>');
    expect(siteMaintenanceHtml(root)).toBe('<h1>Branded maintenance page</h1>');
  });

  it('writes readable runtime overrides even with a restrictive deployment umask', () => {
    const root = fixture();
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'src/platform'), {recursive: true});
    copyFileSync(resolve('scripts/site-maintenance.mjs'), join(root, 'scripts/site-maintenance.mjs'));
    copyFileSync(resolve('src/platform/site-maintenance.mjs'), join(root, 'src/platform/site-maintenance.mjs'));
    const previousDirectoryMode = statSync(join(root, 'data')).mode & 0o777;
    const run = (mode: string) => spawnSync(process.execPath, [
      '--input-type=module', '--eval', 'process.umask(0o077); await import(process.argv[1]);',
      pathToFileURL(join(root, 'scripts/site-maintenance.mjs')).href, mode,
    ], {encoding: 'utf8', cwd: tmpdir()});

    const disabled = run('off');
    expect(disabled.status, disabled.stderr).toBe(0);
    expect(siteMaintenanceState(root)).toMatchObject({enabled: false, source: 'override'});
    expect(statSync(join(root, 'data/site-maintenance.json')).mode & 0o777).toBe(0o644);
    expect(statSync(join(root, 'data')).mode & 0o777).toBe(previousDirectoryMode);
    expect(run('on').status).toBe(0);
    expect(siteMaintenanceState(root).enabled).toBe(true);
    const state = readFileSync(join(root, 'data/site-maintenance.json'), 'utf8');
    expect(run('invalid').status).toBe(2);
    expect(readFileSync(join(root, 'data/site-maintenance.json'), 'utf8')).toBe(state);
    expect(readdirSync(join(root, 'data'))).toEqual(['site-maintenance.json']);
  });

  it('starts enabled and reads subsequent owner changes without a restart', () => {
    const root = fixture();
    expect(siteMaintenanceState(root)).toMatchObject({enabled: true, source: 'default'});
    const path = join(root, 'data', 'site-maintenance.json');
    writeFileSync(path, JSON.stringify({enabled: false}));
    expect(siteMaintenanceState(root)).toMatchObject({enabled: false, source: 'override'});
    writeFileSync(path, JSON.stringify({enabled: true}));
    expect(siteMaintenanceState(root)).toMatchObject({enabled: true, source: 'override'});
  });

  it.each(['not json', '{"enabled":"false"}', 'null'])('keeps the maintenance page on for invalid state %s', value => {
    const root = fixture();
    writeFileSync(join(root, 'data', 'site-maintenance.json'), value);
    expect(siteMaintenanceState(root)).toMatchObject({enabled: true, source: 'invalid'});
  });

  it.each([
    '/api/health', '/api/platform/payment/callback', '/api/platform/digipay/callback',
    '/api/platform/auth/login', '/api/admin/session', '/admin', '/admin/orders/1/print',
    '/payment/result', '/unsubscribe', '/legal/privacy', '/assets/brand/homanet-mark-orange.png',
    '/fonts/vazirmatn-arabic-400-normal.woff2', '/_next/static/chunks/app.js', '/_next/image',
  ])('preserves operational route %s', path => {
    expect(bypassSiteMaintenance(path)).toBe(true);
  });

  it.each(['/', '/shop', '/shop/item', '/cart', '/account', '/worlds/tourism', '/worlds/craft', '/api-other', '/administrator', '/assets-old', '/payment/result-other'])('covers public route %s', path => {
    expect(bypassSiteMaintenance(path)).toBe(false);
  });
});
