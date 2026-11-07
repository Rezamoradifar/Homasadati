// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "./api";
import { assignAccessRole, saveAccessRole } from "./access";
import { all, now, one, platformDb, run } from "./schema";
import { session, SESSION_COOKIE } from "./security";

const directory = mkdtempSync(join(tmpdir(), "homa-company-member-api-"));
const origin = "https://company-member.test";
let owner: string, target: string, other: string, ownerCookie: string, targetCookie: string, addressId: string;

function member(role = "user", available = 1000) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,'unused',?,?,?,?,?)",
    id, id + "@example.test", "Member " + id, role, id, now(), now(), "test",
  );
  run("INSERT INTO p_wallets(user_id,available) VALUES(?,?)", id, available);
  return id;
}

function cookie(actor: string) {
  return SESSION_COOKIE + "=" + session(actor, "company-member-test");
}

function request(path: string, auth = ownerCookie, method = "GET", body?: unknown, selected?: string) {
  return handle(new Request(origin + "/api/platform/" + path, {
    method,
    headers: {
      origin, host: "company-member.test", "content-type": "application/json", cookie: auth,
      ...(selected ? { "x-homa-company-member": selected } : {}),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
  }), path.split("/"));
}

async function begin(selected = target, auth = ownerCookie) {
  const response = await request("admin/member-access", auth, "POST", { userId: selected, reason: "Help member complete their profile" });
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return response.json();
}

async function me(auth = ownerCookie, selected?: string) {
  const response = await request("me", auth, "GET", undefined, selected);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  return (await response.json()).user;
}

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  process.env.APP_ORIGIN = origin;
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
});

beforeEach(() => {
  owner = member("superadmin", 9000);
  target = member("user", 2000);
  other = member("user", 3000);
  ownerCookie = cookie(owner);
  targetCookie = cookie(target);
  addressId = randomUUID();
  run("INSERT INTO p_addresses VALUES(?,?,?,?,?,?,?)", addressId, target, "Target home", "Iran", "Tehran", "1234567890", "Target delivery address, unit 1");
});

afterEach(() => vi.restoreAllMocks());

afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("enters a selected ordinary member without swapping or rotating the owner's session", async () => {
  const started = Date.now(), lease = await begin();
  expect(lease).toMatchObject({ userId: target, targetName: one("SELECT name FROM p_users WHERE id=?", target)?.name });
  expect(lease.expiresAt - started).toBeGreaterThanOrEqual(29 * 60 * 1000);
  expect(lease.expiresAt - started).toBeLessThanOrEqual(31 * 60 * 1000);
  const selected = await me(ownerCookie, target);
  expect(selected.id).toBe(target);
  expect(selected.role).toBe("user");
  expect(selected.companyAccess).toEqual({
    actorId: owner, actorName: one("SELECT name FROM p_users WHERE id=?", owner)?.name,
    targetId: target, targetName: one("SELECT name FROM p_users WHERE id=?", target)?.name,
    expiresAt: new Date(lease.expiresAt).toISOString(),
  });
  expect((await me()).id).toBe(owner);
  expect((await me()).role).toBe("superadmin");
  expect(one("SELECT COUNT(*) n FROM p_sessions WHERE user_id=?", owner)?.n).toBe(1);
  expect((await me(targetCookie)).id).toBe(target);
});

it("requires superadmin to start or stop company member access", async () => {
  expect((await request("admin/member-access", "", "POST", { userId: target })).status).toBe(401);
  for (const role of ["user", "support", "finance", "content"]) {
    const auth = cookie(member(role));
    expect((await request("admin/member-access", auth, "POST", { userId: target })).status).toBe(403);
    expect((await request("admin/member-access", auth, "DELETE", { userId: target })).status).toBe(403);
  }
});

it("rejects self, privileged, blocked, archived and delegated targets", async () => {
  expect((await request("admin/member-access", ownerCookie, "POST", { userId: owner })).status).toBe(403);
  for (const role of ["support", "finance", "content", "superadmin"])
    expect((await request("admin/member-access", ownerCookie, "POST", { userId: member(role) })).status).toBe(403);
  run("UPDATE p_users SET blocked=1 WHERE id=?", other);
  expect((await request("admin/member-access", ownerCookie, "POST", { userId: other })).status).toBe(403);
  const archived = member();
  run("INSERT INTO p_archived_users VALUES(?,?,?)", archived, now(), owner);
  expect((await request("admin/member-access", ownerCookie, "POST", { userId: archived })).status).toBe(403);
  const role = saveAccessRole(owner, { name: "Delegated member", permissions: ["products:read"], active: true, reason: "Test target" });
  assignAccessRole(owner, { userId: target, roleId: role.id, assigned: true, reason: "Test assignment" });
  expect((await request("admin/member-access", ownerCookie, "POST", { userId: target })).status).toBe(403);
});

