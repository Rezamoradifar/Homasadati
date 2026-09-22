// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  cardForPurchase,
  previewCardMatches,
  simurghCashbackEligibility,
  undecidedCardRules,
} from "./seven-card-model";
import { cardPlan, saveCardPlan } from "./seven-card";
import { handle } from "./api";
import { one, run, now, platformDb } from "./schema";
import { session, SESSION_COOKIE } from "./security";
const dir = mkdtempSync(join(tmpdir(), "seven-card-"));
const actor = randomUUID(),
  member = randomUUID();
let adminCookie = "",
  memberCookie = "";
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  process.env.APP_ORIGIN = "http://localhost";
  for (const [id, role] of [
    [actor, "superadmin"],
    [member, "user"],
  ]) {
    run(
      "INSERT INTO p_users(id,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?)",
      id,
      role,
      "unused",
      role,
      id,
      now(),
      now(),
      "test",
    );
    const cookie = SESSION_COOKIE + "=" + session(id, "test");
    if (id === actor) adminCookie = cookie;
    else memberCookie = cookie;
  }
});
afterAll(() => {
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
const quote = {
  left: 90_000_000,
  right: 90_000_000,
  earnedThisWeek: 0,
  previousMatches: 0,
  budget: 100_000_000,
  voucherCountsTowardCap: true,
};
it("uses non-overlapping exact purchase boundaries and the new seven levels", () => {
  expect(cardForPurchase(9_999_999)).toBeNull();
  for (let level = 1; level <= 7; level++) {
    const card = cardForPurchase(level * 10_000_000)!;
    expect(card.level).toBe(level);
    expect(card.desks).toBe(level);
    expect(card.branches).toBe(level + 1);
    expect(card.weeklyCapToman).toBe(level * 15_000_000);
    if (level > 1)
      expect(cardForPurchase(level * 10_000_000 - 1)?.level).toBe(level - 1);
  }
  expect(cardForPurchase(1_000_000_000_000)?.level).toBe(7);
  expect(() => cardForPurchase(10.5)).toThrow();
});
it("preserves the third whole match above the 15m desk cap", () => {
  expect(previewCardMatches(quote)).toMatchObject({
    matches: 2,
    cash: 10_800_000,
    voucher: 0,
    leftCarry: 30_000_000,
    rightCarry: 30_000_000,
    remainingWeeklyAllowance: 4_200_000,
  });
  expect(
    previewCardMatches({ ...quote, earnedThisWeek: 10_800_000 }).matches,
  ).toBe(0);
  expect(previewCardMatches({ ...quote, left: 29_999_999 }).matches).toBe(0);
});
it("pays seven whole cash rewards and the eighth whole voucher across four weeks", () => {
  let previousMatches = 0,
    cash = 0,
    voucher = 0;
  for (let week = 0; week < 4; week++) {
    const q = previewCardMatches({
      ...quote,
      left: 60_000_000,
      right: 60_000_000,
      previousMatches,
    });
    previousMatches += q.matches;
    cash += q.cash;
    voucher += q.voucher;
  }
  expect({ previousMatches, cash, voucher }).toEqual({
    previousMatches: 8,
    cash: 37_800_000,
    voucher: 5_400_000,
  });
});
it("honors voucher cap choice, funding budget, and asymmetric carry", () => {
  const d = { ...quote, previousMatches: 7, earnedThisWeek: 15_000_000 };
  expect(previewCardMatches(d).matches).toBe(0);
  expect(
    previewCardMatches({ ...d, voucherCountsTowardCap: false }),
  ).toMatchObject({ matches: 1, cash: 0, voucher: 5_400_000 });
  expect(previewCardMatches({ ...quote, budget: 5_399_999 }).matches).toBe(0);
  expect(previewCardMatches({ ...quote, right: 35_000_000 })).toMatchObject({
    leftCarry: 60_000_000,
    rightCarry: 5_000_000,
  });
  expect(() => previewCardMatches({ ...quote, left: -1 })).toThrow();
});
it("never treats staged purchases as initial Simurgh cashback", () => {
  expect(simurghCashbackEligibility(70_000_000, 0)).toBe(6_000_000);
  expect(simurghCashbackEligibility(70_000_000, 1)).toBe(0);
  expect(simurghCashbackEligibility(69_999_999, 0)).toBe(0);
});
it("persists an audited draft, rejects stale writes, and never enables settlement", () => {
  expect(cardPlan().unresolved).toHaveLength(6);
  const decisions = { ...undecidedCardRules, counterScope: "desk" as const };
  expect(
    saveCardPlan(actor, { decisions, revision: 0, reason: "initial review" }),
  ).toMatchObject({ revision: 1, liveSettlement: false });
  expect(cardPlan().decisions.counterScope).toBe("desk");
  expect(() =>
    saveCardPlan(actor, { decisions, revision: 0, reason: "stale write" }),
  ).toThrow();
  expect(
    one("SELECT COUNT(*) n FROM p_audit WHERE action='seven-card.draft'")?.n,
  ).toBe(1);
  expect(one("SELECT COUNT(*) n FROM p_ledger")?.n).toBe(0);
});
it("exposes public details, requires staff for changes and validates simulation inputs", async () => {
  const call = (path: string, cookie = "", body?: unknown) =>
    handle(
      new Request("http://localhost/api/platform/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          origin: "http://localhost",
          cookie,
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      path.split("/"),
    );
  const publicResponse = await call("card-plan");
  expect(publicResponse.status).toBe(200);
  expect((await publicResponse.json()).cards).toHaveLength(7);
  expect((await call("admin/seven-card-plan", memberCookie)).status).toBe(403);
  expect(
    (await call("admin/seven-card-simulate", adminCookie, quote)).status,
  ).toBe(200);
  expect(
    (
      await call("admin/seven-card-simulate", adminCookie, {
        ...quote,
        budget: -1,
      })
    ).status,
  ).toBe(400);
});
