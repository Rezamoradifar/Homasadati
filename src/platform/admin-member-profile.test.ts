// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash } from "../server/http";
import { adminMemberProfile, updateAdminMemberProfile } from "./admin-member-profile";
import type { AdminMemberProfilePatch } from "./admin-member-profile-types";
import { createCheckout } from "./checkout";
import { orderDocument } from "./order-document";
import { saveSetting } from "./providers";
import { all, now, one, platformDb, run, type Row } from "./schema";
import { decrypt, encrypt, session } from "./security";
import { testIdentity } from "./test-identity";

const directory = mkdtempSync(join(tmpdir(), "homa-admin-member-profile-"));
let actor: Row, target: string, addressId: string;

function member(role = "user", details = true) {
  const id = randomUUID(), identity = testIdentity(), timestamp = now();
  run(`INSERT INTO p_users(id,name,email,phone,password,role,referral_code,otp_secret,created_at,last_seen,signup_ip)
    VALUES(?,'نام اصلی',?,?,?, ?,?,?,?,?,'fixture')`, id, id + "@example.test", "+98" + identity.mobile.slice(1),
    "private-password", role, id, "private-otp", timestamp, timestamp);
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,1000000)", id);
  if (details) {
    run("UPDATE p_users SET name='مینا احمدی' WHERE id=?", id);
    run("INSERT INTO p_member_details VALUES(?,?,?,?)", id, JSON.stringify({
      firstName: "مینا", lastName: "احمدی", country: "ایران", city: "تهران",
      occupation: "طراح", language: "fa", interests: ["craft"],
    }), timestamp, timestamp);
    run("INSERT INTO p_identities VALUES(?,?,?,?)", id, hash("national:" + identity.nationalId), encrypt(identity.nationalId), timestamp);
  }
  const address = randomUUID();
  run("INSERT INTO p_addresses VALUES(?,?,?,'ایران','تهران','1234567890',?)",
    address, id, "خانه", "نشانی دقیق، پلاک ۱۲\nواحد ۳");
  return { id, address };
}

function patch(): AdminMemberProfilePatch {
  const profile = adminMemberProfile(actor, target);
  return { expectedVersion: profile.version, personal: { ...profile.personal },
    addresses: { upsert: profile.addresses.map(address => ({ ...address })), deleteIds: [] },
    reason: "اصلاح مشخصات با بررسی شرکت" };
}

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  process.env.APP_ORIGIN = "https://member-profile.test";
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  const owner = member("superadmin");
  actor = one("SELECT * FROM p_users WHERE id=?", owner.id)!;
});
beforeEach(() => {
  const fixture = member();
  target = fixture.id; addressId = fixture.address;
  saveSetting("commission_policy", JSON.stringify({ directBps: 0, levels: [], binaryBps: 0,
    maxPayoutBps: 3000, warningBps: 7000, criticalBps: 9000, withdrawMin: 1, withdrawMax: 1e9, paused: false }));
});
afterAll(() => { platformDb().close(); rmSync(directory, { recursive: true, force: true }); });

