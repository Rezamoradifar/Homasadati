import { randomInt } from "node:crypto";
import { ApiError } from "../server/http";
import { setting } from "./providers";
import { referralCode } from "./registration-model";
import { atomic, now, one, run, Row } from "./schema";
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
  if (referralNeedsPurchase() && !hasPaidOrder(owner.id)) return undefined;
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
  return {
    code: user.referral_code,
    active: !user.blocked && (!requiresPurchase || hasPaidOrder(user.id)),
    requiresPurchase,
    canChange: !nextChange || nextChange <= now(),
    nextChange,
    directMembers: direct.total,
    directBuyers: direct.buyers || 0,
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
