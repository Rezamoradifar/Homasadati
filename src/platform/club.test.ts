// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "./api";
import { platformDb, one, run, now } from "./schema";
import { session, SESSION_COOKIE } from "./security";
import { saveSetting } from "./providers";
import { createOrder, settleOrder, refundOrder } from "./finance";
import { binaryReport } from "./binary-report";
const dir = mkdtempSync(join(tmpdir(), "homa-club-"));
let admin: string, content: string, member: string, outsider: string;
function user(
  role = "user",
  sponsor: string | null = null,
  parent: string | null = null,
  leg: string | null = null,
) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,role,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id,
    "Test " + role,
    "unused",
    role,
    id,
    sponsor,
    parent,
    leg,
    now(),
    now(),
    "test",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}
async function request(
  path: string,
  actor: string | null = admin,
  method = "GET",
  data: unknown = {},
) {
  return handle(
    new Request("https://club.test/api/platform/" + path, {
      method,
      headers: {
        origin: "https://club.test",
        host: "club.test",
        "content-type": "application/json",
        cookie: actor ? SESSION_COOKIE + "=" + session(actor, "test") : "",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
    }),
    path.split("?")[0].split("/"),
  );
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "club.sqlite");
  process.env.APP_ORIGIN = "https://club.test";
  admin = user("superadmin");
  content = user("content");
  member = user();
  outsider = user();
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
const merchant = {
  name: "Partner",
  category: "Tourism",
  city: "Yazd",
  address: "Address",
  phone: "",
  website: "https://example.com",
  description: "Service",
  active: false,
  reason: "Create",
};
async function grant(id: string, delta: number, key = randomUUID()) {
  return request("admin/loyalty", admin, "POST", {
    userId: id,
    delta,
    reason: "Documented adjustment",
    idempotencyKey: key,
  });
}
async function reward(stock = 1, points = 50) {
  const r = await request("admin/rewards", admin, "POST", {
    title: "Benefit",
    description: "Details",
    points,
    stock,
    active: true,
    reason: "Approved benefit",
  });
  expect(r.status).toBe(200);
  return (await r.json()).id as string;
}
describe("Customer club API and accounting", () => {
  it("requires authentication and role authorization for administrative writes", async () => {
    expect((await request("admin/merchants", null)).status).toBe(401);
    expect(
      (await request("admin/merchants", member, "POST", merchant)).status,
    ).toBe(403);
    expect((await request("admin/loyalty", content, "POST", {})).status).toBe(
      403,
    );
    expect((await request("admin/binary", admin, "POST", {})).status).toBe(405);
  });
  it("publishes only active merchants and validates website URLs", async () => {
    const created = await request("admin/merchants", content, "POST", merchant);
    expect(created.status).toBe(200);
    const id = (await created.json()).id;
    expect((await (await request("merchants", null)).json()).rows).toHaveLength(
      0,
    );
    expect(
      (
        await request("admin/merchants", content, "POST", {
          ...merchant,
          id,
          active: true,
          website: "javascript:alert(1)",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("admin/merchants", content, "POST", {
          ...merchant,
          id,
          active: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await (await request("merchants?q=Yazd", null)).json()).rows[0].name,
    ).toBe("Partner");
    expect(
      (await (await request("merchants?q=missing", null)).json()).rows,
    ).toHaveLength(0);
  });
  it("records immutable, idempotent points adjustments without changing money or network volume", async () => {
    const id = user(),
      key = randomUUID();
    expect((await grant(id, 100, key)).status).toBe(200);
    expect((await grant(id, 100, key)).status).toBe(200);
    expect((await grant(id, 101, key)).status).toBe(409);
    const data = await (await request("loyalty", id)).json();
    expect(data.balance).toBe(100);
    expect(data.rows).toHaveLength(1);
    expect(
      one("SELECT available FROM p_wallets WHERE user_id=?", id)!.available,
    ).toBe(0);
    expect(
      one("SELECT COUNT(*) n FROM p_binary_lots WHERE user_id=?", id)!.n,
    ).toBe(0);
    expect(() =>
      run("UPDATE p_points_ledger SET delta=999 WHERE user_id=?", id),
    ).toThrow();
    expect(() =>
      run("DELETE FROM p_points_ledger WHERE user_id=?", id),
    ).toThrow();
    expect((await grant(id, -101)).status).toBe(409);
  });
  it("rolls back reward inventory if points are insufficient", async () => {
    const r = await reward();
    expect(
      (
        await request("loyalty/redeem", outsider, "POST", {
          rewardId: r,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(one("SELECT stock FROM p_rewards WHERE id=?", r)!.stock).toBe(1);
    expect(
      one("SELECT COUNT(*) n FROM p_redemptions WHERE reward_id=?", r)!.n,
    ).toBe(0);
  });
  it("reserves a benefit once and restores its points and inventory exactly once on cancellation", async () => {
    const id = user();
    await grant(id, 100);
    const r = await reward(),
      key = randomUUID();
    const first = await request("loyalty/redeem", id, "POST", {
      rewardId: r,
      idempotencyKey: key,
    });
    expect(first.status).toBe(201);
    const redemption = await first.json();
    const again = await (
      await request("loyalty/redeem", id, "POST", {
        rewardId: r,
        idempotencyKey: key,
      })
    ).json();
    expect(again.id).toBe(redemption.id);
    expect((await (await request("loyalty", id)).json()).balance).toBe(50);
    const cancel = {
      id: redemption.id,
      status: "cancelled",
      reason: "Not available",
    };
    expect(
      (await request("admin/redemptions", admin, "POST", cancel)).status,
    ).toBe(200);
    expect(
      (await request("admin/redemptions", admin, "POST", cancel)).status,
    ).toBe(200);
    expect((await (await request("loyalty", id)).json()).balance).toBe(100);
    expect(one("SELECT stock FROM p_rewards WHERE id=?", r)!.stock).toBe(1);
    expect(
      (
        await request("admin/redemptions", admin, "POST", {
          ...cancel,
          status: "fulfilled",
        })
      ).status,
    ).toBe(409);
  });
  it("prevents competing requests from overspending the same points", async () => {
    const id = user();
    await grant(id, 50);
    const r = await reward(2);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request("loyalty/redeem", id, "POST", {
          rewardId: r,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await (await request("loyalty", id)).json()).balance).toBe(0);
    expect(one("SELECT stock FROM p_rewards WHERE id=?", r)!.stock).toBe(1);
  });
  it("does not expose another member's point history", async () => {
    await grant(member, 99);
    const data = await (
      await request(`loyalty?user=${member}`, outsider)
    ).json();
    expect(data.balance).toBe(0);
    expect(data.rows).toHaveLength(0);
  });
  it("keeps binary placement independent of sponsor tree and restricts member reports to their own account", async () => {
    const root = user(),
      externalSponsor = user(),
      child = user("user", externalSponsor, root, "left");
    const report = await (await request("binary", root)).json();
    expect(report.nodes.map((n: { id: string }) => n.id)).toContain(child);
    expect(report.nodes.map((n: { id: string }) => n.id)).not.toContain(
      externalSponsor,
    );
    expect((await request(`binary?user=${root}`, outsider)).status).toBe(403);
    expect((await request(`admin/binary?user=${root}`, admin)).status).toBe(
      200,
    );
    expect((await request(`admin/binary?user=${root}`, content)).status).toBe(
      403,
    );
  });
  it("reports actual matched volumes and reflects refund reversals without creating new commissions", () => {
    saveSetting(
      "commission_policy",
      JSON.stringify({
        directBps: 0,
        levels: [],
        binaryBps: 1000,
        maxPayoutBps: 3000,
        warningBps: 5000,
        criticalBps: 8000,
        withdrawMin: 1,
        withdrawMax: 1000000,
        paused: false,
      }),
    );
    const root = user(),
      left = user("user", root, root, "left"),
      right = user("user", root, root, "right"),
      product = randomUUID();
    run(
      "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,created_at,updated_at) VALUES(?,?,?,'craft','product',1000,5,1,?,?)",
      product,
      "Test product",
      "Test only",
      now(),
      now(),
    );
    const buy = (u: string) => {
      const o = createOrder(u, product, 1, "zarinpal", randomUUID());
      return settleOrder(o.id, "test-" + randomUUID());
    };
    buy(left);
    const order = buy(right);
    let report = binaryReport(root);
    expect(report.left.consumed).toBe(1000);
    expect(report.right.consumed).toBe(1000);
    expect(report.matches[0].amount).toBe(100);
    const count = one("SELECT COUNT(*) n FROM p_commissions")!.n;
    binaryReport(root);
    expect(one("SELECT COUNT(*) n FROM p_commissions")!.n).toBe(count);
    refundOrder(order.id, admin, true, "Refund test");
    report = binaryReport(root);
    expect(report.left.remaining).toBe(1000);
    expect(report.right.total).toBe(0);
    expect(report.matches[0].void).toBe(1);
  });
});
