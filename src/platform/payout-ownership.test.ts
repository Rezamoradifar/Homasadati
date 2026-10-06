// @vitest-environment node
import {beforeAll,afterAll,it,expect} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {hash} from "../server/http";
import {run,now,platformDb,one} from "./schema";
import {saveSetting} from "./providers";
import {encrypt} from "./security";
import {savePayoutProfile,reviewPayoutProfile,verifiedIban} from "./payout-profile";
const dir=mkdtempSync(join(tmpdir(),"homay-ownership-"));
const details={holderName:"Test owner",nationalId:"0012345679",cardNumber:"6037991234567893",iban:"IR062960000000100324200001"};
let actor:string,user:string;
beforeAll(()=>{
 process.env.DATABASE_PATH=join(dir,"db.sqlite");process.env.PLATFORM_MASTER_KEY="c".repeat(64);
 const member=()=>{const id=randomUUID();run("INSERT INTO p_users(id,name,password,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?)",id,"Test","unused",id,now(),now(),"test");return id;};
 actor=member();user=member();
 run("INSERT INTO p_identities VALUES(?,?,?,?)",user,hash("national:"+details.nationalId),encrypt(details.nationalId),now());
 saveSetting("seven_card_schedule_version","2026-10-06");
});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it("blocks a third-party national code and cannot approve without ownership evidence",()=>{
 expect(()=>savePayoutProfile(user,{...details,nationalId:"0099887761"})).toThrow("national_id_mismatch");
 savePayoutProfile(user,details);
 expect(()=>verifiedIban(user)).toThrow("payout_profile_required");
 expect(()=>reviewPayoutProfile(actor,user,"verified","checked")).toThrow("bank_ownership_proof_required");
 reviewPayoutProfile(actor,user,"verified","Name, national ID and bank ownership checked","bank-check-reference");
 expect(verifiedIban(user)).toBe(details.iban);
 expect(one("SELECT reference FROM p_payout_ownership WHERE user_id=?",user)?.reference).toBe("bank-check-reference");
});
it("requires inheritance proof and fresh staff verification after a destination change",()=>{
 expect(()=>savePayoutProfile(user,{...details,recipientType:"heir",nationalId:"0099887761"})).toThrow("inheritance_proof_required");
 savePayoutProfile(user,{...details,recipientType:"heir",nationalId:"0099887761",inheritanceReference:"verified-estate-document"});
 expect(()=>verifiedIban(user)).toThrow("payout_profile_required");
 reviewPayoutProfile(actor,user,"verified","Estate and heir bank ownership checked","heir-bank-check");
 expect(verifiedIban(user)).toBe(details.iban);
});
