// Test helper. Never used by application routes or production setup.
import { randomUUID } from "node:crypto";
import { requestWithdrawal } from "../src/platform/finance";
if (process.env.NODE_ENV !== "test") throw new Error("Test-only helper");
try {
  requestWithdrawal(process.argv[2], 9000, "race-fixture", randomUUID());
  process.stdout.write("accepted");
} catch {
  process.stdout.write("rejected");
}
