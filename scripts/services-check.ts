import { loadEnvConfig } from "@next/env";
import { setting } from "../src/platform/providers";
import { platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
async function checkSms() {
  const key = setting("kavenegar_key"),
    template = setting("sms_template");
  if (!key) return { configured: false, account: "not_configured" };
  async function read(path: string) {
    try {
      const r = await fetch(
        `https://api.kavenegar.com/v1/${encodeURIComponent(key!)}/${path}`,
        { signal: AbortSignal.timeout(15000), redirect: "error" },
      );
      const data = await r.json();
      return data;
    } catch {
      return { return: { status: "unavailable" } };
    }
  }
  const info = await read("account/info.json"),
    config = await read("account/config.json");
  const result: Record<string, unknown> = {
    configured: !!template,
    accountStatus: info.return?.status,
    creditRials:
      info.return?.status === 200 ? info.entries?.remaincredit : null,
    debugMode:
      config.return?.status === 200 ? config.entries?.debugmode : "unknown",
    template: template || null,
    templateApproval: "unknown",
  };
  if (template) {
    for (let page = 1; page <= 10; page++) {
      const data = await read(`verify/templatelist.json?page=${page}`);
      if (data.return?.status !== 200 || !Array.isArray(data.entries)) break;
      const found = data.entries.find(
        (row: { name?: string }) => row.name === template,
      );
      if (found) {
        result.templateApproval = found.approvalStatus || "unknown";
        break;
      }
      if (page >= Number(data.metadata?.TotalPages || 1)) {
        result.templateApproval = "not_found";
        break;
      }
    }
  }
  return result;
}
async function main() {
  const sms = await checkSms();
  console.log(
    JSON.stringify(
      {
        sms,
        zibal: {
          configured: !!setting("zibal_merchant"),
          callbackUrl: process.env.APP_ORIGIN
            ? `${process.env.APP_ORIGIN}/api/platform/payment/callback?gateway=zibal`
            : null,
          livePaymentTest: "not_run",
        },
      },
      null,
      2,
    ),
  );
}
main()
  .catch(() => {
    console.error(
      "Service check failed: verify environment, database access and master key.",
    );
    process.exitCode = 1;
  })
  .finally(() => platformDb().close());
