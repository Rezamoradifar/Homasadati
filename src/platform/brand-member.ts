import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { all, atomic, now, one, run, type Row } from "./schema";
import { audit, passwordHash } from "./security";
import { setting, saveSetting } from "./providers";
import { bindDirect, positionDesks, sevenLevelMode, assertDirectCapacity } from "./card-positions";
import { DIRECT_PATHS, POSITION_PATHS } from "./card-position-model";
import { manageCompanyMember, companyPositionStatus } from "./company-members";
import { newReferralCode, referralStatus, setReferralPlacement } from "./referral";

export function brandManager(email?: string,code?: string): Row {
  if (code) {
    const manager=one("SELECT * FROM p_users WHERE lower(referral_code)=? AND role='superadmin' AND blocked=0",code.trim().toLowerCase())
      || one("SELECT u.* FROM p_referral_aliases a JOIN p_users u ON u.id=a.user_id WHERE lower(a.code)=? AND u.role='superadmin' AND u.blocked=0",code.trim().toLowerCase());
    if (!manager || (email && String(manager.email).toLowerCase()!==email.trim().toLowerCase())) throw new Error("manager_referral_not_found");
    return manager;
  }
  const managers = email
    ? all("SELECT * FROM p_users WHERE lower(email)=? AND role='superadmin' AND blocked=0", email.trim().toLowerCase())
    : all("SELECT * FROM p_users WHERE role='superadmin' AND blocked=0");
  if (managers.length !== 1) throw new Error("specify_one_active_manager_email");
  return managers[0];
}

/** Server-only provisioning: real company grants, never invented purchases. */
export function provisionBrandMember(input: unknown) {
  const d = z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase()),managerEmail:z.string().email().optional(),managerReferralCode:z.string().min(1).max(40).optional(),ordinal:z.number().int().min(1).max(8).optional(),desk:z.number().int().min(4).max(7).optional(),permanent:z.boolean().default(false)}).strict().parse(input);
  return atomic(() => {
    if (!sevenLevelMode()) throw new Error("seven_level_plan_required");
    const manager = brandManager(d.managerEmail,d.managerReferralCode);
    if ((d.ordinal===undefined)===(d.desk===undefined)) throw new Error("choose_one_placement_target");
    const key = "brand_member_setup:"+d.email;
    const prior = setting(key);
    if (prior) {
      const saved = JSON.parse(prior);
      if (saved.managerId !== manager.id || (d.ordinal!==undefined && saved.ordinal !== d.ordinal) || (d.desk!==undefined && !DIRECT_PATHS[saved.ordinal-1]?.startsWith(POSITION_PATHS[d.desk-1]))) throw new Error("brand_setup_conflict");
      const user = one("SELECT * FROM p_users WHERE id=?",saved.userId);
      if (!user || user.email !== d.email || user.sponsor_id !== manager.id) throw new Error("brand_setup_conflict");
      if (d.permanent) permanentPair(manager,user);
      return output(user, manager, null, true);
    }
    if (one("SELECT id FROM p_users WHERE lower(email)=?",d.email)) throw new Error("email_already_exists_no_changes");
    if (d.permanent) permanentManager(manager);
    assertDirectCapacity(manager.id);
    const choice = one("SELECT ordinal FROM p_referral_endpoint_choice WHERE user_id=?",manager.id)?.ordinal;
    const endpoints=DIRECT_PATHS.flatMap((path,i)=>d.desk!==undefined && path.startsWith(POSITION_PATHS[d.desk-1]) ? [i+1] : []);
    const ordinal=d.ordinal ?? (choice && endpoints.includes(choice) ? choice : endpoints.find(n=>!one("SELECT 1 FROM p_card_direct_positions WHERE sponsor_id=? AND ordinal=?",manager.id,n)));
    if (!ordinal) throw new Error("target_position_full");
    if (choice && choice !== ordinal) throw new Error("manager_saved_placement_conflict");
    setReferralPlacement(manager,{ordinal});
    const id = randomUUID(), password = "Hn!"+randomBytes(18).toString("base64url")+"9a";
    run("INSERT INTO p_users(id,email,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip,preferences) VALUES(?,?,?,?,?,?,?,?,?,?)",id,d.email,"هما نت",passwordHash(password),newReferralCode(),manager.id,now(),now(),"owner-authorized-brand-setup",JSON.stringify({email:false,sms:false,inApp:true}));
    run("INSERT INTO p_wallets(user_id) VALUES(?)",id);
    bindDirect(manager.id,id);
    manageCompanyMember(manager.id,{userId:id,action:"positions",desks:7,eventId:randomUUID(),reason:"Owner requested Homanet brand account with seven active company positions"});
    if (d.permanent) permanentPair(manager,one("SELECT * FROM p_users WHERE id=?",id)!);
    if (positionDesks(id)!==7) throw new Error("brand_activation_failed");
    saveSetting(key,JSON.stringify({userId:id,managerId:manager.id,ordinal}));
    audit(manager.id,"brand-member.created",id,null,{email:d.email,name:"هما نت",desks:7,ordinal},"Owner requested one account beneath the manager; no cash purchase or volume invented");
    return output(one("SELECT * FROM p_users WHERE id=?",id)!,manager,password,false);
  });
}

