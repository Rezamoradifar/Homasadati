// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handle } from "./api";
import { now, platformDb, run } from "./schema";
import { session, SESSION_COOKIE } from "./security";

const dir = mkdtempSync(join(tmpdir(), "homay-member-dashboard-"));
const owner = randomUUID(),
  other = randomUUID(),
  product = randomUUID();
let cookie = "";
const earlier = "2020-01-01T00:00:00.000Z",
  later = "2099-01-01T00:00:00.000Z";
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "dashboard.sqlite");
  process.env.PLATFORM_MASTER_KEY = "c".repeat(64);
  process.env.APP_ORIGIN = "https://homay.test";
  for (const id of [owner, other]) {
    run(
      "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,'unused','user',?,?,?,'test')",
      id,
      `${id}@test.example`,
      "عضو آزمون",
      id,
      now(),
      now(),
    );
    run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  }
  run(
    "INSERT INTO p_products(id,title,vertical,subtype,description,price,stock,created_at,updated_at) VALUES(?,'اشتراک آزمون','ai','subscription','آزمون',100,20,?,?)",
    product,
    now(),
    now(),
  );
  for (const id of [owner, other]) {
    for (const [index, status] of [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ].entries()) {
      const order = randomUUID();
      run(
        "INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,policy,expires_at,created_at,idem_key) VALUES(?,?,?,'سفارش آزمون','ai',1,100,100,?,'wallet','{}',?,?,?)",
        order,
        id,
        product,
        status,
        later,
        now(),
        randomUUID(),
      );
      // Only the first is active: expired, cancelled and future subscriptions must be excluded.
      if (index < 4)
        run(
          "INSERT INTO p_subscriptions VALUES(?,?,?,?,?,?,?)",
          randomUUID(),
          id,
          product,
          order,
          index === 3 ? later : earlier,
          index === 1 ? earlier : later,
          Number(index === 2),
        );
    }
    for (const read of [null, now()])
      run(
        "INSERT INTO p_notifications VALUES(?,?,?,?,?,?)",
        randomUUID(),
        id,
        "اعلان",
        "متن",
        read,
        now(),
      );
    for (const status of ["waiting_support", "waiting_user", "closed"])
      run(
        "INSERT INTO p_tickets(id,user_id,subject,category,priority,status,idem_key,payload,created_at,updated_at) VALUES(?,?,'درخواست آزمون','general','normal',?,?,'{}',?,?)",
        randomUUID(),
        id,
        status,
        randomUUID(),
        now(),
        now(),
      );
  }
  cookie = `${SESSION_COOKIE}=${session(owner, "dashboard test")}`;
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});

it("returns only the signed-in member's current activity and ignores another user supplied in the URL", async () => {
  const response = await handle(
    new Request(`https://homay.test/api/platform/dashboard?user=${other}`, {
      headers: { cookie },
    }),
    ["dashboard"],
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.activity).toEqual({
    activeOrders: 3,
    unreadNotifications: 1,
    openTickets: 2,
    activeSubscriptions: 1,
  });
  expect(data.orders.length).toBe(5);
  expect(
    data.orders.every((order: { user_id: string }) => order.user_id === owner),
  ).toBe(true);
});

it("requires authentication for all dashboard summaries", async () => {
  const response = await handle(
    new Request("https://homay.test/api/platform/dashboard"),
    ["dashboard"],
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});