it("keeps historical order/contact/delivery snapshots while correcting the live profile and records the real actor", () => {
  const product = randomUUID();
  run(`INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at)
    VALUES(?,'کیف اصلی','fixture','leather','product',100000,10,1,?,?)`, product, now(), now());
  createCheckout(target, { items: [{ productId: product, quantity: 2 }], method: "wallet",
    expectedTotal: 200000, addressId, idempotencyKey: randomUUID() });
  const order = one("SELECT * FROM p_orders WHERE user_id=?", target)!;
  const document = orderDocument(order.id), savedPolicy = order.policy;
  session(target, "member"); session(target, "second member session"); session(actor.id, "company");
  const identity = testIdentity(), input = patch(), originalNationalId = input.personal.nationalId;
  input.personal.firstName = "نام"; input.personal.lastName = "اصلاح‌شده";
  input.personal.email = "  CORRECTED-" + target + "@EXAMPLE.TEST  ";
  input.personal.phone = identity.mobile;
  input.personal.nationalId = identity.nationalId;
  input.addresses.upsert[0].address = "نشانی فعلی، پلاک ۸";
  const result = updateAdminMemberProfile(actor, target, input);
  expect(result.personal.name).toBe("نام اصلاح‌شده");
  expect(result.personal.email).toBe("corrected-" + target + "@example.test");
  expect(result.personal.phone).toBe("+98" + identity.mobile.slice(1));
  expect(result.membership.contactVerifiedAt).toBe("");
  expect(all("SELECT * FROM p_sessions WHERE user_id=?", target)).toHaveLength(0);
  expect(all("SELECT * FROM p_sessions WHERE user_id=?", actor.id)).not.toHaveLength(0);
  expect(orderDocument(order.id)).toEqual(document);
  expect(one("SELECT policy FROM p_orders WHERE id=?", order.id)!.policy).toBe(savedPolicy);
  const stored = one("SELECT national_enc,national_hash FROM p_identities WHERE user_id=?", target)!;
  expect(stored.national_enc).not.toContain(identity.nationalId);
  expect(decrypt(stored.national_enc)).toBe(identity.nationalId);
  expect(stored.national_hash).toBe(hash("national:" + identity.nationalId));
  const entry = one("SELECT * FROM p_audit WHERE entity_id=? AND action='user.profile.update'", target)!;
  expect(entry.actor_id).toBe(actor.id);
  expect(entry.reason).toBe(input.reason);
  for (const value of [identity.nationalId, originalNationalId!, "private-password", "private-otp"])
    expect(entry.before_json + entry.after_json).not.toContain(value);
  expect(JSON.parse(entry.after_json).nationalIdChanged).toBe(true);
  const removal = patch();
  removal.addresses.upsert = [];
  removal.addresses.deleteIds = [addressId];
  updateAdminMemberProfile(actor, target, removal);
  expect(adminMemberProfile(actor, target).addresses).toHaveLength(0);
  expect(orderDocument(order.id)).toEqual(document);
  expect(one("SELECT policy FROM p_orders WHERE id=?", order.id)!.policy).toBe(savedPolicy);
});

it("preserves truthful existing contact verification and sessions when no login contact changes", () => {
  session(target, "member");
  const before = adminMemberProfile(actor, target), identityBefore = one("SELECT national_enc FROM p_identities WHERE user_id=?", target)!;
  const input = patch(); input.personal.occupation = "مهندس";
  const after = updateAdminMemberProfile(actor, target, input);
  expect(after.membership.contactVerifiedAt).toBe(before.membership.contactVerifiedAt);
  expect(after.membership.contactVerifiedAt).not.toBe("");
  expect(all("SELECT * FROM p_sessions WHERE user_id=?", target)).toHaveLength(1);
  expect(one("SELECT national_enc FROM p_identities WHERE user_id=?", target)).toEqual(identityBefore);
});

it.each(["upsert", "delete"])("rejects a foreign address %s atomically", operation => {
  const foreign = member(), before = adminMemberProfile(actor, target), input = patch();
  input.personal.occupation = "نباید ذخیره شود";
  if (operation === "upsert") input.addresses.upsert[0].id = foreign.address;
  else input.addresses.deleteIds.push(foreign.address);
  expect(() => updateAdminMemberProfile(actor, target, input)).toThrow("address_not_found");
  expect(adminMemberProfile(actor, target)).toEqual(before);
  expect(one("SELECT user_id FROM p_addresses WHERE id=?", foreign.address)!.user_id).toBe(foreign.id);
});

it("uses explicit owned address additions and deletions without deleting omitted addresses", () => {
  const input = patch();
  input.addresses.upsert = [{ label: "محل کار", country: "ایران", city: "شیراز", postalCode: "9876543210", address: "نشانی جدید محل کار" }];
  const added = updateAdminMemberProfile(actor, target, input);
  expect(added.addresses).toHaveLength(2);
  const second = patch(); second.addresses.deleteIds = [addressId];
  second.addresses.upsert = second.addresses.upsert.filter(address => address.id !== addressId);
  const removed = updateAdminMemberProfile(actor, target, second);
  expect(removed.addresses).toHaveLength(1);
  expect(removed.addresses[0].label).toBe("محل کار");
  expect(removed.addresses[0].id).not.toBe(addressId);
});

