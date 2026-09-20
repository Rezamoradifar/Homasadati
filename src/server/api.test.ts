// @vitest-environment node
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {db} from './db';
import {limit} from './http';
import {POST as create} from '../../app/api/requests/route';
import {POST as status} from '../../app/api/status/route';
import {POST as subscribe} from '../../app/api/newsletter/route';
import {POST as unsubscribe} from '../../app/api/unsubscribe/route';
import {POST as login,DELETE as logout} from '../../app/api/admin/session/route';
import {GET as records,PATCH as update} from '../../app/api/admin/records/route';
const directory=mkdtempSync(join(tmpdir(),'homay-test-'));
const payload={kind:'enquiry',name:'Test visitor',email:'visitor@example.com',interest:'Tourism',message:'Please help',locale:'fa',currency:'USD',consent:true};
function req(path:string,data?:unknown,extra:Record<string,string>={},method=data?'POST':'GET'){return new Request('http://localhost'+path,{method,headers:{host:'localhost',origin:'http://localhost','content-type':'application/json',...extra},...(data?{body:JSON.stringify(data)}:{})});}
beforeAll(()=>{process.env.DATABASE_PATH=join(directory,'test.sqlite');process.env.ADMIN_PASSWORD='test-only-password-123456';delete process.env.APP_ORIGIN;});
afterAll(()=>{db().close();rmSync(directory,{recursive:true,force:true});});
describe('Persistent application workflow',()=>{
 it('saves once, survives a second DB connection, tracks privately and rejects changed retries',async()=>{
 const headers={'idempotency-key':randomUUID()};const first=await create(req('/api/requests',payload,headers));expect(first.status).toBe(201);const saved=await first.json();
 expect(await (await create(req('/api/requests',payload,headers))).json()).toEqual(saved);
 expect((await create(req('/api/requests',{...payload,name:'Changed'},headers))).status).toBe(409);
 const second=new Database(process.env.DATABASE_PATH!);expect(second.prepare('SELECT count(*) AS n FROM requests').get()).toEqual({n:1});second.close();
 const found=await (await status(req('/api/status',{code:saved.trackingCode}))).json();expect(found.status).toBe('new');expect(found.email).toBeUndefined();
 expect((await status(req('/api/status',{code:saved.id+'.'+randomUUID()}))).status).toBe(404);
 });
 it('rejects validation errors, oversized inputs and cross-origin mutations',async()=>{
 expect((await create(req('/api/requests',{...payload,consent:false},{'idempotency-key':randomUUID()}))).status).toBe(400);
 expect((await create(req('/api/requests',payload,{origin:'https://evil.example'}))).status).toBe(403);
 expect((await create(req('/api/requests',{...payload,message:'x'.repeat(17000)}))).status).toBe(413);
 });
 it('registers pending newsletter once and cancels through a private token',async()=>{
 const data={email:'news@example.com',locale:'en',consent:true};const saved=await (await subscribe(req('/api/newsletter',data))).json();expect(saved.unsubscribeToken).toHaveLength(64);
 expect((await (await subscribe(req('/api/newsletter',data))).json()).unsubscribeToken).toBeUndefined();
 expect((await unsubscribe(req('/api/unsubscribe',{token:saved.unsubscribeToken}))).status).toBe(200);
 expect(db().prepare('SELECT status FROM subscribers').get()).toEqual({status:'unsubscribed'});
 });
 it('protects admin data, updates status and revokes logout sessions',async()=>{
 expect((await records(req('/api/admin/records'))).status).toBe(401);
 expect((await login(req('/api/admin/session',{password:'incorrect'}))).status).toBe(401);
 const session=await login(req('/api/admin/session',{password:process.env.ADMIN_PASSWORD}));expect(session.status).toBe(200);expect(session.headers.get('set-cookie')).toContain('HttpOnly');const headers={cookie:session.headers.get('set-cookie')!.split(';')[0]};
 const list=await (await records(req('/api/admin/records',undefined,headers))).json();expect(list.rows).toHaveLength(1);expect(list.rows[0].idem_hash).toBeUndefined();
 expect((await update(req('/api/admin/records',{id:list.rows[0].id,status:'in_progress'},headers,'PATCH'))).status).toBe(200);
 expect(db().prepare('SELECT status FROM requests').get()).toEqual({status:'in_progress'});
 await logout(req('/api/admin/session',undefined,headers,'DELETE'));expect((await records(req('/api/admin/records',undefined,headers))).status).toBe(401);
 });
 it('enforces rate limits atomically',()=>{limit('unit',1,60);expect(()=>limit('unit',1,60)).toThrow('rate_limited');});
});
