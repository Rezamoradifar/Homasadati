// @vitest-environment node
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { platformDb, run, one, now } from "./schema";
import { saveSetting } from "./providers";
import { createOrder, settleOrder, refundOrder } from "./finance";
import {
  issueTravelCards,
  requestTravel,
  reviewTravel,
  saveTravelRule,
  cardsFor,
} from "./travel";
import { workingDaysBefore, tehranDay } from "./travel-model";
import { handle } from "./api";
import { session, SESSION_COOKIE } from "./security";
const dir = mkdtempSync(join(tmpdir(), "homa-travel-"));
let user: string,
  admin: string,
  rank: string,
  tour: string,
  craft: string,
  order: string;
function member(role = "user") {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
    id,
    "نام عضو",
    "unused",
    role,
    id,
    now(),
    now(),
    "fixture",
  );
  run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
  return id;
}
function product(vertical: string) {
  const id = randomUUID();
  run(
    "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,published,cancel_hours,created_at,updated_at) VALUES(?,?,?,?,?,100000,10,1,0,?,?)",
    id,
    "آزمون",
    "فقط دیتابیس آزمون",
    vertical,
    "product",
    now(),
    now(),
  );
  return id;
}
function dateLater(n = 20) {
  const d = new Date(tehranDay() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function request(cardId: string, amount = 30000) {
  return {
    cardId,
    productId: tour,
    travelDate: dateLater(),
    amount,
    note: "هماهنگی سفر آزمایشی",
    idempotencyKey: randomUUID(),
  };
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "travel.sqlite");
  process.env.APP_ORIGIN = "https://homay.test";
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  saveSetting(
    "commission_policy",
    JSON.stringify({
      directBps: 0,
      levels: [],
      binaryBps: 0,
      maxPayoutBps: 3000,
      warningBps: 5000,
      criticalBps: 8000,
      withdrawMin: 1,
      withdrawMax: 1000000000,
      paused: false,
    }),
  );
  user = member();
  admin = member("superadmin");
  rank = randomUUID();
  run("INSERT INTO p_ranks VALUES(?,?,0,0,0)", rank, "رتبه " + rank);
  saveTravelRule(admin, {
    rankId: rank,
    amount: 50000,
    validDays: 365,
    active: true,
    reason: "تعریف اعتبار آزمون",
  });
  craft = product("craft");
  tour = product("tourism");
  const o = createOrder(user, craft, 1, "zarinpal", randomUUID());
  order = o.id;
  settleOrder(order, "test-" + randomUUID());
});
it("issues one named card per eligible rank, only after cancellation window", () => {
  run("UPDATE p_orders SET cancel_until=? WHERE id=?", dateLater(), order);
  expect(issueTravelCards(user)).toHaveLength(0);
  run("UPDATE p_orders SET cancel_until=? WHERE id=?", "2000-01-01", order);
  const a = issueTravelCards(user);
  expect(a.find((c) => c.rank_id === rank)).toMatchObject({
    holder_name: "نام عضو",
    issued: 50000,
    available: 50000,
  });
  expect(issueTravelCards(user)).toHaveLength(a.length);
});
it("counts complete business days and excludes registered holidays", () => {
  expect(workingDaysBefore("2026-09-20", "2026-09-29", [5], [])).toBe(7);
  expect(
    workingDaysBefore("2026-09-20", "2026-09-29", [5], ["2026-09-22"]),
  ).toBe(6);
});
it("reserves once on retry, blocks overspend and consumes only after approval", () => {
  const c = issueTravelCards(user).find((c) => c.rank_id === rank)!;
  const input = request(c.id);
  const r = requestTravel(user, input);
  expect(requestTravel(user, input).id).toBe(r.id);
  expect(() => requestTravel(user, request(c.id))).toThrow();
  expect(
    one("SELECT available,reserved,spent FROM p_travel_cards WHERE id=?", c.id),
  ).toEqual({ available: 20000, reserved: 30000, spent: 0 });
  reviewTravel(admin, {
    id: r.id,
    status: "approved",
    reference: "booking-1",
    reason: "هماهنگی انجام شد",
  });
  expect(one("SELECT stock FROM p_products WHERE id=?", tour)?.stock).toBe(9);
  reviewTravel(admin, {
    id: r.id,
    status: "redeemed",
    reference: "settlement-1",
    reason: "مصرف اعتبار تأیید شد",
  });
  expect(
    one("SELECT available,reserved,spent FROM p_travel_cards WHERE id=?", c.id),
  ).toEqual({ available: 20000, reserved: 0, spent: 30000 });
  expect(() =>
    reviewTravel(admin, {
      id: r.id,
      status: "redeemed",
      reference: "duplicate",
      reason: "تکرار",
    }),
  ).toThrow();
});
it("rolls back failed stock approval and restores capacity and credit on cancellation", () => {
  const c = issueTravelCards(user).find((c) => c.rank_id === rank)!;
  const r = requestTravel(user, request(c.id));
  run("UPDATE p_products SET stock=0 WHERE id=?", tour);
  expect(() =>
    reviewTravel(admin, {
      id: r.id,
      status: "approved",
      reference: "booking",
      reason: "تأیید",
    }),
  ).toThrow();
  expect(
    one("SELECT status FROM p_travel_requests WHERE id=?", r.id)?.status,
  ).toBe("requested");
  run("UPDATE p_products SET stock=1 WHERE id=?", tour);
  reviewTravel(admin, {
    id: r.id,
    status: "approved",
    reference: "booking",
    reason: "تأیید",
  });
  reviewTravel(admin, {
    id: r.id,
    status: "cancelled",
    reason: "لغو هماهنگ‌شده",
  });
  expect(one("SELECT stock FROM p_products WHERE id=?", tour)?.stock).toBe(1);
  expect(
    one("SELECT available,reserved FROM p_travel_cards WHERE id=?", c.id),
  ).toEqual({ available: 50000, reserved: 0 });
});
it("rejects short notice, ownership violations and refunded eligibility", () => {
  const c = issueTravelCards(user).find((c) => c.rank_id === rank)!;
  expect(() =>
    requestTravel(user, { ...request(c.id), travelDate: dateLater(3) }),
  ).toThrow();
  expect(() => requestTravel(admin, request(c.id))).toThrow();
  refundOrder(order, admin, true, "استرداد آزمون");
  expect(cardsFor(user).find((x) => x.id === c.id)?.eligible).toBe(false);
  expect(() => requestTravel(user, request(c.id))).toThrow();
});
it("enforces travel administration roles at API boundary", async () => {
  const call = async (id: string, path: string, data?: unknown) => {
    const token = session(id, "test");
    return handle(
      new Request("https://homay.test/api/platform/" + path, {
        method: data ? "POST" : "GET",
        headers: {
          origin: "https://homay.test",
          host: "homay.test",
          "Content-Type": "application/json",
          cookie: SESSION_COOKIE + "=" + token,
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
      path.split("/"),
    );
  };
  expect((await call(user, "admin/travel")).status).toBe(403);
  expect((await call(admin, "admin/travel")).status).toBe(200);
  const support = member("support");
  expect(
    (
      await call(support, "admin/travel/rules", {
        rankId: rank,
        amount: 1,
        validDays: 30,
        active: true,
        reason: "تغییر",
      })
    ).status,
  ).toBe(403);
});
it('installs eight draft ranks atomically without enabling credit or duplicating on retry',async()=>{const {travelPresets,installTravelPresets}=await import('./travel-presets');expect(travelPresets()).toHaveLength(8);const p=installTravelPresets(admin);expect(p.every(r=>r.rank_id&&r.active===0)).toBe(true);const before=p.map(r=>r.rank_id);expect(installTravelPresets(admin).map(r=>r.rank_id)).toEqual(before);expect(issueTravelCards(user).filter(c=>before.includes(c.rank_id))).toHaveLength(0);});
