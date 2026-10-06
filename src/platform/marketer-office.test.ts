// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {platformDb,run,now,one} from "./schema";
import {officeAccess,requireOffice,grantOffice,officeChart,officeNetwork} from "./marketer-office";
import {handle} from "./api";
import {session,SESSION_COOKIE} from "./security";
const dir=mkdtempSync(join(tmpdir(),"homay-office-"));
let owner:string,user:string,other:string,product:string;
function member(parent:string|null=null,role="user",leg="left") {const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,parent_id,leg,role,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?)",id,"Member","unused",id,parent,parent?leg:null,role,now(),now(),"test");return id;}
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,"test.sqlite");owner=member(null,"superadmin");user=member();other=member();product=randomUUID();run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",product,"Item","","craft","item",100,10,now(),now());});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("is closed by default; only owner grants seven independent audited levels",()=>{
 expect(officeAccess(user).enabled).toBe(false);expect(()=>requireOffice(user)).toThrow();expect(()=>grantOffice(other,{userId:user,level:7,reason:"no"})).toThrow();
 expect(grantOffice(owner,{userId:user,level:7,reason:"approved"})).toEqual({enabled:true,level:7,maxDepth:12});
 expect(one("SELECT action FROM p_audit WHERE entity_id=? ORDER BY created_at DESC",user)?.action).toBe("marketer-office.access");
 expect(()=>grantOffice(owner,{userId:user,level:8,reason:"invalid"})).toThrow();
});
it("shows more than five depths and rejects unrelated roots",()=>{
 let cursor=user;for(let i=0;i<8;i++)cursor=member(cursor);
 const network=officeNetwork(user,user,12);expect(Math.max(...network.rows.map(r=>r.depth))).toBe(8);
 expect(()=>officeNetwork(user,other,12)).toThrow();
 grantOffice(owner,{userId:user,level:1,reason:"limited"});expect(officeNetwork(user,user,12).depth).toBe(6);
});
it("uses paid downline sales only, reverses refunds and excludes own/outside sales",()=>{
 const child=one("SELECT id FROM p_users WHERE parent_id=?",user)!.id;
 function order(who:string,amount:number,refund:string|null=null){run("INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,policy,expires_at,created_at,paid_at,refunded_at,idem_key) VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)",randomUUID(),who,product,"Sale","craft",amount,amount,"processing","wallet","{}",now(),"2026-10-05T10:00:00Z","2026-10-05T10:00:00Z",refund,randomUUID());}
 order(child,100);order(child,50,"2026-10-06T10:00:00Z");order(user,900);order(other,800);
 const chart=officeChart(user,{series:"sales",interval:"week"},Date.parse("2026-10-06T12:00:00Z"));expect(chart.current).toBe(100);expect(chart.candles.at(-1)).toMatchObject({o:0,h:150,l:0,c:100,n:3});expect(new Date(chart.candles.at(-1)!.t).toISOString()).toBe("2026-10-04T20:30:00.000Z");
});
it("denies direct HTTP access after revocation, including chart and network",async()=>{
 grantOffice(owner,{userId:user,level:0,reason:"revoke"});const token=session(user,"test");
 for(const path of ["marketer-office","marketer-office/chart","marketer-office/network"]){const res=await handle(new Request("https://homanets.com/api/platform/"+path,{headers:{cookie:SESSION_COOKIE+"="+token}}),path.split("/"));expect(res.status).toBe(403);}
 const res=await handle(new Request("https://homanets.com/api/platform/admin/marketer-office?userId="+user,{headers:{cookie:SESSION_COOKIE+"="+token}}),["admin","marketer-office"]);expect(res.status).toBe(403);
});

it("bounds broad networks before rendering",()=>{
 const root=member();grantOffice(owner,{userId:root,level:7,reason:"large network"});
 const queue=[root];for(let i=0;i<110;i++){queue.push(member(queue[i],"user","left"));queue.push(member(queue[i],"user","right"));}
 const tree=officeNetwork(root,root,12);expect(tree.rows).toHaveLength(200);expect(tree.truncated).toBe(true);
});
