import { createRequire } from "node:module";
createRequire(process.cwd()+"/package.json")("@next/env").loadEnvConfig(process.cwd());
async function main(){
  const {platformDb,one,atomic}=await import("../src/platform/schema");
  const {createBackup}=await import("../src/platform/backup");
  const {configurePositions,positionMode}=await import("../src/platform/card-positions");
  const {audit}=await import("../src/platform/security");
  await createBackup();
  const actor=one("SELECT id FROM p_users WHERE role='superadmin' AND blocked=0 ORDER BY created_at LIMIT 1");
  if(!actor)throw new Error("administrator_required");
  const {setting}=await import("../src/platform/providers");
  const before=positionMode();atomic(()=>{configurePositions();
  if(!before)audit(actor.id,"seven-card.positions","aa-2026-10-06",{enabled:false},{enabled:true},"Owner requested aa.pdf topology, direct placement and per-position volume");});
  console.log(JSON.stringify({positionVersion:"aa-2026-10-06",liveSettlement:setting("seven_card_live")==="1",note:"Existing live setting is preserved; activation is separate."}));platformDb().close();
}
main().catch(e=>{console.error("Position setup stopped:",e.code || e.message);process.exitCode=1;});