function output(user: Row,manager: Row,password:string|null,reused:boolean) {
  const referral = referralStatus(user);
  const binding = one("SELECT ordinal FROM p_card_direct_positions WHERE child_id=?",user.id);
  const path = binding ? DIRECT_PATHS[binding.ordinal-1] : undefined;
  return {reused,email:user.email,name:user.name,password,passwordShownOnce:!reused,
    managerEmail:manager.email,managerGrant:companyPositionStatus(manager.id),placement:binding?.ordinal,parentPosition:path ? POSITION_PATHS.findIndex(prefix=>prefix===path.slice(0,2))+1 : null,
    parentSide:path?.endsWith("L") ? "left" : "right",
    activePositions:positionDesks(user.id),grant:companyPositionStatus(user.id),
    referralCode:referral.code,referralLink:"https://homanets.com/register?ref="+encodeURIComponent(referral.code),
    referralCapacity:referral.placement?.slots.filter(s=>s.enabled).length || 0,
    referralReady:referral.active,nextReferralPlacementRequired:true,
    branches:referral.placement?.slots};
}


function permanentManager(manager:Row) {
  const designated=setting("company_position_permanent_owner");
  if (designated && designated!==manager.id) throw new Error("permanent_owner_conflict");
  const before=one("SELECT * FROM p_company_positions WHERE user_id=?",manager.id);
  if (designated===manager.id && before?.desks===7) return;
  run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET desks=7,actor_id=excluded.actor_id,last_status='qualified'",manager.id,7,now(),now(),manager.id,"qualified");
  saveSetting("company_position_permanent_owner",manager.id);
  audit(manager.id,"company-position.permanent-owner",manager.id,before,{desks:7,exempt:true},"Owner requested permanent CEO positions without deadline or purchase condition");
}
function permanentPair(manager:Row,user:Row) {
  if (user.role!=="user" || user.blocked || user.sponsor_id!==manager.id) throw new Error("brand_setup_conflict");
  const designated=setting("company_position_permanent_brand");
  if (designated && designated!==user.id) throw new Error("permanent_brand_conflict");
  permanentManager(manager);
  const before=one("SELECT * FROM p_company_positions WHERE user_id=?",user.id);
  if (designated===user.id && before?.desks===7 && before.actor_id===manager.id) return;
  run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET desks=7,actor_id=excluded.actor_id,last_status='qualified'",user.id,7,now(),now(),manager.id,"qualified");
  saveSetting("company_position_permanent_brand",user.id);
  audit(manager.id,"company-position.permanent-brand",user.id,before,{desks:7,exempt:true},"Owner requested permanent Homanet leader account positions without deadline or purchase condition");
}
