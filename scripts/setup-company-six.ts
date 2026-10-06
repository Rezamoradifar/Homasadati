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
  const saved=setting('company_six_setup_v1');
  if(saved){console.log(decrypt(saved));return;}
  const owners=all("SELECT * FROM p_users WHERE role='superadmin' AND blocked=0");
  if(owners.length!==1)throw new Error('Exactly one active main administrator is required.');
  const owner=owners[0];
  if(setting('seven_card_position_version')!=='aa-2026-10-06')throw new Error('Position mode is not configured.');
  if(one('SELECT id FROM p_users WHERE parent_id=?',owner.id))throw new Error('Manager already has binary children; existing network was preserved.');
  const emails=Array.from({length:6},(_,i)=>`club.position${i+1}@homanets.com`);
  if(emails.some(email=>one('SELECT id FROM p_users WHERE email=?',email)))throw new Error('An account email already exists; no accounts changed.');
  await createBackup();
  const password='Hn!'+randomBytes(12).toString('base64url')+'9a';
  const ids=emails.map(()=>randomUUID());
  const output=atomic(()=>{
   const before=one('SELECT * FROM p_company_positions WHERE user_id=?',owner.id);
   run("INSERT INTO p_company_positions VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET desks=7,actor_id=excluded.actor_id,last_status='qualified'",owner.id,7,now(),new Date(Date.now()+35*86400000).toISOString(),owner.id,'qualified');
   saveSetting('company_position_permanent_owner',owner.id);
   audit(owner.id,'company-position.permanent-owner',owner.id,before,{desks:7,exempt:true},'Owner requested seven permanent manager cards without 35-day condition');
   const parents=[owner.id,owner.id,ids[0],ids[0],ids[1],ids[1]];
   const legs=['left','right','left','right','left','right'];
   const users=ids.map((id,i)=>{
    const referral='HN'+randomBytes(6).toString('hex').toUpperCase();
    run('INSERT INTO p_users(id,email,name,password,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip,preferences) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,emails[i],`هما نت ${i+1}`,passwordHash(password),referral,parents[i],parents[i],legs[i],now(),now(),'owner-authorized-setup',JSON.stringify({email:false,sms:false,inApp:true}));
    run('INSERT INTO p_wallets(user_id) VALUES(?)',id);
    manageCompanyMember(owner.id,{userId:id,action:'positions',desks:1,reason:'Owner requested provisional first company card',eventId:randomUUID()});
    manageCompanyMember(owner.id,{userId:id,action:'credit',amount:10000000,reason:'Owner requested purchase-only company credit without commission volume',eventId:randomUUID()});
    bindDirect(parents[i],id);
    if(positionDesks(id)!==1)throw new Error('First card activation failed');
    return {name:`هما نت ${i+1}`,email:emails[i],referral,parent:i<2?'manager':`هما نت ${i<4?1:2}`,side:legs[i],creditToman:10000000};
   });
   if(positionDesks(owner.id)!==7)throw new Error('Manager activation failed');
   const result={manager:{email:owner.email,referral:owner.referral_code,cards:7,deadlineExempt:true,passwordChanged:false},commonPassword:password,users};
   saveSetting('company_six_setup_v1',encrypt(JSON.stringify(result,null,2)));
   audit(owner.id,'company-six.setup',owner.id,null,{userIds:ids,count:6},'Owner requested two-level binary company network');
   return result;
  });
  console.log(JSON.stringify(output,null,2));
 }finally{platformDb().close();}
}
main().catch(e=>{console.error('Setup stopped:',e.message);process.exitCode=1;});
