// @vitest-environment node
import { expect, it } from "vitest";
import { englishCoverage } from "../../scripts/check-english";

it("covers authored Persian UI and system messages with explicit English translations", () => {
  const result = englishCoverage();
  expect(result.total).toBeGreaterThan(2000);
  expect(result.missing).toEqual([]);
});
