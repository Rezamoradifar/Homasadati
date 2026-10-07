import {randomUUID} from "node:crypto";
import {z} from "zod";
import {all,one,run,now,atomic} from "./schema";
import {audit} from "./security";
import {ApiError} from "../server/http";
import {id,money,text} from "./validation";
const DAY=86400000;
function revokeSessions(userId:string){for(const table of ['p_sessions','p_google_logins','p_google_challenges']) run(`DELETE FROM ${table} WHERE user_id=?`,userId);}
export function companyCredit(user:string){return one("SELECT COALESCE(SUM(delta),0) balance FROM p_company_credit WHERE user_id=?",user)!.balance as number;}
export function creditEntry(user:string,key:string,delta:number,reference:string){
  if(!Number.isSafeInteger(delta))throw new ApiError(400,"invalid_input");
  return atomic(()=>{const existing=one("SELECT * FROM p_company_credit WHERE event_key=?",key);if(existing){if(existing.user_id!==user||existing.delta!==delta)throw new ApiError(409,"idempotency_conflict");return;}
    if(!Number.isSafeInteger(companyCredit(user)+delta)||companyCredit(user)+delta>1e12)throw new ApiError(400,"invalid_input");
    if(companyCredit(user)+delta<0)throw new ApiError(409,"insufficient_balance");
    run("INSERT INTO p_company_credit VALUES(?,?,?,?,?,?)",randomUUID(),user,key,delta,reference,now());});
}
export function companyPositionStatus(user:string,at=Date.now()){
  const g=one("SELECT * FROM p_company_positions WHERE user_id=?",user);if(!g)return null;
  if(one("SELECT value FROM p_settings WHERE key='company_position_permanent_owner'")?.value===user && one("SELECT role,blocked FROM p_users WHERE id=?",user)?.role==='superadmin' && !one("SELECT blocked FROM p_users WHERE id=?",user)?.blocked) return {...g,status:"qualified",exempt:true,deadline:null,realPurchaseToman:0,requiredToman:0,remainingDays:0,activeDesks:g.desks};
  // A gift is not bank payment. Voucher-funded shares are excluded as well.
  const total=one(`SELECT COALESCE(SUM(o.amount-COALESCE(v.amount,0)),0) n FROM p_orders o LEFT JOIN p_order_vouchers v ON v.order_id=o.id WHERE o.user_id=? AND o.payment_method IN ('zibal','zarinpal','bale','bank_transfer') AND o.paid_at>=? AND o.paid_at<=? AND o.paid_at<=? AND o.refunded_at IS NULL AND o.status NOT IN ('cancelled','refunded')`,user,g.granted_at,g.deadline,new Date(at).toISOString())!.n;
  const status=at<Date.parse(g.granted_at)?"not_started":total>=20000000?"qualified":at<Date.parse(g.deadline)?"grace":"suspended";
  return {...g,deadline:g.deadline as string,status,realPurchaseToman:total,requiredToman:20000000,remainingDays:Math.max(0,Math.ceil((Date.parse(g.deadline)-at)/DAY)),activeDesks:["suspended","not_started"].includes(status)?0:g.desks};
}
function owner(actor:string){const u=one("SELECT * FROM p_users WHERE id=?",actor);if(!u||u.blocked||u.role!=="superadmin")throw new ApiError(403,"forbidden");}
export function manageCompanyMember(actor:string,input:unknown){
  owner(actor);
  const base=z.object({userId:id,reason:text,action:z.enum(["credit","positions","archive","restore","activate","profile"]),amount:money.optional(),desks:z.number().int().min(1).max(7).optional(),eventId:id,name:text.optional()}).strict().parse(input);
  if(base.userId===actor)throw new ApiError(409,"cannot_modify_self");
  return atomic(()=>{
    const u=one("SELECT * FROM p_users WHERE id=?",base.userId);if(!u)throw new ApiError(404,"not_found");
    if(u.role==='superadmin'&&base.action==='archive'&&one("SELECT COUNT(*) n FROM p_users WHERE role='superadmin' AND blocked=0")!.n<=1)throw new ApiError(409,"invalid_state");
    const previous=one("SELECT * FROM p_company_actions WHERE id=?",base.eventId);
    if(previous){if(previous.payload!==JSON.stringify(base)||previous.actor_id!==actor)throw new ApiError(409,"idempotency_conflict");return companyMemberView(u.id);}
    const before={name:u.name,blocked:u.blocked,credit:companyCredit(u.id),position:companyPositionStatus(u.id)};
    if(base.action==='credit'){if(!base.amount)throw new ApiError(400,"invalid_input");creditEntry(u.id,"admin-credit:"+base.eventId,base.amount,actor);}
    if(base.action==='positions'){if(one("SELECT value FROM p_settings WHERE key='seven_card_position_version'")?.value!=="aa-2026-10-06" && one("SELECT value FROM p_settings WHERE key='seven_card_position_version'")?.value!=="four-referrals-2026-10-07" && one("SELECT value FROM p_settings WHERE key='seven_card_position_version'")?.value!=="manual-referrals-2026-10-07" && one("SELECT value FROM p_settings WHERE key='seven_card_position_version'")?.value!=="seven-level-manual-2026-10-07")throw new ApiError(409,"invalid_state");if(!base.desks)throw new ApiError(400,"invalid_input");run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET desks=excluded.desks,granted_at=excluded.granted_at,deadline=excluded.deadline,actor_id=excluded.actor_id,last_status='grace'",u.id,base.desks,now(),new Date(Date.now()+35*DAY).toISOString(),actor,"grace");}
    if(base.action==='archive'){run("INSERT INTO p_archived_users VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET archived_at=excluded.archived_at,actor_id=excluded.actor_id",u.id,now(),actor);run("UPDATE p_users SET blocked=1 WHERE id=?",u.id);revokeSessions(u.id);}
    if(base.action==='restore'||base.action==='activate'){run("DELETE FROM p_archived_users WHERE user_id=?",u.id);run("UPDATE p_users SET blocked=0 WHERE id=?",u.id);}
    if(base.action==='profile'){if(!base.name)throw new ApiError(400,"invalid_input");run("UPDATE p_users SET name=? WHERE id=?",base.name,u.id);}
    run("INSERT INTO p_company_actions VALUES(?,?,?,?,?)",base.eventId,u.id,actor,JSON.stringify(base),now());
    audit(actor,"company-member."+base.action,u.id,before,{...companyMemberView(u.id),eventId:base.eventId},base.reason);
    return companyMemberView(u.id);
  });
}
export function companyMemberView(user:string){return {name:one("SELECT name FROM p_users WHERE id=?",user)?.name,blocked:!!one("SELECT blocked FROM p_users WHERE id=?",user)?.blocked,creditToman:companyCredit(user),positions:companyPositionStatus(user),archived:!!one("SELECT user_id FROM p_archived_users WHERE user_id=?",user),history:all("SELECT a.action,a.reason,a.created_at,u.name actor FROM p_audit a JOIN p_users u ON u.id=a.actor_id WHERE a.entity_id=? ORDER BY a.created_at DESC LIMIT 100",user)};}
export function reviewCompanyPositions(){for(const g of all("SELECT user_id,last_status FROM p_company_positions")){const state=companyPositionStatus(g.user_id)!;if(g.last_status!==state.status){run("UPDATE p_company_positions SET last_status=? WHERE user_id=?",state.status,g.user_id);audit(g.user_id,"company-position."+state.status,g.user_id,{status:g.last_status},{status:state.status},"Automatic 35-day qualification review");}}}
