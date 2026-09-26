// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platformDb } from "./schema";
import { newReferralCode } from "./referral";
import { welcomeEmail } from "./welcome";

const directory = mkdtempSync(join(tmpdir(), "homay-welcome-"));
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "w.sqlite");
  platformDb();
});
afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("gives new members a short referral code without look-alike characters", () => {
  const codes = new Set(Array.from({ length: 200 }, newReferralCode));
  expect(codes.size).toBe(200);
  for (const c of codes) expect(c).toMatch(/^hn-[a-hj-km-np-z2-9]{6}$/);
});

it("welcomes a member by first name with their referral code", () => {
  const mail = welcomeEmail(JSON.stringify({ template: "welcome", name: "سارا احمدی", code: "hn-7k4m2q" }), {
    name: "هما نت",
    origin: "https://homanets.com",
    direction: "rtl",
    footer: [],
  });
  expect(mail.subject).toBe("سارا عزیز، به خانوادهٔ هما نت خوش آمدید");
  expect(mail.html).toContain("hn-7k4m2q");
  expect(mail.text).toContain("1. از بخش امنیت حساب");
});