it("binds access to the initiating owner session and rejects forged or unleased headers", async () => {
  expect((await request("me", ownerCookie, "GET", undefined, target)).status).toBe(403);
  await begin();
  expect((await request("me", targetCookie, "GET", undefined, target)).status).toBe(403);
  expect((await request("me", cookie(owner), "GET", undefined, target)).status).toBe(403);
  expect((await request("me", cookie(member("superadmin")), "GET", undefined, target)).status).toBe(403);
  expect((await request("me", ownerCookie, "GET", undefined, other)).status).toBe(403);
  expect((await request("me", ownerCookie, "GET", undefined, "not-a-uuid")).status).toBe(400);
});

it("reads the target's actual dashboard and addresses without leaking into other request contexts", async () => {
  await begin();
  const responses = await Promise.all([
    request("me", ownerCookie, "GET", undefined, target),
    request("me", ownerCookie),
    request("me", targetCookie),
    request("me", cookie(other)),
    request("dashboard", ownerCookie, "GET", undefined, target),
    request("dashboard", ownerCookie),
    request("addresses", ownerCookie, "GET", undefined, target),
    request("addresses", ownerCookie),
  ]);
  for (const response of responses) expect(response.status).toBe(200);
  const data = await Promise.all(responses.map(response => response.json()));
  expect(data.slice(0, 4).map(value => value.user.id)).toEqual([target, owner, target, other]);
  expect(data[0].user.companyAccess).toBeTruthy();
  expect(data[1].user.companyAccess).toBeFalsy();
  expect(data[2].user.companyAccess).toBeFalsy();
  expect(data[4].wallet.available).toBe(2000);
  expect(data[5].wallet.available).toBe(9000);
  expect(data[6].rows).toEqual([expect.objectContaining({ id: addressId, user_id: target })]);
  expect(data[7].rows).toEqual([]);
  expect((await me()).id).toBe(owner);
});

it("keeps two selected member tabs independent and stops only the requested lease", async () => {
  await begin(target);
  await begin(other);
  const selected = await Promise.all([
    me(ownerCookie, target), me(ownerCookie, other), me(),
    request("dashboard", ownerCookie, "GET", undefined, target).then(response => response.json()),
    request("dashboard", ownerCookie, "GET", undefined, other).then(response => response.json()),
  ]);
  expect(selected.slice(0, 3).map(user => user.id)).toEqual([target, other, owner]);
  expect(selected[0].companyAccess.targetId).toBe(target);
  expect(selected[1].companyAccess.targetId).toBe(other);
  expect(selected[3].wallet.available).toBe(2000);
  expect(selected[4].wallet.available).toBe(3000);
  const stopped = await request("admin/member-access", ownerCookie, "DELETE", { userId: target });
  expect(stopped.status).toBe(200);
  expect(stopped.headers.get("set-cookie")).toBeNull();
  expect((await request("me", ownerCookie, "GET", undefined, target)).status).toBe(403);
  expect((await me(ownerCookie, other)).id).toBe(other);
  expect((await me()).id).toBe(owner);
  expect((await me()).role).toBe("superadmin");
});

it("allows nonfinancial member corrections and records the real owner as the audit actor", async () => {
  await begin();
  const ownerName = one("SELECT name FROM p_users WHERE id=?", owner)?.name;
  const beforeAudit = one("SELECT COUNT(*) n FROM p_audit")!.n;
  const profile = await request("profile", ownerCookie, "PATCH", { name: "Corrected member", preferences: { email: false, sms: true, inApp: true } }, target);
  expect(profile.status, JSON.stringify(await profile.clone().json())).toBe(200);
  const details = await request("member-details", ownerCookie, "PATCH", {
    firstName: "Corrected", lastName: "Member", country: "Iran", city: "Shiraz", occupation: "Designer", language: "en", interests: ["craft"],
  }, target);
  expect(details.status, JSON.stringify(await details.clone().json())).toBe(200);
  const address = await request("addresses", ownerCookie, "PATCH", {
    id: addressId, label: "Corrected home", country: "Iran", city: "Shiraz", postal_code: "9876543210", address: "Corrected target address, unit 7",
  }, target);
  expect(address.status, JSON.stringify(await address.clone().json())).toBe(200);
  expect(one("SELECT name FROM p_users WHERE id=?", target)?.name).toBe("Corrected Member");
  expect(one("SELECT name FROM p_users WHERE id=?", owner)?.name).toBe(ownerName);
  expect(one("SELECT city,address FROM p_addresses WHERE id=?", addressId)).toEqual({ city: "Shiraz", address: "Corrected target address, unit 7" });
  const newAudit = all("SELECT actor_id,action,entity_id,after_json FROM p_audit ORDER BY rowid").slice(beforeAudit);
  expect(newAudit.length).toBeGreaterThanOrEqual(3);
  for (const row of newAudit) expect(row.actor_id).toBe(owner);
  expect(newAudit.some(row => row.entity_id === target)).toBe(true);
  expect(newAudit.some(row => JSON.parse(row.after_json)?.companyAccess?.targetId === target)).toBe(true);
  expect(one("SELECT available FROM p_wallets WHERE user_id=?", target)?.available).toBe(2000);
  expect((await me()).id).toBe(owner);
});

