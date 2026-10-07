import { fourReferralMode, manualReferralMode, positionDesks, sevenLevelMode, positionDirectCapacity, positionMode } from "./card-positions";
import { fourDirectCapacity, DIRECT_PATHS } from "./card-position-model";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { ApiError } from "../server/http";
import { setting } from "./providers";
import { referralCode } from "./registration-model";
import { all, atomic, now, one, run, Row } from "./schema";
import { audit } from "./security";

/** Personal referral codes. A member may pick their own code; the previous
 * one is kept as an alias so links already shared keep working. When the
 * admin enables `referral_requires_purchase`, a code only accepts new
 * members once its owner has a paid, non-refunded purchase. */
const CHANGE_EVERY_MS = 30 * 86400000;
const RESERVED = new Set(["admin", "administrator", "support", "homa", "homanet", "homay", "root", "system", "test", "null"]);

/** A short code that is easy to read aloud and type: "hn-" and six characters
 * with look-alikes (0/o, 1/l/i) left out, about a billion combinations. */
const READABLE = "abcdefghjkmnpqrstuvwxyz23456789";
export function newReferralCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = "hn-" + Array.from({ length: 6 }, () => READABLE[randomInt(READABLE.length)]).join("");
    if (!ownerOf(code)) return code;
  }
  throw new ApiError(503, "referral_code_unavailable");
}

export const referralNeedsPurchase = () => setting("referral_requires_purchase") === "1";

function canInviteByPurchaseOrGrant(user: string) {
  if (positionMode() && positionDesks(user) > 0) return true;
  return hasPaidOrder(user);
}

function hasPaidOrder(user: string) {
  return !!one("SELECT 1 FROM p_orders WHERE user_id=? AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1", user);
}

function ownerOf(code: string) {
  return (
    one("SELECT * FROM p_users WHERE referral_code=?", code) ||
    one("SELECT u.* FROM p_referral_aliases a JOIN p_users u ON u.id=a.user_id WHERE a.code=?", code)
  );
}

/** The sponsor a code points to, or undefined when it cannot sign anyone up. */
export function sponsorByCode(code: string): Row | undefined {
  const owner = ownerOf(code.trim().toLowerCase());
  if (!owner || owner.blocked) return undefined;
  if (referralNeedsPurchase() && !canInviteByPurchaseOrGrant(owner.id)) return undefined;
  return owner;
}

export function referralStatus(user: Row) {
  const last = one("SELECT MAX(retired_at) at FROM p_referral_aliases WHERE user_id=?", user.id)?.at as string | null;
  const nextChange = last ? new Date(Date.parse(last) + CHANGE_EVERY_MS).toISOString() : null;
  const direct = one(
    `SELECT COUNT(*) total,
       SUM(EXISTS(SELECT 1 FROM p_orders o WHERE o.user_id=u.id AND o.paid_at IS NOT NULL AND o.refunded_at IS NULL)) buyers
     FROM p_users u WHERE u.sponsor_id=?`,
    user.id,
  )!;
  const requiresPurchase = referralNeedsPurchase();
  const four = fourReferralMode();
  const full = sevenLevelMode();
  const capacity = four || full ? positionDirectCapacity(positionDesks(user.id)) : 0;
  return {
    placement: full ? {
      mandatory:true,key:"ordinal",nextDesk:one("SELECT ordinal FROM p_referral_endpoint_choice WHERE user_id=?",user.id)?.ordinal ?? null,
      slots:DIRECT_PATHS.map((path,i)=>({desk:i+1,value:i+1,label:"شاخه "+(i+1).toLocaleString("fa-IR")+" · جایگاه "+({LL:4,LR:5,RL:6,RR:7} as Record<string,number>)[path.slice(0,2)].toLocaleString("fa-IR")+" · "+(path.endsWith("L") ? "چپ" : "راست"),enabled:i<capacity,occupied:!!one("SELECT 1 FROM p_card_direct_positions WHERE sponsor_id=? AND ordinal=?",user.id,i+1)})),
    } : four ? {
      mandatory: manualReferralMode(),
      nextDesk: one("SELECT desk FROM p_referral_placement WHERE user_id=?",user.id)?.desk ?? null,
      slots: [4,5,6,7].map(desk => ({desk,
        enabled: capacity > 0,
        occupied: !!one("SELECT 1 FROM p_card_direct_positions WHERE sponsor_id=? AND ordinal=?",user.id,desk-3),
      })),
    } : null,
    code: user.referral_code,
    active: !user.blocked && (!requiresPurchase || canInviteByPurchaseOrGrant(user.id)) &&
      (!(four || full) || direct.total < capacity) &&
      (!manualReferralMode() || !!one(full ? "SELECT 1 FROM p_referral_endpoint_choice WHERE user_id=?" : "SELECT 1 FROM p_referral_placement WHERE user_id=?",user.id)),
    requiresPurchase,
    canChange: !nextChange || nextChange <= now(),
    nextChange,
    directMembers: direct.total,
    directBuyers: direct.buyers || 0,
    // Joined in the last 30 days, and the latest five with first name only.
    recentMembers: one(
      "SELECT COUNT(*) n FROM p_users WHERE sponsor_id=? AND created_at>=?",
      user.id,
      new Date(Date.now() - 30 * 86400000).toISOString(),
    )!.n,
    latest: all(
      `SELECT u.name,u.created_at,
         EXISTS(SELECT 1 FROM p_orders o WHERE o.user_id=u.id AND o.paid_at IS NOT NULL AND o.refunded_at IS NULL) bought
       FROM p_users u WHERE u.sponsor_id=? ORDER BY u.created_at DESC LIMIT 5`,
      user.id,
    ).map((r) => ({ name: String(r.name).trim().split(/\s+/)[0], joined: r.created_at, bought: !!r.bought })),
  };
}

