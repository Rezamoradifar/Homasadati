import { createRequire } from "node:module";
import { parseArgs } from "node:util";
createRequire(process.cwd()+"/package.json")("@next/env").loadEnvConfig(process.cwd());
async function main() {
  const {values}=parseArgs({options:{email:{type:"string"},"manager-email":{type:"string"},ordinal:{type:"string"},desk:{type:"string"},"manager-code":{type:"string"},inspect:{type:"boolean"},permanent:{type:"boolean"}}});
  const {platformDb}=await import("../src/platform/schema");
  const {brandManager,provisionBrandMember}=await import("../src/platform/brand-member");
  const {referralStatus}=await import("../src/platform/referral");
  const {createBackup}=await import("../src/platform/backup");
  try {
    if (values.inspect) {
      const manager=brandManager(values["manager-email"],values["manager-code"]);
      console.log(JSON.stringify({managerEmail:manager.email,placement:referralStatus(manager).placement},null,2));
      return;
    }
    if (!values.email || (!values.ordinal && !values.desk)) throw new Error("email_and_manager_branch_required");
    await createBackup();
    console.log(JSON.stringify(provisionBrandMember({email:values.email,managerEmail:values["manager-email"],managerReferralCode:values["manager-code"],ordinal:values.ordinal ? Number(values.ordinal) : undefined,desk:values.desk ? Number(values.desk) : undefined,permanent:values.permanent || false}),null,2));
  } finally { platformDb().close(); }
}
main().catch(e=>{console.error("Brand account setup stopped:",e.code || e.message);process.exitCode=1;});
