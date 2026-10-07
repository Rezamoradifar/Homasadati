import { createRequire } from "node:module";
createRequire(process.cwd()+"/package.json")("@next/env").loadEnvConfig(process.cwd());
async function main() {
  const {platformDb,one,atomic} = await import("../src/platform/schema");
  const {createBackup} = await import("../src/platform/backup");
  const {configureSevenLevelPlan} = await import("../src/platform/card-positions");
  const {SEVEN_LEVEL_VERSION} = await import("../src/platform/card-levels");
  const {setting} = await import("../src/platform/providers");
  const {audit} = await import("../src/platform/security");
  const actor = one("SELECT id FROM p_users WHERE role='superadmin' AND blocked=0 ORDER BY created_at LIMIT 1");
  if (!actor) throw new Error("administrator_required");
  await createBackup();
  atomic(() => {
    const before = setting("seven_card_position_version");
    configureSevenLevelPlan();
    if (before !== SEVEN_LEVEL_VERSION)
      audit(actor.id,"seven-card.positions",SEVEN_LEVEL_VERSION,{version:before},{version:SEVEN_LEVEL_VERSION},"Seven personal positions; seven card levels; 15m cap per position; 2–8 manual referral branches; post-activation volume");
  });
  console.log(JSON.stringify({positionVersion:SEVEN_LEVEL_VERSION,liveSettlement:setting("seven_card_live")==="1"}));
  platformDb().close();
}
main().catch(e => {console.error("Position setup stopped:",e.code || e.message);process.exitCode=1;});
