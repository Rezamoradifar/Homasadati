// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "./api";
import { assignAccessRole, saveAccessRole } from "./access";
import { now, platformDb, run } from "./schema";
import { session, SESSION_COOKIE } from "./security";

const directory = mkdtempSync(join(tmpdir(), "homa-order-document-api-"));
const origin = "https://order-document.test";
let owner: string, buyer: string, orderId: string, createdAt: string;
let phoneIndex = 0;
const actors: Record<string, string> = {};

function member(role = "user") {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,phone,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?)",
    id, "Current profile name", "+98912" + String(++phoneIndex).padStart(7, "0"), "private-password-canary", role,
    id, now(), now(), "test",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}

function cookie(actor: string) {
  return SESSION_COOKIE + "=" + session(actor, "order-document-test");
}

function request(path: string, auth = "") {
  return handle(new Request(origin + "/api/platform/" + path, {
    headers: { origin, host: "order-document.test", cookie: auth },
  }), path.split("/"));
}

beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  process.env.APP_ORIGIN = origin;
  process.env.PLATFORM_MASTER_KEY = "a".repeat(64);
  for (const role of ["superadmin", "finance", "support", "content", "user"])
    actors[role] = member(role);
  owner = actors.superadmin;
  buyer = member();
  const productId = randomUUID();
  orderId = randomUUID();
  createdAt = now();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,'craft','product',1000,10,1,?,?)",
    productId, "Current catalog title", "Test", createdAt, createdAt,
  );
  run(
    "INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,authority,policy,expires_at,created_at,idem_key) VALUES(?,?,?,?,'craft',2,1000,2000,'pending','zibal',?,?,?,?,?)",
    orderId, buyer, productId, "Ordered product title", "private-authority-canary",
    JSON.stringify({
      private: "private-policy-canary",
      orderTerms: {
        customer: { name: "Snapshot recipient", phone: "+989123456789" },
        shippingAddress: { label: "Home", country: "Iran", city: "Tehran", postal_code: "1234567890", address: "Exact delivery address, unit 2" },
      },
    }),
    createdAt, createdAt, randomUUID(),
  );
});

afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("rejects unauthenticated requests before exposing order details", async () => {
  expect((await request("admin/orders/" + orderId)).status).toBe(401);
});

it.each(["user", "content"])("rejects %s accounts without order-read permission", async role => {
  expect((await request("admin/orders/" + orderId, cookie(actors[role]))).status).toBe(403);
});

it.each(["superadmin", "finance", "support"])("allows %s to read the selected order document", async role => {
  const response = await request("admin/orders/" + orderId, cookie(actors[role]));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    order: {
      id: orderId, title: "Ordered product title", vertical: "craft", quantity: 2,
      unitPrice: 1000, amount: 2000, status: "pending", paymentMethod: "zibal",
      paymentRef: null, createdAt, paidAt: null,
    },
    customer: { name: "Snapshot recipient", phone: "+989123456789", source: "snapshot" },
    shipping: { label: "Home", country: "Iran", city: "Tehran", postalCode: "1234567890", address: "Exact delivery address, unit 2" },
  });
});

it("checks delegated order-read permission on every request, including revocation", async () => {
  const delegated = member(), auth = cookie(delegated);
  const role = saveAccessRole(owner, {
    name: "Order documents only", permissions: ["orders:read"], active: true, reason: "Test delegation",
  });
  assignAccessRole(owner, { userId: delegated, roleId: role.id, assigned: true, reason: "Test assignment" });
  expect((await request("admin/orders/" + orderId, auth)).status).toBe(200);
  assignAccessRole(owner, { userId: delegated, roleId: role.id, assigned: false, reason: "Test revocation" });
  expect((await request("admin/orders/" + orderId, auth)).status).toBe(403);
});

it("does not treat delegated order-write permission as permission to read fulfillment data", async () => {
  const delegated = member();
  const role = saveAccessRole(owner, {
    name: "Order writes only", permissions: ["orders:write"], active: true, reason: "Test write-only access",
  });
  assignAccessRole(owner, { userId: delegated, roleId: role.id, assigned: true, reason: "Test assignment" });
  expect((await request("admin/orders/" + orderId, cookie(delegated))).status).toBe(403);
});

it("rejects missing orders, malformed IDs and unsupported path suffixes", async () => {
  const auth = cookie(owner);
  expect((await request("admin/orders/" + randomUUID(), auth)).status).toBe(404);
  expect((await request("admin/orders/not-a-uuid", auth)).status).toBe(400);
  expect((await request("admin/orders/" + orderId + "/unexpected", auth)).status).toBe(404);
});

it("returns only the fulfillment contract rather than raw policy, provider or account secrets", async () => {
  const response = await request("admin/orders/" + orderId, cookie(owner));
  const data = await response.json();
  expect(Object.keys(data).sort()).toEqual(["customer", "order", "shipping"]);
  const serialized = JSON.stringify(data);
  for (const secret of ["private-password-canary", "private-authority-canary", "private-policy-canary"])
    expect(serialized).not.toContain(secret);
  for (const key of ["policy", "password", "otp_secret", "national_id", "authority", "rows"])
    expect(data).not.toHaveProperty(key);
});

it("preserves owner-only access on the member order-detail route", async () => {
  expect((await request("orders/" + orderId, cookie(buyer))).status).toBe(200);
  expect((await request("orders/" + orderId, cookie(actors.user))).status).toBe(404);
  expect((await request("orders/" + orderId, cookie(owner))).status).toBe(404);
});
