// @vitest-environment node
import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it("preserves private configuration and roundtrips DigiPay punctuation through the real Next loader", () => {
  const result = spawnSync("python3", ["-B", fileURLToPath(new URL("./configure_digipay_test.py", import.meta.url))], {
    encoding: "utf8", timeout: 30000,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toMatch(/Ran \d+ tests/);
});
