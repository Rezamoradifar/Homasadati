// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from './api';
import { now, platformDb, run } from './schema';
import { session, SESSION_COOKIE } from './security';

const dir = mkdtempSync(join(tmpdir(), 'homa-home-design-'));
const origin = 'https://home-design.test';
let adminCookie = '', memberCookie = '';
function createUser(role: string) {
  const id = randomUUID();
  run("INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,'unused',?,?,?,?,?)", id, `${id}@example.test`, 'Test user', role, id, now(), now(), 'test');
  return SESSION_COOKIE + '=' + session(id, 'test');
}
function request(path: string, method = 'GET', cookie = '', body?: unknown) {
  return handle(new Request(`${origin}/api/platform/${path}`, { method, headers: { origin, host: 'home-design.test', cookie, 'content-type': 'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}) }), path.split('/'));
}
beforeAll(() => { process.env.DATABASE_PATH = join(dir, 'test.sqlite'); process.env.APP_ORIGIN = origin; process.env.PLATFORM_MASTER_KEY = 'a'.repeat(64); adminCookie = createUser('content'); memberCookie = createUser('user'); });
afterAll(() => { platformDb().close(); rmSync(dir, {recursive:true, force:true}); });

it('persists authorized homepage content, exposes it uncached and keeps an audit record', async () => {
  const values = {'fa.hero.hero':'هما جدید', 'fa.premium.shop':'فروشگاه ما', 'image.hero':'/assets/heritage/isfahan.webp'};
  expect((await request('admin/homepage-design','PATCH',adminCookie,{values})).status).toBe(200);
  const publicResponse = await request('homepage-design');
  expect(publicResponse.headers.get('Cache-Control')).toBe('no-store');
  expect((await publicResponse.json()).values).toEqual(values);
  expect(platformDb().prepare("SELECT count(*) AS count FROM p_audit WHERE action='homepage.design'").get()).toEqual({count:1});
});
it('rejects members, unknown fields and unsafe image addresses without changing published data', async () => {
  const before = (await (await request('homepage-design')).json()).values;
  expect((await request('admin/homepage-design','PATCH',memberCookie,{values:{'fa.hero.hero':'bad'}})).status).toBe(403);
  expect((await request('admin/homepage-design','PATCH',adminCookie,{values:{'image.hero':'javascript:alert(1)'}})).status).toBe(400);
  expect((await request('admin/homepage-design','PATCH',adminCookie,{values:{'unexpected.key':'bad'}})).status).toBe(400);
  expect((await (await request('homepage-design')).json()).values).toEqual(before);
});
