import { createRequire } from "node:module";
import { setting } from "../src/platform/providers";
import { platformDb } from "../src/platform/schema";

const requireEnv = createRequire(process.cwd() + "/package.json");
requireEnv("@next/env").loadEnvConfig(process.cwd());

async function main() {
  const key = setting("kavenegar_key");
  const name = setting("sms_template");
  if (!key || !name || !/^[A-Za-z0-9-]+$/.test(name)) {
    console.error("Missing API key or invalid template name.");
    process.exitCode = 1;
    return;
  }
  async function call(method: string, query = "", data?: Record<string, string>) {
    const response = await fetch(
      `https://api.kavenegar.com/v1/${encodeURIComponent(key!)}/verify/${method}.json${query}`,
      {
        method: data ? "POST" : "GET",
        ...(data ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() } : {}),
        signal: AbortSignal.timeout(15000), redirect: "error",
      },
    );
    const result = await response.json();
    if (!response.ok || result.return?.status !== 200) {
      console.error("Kavenegar response code:", result.return?.status ?? response.status);
      throw new Error("provider");
    }
    return result;
  }
  let complete = false;
  for (let page = 1; page <= 10; page++) {
    const list = await call("templatelist", `?page=${page}`);
    if (!Array.isArray(list.entries)) throw new Error("format");
    const found = list.entries.find((row: any) => row.name === name);
    if (found) {
      console.log(JSON.stringify({ template: name, templateApproval: found.approvalStatus || "unknown", liveSmsTest: "not_run" }, null, 2));
      return;
    }
    const similar = list.entries.find((row: any) => typeof row.name === "string" && row.name.toLowerCase() === name.toLowerCase());
    if (similar) {
      console.log(JSON.stringify({ template: name, existingTemplateName: similar.name, templateApproval: similar.approvalStatus || "unknown", action: "Correct the configured template name to match exactly; no duplicate created." }, null, 2));
      return;
    }
    const total = Number(list.metadata?.TotalPages);
    if (!Number.isInteger(total) || total < 0) throw new Error("pagination");
    if (page >= total) { complete = true; break; }
  }
  if (!complete) throw new Error("pagination");
  const result = await call("addtemplate", "", {
    sourceType: "0", sendMethod: "1", fallBackMethod: "3",
    sourceUrl: "https://homanets.com", sourceName: "Homanet", name,
    textMessage: "هما نت\nکد تأیید شما: %token\nاین کد تا ۵ دقیقه معتبر است. آن را در اختیار دیگران قرار ندهید.",
  });
  const entry = result.entries;
  const id = String(entry?.templateid ?? entry?.id ?? "");
  if (!/^\d+$/.test(id)) {
    console.log(JSON.stringify({ template: name, submitted: true, templateApproval: "unknown", liveSmsTest: "not_run" }, null, 2));
    return;
  }
  const check = await call("gettemplate", `?id=${encodeURIComponent(id)}`);
  const details = Array.isArray(check.entries) ? check.entries[0] : check.entries;
  console.log(JSON.stringify({ template: name, submitted: true, templateApproval: details?.approvalStatus || "unknown", liveSmsTest: "not_run" }, null, 2));
}

main().catch(() => {
  console.error("Template setup did not complete. Check the reported provider code or connectivity. API key was not printed; no SMS was sent.");
  process.exitCode = 1;
}).finally(() => platformDb().close());
