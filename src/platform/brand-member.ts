import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { all, atomic, now, one, run, type Row } from "./schema";
import { audit, passwordHash } from "./security";
import { setting, saveSetting } from "./providers";
import { bindDirect, positionDesks, sevenLevelMode, assertDirectCapacity } from "./card-positions";
import { manageCompanyMember, companyPositionStatus } from "./company-members";
import { newReferralCode, referralStatus, setReferralPlacement } from "./referral";

export function brandManager(email?: string): Row {
  const managers = email
    ? all("SELECT * FROM p_users WHERE lower(email)=? AND role='superadmin' AND blocked=0", email.trim().toLowerCase())
    : all("SELECT * FROM p_users WHERE role='superadmin' AND blocked=0");
  if (managers.length !== 1) throw new Error("specify_one_active_manager_email");
  return managers[0];
}

/** Server-only provisioning: real company grants, never invented purchases. */
export function provisionBrandMember(input: unknown) {
  const d = z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase()),managerEmail:z.string().email().optional(),ordinal:z.number().int().min(1).max(8)}).strict().parse(input);
  return atomic(() => {
    if (!sevenLevelMode()) throw new Error("seven_level_plan_required");
    const manager = brandManager(d.managerEmail);
    const key = "brand_member_setup:"+d.email;
    const prior = setting(key);
    if (prior) {
      const saved = JSON.parse(prior);
      if (saved.managerId !== manager.id || saved.ordinal !== d.ordinal) throw new Error("brand_setup_conflict");
      const user = one("SELECT * FROM p_users WHERE id=?",saved.userId);
      if (!user || user.email !== d.email || user.sponsor_id !== manager.id) throw new Error("brand_setup_conflict");
      return output(user, manager, null, true);
    }
    if (one("SELECT id FROM p_users WHERE lower(email)=?",d.email)) throw new Error("email_already_exists_no_changes");
    assertDirectCapacity(manager.id);
    const choice = one("SELECT ordinal FROM p_referral_endpoint_choice WHERE user_id=?",manager.id)?.ordinal;
    if (choice && choice !== d.ordinal) throw new Error("manager_saved_placement_conflict");
    setReferralPlacement(manager,{ordinal:d.ordinal});
    const id = randomUUID(), password = "Hn!"+randomBytes(18).toString("base64url")+"9a";
    run("INSERT INTO p_users(id,email,name,password,referral_code,sponsor_id,created_at,last_seen,signup_ip,preferences) VALUES(?,?,?,?,?,?,?,?,?,?)",id,d.email,"هما نت",passwordHash(password),newReferralCode(),manager.id,now(),now(),"owner-authorized-brand-setup",JSON.stringify({email:false,sms:false,inApp:true}));
    run("INSERT INTO p_wallets(user_id) VALUES(?)",id);
    bindDirect(manager.id,id);
    manageCompanyMember(manager.id,{userId:id,action:"positions",desks:7,eventId:randomUUID(),reason:"Owner requested Homanet brand account with seven active company positions"});
    if (positionDesks(id)!==7) throw new Error("brand_activation_failed");
    saveSetting(key,JSON.stringify({userId:id,managerId:manager.id,ordinal:d.ordinal}));
    audit(manager.id,"brand-member.created",id,null,{email:d.email,name:"هما نت",desks:7,ordinal:d.ordinal},"Owner requested one account beneath the manager; no cash purchase or volume invented");
    return output(one("SELECT * FROM p_users WHERE id=?",id)!,manager,password,false);
  });
}

function output(user: Row,manager: Row,password:string|null,reused:boolean) {
  const referral = referralStatus(user);
  return {reused,email:user.email,name:user.name,password,passwordShownOnce:!reused,
    managerEmail:manager.email,placement:one("SELECT ordinal FROM p_card_direct_positions WHERE child_id=?",user.id)?.ordinal,
    activePositions:positionDesks(user.id),grant:companyPositionStatus(user.id),
    referralCode:referral.code,referralLink:"https://homanets.com/register?ref="+encodeURIComponent(referral.code),
    referralCapacity:referral.placement?.slots.filter(s=>s.enabled).length || 0,
    referralReady:referral.active,nextReferralPlacementRequired:true,
    branches:referral.placement?.slots};
}
