// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {run,one,now,platformDb} from './schema';
import {saveSetting} from './providers';
import {session,SESSION_COOKIE} from './security';
import {handle} from './api';
import {launchDashboard} from './launch-dashboard';
import {reviewPayoutProfile} from './payout-profile';
import {releaseCardRewards} from './seven-card-engine';
import {searchTree} from './network-tree';
import {SEVEN_LEVEL_VERSION} from './card-levels';
const dir=mkdtempSync(join(tmpdir(),'homay-launch-'));let owner:string,member:string,outsider:string;
function create(role='user'){const id=randomUUID();run('INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)',id,'Search member '+id,'unused',role,id,now(),now(),'test');run('INSERT INTO p_wallets(user_id) VALUES(?)',id);return id;}
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,'test.sqlite');owner=create('superadmin');member=create();outsider=create();});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it('keeps operational counts owner-only and separates unpaid orders from gateway failures',async()=>{
 const req=(id?:string)=>handle(new Request('https://homay.test/api/platform/admin/launch-dashboard',{headers:{cookie:id?SESSION_COOKIE+'='+session(id,'test'):''}}),['admin','launch-dashboard']);
 expect((await req()).status).toBe(401);expect((await req(member)).status).toBe(403);const response=await req(owner);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({failedGatewayAttempts:0,cancelledGatewayAttempts:0});
 const d=launchDashboard(Date.parse('2026-10-10T21:00:00Z'));expect(d.since).toBe('2026-10-10T20:30:00.000Z');expect(JSON.stringify(d)).not.toContain(member);
});
it('creates private bank review notifications once and queues no additional emails or SMS',()=>{
 saveSetting('seven_card_schedule_version','legacy');run("INSERT INTO p_payout_profiles VALUES(?,?,?,?,?,'pending','',NULL,NULL,?,?)",member,'opaque',member,'1111','2222',now(),now());
 const outbox=one('SELECT COUNT(*) n FROM p_outbox')!.n;reviewPayoutProfile(owner,member,'verified','Confirmed');expect(()=>reviewPayoutProfile(owner,member,'verified','Confirmed')).toThrow('invalid_state');
 expect(one("SELECT COUNT(*) n FROM p_notifications WHERE user_id=? AND title='اطلاعات بانکی تأیید شد'",member)!.n).toBe(1);expect(one('SELECT COUNT(*) n FROM p_outbox')!.n).toBe(outbox);
});
it('aggregates reward release into one in-app event and repeat workers do not duplicate it',()=>{
 run('UPDATE p_wallets SET pending=1000 WHERE user_id=?',member);
 for(const [id,kind,amount] of [['cash','cash',1000],['voucher','voucher',500]] as const){run('INSERT INTO p_card_matches VALUES(?,?,1,?,1,?,?,0,?)',id,member,'2026-10-04T20:30Z',kind,amount,now());run('INSERT INTO p_card_due(match_id,user_id,kind,amount,release_at) VALUES(?,?,?,?,?)',id,member,kind,amount,'2026-01-01T00:00:00Z');}
 expect(releaseCardRewards()).toBe(2);expect(releaseCardRewards()).toBe(0);expect(one("SELECT COUNT(*) n FROM p_notifications WHERE user_id=? AND title='پاداش جایگاه‌ها آزاد شد'",member)!.n).toBe(1);expect(one('SELECT available,pending FROM p_wallets WHERE user_id=?',member)).toMatchObject({available:1000,pending:0});
});
it('shows the scoped route to a member and never exposes unrelated search matches',()=>{
 saveSetting('seven_card_position_version',SEVEN_LEVEL_VERSION);run('INSERT INTO p_card_direct_positions VALUES(?,?,?,?)',member,owner,1,now());
 const result=searchTree(owner,member)[0];expect(result.id).toBe(member);expect(result.path.map((p:any)=>p.id)).toEqual([owner,member]);expect(searchTree(owner,outsider)).toEqual([]);expect(JSON.stringify(result)).not.toMatch(/password|opaque|1111/);
});
