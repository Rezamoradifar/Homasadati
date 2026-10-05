import { loadEnvConfig } from "@next/env";
import { createBackup } from "../src/platform/backup";
import { platformDb, one, atomic } from "../src/platform/schema";
import { setting, saveSetting } from "../src/platform/providers";
import { audit } from "../src/platform/security";

loadEnvConfig(process.cwd());

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (input.length > 1000) throw new Error("input");
  }
  const lines = input.split(/\r?\n/);
  let key = lines[0]?.trim() || "";
  input = "";
  const template = lines[1]?.trim() || setting("sms_template");
  if (!/^[a-f\d]{40,300}$/i.test(key)) throw new Error("key");
  if (!template || template.length > 100) {
    console.error("OTP template is missing. Enter the approved Kavenegar template name and retry.");
    process.exitCode = 1;
    return;
  }
  const admin = one("SELECT id FROM p_users WHERE role='superadmin' AND blocked=0 ORDER BY created_at LIMIT 1");
  if (!admin) throw new Error("admin");
  let info: any;
  try {
    const response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(key)}/account/info.json`, {
      signal: AbortSignal.timeout(15000), redirect: "error",
    });
    if (!response.ok) throw new Error("account");
    info = await response.json();
  } catch { throw new Error("account"); }
  if (info.return?.status !== 200) throw new Error("account");
  console.log("Backup completed:", await createBackup());
  atomic(() => {
    const before = { keyConfigured: !!one("SELECT key FROM p_settings WHERE key='kavenegar_key'"), template: setting("sms_template") || null };
    saveSetting("kavenegar_key", key, true);
    saveSetting("sms_template", template);
    audit(admin.id, "settings.sms.configure", "kavenegar", before,
      { keyConfigured: true, template }, "Owner-authorized SMS setup via root CLI; key redacted");
  });
  key = "";
  lines.fill("");
  console.log(JSON.stringify({ keySavedEncrypted: true, accountStatus: 200, template,
    creditRials: info.entries?.remaincredit ?? null,
    liveSmsTest: "not_run", templateApproval: "check_with_services_check" }, null, 2));
}

main().catch(() => {
  console.error("SMS configuration failed. Check API key, network, database access and encryption configuration. Key was not printed.");
  process.exitCode = 1;
}).finally(() => platformDb().close());