it("handles a legacy member without inventing identity or verification and creates details only on an explicit edit", () => {
  const legacy = member("user", false);
  target = legacy.id;
  const before = adminMemberProfile(actor, target);
  expect(before.personal).toMatchObject({ name: "نام اصلی", firstName: "", lastName: "", nationalId: null });
  expect(before.membership).toMatchObject({ contactVerifiedAt: "", detailsUpdatedAt: null, consent: null });
  expect(one("SELECT user_id FROM p_member_details WHERE user_id=?", target)).toBeUndefined();
  const input = patch();
  Object.assign(input.personal, { firstName: "نام", lastName: "تکمیل‌شده", country: "ایران", city: "تهران" });
  const after = updateAdminMemberProfile(actor, target, input);
  expect(after.personal.name).toBe("نام تکمیل‌شده");
  expect(after.membership.contactVerifiedAt).toBe("");
  expect(after.personal.nationalId).toBeNull();
});

it("rolls back earlier personal/address writes if identity encryption fails inside the transaction", () => {
  target = member("user", false).id;
  const before = adminMemberProfile(actor, target), input = patch();
  Object.assign(input.personal, { firstName: "نام", lastName: "نباید ذخیره شود", country: "ایران", city: "تهران",
    nationalId: testIdentity().nationalId });
  input.addresses.upsert[0].address = "نشانی نباید ذخیره شود";
  const key = process.env.PLATFORM_MASTER_KEY;
  process.env.PLATFORM_MASTER_KEY = "invalid";
  try {
    expect(() => updateAdminMemberProfile(actor, target, input)).toThrow("encryption_not_configured");
  } finally {
    process.env.PLATFORM_MASTER_KEY = key;
  }
  expect(adminMemberProfile(actor, target)).toEqual(before);
  expect(one("SELECT user_id FROM p_member_details WHERE user_id=?", target)).toBeUndefined();
  expect(one("SELECT user_id FROM p_identities WHERE user_id=?", target)).toBeUndefined();
});

it.each(["nationalId", "legalName"])("requires payout re-review after a %s correction without changing bank details or balances", field => {
  const before = adminMemberProfile(actor, target), timestamp = now();
  const bankData = encrypt(JSON.stringify({ holderName: before.personal.name, nationalId: before.personal.nationalId,
    cardNumber: "6037991234567890", iban: "IR00000000000000000000000000" }));
  run(`INSERT INTO p_payout_profiles(user_id,data,national_hash,iban_last4,card_last4,status,reason,reviewed_by,reviewed_at,created_at,updated_at)
    VALUES(?,?,?,'0000','7890','verified','old approval',?,?,?,?)`, target, bankData,
    hash("national:" + before.personal.nationalId), actor.id, timestamp, timestamp, timestamp);
  run("INSERT INTO p_payout_ownership VALUES(?,?,?,?,?)", target, "old-bank-proof", hash("old-iban"), actor.id, timestamp);
  const input = patch();
  if (field === "nationalId") input.personal.nationalId = testIdentity().nationalId;
  else input.personal.firstName = "نام اصلاح‌شده";
  updateAdminMemberProfile(actor, target, input);
  expect(one("SELECT status,data,reviewed_by,reviewed_at FROM p_payout_profiles WHERE user_id=?", target)).toEqual({
    status: "pending", data: bankData, reviewed_by: null, reviewed_at: null,
  });
  expect(one("SELECT user_id FROM p_payout_ownership WHERE user_id=?", target)).toBeUndefined();
  expect(one("SELECT available FROM p_wallets WHERE user_id=?", target)!.available).toBe(1000000);
});
