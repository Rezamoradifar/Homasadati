import { createRequire } from "node:module";
createRequire(process.cwd()+"/package.json")("@next/env").loadEnvConfig(process.cwd());
async function main() {
  const {platformDb,one,atomic} = await import("../src/platform/schema");
  const {createBackup} = await import("../src/platform/backup");
  const {configureFourReferrals} = await import("../src/platform/card-positions");
  const {FOUR_REFERRAL_VERSION} = await import("../src/platform/card-position-model");
  const {setting} = await import("../src/platform/providers");
  const {audit} = await import("../src/platform/security");
  const actor = one("SELECT id FROM p_users WHERE role='superadmin' AND blocked=0 ORDER BY created_at LIMIT 1");
  if (!actor) throw new Error("administrator_required");
  await createBackup();
  atomic(() => {
    const before = setting("seven_card_position_version");
    configureFourReferrals();
    if (before !== FOUR_REFERRAL_VERSION)
      audit(actor.id,"seven-card.positions",FOUR_REFERRAL_VERSION,{version:before},{version:FOUR_REFERRAL_VERSION},"Seven personal positions; four referral slots with mandatory owner placement and volume only after activation");
  });
  console.log(JSON.stringify({positionVersion:FOUR_REFERRAL_VERSION,liveSettlement:setting("seven_card_live")==="1"}));
  platformDb().close();
}
main().catch(e => {console.error("Position setup stopped:",e.code || e.message);process.exitCode=1;});
