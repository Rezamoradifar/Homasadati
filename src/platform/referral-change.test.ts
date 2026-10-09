// @vitest-environment node
import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {platformDb,run,one,now} from './schema';
import {saveSetting} from './providers';
import {setReferralCode,setReferralCodeByAdmin,referralStatus,sponsorByCode} from './referral';
const dir=mkdtempSync(join(tmpdir(),'homay-referral-change-'));
const DAY=86400000;
function member(role='user'){
 const id=randomUUID();run('INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)',id,'Test','unused',role,'hn-'+id,now(),now(),'test');
 return one('SELECT * FROM p_users WHERE id=?',id)!;
}
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,'test.sqlite');platformDb();saveSetting('referral_requires_purchase','0');});
afterEach(()=>vi.useRealTimers());afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it('allows the first choice immediately and the next exactly seven days later, including existing cooldowns',()=>{
 vi.useFakeTimers();const start=Date.parse('2026-10-09T12:00:00Z');vi.setSystemTime(start);const user=member();
 expect(referralStatus(user).canChange).toBe(true);
 const result=setReferralCode(user,'weekly-first');expect(result.nextChange).toBe(new Date(start+7*DAY).toISOString());
 vi.setSystemTime(start+7*DAY-1);expect(()=>setReferralCode(user,'weekly-second')).toThrow();
 vi.setSystemTime(start+7*DAY);expect(setReferralCode(user,'weekly-second').code).toBe('weekly-second');
 expect(sponsorByCode('weekly-first')!.id).toBe(user.id);
});
it('lets authorized administrators edit repeatedly immediately, preserves all links and records the actor',()=>{
 const admin=member('superadmin'),user=member();setReferralCode(user,'member-chosen');
 setReferralCodeByAdmin(admin,user.id,'admin-first','correction');setReferralCodeByAdmin(admin,user.id,'admin-second','second correction');
 for(const code of [user.referral_code,'member-chosen','admin-first','admin-second'])expect(sponsorByCode(code)!.id).toBe(user.id);
 expect(one("SELECT actor_id,reason FROM p_audit WHERE entity_id=? AND action='referral.code' AND reason='second correction'",user.id)).toMatchObject({actor_id:admin.id,reason:'second correction'});
 expect(()=>setReferralCode(user,'member-again')).toThrow();
 const unchanged=referralStatus(one('SELECT * FROM p_users WHERE id=?',user.id)!);setReferralCodeByAdmin(admin,user.id,'admin-second','no change');
 expect(referralStatus(one('SELECT * FROM p_users WHERE id=?',user.id)!).nextChange).toBe(unchanged.nextChange);
});
it('keeps role permissions, protected accounts, reserved codes and collisions enforced',()=>{
 const admin=member('superadmin'),support=member('support'),user=member(),other=member();
 expect(()=>setReferralCodeByAdmin(user,other.id,'illegal-code','denied')).toThrow();
 expect(()=>setReferralCodeByAdmin(support,admin.id,'protected-code','denied')).toThrow();
 setReferralCodeByAdmin(support,user.id,'support-edit','authorized');
 expect(()=>setReferralCodeByAdmin(admin,other.id,'support-edit','collision')).toThrow();
 expect(()=>setReferralCodeByAdmin(admin,user.id,'admin','reserved')).toThrow();
 expect(one('SELECT referral_code FROM p_users WHERE id=?',user.id)!.referral_code).toBe('support-edit');
 run('UPDATE p_users SET blocked=1 WHERE id=?',admin.id);
 expect(()=>setReferralCodeByAdmin(one('SELECT * FROM p_users WHERE id=?',admin.id)!,user.id,'blocked-admin','denied')).toThrow();
});
