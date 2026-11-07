#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CARD_PATH = "src/platform/seven-card-engine.ts";
export const REVIEWED_CARD_BLOBS = Object.freeze({
  base: "9fa964acde1d8b529ae8328eb763f5a255b1e547",
  installed: "eb8ffaf863df6e5543deab33e976adfcaec3b1c1",
  incoming: "d5f769d21e671c446272f2a50c92667c809ca805",
});
const MERGED_BLOB = "715592654a92fde6d29ff9da7f43ee0bc55fc2cd";
const ORDER_ANCHOR = "     AND NOT EXISTS(SELECT 1 FROM p_card_orders c WHERE c.order_id=o.id)";
const FIRST_PURCHASE_ANCHOR = '    const earlier = one("SELECT COUNT(*) n FROM p_card_orders WHERE user_id=?", o.user_id)!.n;';

export function gitBlobHash(source) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

export function assertReviewedCardBlobs(hashes) {
  for (const [side, expected] of Object.entries(REVIEWED_CARD_BLOBS)) {
    if (hashes[side] !== expected)
      throw new Error(`Unreviewed ${side} card-engine blob; manual review required`);
  }
}

function replaceOnce(source, anchor, replacement) {
  if (source.split(anchor).length !== 2)
    throw new Error("Card-engine merge anchor is missing or repeated");
  return source.replace(anchor, replacement);
}

/** Combine only the reviewed server safeguards with the incoming DigiPay code.
 * The CLI additionally requires all three exact Git blobs before using this. */
export function mergeReviewedCardSource(source) {
  if (typeof source !== "string" || /^(<<<<<<<|=======|>>>>>>>)/m.test(source))
    throw new Error("Unexpected card-engine conflict markers");
  if (source.includes("initialPaidPurchase") || source.includes("json_extract(o.policy,'$.binaryEngine')") ||
      source.includes("NOT EXISTS(SELECT 1 FROM p_binary_lots l WHERE l.order_id=o.id)"))
    throw new Error("Server card-engine safeguards already present; manual review required");
  const withOrderGuards = replaceOnce(source, ORDER_ANCHOR,
    "     AND json_extract(o.policy,'$.binaryEngine')='cards-v1'\n" +
    "     AND NOT EXISTS(SELECT 1 FROM p_binary_lots l WHERE l.order_id=o.id)\n" + ORDER_ANCHOR);
  return replaceOnce(withOrderGuards, FIRST_PURCHASE_ANCHOR,
    "    // Set by settleOrder using all paid history, inside the payment transaction.\n" +
    "    // Refunding or maturing another order cannot re-open this one-time bonus.\n" +
    "    const earlier = JSON.parse(o.policy).initialPaidPurchase === true ? 0 : 1;");
}

export function resolveHomaCardMerge({ base, installed, incoming }) {
  assertReviewedCardBlobs({
    base: gitBlobHash(base), installed: gitBlobHash(installed), incoming: gitBlobHash(incoming),
  });
  const merged = mergeReviewedCardSource(Buffer.isBuffer(incoming) ? incoming.toString("utf8") : incoming);
  if (gitBlobHash(merged) !== MERGED_BLOB)
    throw new Error("Unexpected merged card-engine blob; manual review required");
  return merged;
}

function main() {
  if (process.argv.length !== 3) throw new Error("Usage: resolve-homa-card-merge.mjs STAGING_WORKTREE");
  const stage = resolve(process.argv[2]);
  const readStage = number => execFileSync("git", ["-c", `safe.directory=${stage}`, "-C", stage,
    "show", `:${number}:${CARD_PATH}`], { maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  // A hash mismatch, missing index stage or unexpected output stops before any
  // write. No release-wide reset or checkout is allowed here.
  const merged = resolveHomaCardMerge({ base: readStage(1), installed: readStage(2), incoming: readStage(3) });
  const target = join(stage, CARD_PATH);
  if (!lstatSync(target).isFile()) throw new Error("Card-engine target must be a regular file");
  writeFileSync(target, merged, "utf8");
  console.log("Resolved reviewed card-engine conflict; preserved server safeguards and DigiPay refund holds.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Card-engine merge stopped");
    process.exitCode = 1;
  }
}
