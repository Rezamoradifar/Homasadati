import { createRequire } from "node:module";
import { setting } from "../src/platform/providers";
import { platformDb } from "../src/platform/schema";

const requireEnv = createRequire(process.cwd() + "/package.json");
requireEnv("@next/env").loadEnvConfig(process.cwd());
let phase = "load_settings";

async function main() {
  const key = setting("kavenegar_key");
  const name = setting("sms_template");
  if (!key || !name || !/^[A-Za-z0-9-]+$/.test(name)) {
    console.error("Missing API key or invalid template name.");
    process.exitCode = 1;
    return;
  }
  async function call(method: string, query = "", data?: Record<string, string>) {
    phase = method;
    console.log("Kavenegar operation:", method);
    let response: Response;
    try { response = await fetch(
      `https://api.kavenegar.com/v1/${encodeURIComponent(key!)}/verify/${method}.json${query}`,
      {
        method: data ? "POST" : "GET",
        ...(data ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() } : {}),
        signal: AbortSignal.timeout(15000), redirect: "error",
      },
    ); } catch (error: any) {
      const code = error?.cause?.code;
      const safeCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"];
      console.error("Connection failure:", safeCodes.includes(code) ? code : error?.name === "TimeoutError" ? "request_timeout" : "network_or_tls_error");
      throw new Error("network");
    }
    let result: any;
    try { result = await response.json(); }
    catch { console.error("Non-JSON response; HTTP status:", response.status); throw new Error("format"); }
    if (!response.ok || result.return?.status !== 200) {
      console.error("Kavenegar response code:", result.return?.status ?? response.status);
      throw new Error("provider");
    }
    return result;
  }
  let complete = false;
  for (let page = 1; page <= 10; page++) {
    const list = await call("templatelist", `?page=${page}`);
    phase = "read_template_list";
    if (!Array.isArray(list.entries)) {
      console.error("Unexpected template list format:", typeof list.entries);
      throw new Error("format");
    }
    console.log("Template page:", JSON.stringify({ page, count: list.entries.length, totalPages: list.metadata?.TotalPages ?? null }));
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
    // Some empty-account responses omit pagination metadata entirely.
    if (list.entries.length === 0) { complete = true; break; }
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
  console.error("Template setup did not complete; phase:", phase, ". API key was not printed; no SMS was sent. If phase is gettemplate, creation may already have succeeded; rerunning checks existing templates first.");
  process.exitCode = 1;
}).finally(() => platformDb().close());
