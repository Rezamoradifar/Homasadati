import { randomInt } from "node:crypto";
/** Test helper: a fresh, valid Iranian national code and mobile each call. */
export function testIdentity() {
  const base = String(randomInt(10_000_000, 999_999_999)).padStart(9, "0");
  const sum = [...base].reduce((t, d, i) => t + Number(d) * (10 - i), 0) % 11;
  return {
    nationalId: base + (sum < 2 ? sum : 11 - sum),
    mobile: "0912" + String(randomInt(1_000_000, 9_999_999)),
  };
}
