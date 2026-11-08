import { randomUUID } from "node:crypto";
import memberCopy from "./admin-member-copy.json";
import { ApiError, hash } from "../server/http";
import { assertAccess } from "./access";
import { adminMemberProfilePatchSchema } from "./admin-member-profile-model";
export { adminMemberProfilePatchSchema } from "./admin-member-profile-model";
import { all, atomic, now, one, run, type Row } from "./schema";
import { audit, decrypt, encrypt } from "./security";
import { id } from "./validation";
import type { AdminMemberProfileData, AdminMemberPersonal } from "./admin-member-profile-types";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function parseObject(value: unknown) {
  try { return object(JSON.parse(String(value))); } catch { return {}; }
}
const string = (value: unknown) => typeof value === "string" ? value : "";

function profileState(userId: string) {
  const user = one(`SELECT id,name,email,phone,preferences,role,blocked,created_at,last_seen,referral_code
    FROM p_users WHERE id=?`, userId);
  if (!user) throw new ApiError(404, "not_found");
  const details = one("SELECT details,contact_verified_at,updated_at FROM p_member_details WHERE user_id=?", userId);
  const identity = one("SELECT national_hash,national_enc,created_at FROM p_identities WHERE user_id=?", userId);
  const addresses = all("SELECT id,label,country,city,postal_code,address FROM p_addresses WHERE user_id=? ORDER BY id", userId);
  const version = hash(JSON.stringify({
    user: { name: user.name, email: user.email, phone: user.phone, preferences: user.preferences,
      role: user.role, blocked: user.blocked, referralCode: user.referral_code },
    details: details ?? null,
    identity: identity ? { hash: identity.national_hash, createdAt: identity.created_at } : null,
    addresses,
  }));
  return { user, details, identity, addresses, version };
}

function profileData(state: ReturnType<typeof profileState>): AdminMemberProfileData {
  const { user, details, identity, addresses, version } = state;
  const info = parseObject(details?.details);
  const preferences = parseObject(user.preferences);
  const consent = one("SELECT version,accepted_at FROM p_consents WHERE user_id=? ORDER BY accepted_at DESC LIMIT 1", user.id);
  return {
    id: user.id,
    version,
    personal: {
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      preferences: { email: preferences.email === true, sms: preferences.sms === true, inApp: preferences.inApp === true },
      firstName: string(info.firstName), lastName: string(info.lastName),
      country: string(info.country), city: string(info.city), occupation: string(info.occupation),
      language: info.language === "en" || info.language === "ar" ? info.language : "fa",
      interests: Array.isArray(info.interests) ? info.interests.filter((value): value is AdminMemberPersonal["interests"][number] =>
        ["tourism", "craft", "beauty", "ai", "leather"].includes(String(value))) : [],
      nationalId: identity ? decrypt(identity.national_enc) : null,
    },
    addresses: addresses.map(address => ({ id: address.id, label: address.label, country: address.country,
      city: address.city, postalCode: address.postal_code, address: address.address })),
    membership: {
      role: user.role, createdAt: user.created_at, lastSeen: user.last_seen,
      blocked: !!user.blocked, referralCode: user.referral_code,
      contactVerifiedAt: details?.contact_verified_at || "", detailsUpdatedAt: details?.updated_at ?? null,
      consent: consent ? { version: consent.version, acceptedAt: consent.accepted_at } : null,
    },
  };
}

/** Full personal data is available only through the existing company users permission. */
export function adminMemberProfile(actor: Row, userId: string): AdminMemberProfileData {
  assertAccess(actor, "users");
  return profileData(profileState(id.parse(userId)));
}

function auditProfile(profile: AdminMemberProfileData) {
  return {
    personal: { ...profile.personal, nationalId: profile.personal.nationalId ? "[redacted]" : null },
    addresses: profile.addresses,
    contactVerifiedAt: profile.membership.contactVerifiedAt,
  };
}

