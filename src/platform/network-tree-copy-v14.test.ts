import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("member position card copy", () => {
  const source=readFileSync("src/platform/NetworkTree.tsx","utf8");

  it("does not repeat the position-activation volume warning beneath the statistics", () => {
    expect(source).not.toContain("position-volume-note");
    expect(source).not.toContain("خریدهای قبل از فعال‌سازی پورسانت ندارند");
  });

  it("preserves actual live left/right volume, savings, purchase progress and network details", () => {
    expect(source).toContain("rialAmount(current.confirmedLeftVolume ?? current.leftVolume)");
    expect(source).toContain("rialAmount(current.confirmedRightVolume ?? current.rightVolume)");
    expect(source).toContain("current.pendingLeftVolume");
    expect(source).toContain("current.pendingRightVolume");
    // Savings and the underlying posted volume fields remain independent
    // from the new paid-purchase display values.
    const service=readFileSync("src/platform/card-positions.ts","utf8");
    expect(service).toContain("leftVolume:left.volume,rightVolume:right.volume");
    expect(service).toContain("confirmedLeftVolume:left.volume+pendingLeft.volume");
    expect(source).toContain("rialAmount(current.savings.left)");
    expect(source).toContain("rialAmount(current.savings.right)");
    expect(source).toContain('className="position-purchase-note"');
    expect(source).toContain("position-leg-details");
  });
});
