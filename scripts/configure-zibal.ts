import { loadEnvConfig } from "@next/env";
import { saveSetting } from "../src/platform/providers";
import { platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.APP_ORIGIN?.startsWith("https://")) throw new Error("origin");
  let merchant = "";
  for await (const chunk of process.stdin) {
    merchant += chunk.toString();
    if (merchant.length > 200) throw new Error("length");
  }
  merchant = merchant.trim();
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(merchant) || merchant === "zibal") throw new Error("merchant");
  saveSetting("zibal_merchant", merchant, true);
  merchant = "";
  console.log("Production Zibal merchant saved encrypted. Live payment not tested.");
}
main().catch(() => { console.error("Could not configure Zibal: verify HTTPS origin, master key, database access and merchant input."); process.exitCode = 1; }).finally(() => platformDb().close());