export function updateAdminMemberProfile(actor: Row, userId: string, input: unknown): AdminMemberProfileData {
  assertAccess(actor, "users", true);
  const target = id.parse(userId), data = adminMemberProfilePatchSchema.parse(input);
  return atomic(() => {
    const state = profileState(target);
    if ((state.user.role !== "user" || one("SELECT user_id FROM p_access_assignments WHERE user_id=?", target)) &&
      actor.role !== "superadmin") throw new ApiError(403, "forbidden");
    if (state.version !== data.expectedVersion) throw new ApiError(409, "profile_changed");
    const before = profileData(state);
    const personal = data.personal;
    if (personal.email && one("SELECT id FROM p_users WHERE lower(email)=? AND id!=?", personal.email, target))
      throw new ApiError(409, "email_in_use");
    if (personal.phone && one("SELECT id FROM p_users WHERE phone=? AND id!=?", personal.phone, target))
      throw new ApiError(409, "phone_in_use");
    const nationalHash = personal.nationalId ? hash("national:" + personal.nationalId) : null;
    if (nationalHash && (one("SELECT user_id FROM p_identities WHERE national_hash=? AND user_id!=?", nationalHash, target) ||
      one("SELECT user_id FROM p_payout_profiles WHERE national_hash=? AND user_id!=?", nationalHash, target)))
      throw new ApiError(409, "national_id_in_use");
    const ownedAddresses = new Set(state.addresses.map(address => address.id));
    for (const addressId of [...data.addresses.deleteIds,
      ...data.addresses.upsert.flatMap(address => address.id ? [address.id] : [])])
      if (!ownedAddresses.has(addressId)) throw new ApiError(404, "address_not_found");

    const fullName = [personal.firstName, personal.lastName].filter(Boolean).join(" ") || personal.name;
    const contactChanged = personal.email !== (state.user.email ?? null) || personal.phone !== (state.user.phone ?? null);
    const identityChanged = nationalHash !== (state.identity?.national_hash ?? null);
    const legalNameChanged = fullName !== state.user.name;
    const updated = now();
    run("UPDATE p_users SET name=?,email=?,phone=?,preferences=? WHERE id=?", fullName,
      personal.email, personal.phone, JSON.stringify(personal.preferences), target);
    const { firstName, lastName, country, city, occupation, language, interests } = personal;
    run(`INSERT INTO p_member_details(user_id,details,contact_verified_at,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET details=excluded.details,
      contact_verified_at=excluded.contact_verified_at,updated_at=excluded.updated_at`, target,
      JSON.stringify({ firstName, lastName, country, city, occupation, language, interests }),
      contactChanged ? "" : state.details?.contact_verified_at || "", updated);
    if (identityChanged) {
      if (personal.nationalId) run(`INSERT INTO p_identities(user_id,national_hash,national_enc,created_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET national_hash=excluded.national_hash,national_enc=excluded.national_enc`,
        target, nationalHash, encrypt(personal.nationalId), updated);
      else run("DELETE FROM p_identities WHERE user_id=?", target);
    }
    for (const addressId of data.addresses.deleteIds)
      run("DELETE FROM p_addresses WHERE id=? AND user_id=?", addressId, target);
    for (const address of data.addresses.upsert) {
      if (address.id) run("UPDATE p_addresses SET label=?,country=?,city=?,postal_code=?,address=? WHERE id=? AND user_id=?",
        address.label, address.country, address.city, address.postalCode, address.address, address.id, target);
      else run("INSERT INTO p_addresses(id,user_id,label,country,city,postal_code,address) VALUES(?,?,?,?,?,?,?)",
        randomUUID(), target, address.label, address.country, address.city, address.postalCode, address.address);
    }
    if (contactChanged) {
      run("DELETE FROM p_sessions WHERE user_id=?", target);
      run("DELETE FROM p_google_logins WHERE user_id=?", target);
      run("DELETE FROM p_google_challenges WHERE user_id=?", target);
    }
    const payout = one("SELECT status FROM p_payout_profiles WHERE user_id=?", target);
    const payoutReviewRequired = !!payout && (identityChanged || legalNameChanged);
    if (payoutReviewRequired) {
      run(`UPDATE p_payout_profiles SET status='pending',reason=?,
        reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE user_id=?`, memberCopy[personal.language].identityHint, updated, target);
      run("DELETE FROM p_payout_ownership WHERE user_id=?", target);
    }
    const after = profileData(profileState(target));
    audit(actor.id, "user.profile.update", target, auditProfile(before),
      { ...auditProfile(after), nationalIdChanged: identityChanged, payoutReviewRequired }, data.reason);
    return after;
  });
}
