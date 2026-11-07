// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REVIEWED_CARD_BLOBS, assertReviewedCardBlobs, gitBlobHash, mergeReviewedCardSource, resolveHomaCardMerge,
} from "./resolve-homa-card-merge.mjs";

// This fixture needs no historical Git objects. Its hold predicates represent
// incoming financial behavior which must survive the server-only safeguards.
const incoming = `import { digipayRefundHeldOrderIdsSql } from "./digipay-financial-holds";
function countOrders() {
  const orders = all(
    \`SELECT o.* FROM p_orders o WHERE o.cancel_until<=?
     AND o.id NOT IN (\${digipayRefundHeldOrderIdsSql})
     AND NOT EXISTS(SELECT 1 FROM p_card_orders c WHERE c.order_id=o.id)
     AND NOT EXISTS(SELECT 1 FROM p_orders h WHERE h.id IN (\${digipayRefundHeldOrderIdsSql}))\`);
  for (const o of orders) {
    const earlier = one("SELECT COUNT(*) n FROM p_card_orders WHERE user_id=?", o.user_id)!.n;
    saveCashback(o, earlier);
  }
}
function takeVolume() { return "DigiPay source-allocation hold remains unchanged"; }
`;

it("keeps DigiPay holds and unrelated incoming code while restoring both server financial safeguards", () => {
  const merged = mergeReviewedCardSource(incoming);
  expect(merged).toContain("AND json_extract(o.policy,'$.binaryEngine')='cards-v1'");
  expect(merged).toContain("AND NOT EXISTS(SELECT 1 FROM p_binary_lots l WHERE l.order_id=o.id)");
  expect(merged).toContain("const earlier = JSON.parse(o.policy).initialPaidPurchase === true ? 0 : 1;");
  expect(merged).not.toContain('const earlier = one("SELECT COUNT(*) n FROM p_card_orders');
  expect(merged.match(/digipayRefundHeldOrderIdsSql/g)).toHaveLength(3);
  expect(merged).toContain('function takeVolume() { return "DigiPay source-allocation hold remains unchanged"; }');
  expect(merged).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
});

it.each([
  incoming.replace("     AND NOT EXISTS(SELECT 1 FROM p_card_orders c WHERE c.order_id=o.id)", ""),
  incoming + "     AND NOT EXISTS(SELECT 1 FROM p_card_orders c WHERE c.order_id=o.id)",
  incoming.replace('    const earlier = one("SELECT COUNT(*) n FROM p_card_orders WHERE user_id=?", o.user_id)!.n;', ""),
  incoming + "\n<<<<<<< another change\n", mergeReviewedCardSource(incoming),
])("refuses missing/repeated anchors, unresolved markers or already patched sources", source => {
  expect(() => mergeReviewedCardSource(source)).toThrow();
});

it("hashes the exact UTF-8 Git blob including its byte count", () => {
  expect(gitBlobHash("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  expect(gitBlobHash(Buffer.from("hello\n"))).toBe(gitBlobHash("hello\n"));
});

it("allows only the three reviewed index-side hashes", () => {
  expect(() => assertReviewedCardBlobs(REVIEWED_CARD_BLOBS)).not.toThrow();
  for (const side of ["base", "installed", "incoming"]) {
    expect(() => assertReviewedCardBlobs({ ...REVIEWED_CARD_BLOBS, [side]: "0".repeat(40) }))
      .toThrow(`Unreviewed ${side} card-engine blob`);
  }
  expect(() => resolveHomaCardMerge({ base: incoming, installed: incoming, incoming }))
    .toThrow("Unreviewed base card-engine blob");
});

it("leaves an unreviewed real conflicted index and worktree file untouched", () => {
  const stage = mkdtempSync(join(tmpdir(), "homa-card-merge-"));
  try {
    const git = (args, input) => {
      const result = spawnSync("git", ["-C", stage, ...args], { encoding: "utf8", input });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    git(["init", "--quiet"]);
    const path = "src/platform/seven-card-engine.ts";
    const hashes = ["base", "installed", "incoming"].map(side => git(["hash-object", "-w", "--stdin"], incoming + `// ${side}\n`));
    git(["update-index", "--index-info"], hashes.map((sha, index) => `100644 ${sha} ${index + 1}\t${path}\n`).join(""));
    const target = join(stage, path), conflict = "<<<<<<< HEAD\nserver\n=======\nrelease\n>>>>>>> incoming\n";
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, conflict);
    const beforeIndex = git(["ls-files", "--stage"]);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./resolve-homa-card-merge.mjs", import.meta.url)), stage], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unreviewed base card-engine blob");
    expect(readFileSync(target, "utf8")).toBe(conflict);
    expect(git(["ls-files", "--stage"])).toBe(beforeIndex);
  } finally { rmSync(stage, { recursive: true, force: true }); }
});
