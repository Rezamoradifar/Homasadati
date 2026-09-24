import { loadEnvConfig } from "@next/env";
import {
  operationalStatus,
  sendOperationalAlert,
} from "../src/platform/monitoring";
import { platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
async function main() {
  const report = operationalStatus();
  let web = false;
  const port = Number(process.env.HTTP_PORT || 3000);
  if (Number.isInteger(port) && port > 0 && port <= 65535)
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      web = r.ok && (await r.json()).status === "ok";
    } catch {}
  const result = {
    ...report,
    checks: { ...report.checks, web },
    status: report.status === "ok" && web ? "ok" : "attention",
  };
  console.log(JSON.stringify(result));
  if (process.argv.includes("--notify")) {
    const alert = await sendOperationalAlert(result);
    if (!alert.configured)
      console.error("Alert webhook is not configured; no notification sent.");
  }
  if (result.status !== "ok") process.exitCode = 1;
}
main()
  .catch(() => {
    console.error("Monitoring failed; inspect private server configuration.");
    process.exitCode = 1;
  })
  .finally(() => platformDb().close());
