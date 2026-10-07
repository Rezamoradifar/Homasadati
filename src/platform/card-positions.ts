import {companyPositionStatus} from "./company-members";
import { mondayStart, updatedCardSchedule } from "./card-schedule";
import { ApiError } from "../server/http";
import { all, one, run, now, atomic } from "./schema";
import { setting, saveSetting } from "./providers";
import { desksForPurchase } from "./card-levels";
import { POSITION_PATHS, DIRECT_PATHS, directCapacity, directRoutes, FOUR_DIRECT_PATHS, FOUR_REFERRAL_VERSION, fourDirectCapacity, fourDirectRoutes } from "./card-position-model";
export const fourReferralMode = () => setting("seven_card_position_version") === FOUR_REFERRAL_VERSION;
export const positionMode = () => fourReferralMode() || setting("seven_card_position_version") === "aa-2026-10-06";
const capacity = (desks: number) => fourReferralMode() ? fourDirectCapacity(desks) : directCapacity(desks);
/** Confirmed purchases light positions immediately; income waits for maturity. */
export function positionDesks(user: string, at=Date.now()) {
  return Math.max(companyPositionStatus(user,at)?.activeDesks || 0,desksForPurchase(one("SELECT COALESCE(SUM(amount),0) n FROM p_orders WHERE user_id=? AND paid_at IS NOT NULL AND paid_at>=? AND refunded_at IS NULL AND status NOT IN ('cancelled','refunded') AND payment_method!='company_credit' AND paid_at<=?",user,new Date(Number(setting("seven_card_live_since") || 0)).toISOString(),new Date(at).toISOString())!.n));
}
export function assertDirectCapacity(sponsor: string, excluding?: string) {
  const count = one("SELECT COUNT(*) n FROM p_users WHERE sponsor_id=? AND id!=?",sponsor,excluding || "")!.n;
  if (count >= capacity(positionDesks(sponsor))) throw new ApiError(409,"direct_capacity_reached");
}
export function bindDirect(sponsor: string, child: string) {
  return atomic(() => {
    const prior = one("SELECT * FROM p_card_direct_positions WHERE child_id=?",child);
    if (prior) { if(prior.sponsor_id !== sponsor) throw new ApiError(409,"direct_position_locked"); return prior; }
    const used = all("SELECT ordinal FROM p_card_direct_positions WHERE sponsor_id=?",sponsor).map(x=>x.ordinal);
    const chosen = fourReferralMode() ? one("SELECT desk FROM p_referral_placement WHERE user_id=?",sponsor)?.desk : null;
    const ordinal = chosen ? chosen - 3 : Array.from({length:8},(_,i)=>i+1).find(x=>!used.includes(x));
    if (chosen && used.includes(ordinal)) throw new ApiError(409,"direct_position_occupied");
    if (!ordinal || ordinal > capacity(positionDesks(sponsor))) throw new ApiError(409,"direct_capacity_reached");
    run("INSERT INTO p_card_direct_positions VALUES(?,?,?,?)",child,sponsor,ordinal,now());
    if (chosen) run("DELETE FROM p_referral_placement WHERE user_id=?",sponsor);
    return {child_id:child,sponsor_id:sponsor,ordinal};
  });
}
/** Migration refuses any existing financial history or unresolved placement. */
export function configurePositions() {
  return atomic(() => {
    if (positionMode()) return;
    if(!updatedCardSchedule()) throw new ApiError(409,"approved_plan_rules_required");
    if (setting("seven_card_live") === "1" || one("SELECT COUNT(*) n FROM p_card_orders")!.n) throw new ApiError(409,"position_history_review_required");
    for (const s of all("SELECT sponsor_id,COUNT(*) n FROM p_users WHERE sponsor_id IS NOT NULL GROUP BY sponsor_id")) {
      if(s.n > directCapacity(positionDesks(s.sponsor_id))) throw new ApiError(409,"existing_direct_capacity_conflict");
      for(const u of all("SELECT id FROM p_users WHERE sponsor_id=? ORDER BY created_at,id",s.sponsor_id)) bindDirect(s.sponsor_id,u.id);
    }
    saveSetting("seven_card_position_version","aa-2026-10-06");
  });
}
export function positionVolume(user: string, desk: number, leg: string, column = "remaining") {
  if(!["remaining","volume"].includes(column)) throw new Error("invalid_column");
  return one(`SELECT COALESCE(SUM(${column}),0) n FROM p_card_position_lots WHERE user_id=? AND desk=? AND leg=? AND void=0`,user,desk,leg)!.n as number;
}
export function positionAncestors(buyer: string) {
  const routes: {user:string;desk:number;leg:string}[]=[];
  const seen=new Set([buyer]);let child=buyer;
  for(let depth=0;depth<100000;depth++) {
    const binding=one("SELECT * FROM p_card_direct_positions WHERE child_id=?",child);
    if(!binding) break;
    if(seen.has(binding.sponsor_id)) throw new ApiError(409,"network_cycle");
    seen.add(binding.sponsor_id);
    // All seven positions carry volume, including dormant ones; own purchases never enter here.
    routes.push(...(fourReferralMode() ? fourDirectRoutes : directRoutes)(binding.ordinal,7).map(x=>({user:binding.sponsor_id,...x})));
    child=binding.sponsor_id;
  }
  return routes;
}
export function positionPath(top: string, target: string) {
  const path:{id:string;name:string}[]=[];const seen=new Set<string>();let current=target;
  while(current && !seen.has(current)) {
    seen.add(current);const u=one("SELECT id,name FROM p_users WHERE id=?",current);if(!u) return null;
    path.unshift({id:u.id,name:u.name});if(current===top)return path;
    current=one("SELECT sponsor_id FROM p_card_direct_positions WHERE child_id=?",current)?.sponsor_id;
  }
  return null;
}
export function personalPositionTree(user: string) {
  const desks=positionDesks(user);
  const directs=all("SELECT d.ordinal,d.child_id,u.name FROM p_card_direct_positions d JOIN p_users u ON u.id=d.child_id WHERE d.sponsor_id=? ORDER BY d.ordinal",user);
  const build=(desk:number):any=>({desk,path:POSITION_PATHS[desk-1],active:desk<=desks,
    left:desk<4?build(desk*2):null,right:desk<4?build(desk*2+1):null,
    leftVolume:positionVolume(user,desk,"left","volume"),rightVolume:positionVolume(user,desk,"right","volume"),
    weeklySales:one("SELECT COALESCE(SUM(l.volume),0) n FROM p_card_position_lots l JOIN p_orders o ON o.id=l.order_id WHERE l.user_id=? AND l.desk=? AND l.void=0 AND o.paid_at>=?",user,desk,new Date(mondayStart(Date.now())).toISOString())!.n,
    totalSales:positionVolume(user,desk,"left","volume")+positionVolume(user,desk,"right","volume"),
    savings:{left:positionVolume(user,desk,"left"),right:positionVolume(user,desk,"right")}});
  return {version:fourReferralMode() ? FOUR_REFERRAL_VERSION : "aa-2026-10-06",member:one("SELECT id,name,referral_code,created_at FROM p_users WHERE id=?",user),company:companyPositionStatus(user),desks,directCapacity:capacity(desks),tree:build(1),
    directs:(fourReferralMode() ? FOUR_DIRECT_PATHS : DIRECT_PATHS).map((path,i)=>({ordinal:i+1,desk:fourReferralMode() ? i+4 : null,path,enabled:i<capacity(desks),member:directs.find(d=>d.ordinal===i+1) || null}))};
}

/** Never reinterpret an existing binding or a historical financial route. */
export function configureFourReferrals() {
  return atomic(() => {
    if (fourReferralMode()) return;
    if (!updatedCardSchedule()) throw new ApiError(409,"approved_plan_rules_required");
    if (setting("seven_card_live") === "1" ||
        one("SELECT COUNT(*) n FROM p_card_orders")!.n ||
        one("SELECT COUNT(*) n FROM p_card_position_lots")!.n ||
        one("SELECT COUNT(*) n FROM p_card_matches")!.n)
      throw new ApiError(409,"position_history_review_required");
    if (one("SELECT COUNT(*) n FROM p_card_direct_positions")!.n ||
        one("SELECT COUNT(*) n FROM p_users WHERE sponsor_id IS NOT NULL")!.n)
      throw new ApiError(409,"existing_direct_position_review_required");
    saveSetting("seven_card_position_version", FOUR_REFERRAL_VERSION);
  });
}
