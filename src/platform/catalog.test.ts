// @vitest-environment node
import sharp from "sharp";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handle } from "./api";
import { platformDb, run, one, now } from "./schema";
import { session, SESSION_COOKIE } from "./security";
import { emptyCatalogDetails } from "./catalog-model";
import { createOrder, settleOrder } from "./finance";
import { saveSetting } from "./providers";
const directory = mkdtempSync(join(tmpdir(), "homay-catalog-"));
let admin: string, editor: string, buyer: string;
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = admin,
) {
  return handle(
    new Request("https://catalog.test/api/platform/" + path, {
      method,
      headers: {
        origin: "https://catalog.test",
        host: "catalog.test",
        cookie,
        "Content-Type": "application/json",
      },
      ...(method !== "GET" ? { body: JSON.stringify(data) } : {}),
    }),
    path.split("?")[0].split("/"),
  );
}
function product(sku: string) {
  return {
    title: "محصول واقعی تست",
    description: "توضیحات کامل محصول",
    vertical: "beauty",
    subtype: "cosmetics",
    price: 200000,
    stock: 5,
    images: [],
    taxonomy: [],
    published: true,
    duration_days: 30,
    cancel_hours: 24,
    details: {
      ...emptyCatalogDetails(),
      sku,
      family: "SERUM",
      brand: "برند آزمون",
      cost: 120000,
      supplier: "Private supplier",
      lowStock: 2,
      ingredients: "ویتامین C",
      skinType: "خشک",
      volume: "۳۰ میلی‌لیتر",
      titleEn: "Face serum",
      color: "neutral",
    },
  };
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "catalog.sqlite");
  process.env.APP_ORIGIN = "https://catalog.test";
  for (const role of ["superadmin", "content", "user"]) {
    const id = randomUUID();
    run(
      "INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
      id,
      role,
      "unused",
      role,
      id,
      now(),
      now(),
      "fixture",
    );
    run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
    const cookie = SESSION_COOKIE + "=" + session(id, "test");
    if (role === "superadmin") admin = cookie;
    else if (role === "content") editor = cookie;
    else buyer = id;
  }
  saveSetting(
    "commission_policy",
    JSON.stringify({
      directBps: 0,
      levels: [],
      binaryBps: 0,
      maxPayoutBps: 0,
      warningBps: 5000,
      criticalBps: 8000,
      withdrawMin: 1,
      withdrawMax: 10000000,
      paused: false,
    }),
  );
});
afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});
describe("Extended catalog and operations", () => {
  it("persists detailed products and excludes private purchasing data from public catalog", async () => {
    const p = product("SERUM-01");
    const response = await request("admin/products", "POST", p);
    expect(response.status).toBe(200);
    const { id } = await response.json();
    expect(
      JSON.parse(
        one("SELECT details FROM p_product_details WHERE product_id=?", id)!
          .details,
      ).ingredients,
    ).toBe(p.details.ingredients);
    const catalog = await (
      await request("catalog", "GET", undefined, "")
    ).json();
    const row = catalog.rows.find((r: any) => r.id === id);
    expect(row.details.titleEn).toBe("Face serum");
    expect(row.details.cost).toBeUndefined();
    expect(row.details.supplier).toBeUndefined();
    expect(row.details.lowStock).toBeUndefined();
  });
  it("rejects duplicate SKU and rolls back the whole product write", async () => {
    const before = one("SELECT COUNT(*) n FROM p_products")!.n;
    expect(
      (await request("admin/products", "POST", product("SERUM-01"))).status,
    ).toBe(409);
    expect(one("SELECT COUNT(*) n FROM p_products")!.n).toBe(before);
  });
  it("validates date ranges, prices and negative feature values on the server", async () => {
    for (const details of [
      { cost: -1 },
      { comparePrice: 1 },
      { startsOn: "2026-12-03", endsOn: "2026-12-02" },
      { expiresOn: "2026-02-30" },
    ]) {
      const p = product(randomUUID());
      Object.assign(p.details, details);
      expect((await request("admin/products", "POST", p)).status).toBe(400);
    }
  });
  it("groups independently priced and stocked SKUs into a public product family", async () => {
    const p = product("SERUM-02");
    p.price = 300000;
    p.stock = 7;
    p.details.color = "pink";
    expect((await request("admin/products", "POST", p)).status).toBe(200);
    const result = await (
      await request("catalog?family=SERUM", "GET", undefined, "")
    ).json();
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r: any) => r.price).sort()).toEqual([
      200000, 300000,
    ]);
    expect(
      (
        await (
          await request("catalog?family=unknown", "GET", undefined, "")
        ).json()
      ).rows,
    ).toHaveLength(0);
  });
  it("refuses stale inventory updates after a concurrent reservation", async () => {
    const row = one(
      "SELECT p.* FROM p_products p JOIN p_product_details d ON d.product_id=p.id WHERE d.sku='SERUM-02'",
    )!;
    run("UPDATE p_products SET stock=stock-1 WHERE id=?", row.id);
    const payload = {
      ...product("SERUM-02"),
      id: row.id,
      expected_stock: row.stock,
      expected_updated_at: row.updated_at,
    };
    expect((await request("admin/products", "POST", payload)).status).toBe(409);
    expect(one("SELECT stock FROM p_products WHERE id=?", row.id)!.stock).toBe(
      6,
    );
  });
  it("calculates section dashboards from paid orders and real stock", async () => {
    const row = one(
      "SELECT p.* FROM p_products p JOIN p_product_details d ON d.product_id=p.id WHERE d.sku='SERUM-01'",
    )!;
    const order = createOrder(buyer, row.id, 1, "zarinpal", randomUUID());
    settleOrder(order.id, "verified-test-reference");
    const dashboard = await (
      await request("admin/operations?vertical=beauty")
    ).json();
    expect(dashboard.sales.revenue).toBe(200000);
    expect(dashboard.sales.paidOrders).toBe(1);
    expect(dashboard.catalog.products).toBe(2);
    expect(dashboard.top[0].product_id).toBe(row.id);
    const other = await (
      await request("admin/operations?vertical=tourism")
    ).json();
    expect(other.sales.revenue).toBe(0);
    expect(other.catalog.products).toBe(0);
  });
  it("enforces financial RBAC on section dashboards", async () => {
    expect(
      (await request("admin/operations", "GET", undefined, editor)).status,
    ).toBe(403);
    expect(
      (await request("admin/catalog-options", "GET", undefined, editor)).status,
    ).toBe(200);
    expect((await request("admin/products", "GET", undefined, "")).status).toBe(
      401,
    );
  });
  it("preserves detail records when older clients update core product fields", async () => {
    const row = one(
      "SELECT product_id FROM p_product_details WHERE sku='SERUM-02'",
    )!;
    const { details, ...core } = product("unused");
    expect(
      (await request("admin/products", "POST", { ...core, id: row.product_id }))
        .status,
    ).toBe(200);
    expect(
      one(
        "SELECT sku FROM p_product_details WHERE product_id=?",
        row.product_id,
      )!.sku,
    ).toBe("SERUM-02");
  });
  it("validates and stores real image uploads with an audited public URL", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#123e35" },
    })
      .png()
      .toBuffer();
    const response = await handle(
      new Request("https://catalog.test/api/platform/media", {
        method: "POST",
        headers: {
          origin: "https://catalog.test",
          host: "catalog.test",
          cookie: admin,
          "Content-Type": "image/png",
        },
        body: new Uint8Array(png),
      }),
      ["media"],
    );
    expect(response.status).toBe(201);
    const result = await response.json();
    const image = await request(
      result.url.replace("/api/platform/", ""),
      "GET",
      undefined,
      "",
    );
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
    const info = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect(info.width).toBe(2);
    expect(
      one("SELECT COUNT(*) n FROM p_audit WHERE action='media.upload'")!.n,
    ).toBe(1);
    const p = product("WITH-IMAGE");
    (p.images as string[]).push(result.url);
    expect((await request("admin/products", "POST", p)).status).toBe(200);
  });
  it("rejects unauthenticated or malformed image uploads", async () => {
    const upload = (cookie: string) =>
      handle(
        new Request("https://catalog.test/api/platform/media", {
          method: "POST",
          headers: {
            origin: "https://catalog.test",
            host: "catalog.test",
            cookie,
            "Content-Type": "image/png",
          },
          body: "<script>alert(1)</script>",
        }),
        ["media"],
      );
    expect((await upload("")).status).toBe(401);
    expect((await upload(admin)).status).toBe(400);
  });
});
