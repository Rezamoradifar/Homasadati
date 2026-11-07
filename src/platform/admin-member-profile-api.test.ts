// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash } from "../server/http";
import { handle } from "./api";
import { assignAccessRole, saveAccessRole } from "./access";
import { all, now, one, platformDb, run } from "./schema";
import { encrypt, session, SESSION_COOKIE } from "./security";
import { testIdentity } from "./test-identity";
import type { AdminMemberProfileData } from "./admin-member-profile-types";

const directory = mkdtempSync(join(tmpdir(), "homa-admin-member-profile-api-"));
const origin = "https://member-profile.test";
const actors: Record<string, string> = {};
let subject: string;

function member(role = "user") {
  const id = randomUUID(), identity = testIdentity(), timestamp = now();
  run(
    "INSERT INTO p_users(id,email,phone,name,password,role,referral_code,otp_secret,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id, id + "@example.test", "+98" + identity.mobile.slice(1), "Original Member",
    "private-password-canary", role, id, "private-otp-canary", timestamp, timestamp, "private-ip-canary",
  );
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,25000)", id);
  run("INSERT INTO p_member_details VALUES(?,?,?,?)", id, JSON.stringify({
    firstName: "Original", lastName: "Member", country: "Iran", city: "Tehran",
    occupation: "Designer", language: "en", interests: ["craft"],
  }), timestamp, timestamp);
  run("INSERT INTO p_identities VALUES(?,?,?,?)", id, hash("national:" + identity.nationalId), encrypt(identity.nationalId), timestamp);
  run("INSERT INTO p_consents VALUES(?,?,?,1,1,1,0,?)", randomUUID(), id, "test-terms-v1", timestamp);
  run("INSERT INTO p_addresses VALUES(?,?,?,?,?,?,?)", randomUUID(), id, "Home", "Iran", "Tehran", "1234567890", "Original address, unit 1");
  return id;
}

function cookie(actor: string) {
  return SESSION_COOKIE + "=" + session(actor, "admin-member-profile-test");
}

function request(target: string, actor: string | null = actors.superadmin, method = "GET", body?: unknown) {
  const path = "admin/users/" + target + "/profile";
  return handle(new Request(origin + "/api/platform/" + path, {
    method,
    headers: { origin, host: "member-profile.test", "content-type": "application/json", cookie: actor ? cookie(actor) : "" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
  }), path.split("/"));
}

async function profile(target = subject, actor = actors.superadmin) {
  const response = await request(target, actor);
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result as AdminMemberProfileData;
}

function patch(data: AdminMemberProfileData) {
  return {
    expectedVersion: data.version,
    personal: { ...data.personal },
    addresses: { upsert: data.addresses.map(address => ({ ...address })), deleteIds: [] as string[] },
    reason: "Correct member details after verification",
  };
}

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  process.env.APP_ORIGIN = origin;
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  for (const role of ["superadmin", "support", "finance", "content", "user"])
    actors[role] = member(role);
});

beforeEach(() => { subject = member(); });

afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("requires a session before exposing or updating a member profile", async () => {
  expect((await request(subject, null)).status).toBe(401);
  expect((await request(subject, null, "PATCH", patch(await profile()))).status).toBe(401);
});

it.each(["user", "finance", "content"])("denies %s without users permissions", async role => {
  const input = patch(await profile());
  expect((await request(subject, actors[role])).status).toBe(403);
  expect((await request(subject, actors[role], "PATCH", input)).status).toBe(403);
});

it.each(["superadmin", "support"])("allows %s to read the selected member through a private whitelist", async role => {
  const response = await request(subject, actors[role]);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const data = await response.json();
  expect(Object.keys(data).sort()).toEqual(["addresses", "id", "membership", "personal", "version"]);
  expect(data.id).toBe(subject);
  expect(data.personal).toMatchObject({ firstName: "Original", lastName: "Member", name: "Original Member", country: "Iran", city: "Tehran", occupation: "Designer", language: "en", interests: ["craft"] });
  expect(data.personal.nationalId).toMatch(/^\d{10}$/);
  expect(data.addresses).toEqual([expect.objectContaining({ city: "Tehran", postalCode: "1234567890", address: "Original address, unit 1" })]);
  const serialized = JSON.stringify(data);
  for (const secret of ["private-password-canary", "private-otp-canary", "private-ip-canary", "national_hash", "national_enc", "otp_secret", "otp_pending", "token_hash"])
    expect(serialized).not.toContain(secret);
  expect(data).not.toHaveProperty("wallet");
});

