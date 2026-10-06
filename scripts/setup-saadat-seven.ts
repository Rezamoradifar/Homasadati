import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
createRequire(process.cwd()+'/package.json')('@next/env').loadEnvConfig(process.cwd());
async function main(){
 const {all,one,run,now,atomic,platformDb}=await import('../src/platform/schema');
 const {passwordHash,encrypt,decrypt,audit}=await import('../src/platform/security');
 const {setting,saveSetting}=await import('../src/platform/providers');
 const {createBackup}=await import('../src/platform/backup');
 const {manageCompanyMember}=await import('../src/platform/company-members');
 const {bindDirect,positionDesks}=await import('../src/platform/card-positions');
 try{
  const saved=setting('company_seven_left6_v1');
  if(saved){console.log(decrypt(saved));return;}
  const owners=all("SELECT * FROM p_users WHERE role='superadmin' AND blocked=0");
  if(owners.length!==1)throw new Error('Exactly one active main administrator is required.');
  const owner=owners[0];
  const anchor=one("SELECT * FROM p_users WHERE email='club.position6@homanets.com' AND blocked=0");
  if(!anchor)throw new Error('Active sixth company account is required.');
  const original=setting('company_six_setup_v1');
  if(!original)throw new Error('Original company account setup is required.');
  const commonPassword=JSON.parse(decrypt(original)).commonPassword;
  if(setting('seven_card_position_version')!=='aa-2026-10-06')throw new Error('Position mode is not configured.');
  if(one("SELECT id FROM p_users WHERE parent_id=? AND leg='left'",anchor.id))throw new Error('Sixth account left position is occupied; existing network was preserved.');
  const emails=Array.from({length:7},(_,i)=>`saadat.position${i+1}@homanets.com`);
  if(emails.some(email=>one('SELECT id FROM p_users WHERE email=?',email)))throw new Error('An account email already exists; no accounts changed.');
  await createBackup();
  const password=commonPassword;
  const ids=emails.map(()=>randomUUID());
  const output=atomic(()=>{
   const parents=[anchor.id,ids[0],ids[0],ids[1],ids[1],ids[2],ids[2]];
   const legs=['left','left','right','left','right','left','right'];
   const users=ids.map((id,i)=>{
    const referral='HN'+randomBytes(6).toString('hex').toUpperCase();
    run('INSERT INTO p_users(id,email,name,password,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip,preferences) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,emails[i],`هما سعادت ${i+1}`,passwordHash(password),referral,parents[i],parents[i],legs[i],now(),now(),'owner-authorized-setup',JSON.stringify({email:false,sms:false,inApp:true}));
    run('INSERT INTO p_wallets(user_id) VALUES(?)',id);
    manageCompanyMember(owner.id,{userId:id,action:'positions',desks:1,reason:'Owner requested provisional first company card',eventId:randomUUID()});
    manageCompanyMember(owner.id,{userId:id,action:'credit',amount:10000000,reason:'Owner requested purchase-only company credit without commission volume',eventId:randomUUID()});
    bindDirect(parents[i],id);
    if(positionDesks(id)!==1)throw new Error('First card activation failed');
    return {name:`هما سعادت ${i+1}`,email:emails[i],referral,parent:i===0?'club.position6@homanets.com':`هما سعادت ${Math.floor((i-1)/2)+1}`,side:legs[i],creditToman:10000000};
   });
   const result={anchor:anchor.email,branch:'left',commonPassword:password,users};
   saveSetting('company_seven_left6_v1',encrypt(JSON.stringify(result,null,2)));
   audit(owner.id,'company-seven-left6.setup',owner.id,null,{userIds:ids,count:7},'Owner requested seven branded company accounts under sixth account left branch');
   return result;
  });
  console.log(JSON.stringify(output,null,2));
 }finally{platformDb().close();}
}
main().catch(e=>{console.error('Setup stopped:',e.message);process.exitCode=1;});