export function setReferralCode(user: Row, input: string) {
  const code = referralCode.parse(input);
  if (RESERVED.has(code)) throw new ApiError(409, "referral_code_taken");
  return atomic(() => {
    const status = referralStatus(user);
    if (code === user.referral_code) return status;
    if (!status.canChange) throw new ApiError(429, "referral_change_too_soon");
    const taken = ownerOf(code);
    if (taken && taken.id !== user.id) throw new ApiError(409, "referral_code_taken");
    // Reclaiming one's own old alias makes it the main code again.
    run("DELETE FROM p_referral_aliases WHERE code=? AND user_id=?", code, user.id);
    run("INSERT INTO p_referral_aliases(code,user_id,retired_at) VALUES(?,?,?)", user.referral_code, user.id, now());
    run("UPDATE p_users SET referral_code=? WHERE id=?", code, user.id);
    audit(user.id, "referral.code", user.id, { code: user.referral_code }, { code });
    return referralStatus({ ...user, referral_code: code });
  });
}

/** A member chooses the next incoming referral, never another member's placement. */
export function setReferralPlacement(user: Row, input: unknown) {
  if(sevenLevelMode()) {
    const {ordinal}=z.object({ordinal:z.number().int().min(1).max(8).nullable()}).strict().parse(input);
    return atomic(()=>{
      if(user.blocked) throw new ApiError(403,"forbidden");
      if(ordinal !== null) {
        if(ordinal>positionDirectCapacity(positionDesks(user.id))) throw new ApiError(409,"direct_capacity_reached");
        if(one("SELECT 1 FROM p_card_direct_positions WHERE sponsor_id=? AND ordinal=?",user.id,ordinal)) throw new ApiError(409,"direct_position_occupied");
        run("INSERT INTO p_referral_endpoint_choice VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET ordinal=excluded.ordinal,updated_at=excluded.updated_at",user.id,ordinal,now());
      } else run("DELETE FROM p_referral_endpoint_choice WHERE user_id=?",user.id);
      return referralStatus(user);
    });
  }

  const {desk} = z.object({desk:z.union([z.literal(4),z.literal(5),z.literal(6),z.literal(7),z.null()])}).strict().parse(input);
  return atomic(() => {
    if (user.blocked || !fourReferralMode()) throw new ApiError(403,"forbidden");
    if (desk !== null) {
      if (!fourDirectCapacity(positionDesks(user.id))) throw new ApiError(409,"direct_capacity_reached");
      if (one("SELECT 1 FROM p_card_direct_positions WHERE sponsor_id=? AND ordinal=?",user.id,desk-3))
        throw new ApiError(409,"direct_position_occupied");
      run("INSERT INTO p_referral_placement VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET desk=excluded.desk,updated_at=excluded.updated_at",user.id,desk,now());
    } else run("DELETE FROM p_referral_placement WHERE user_id=?",user.id);
    return referralStatus(user);
  });
}