it("lets support update ordinary member details, deriving the full name and preserving membership and balances", async () => {
  const before = await profile(), input = patch(before);
  input.personal.firstName = "Corrected";
  input.personal.lastName = "Recipient";
  input.personal.city = "Shiraz";
  input.personal.occupation = "Engineer";
  input.personal.preferences = { email: false, sms: true, inApp: true };
  input.addresses.upsert[0].address = "Corrected address, unit 7";
  const securityBefore = one("SELECT password,otp_secret,role,referral_code,blocked FROM p_users WHERE id=?", subject);
  const consentBefore = all("SELECT * FROM p_consents WHERE user_id=?", subject);
  const response = await request(subject, actors.support, "PATCH", input);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const after = await profile();
  expect(after.personal).toMatchObject({ name: "Corrected Recipient", firstName: "Corrected", lastName: "Recipient", city: "Shiraz", occupation: "Engineer", preferences: { email: false, sms: true, inApp: true } });
  expect(after.addresses[0].address).toBe("Corrected address, unit 7");
  expect(after.version).not.toBe(before.version);
  expect(one("SELECT password,otp_secret,role,referral_code,blocked FROM p_users WHERE id=?", subject)).toEqual(securityBefore);
  expect(one("SELECT available FROM p_wallets WHERE user_id=?", subject)?.available).toBe(25000);
  expect(all("SELECT * FROM p_consents WHERE user_id=?", subject)).toEqual(consentBefore);
});

it("honors delegated read and write independently and immediately revokes access", async () => {
  const delegated = member(), role = saveAccessRole(actors.superadmin, {
    name: "Read member profiles", permissions: ["users:read"], active: true, reason: "Test delegation",
  });
  assignAccessRole(actors.superadmin, { userId: delegated, roleId: role.id, assigned: true, reason: "Test assignment" });
  expect((await request(subject, delegated)).status).toBe(200);
  expect((await request(subject, delegated, "PATCH", patch(await profile()))).status).toBe(403);
  assignAccessRole(actors.superadmin, { userId: delegated, roleId: role.id, assigned: false, reason: "Test revocation" });
  expect((await request(subject, delegated)).status).toBe(403);

  const writeRole = saveAccessRole(actors.superadmin, {
    name: "Write member profiles", permissions: ["users:write"], active: true, reason: "Test delegation",
  });
  assignAccessRole(actors.superadmin, { userId: delegated, roleId: writeRole.id, assigned: true, reason: "Test assignment" });
  expect((await request(subject, delegated)).status).toBe(403);
  const input = patch(await profile());
  input.personal.occupation = "Delegated correction";
  expect((await request(subject, delegated, "PATCH", input)).status).toBe(200);
});

it.each(["support", "finance", "superadmin"])("reserves edits of a %s target for superadmin", async role => {
  const privileged = member(role), input = patch(await profile(privileged));
  input.personal.occupation = "Corrected by owner";
  expect((await request(privileged, actors.support, "PATCH", input)).status).toBe(403);
  expect((await request(privileged, actors.superadmin, "PATCH", input)).status).toBe(200);
});

it("reserves edits of a delegated target for superadmin even when its built-in role is user", async () => {
  const role = saveAccessRole(actors.superadmin, {
    name: "Delegated catalog reader", permissions: ["products:read"], active: true, reason: "Test role",
  });
  assignAccessRole(actors.superadmin, { userId: subject, roleId: role.id, assigned: true, reason: "Test assignment" });
  const input = patch(await profile());
  input.personal.occupation = "Owner correction";
  expect((await request(subject, actors.support, "PATCH", input)).status).toBe(403);
  expect((await request(subject, actors.superadmin, "PATCH", input)).status).toBe(200);
});

it.each(["email", "phone", "nationalId"] as const)("rejects a duplicate %s and rolls back all profile and address changes", async field => {
  const other = await profile(member()), before = await profile(), input = patch(before);
  input.personal[field] = other.personal[field];
  input.personal.firstName = "Must not persist";
  input.addresses.upsert[0].address = "Must not persist address";
  const response = await request(subject, actors.superadmin, "PATCH", input);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(409);
  expect(await profile()).toEqual(before);
});

it("rejects stale versions without overwriting a later successful edit", async () => {
  const before = await profile(), first = patch(before), stale = patch(before);
  first.personal.occupation = "First correction";
  stale.personal.occupation = "Stale overwrite";
  expect((await request(subject, actors.superadmin, "PATCH", first)).status).toBe(200);
  const saved = await profile();
  expect((await request(subject, actors.superadmin, "PATCH", stale)).status).toBe(409);
  expect(await profile()).toEqual(saved);
});

it("rejects role, password, balance and referral mass assignment at both payload levels", async () => {
  const before = await profile(), input = patch(before);
  for (const extra of [{ role: "superadmin" }, { password: "attacker-password" }, { balance: 999999 }, { referralCode: "attacker-code" }]) {
    expect((await request(subject, actors.superadmin, "PATCH", { ...input, ...extra })).status).toBe(400);
    expect((await request(subject, actors.superadmin, "PATCH", { ...input, personal: { ...input.personal, ...extra } })).status).toBe(400);
  }
  expect(await profile()).toEqual(before);
  expect(one("SELECT available FROM p_wallets WHERE user_id=?", subject)?.available).toBe(25000);
});

it("returns not-found for unknown members and invalid-input for malformed identifiers", async () => {
  expect((await request(randomUUID())).status).toBe(404);
  expect((await request("not-a-uuid")).status).toBe(400);
});
