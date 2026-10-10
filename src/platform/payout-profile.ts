import {notifyInApp} from "./finance";
import { updatedCardSchedule } from "./card-schedule";
import { ApiError, hash } from "../server/http";
import { all, atomic, now, one, run } from "./schema";
import { audit, decrypt, encrypt } from "./security";

/** Bank details a member must register, and staff must verify, before any
 * rial withdrawal. Stored encrypted; members only ever see masked values. */
export { payoutProfileSchema } from "./payout-model";
export type PayoutDetails = { holderName: string; nationalId: string; cardNumber: string; iban: string; recipientType?: "self" | "heir"; inheritanceReference?: string };

const mask = (value: string, keep = 4) => "•".repeat(Math.max(0, value.length - keep)) + value.slice(-keep);

export function savePayoutProfile(userId: string, input: PayoutDetails) {
  const details: PayoutDetails = {
    recipientType: input.recipientType || "self",
    inheritanceReference: input.inheritanceReference,
    holderName: input.holderName,
    nationalId: input.nationalId,
    cardNumber: input.cardNumber,
    iban: input.iban,
  };
  const nationalHash = hash("national:" + details.nationalId);
  return atomic(() => {
    const owner = one("SELECT user_id FROM p_payout_profiles WHERE national_hash=?", nationalHash);
    if (owner && owner.user_id !== userId) throw new ApiError(409, "national_id_in_use");
    // Bank details must belong to the person who signed up.
    const registered = one("SELECT national_hash FROM p_identities WHERE user_id=?", userId);
    if(updatedCardSchedule() && !registered) throw new ApiError(409,"identity_required");
    if (details.recipientType === "heir" && (!registered || !details.inheritanceReference?.trim())) throw new ApiError(409,"inheritance_proof_required");
    if (details.recipientType !== "heir" && registered && registered.national_hash !== nationalHash) throw new ApiError(409, "national_id_mismatch");
    const before = one("SELECT status,iban_last4,card_last4 FROM p_payout_profiles WHERE user_id=?", userId);
    run(
      `INSERT INTO p_payout_profiles(user_id,data,national_hash,iban_last4,card_last4,status,reason,reviewed_by,reviewed_at,created_at,updated_at)
       VALUES(?,?,?,?,?,'pending','',NULL,NULL,?,?)
       ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,national_hash=excluded.national_hash,
         iban_last4=excluded.iban_last4,card_last4=excluded.card_last4,status='pending',reason='',
         reviewed_by=NULL,reviewed_at=NULL,updated_at=excluded.updated_at`,
      userId,
      encrypt(JSON.stringify(details)),
      nationalHash,
      details.iban.slice(-4),
      details.cardNumber.slice(-4),
      now(),
      now(),
    );
    audit(userId, "payout-profile.submit", userId, before ?? null, {
      iban_last4: details.iban.slice(-4),
      card_last4: details.cardNumber.slice(-4),
    });
    return payoutProfileView(userId);
  });
}

/** What the member sees: status and masked numbers only. */
export function payoutProfileView(userId: string) {
  const row = one("SELECT * FROM p_payout_profiles WHERE user_id=?", userId);
  if (!row) return null;
  const d = JSON.parse(decrypt(row.data)) as PayoutDetails;
  return {
    recipientType: d.recipientType || "self",
    inheritanceReference: d.inheritanceReference,
    status: row.status,
    reason: row.reason,
    holderName: d.holderName,
    nationalId: mask(d.nationalId, 3),
    cardNumber: mask(d.cardNumber),
    iban: "IR" + mask(d.iban.slice(2)),
    updatedAt: row.updated_at,
  };
}

export function payoutProfiles(status = "") {
  return all(
    "SELECT p.*,u.name,u.email,u.phone FROM p_payout_profiles p JOIN p_users u ON u.id=p.user_id WHERE (?='' OR p.status=?) ORDER BY p.status='pending' DESC,p.updated_at DESC LIMIT 200",
    status,
    status,
  ).map(({ data, national_hash: _, ...row }) => ({ ...row, ...(JSON.parse(decrypt(data)) as PayoutDetails) }));
}

export function reviewPayoutProfile(actor: string, userId: string, status: "verified" | "rejected", reason: string, ownershipReference = "") {
  return atomic(() => {
    const row = one("SELECT status,data FROM p_payout_profiles WHERE user_id=?", userId);
    if (!row) throw new ApiError(404, "not_found");
    if (row.status !== "pending") throw new ApiError(409, "invalid_state");
    if (status === "verified" && updatedCardSchedule()) {
      const details=JSON.parse(decrypt(row.data)) as PayoutDetails;
      if(!ownershipReference.trim() || !reason.trim()) throw new ApiError(409,"bank_ownership_proof_required");
      if(details.recipientType=== "heir" && !details.inheritanceReference?.trim()) throw new ApiError(409,"inheritance_proof_required");
      run("INSERT INTO p_payout_ownership VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET reference=excluded.reference,iban_hash=excluded.iban_hash,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at",userId,ownershipReference.trim(),hash(details.iban),actor,now());
    }
    if (status === "rejected" && !reason.trim()) throw new ApiError(400, "invalid_input");
    run(
      "UPDATE p_payout_profiles SET status=?,reason=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE user_id=?",
      status,
      reason.trim(),
      actor,
      now(),
      now(),
      userId,
    );
    audit(actor, "payout-profile.review", userId, { status: row.status }, { status }, reason);
    notifyInApp(userId,status === "verified" ? "اطلاعات بانکی تأیید شد" : "اطلاعات بانکی نیاز به اصلاح دارد","نتیجه بررسی اطلاعات بانکی در بخش کیف پول قابل مشاهده است.");
    return { ok: true };
  });
}

/** The verified IBAN a withdrawal is paid to. */
export function verifiedIban(userId: string) {
  const row = one("SELECT data,status FROM p_payout_profiles WHERE user_id=?", userId);
  if (!row || row.status !== "verified") throw new ApiError(403, "payout_profile_required");
  const details=JSON.parse(decrypt(row.data)) as PayoutDetails;
  if(updatedCardSchedule() && !one("SELECT user_id FROM p_payout_ownership WHERE user_id=? AND iban_hash=?",userId,hash(details.iban))) throw new ApiError(403,"bank_ownership_proof_required");
  return details.iban;
}
