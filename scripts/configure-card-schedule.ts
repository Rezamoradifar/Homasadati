import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(process.cwd()+"/package.json");
require("@next/env").loadEnvConfig(process.cwd());
async function main() {
  const {platformDb,atomic,one}=await import("../src/platform/schema");
  const {saveSetting,setting}=await import("../src/platform/providers");
  const {audit}=await import("../src/platform/security");
  const {createBackup}=await import("../src/platform/backup");
  if(process.argv[2] === "--restore") {
    const previous=JSON.parse(readFileSync(process.argv[3],"utf8"));
    atomic(()=>{saveSetting("seven_card_plan_draft",previous.draft || "");saveSetting("seven_card_schedule_version",previous.schedule || "");});
    platformDb().close();return;
  }
  await createBackup();
  if(process.argv[2]) writeFileSync(process.argv[2],JSON.stringify({draft:setting("seven_card_plan_draft"),schedule:setting("seven_card_schedule_version")}),{mode:0o600});
  atomic(()=>{
    const actor=one("SELECT id FROM p_users WHERE role='superadmin' AND blocked=0 ORDER BY created_at LIMIT 1");
    if(!actor) throw new Error("administrator_required");
    const raw=setting("seven_card_plan_draft"),before=raw?JSON.parse(raw):null;
    const after={revision:(before?.revision || 0)+1,decisions:{overflow:"flush",counterScope:"member",voucherCountsTowardCap:true,topology:"own-desks",purchaseCredit:"purchase-value",weekStart:1}};
    saveSetting("seven_card_plan_draft",JSON.stringify(after));
    saveSetting("seven_card_schedule_version","2026-10-06");
    audit(actor.id,"seven-card.schedule","2026-10-06",before,after,"Owner approved Monday calculation, next-week payment, 10.5m cap and flush");
  });
  console.log(JSON.stringify({schedule:"2026-10-06",deskWeeklyCapToman:10500000,liveSettlement:setting("seven_card_live")==="1",identityInquiry:"not_configured"}));
  platformDb().close();
}
main().catch(()=>{console.error("Schedule setup failed. No secrets printed.");process.exitCode=1;});