it("keeps simultaneous selected-member and regular-member writes isolated across request-body awaits", async () => {
  await begin();
  const ownerName = one("SELECT name FROM p_users WHERE id=?", owner)?.name;
  const preferences = { email: true, sms: false, inApp: true };
  const responses = await Promise.all([
    request("profile", ownerCookie, "PATCH", { name: "Company corrected target", preferences }, target),
    request("profile", cookie(other), "PATCH", { name: "Regular member correction", preferences }),
    request("me", ownerCookie),
  ]);
  for (const response of responses) expect(response.status).toBe(200);
  expect((await responses[2].json()).user.id).toBe(owner);
  expect(one("SELECT name FROM p_users WHERE id=?", target)?.name).toBe("Company corrected target");
  expect(one("SELECT name FROM p_users WHERE id=?", other)?.name).toBe("Regular member correction");
  expect(one("SELECT name FROM p_users WHERE id=?", owner)?.name).toBe(ownerName);
  expect((await me(ownerCookie, target)).id).toBe(target);
  expect((await me()).id).toBe(owner);
});

it("blocks financial and authentication mutations before changing either account", async () => {
  await begin();
  const sessionsBefore = all("SELECT token_hash,user_id FROM p_sessions ORDER BY token_hash");
  for (const path of ["orders", "checkouts", "withdrawals", "payout-profile", "contact", "security", "auth/logout", "auth/otp"]) {
    const response = await request(path, ownerCookie, "POST", { action: "password", newPassword: "must-not-be-set", target: "attacker@example.test", purpose: "reset" }, target);
    expect(response.status, path + ": " + JSON.stringify(await response.clone().json())).toBe(403);
  }
  expect(all("SELECT token_hash,user_id FROM p_sessions ORDER BY token_hash")).toEqual(sessionsBefore);
  expect(one("SELECT available FROM p_wallets WHERE user_id=?", target)?.available).toBe(2000);
  expect(one("SELECT COUNT(*) n FROM p_orders WHERE user_id=?", target)?.n).toBe(0);
  expect(one("SELECT password FROM p_users WHERE id=?", target)?.password).toBe("unused");
  expect((await me()).id).toBe(owner);
});

it("stops only the selected context and keeps the original owner session valid", async () => {
  await begin();
  const response = await request("admin/member-access", ownerCookie, "DELETE", { userId: target });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect((await request("me", ownerCookie, "GET", undefined, target)).status).toBe(403);
  expect((await me()).id).toBe(owner);
  expect((await me()).role).toBe("superadmin");
  expect((await me(targetCookie)).id).toBe(target);
});

it("expires the selected context after thirty minutes while preserving the owner's session", async () => {
  await begin();
  const future = Date.now() + 31 * 60 * 1000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  expect((await request("me", ownerCookie, "GET", undefined, target)).status).toBe(403);
  expect((await me()).id).toBe(owner);
});

it("rechecks the real owner's role and target eligibility on every selected request", async () => {
  await begin();
  run("UPDATE p_users SET role='support' WHERE id=?", owner);
  expect((await request("me", ownerCookie, "GET", undefined, target)).status).toBe(403);
  run("UPDATE p_users SET role='superadmin' WHERE id=?", owner);
  expect((await me(ownerCookie, target)).id).toBe(target);
  run("UPDATE p_users SET blocked=1 WHERE id=?", target);
  expect((await request("me", ownerCookie, "GET", undefined, target)).status).toBe(403);
  expect((await me()).id).toBe(owner);
});
