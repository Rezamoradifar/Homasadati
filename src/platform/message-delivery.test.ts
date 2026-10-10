// @vitest-environment node
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {run,one,all,now,platformDb} from './schema';
import {saveSetting,sendOtp} from './providers';
import {notify,notifyInApp} from './finance';
import {welcomeMember} from './welcome';
import {maintenance} from './maintenance';
import {messagePresentation,notificationSms} from './message-presentation';
const dir=mkdtempSync(join(tmpdir(),'homay-message-'));
const owner=randomUUID(),muted=randomUUID();
beforeAll(()=>{
 process.env.DATABASE_PATH=join(dir,'fixture.sqlite');process.env.PLATFORM_MASTER_KEY='f'.repeat(64);process.env.APP_ORIGIN='https://homay.test';
 for(const id of [owner,muted]){run("INSERT INTO p_users(id,email,phone,name,password,role,referral_code,preferences,created_at,last_seen,signup_ip) VALUES(?,?,?,'عضو نمونه','unused','user',?,?,?,?,'test')",id,id+'@test.example',id===owner?'+989111111111':'+989122222222',id,JSON.stringify({sms:id===owner,email:id===owner,inApp:true}),now(),now());run('INSERT INTO p_wallets(user_id) VALUES(?)',id);}
 saveSetting('kavenegar_key','fixture-key',true);saveSetting('sms_sender','fixture-sender');saveSetting('resend_key','fixture-mail-key',true);saveSetting('email_from','fixture@homay.test');
});
afterAll(()=>{vi.unstubAllGlobals();platformDb().close();rmSync(dir,{recursive:true,force:true});});
it('delivers branded welcome and status templates, preserves private-only events and preferences',async()=>{
 welcomeMember(owner);welcomeMember(muted);
 notify(owner,'وضعیت سفارش تغییر کرد','shipped');
 notifyInApp(owner,'اطلاعات بانکی تأیید شد','Private bank note');
 notify(muted,'وضعیت برداشت تغییر کرد','paid');
 expect(one('SELECT COUNT(*) n FROM p_outbox WHERE user_id=?',muted)!.n).toBe(0);
 const sms:string[]=[],email:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{if(String(url).includes('/sms/send.json')){sms.push(new URLSearchParams(init.body).get('message')!);return Response.json({return:{status:200}});}if(String(url)==='https://api.resend.com/emails'){email.push(JSON.parse(init.body));return Response.json({id:randomUUID()});}throw Error('Unexpected external request');}));
 await maintenance();
 expect(sms).toHaveLength(2);expect(email).toHaveLength(2);
 expect(sms[0]).toContain('عضو عزیز');expect(sms[0]).not.toContain('"template"');expect(sms[0]).toContain('/account?tab=dashboard');
 expect(sms[1]).toContain('سفارش شما ارسال شد');expect(sms[1]).toContain('/account?tab=orders');
 expect(JSON.stringify([...sms,...email])).not.toContain('Private bank note');
 expect(email[1].html).toContain('/account?tab=orders');expect(email[1].html).toContain('#0F6E72');
 expect(all("SELECT status FROM p_outbox").every(j=>j.status==='sent')).toBe(true);
 await maintenance();expect(sms).toHaveLength(2);expect(email).toHaveLength(2);
 vi.unstubAllGlobals();
});
it('renders readable withdrawal outcomes and bounded SMS previews with the full follow-up link',()=>{
 expect(messagePresentation('وضعیت برداشت تغییر کرد','approved').text).toContain('در انتظار پرداخت');
 expect(messagePresentation('وضعیت برداشت تغییر کرد','paid').text).toContain('شماره پیگیری');
 const text=notificationSms('اطلاعیه','متن '.repeat(1000),'هما نت','https://homay.test');
 expect(text.length).toBeLessThan(400);expect(text).toContain('…');expect(text.endsWith('/account?tab=notifications')).toBe(true);
});
it('uses approved per-purpose OTP names and keeps the existing template as fallback',async()=>{
 saveSetting('sms_template','existing-approved');saveSetting('sms_template_reset','reset-approved');
 const templates:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const data=new URLSearchParams(init.body);templates.push(data.get('template')!);expect(data.get('token')).toMatch(/^\d{6}$/);return Response.json({return:{status:200}});}));
 const a=await sendOtp('+989133333333','reset');const b=await sendOtp('+989144444444','login');
 expect(templates).toEqual(['reset-approved','existing-approved']);expect(a).not.toHaveProperty('code');expect(b).not.toHaveProperty('code');vi.unstubAllGlobals();
});
it('lets only the administrator save approved purpose-template names through the real API',async()=>{
 const {handle}=await import('./api');const {session,SESSION_COOKIE}=await import('./security');
 const admin=randomUUID();run("INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,'مدیر آزمون','unused','superadmin',?,?,?,'test')",admin,admin,now(),now());
 const request=(id:string)=>handle(new Request('https://homay.test/api/platform/admin/settings',{method:'POST',headers:{origin:'https://homay.test','Content-Type':'application/json',cookie:SESSION_COOKIE+'='+session(id,'test')},body:JSON.stringify({key:'sms_template_contact',value:'approved-contact',reason:'Template configuration test'})}),['admin','settings']);
 expect((await request(muted)).status).toBe(403);
 expect((await request(admin)).status).toBe(200);
 expect(one("SELECT value FROM p_settings WHERE key='sms_template_contact'")!.value).toBe('approved-contact');
});
