import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";

describe("member purchase volume display", () => {
  const positions = readFileSync("src/platform/card-positions.ts", "utf8");
  const tree = readFileSync("src/platform/NetworkTree.tsx", "utf8");

  it("exposes a confirmed personal purchase total without using commission lots", () => {
    expect(positions).toContain("const personalPaidVolume = one(");
    expect(positions).toContain("paid_at IS NOT NULL AND refunded_at IS NULL");
    expect(positions).toContain("payment_method!='company_credit'");
    expect(positions).toContain("return {personalPaidVolume,nextReferralOrdinal");
  });

  it("shows personal totals on both the own-positions card and each network member", () => {
    expect(tree).toContain("حجم خرید شخصی پرداخت‌شده");
    expect(tree).toContain("rialAmount(data.personalPaidVolume || 0)");
    expect(tree).toContain("حجم کل خرید شخصی:");
    expect(tree).toContain("rialAmount(n.personalVolume)");
    expect(tree).toContain("rialAmount(current.leftVolume)");
    expect(tree).toContain("rialAmount(current.rightVolume)");
  });
});
