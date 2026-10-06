import {createRequire} from 'node:module';
createRequire(process.cwd()+'/package.json')('@next/env').loadEnvConfig(process.cwd());
async function main(){
 const {all,one,run,atomic,platformDb}=await import('../src/platform/schema');
 const {createBackup}=await import('../src/platform/backup');
 const {audit}=await import('../src/platform/security');
 const {saveSetting}=await import('../src/platform/providers');
 const emails=[...Array.from({length:6},(_,i)=>`club.position${i+1}@homanets.com`),...Array.from({length:7},(_,i)=>`saadat.position${i+1}@homanets.com`)];
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 try{
  const owner=one("SELECT id FROM p_users WHERE email='moradi5024@gmail.com' AND role='superadmin' AND blocked=0");
  if(!owner)throw new Error('Main administrator not found');
  const users=emails.flatMap(email=>{const u=one('SELECT * FROM p_users WHERE email=?',email);return u?[u]:[];});
  if(!users.length){console.log('No matching accounts remain.');return;}
  const ids=users.map(u=>u.id),marks=ids.map(()=>'?').join(',');
  if(ids.includes(owner.id)||users.some(u=>u.role!=='user'))throw new Error('Only requested ordinary company accounts can be removed');
  const allowed=new Set(['p_sessions','p_google_logins','p_google_identities','p_wallets','p_company_credit','p_company_positions','p_company_actions','p_archived_users','p_card_direct_positions','p_card_members']);
  const tables=all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const refs=tables.flatMap(t=>all(`PRAGMA foreign_key_list(${quote(t.name)})`).filter(f=>f.table==='p_users').map(f=>({table:t.name,column:f.from})));
  const check=()=>{
   if(one(`SELECT id FROM p_users WHERE (parent_id IN (${marks}) OR sponsor_id IN (${marks})) AND id NOT IN (${marks})`,...ids,...ids,...ids))throw new Error('External descendants exist; deletion stopped');
   if(one(`SELECT user_id FROM p_wallets WHERE user_id IN (${marks}) AND (available!=0 OR pending!=0 OR held!=0 OR debt!=0)`,...ids))throw new Error('Financial wallet balance exists; deletion stopped');
   if(one(`SELECT user_id FROM p_card_members WHERE user_id IN (${marks}) AND total!=0`,...ids))throw new Error('Real purchase history exists; deletion stopped');
   if(one(`SELECT user_id FROM p_company_credit WHERE user_id IN (${marks}) AND (delta<=0 OR event_key NOT LIKE 'admin-credit:%')`,...ids))throw new Error('Company credit has spending or other entries; deletion stopped');
   for(const r of refs){
    if(r.table==='p_users')continue;
    const hit=one(`SELECT 1 hit FROM ${quote(r.table)} WHERE ${quote(r.column)} IN (${marks}) LIMIT 1`,...ids);
    if(!hit)continue;
    if(!allowed.has(r.table))throw new Error('Linked records require review: '+r.table+'.'+r.column);
    if(['p_company_positions','p_company_actions','p_archived_users'].includes(r.table)&&r.column==='actor_id'&&one(`SELECT 1 hit FROM ${quote(r.table)} WHERE actor_id IN (${marks}) AND user_id NOT IN (${marks})`,...ids,...ids))throw new Error('Account acted on another member; deletion stopped');
   }
  };
  check();await createBackup();
  atomic(()=>{
   check();
   const trigger=one("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='p_company_credit_no_delete'");
   if(!trigger?.sql)throw new Error('Credit immutability trigger not found');
   run('DROP TRIGGER p_company_credit_no_delete');
   for(const table of allowed){
    if(!tables.some(t=>t.name===table))continue;
    const columns=refs.filter(r=>r.table===table).map(r=>r.column);
    if(columns.length)run(`DELETE FROM ${quote(table)} WHERE ${columns.map(c=>`${quote(c)} IN (${marks})`).join(' OR ')}`,...columns.flatMap(()=>ids));
   }
   run(trigger.sql);
   run(`DELETE FROM p_google_challenges WHERE user_id IN (${marks})`,...ids);
   run(`UPDATE p_users SET parent_id=NULL,leg=NULL,sponsor_id=NULL WHERE id IN (${marks})`,...ids);
   run(`DELETE FROM p_users WHERE id IN (${marks})`,...ids);
   saveSetting('company_six_setup_v1','');saveSetting('company_seven_left6_v1','');
   if(all('PRAGMA foreign_key_check').length)throw new Error('Foreign key verification failed');
   audit(owner.id,'company-accounts.permanent-removal',owner.id,{emails:users.map(u=>u.email)},{deleted:ids.length},'Owner explicitly requested permanent removal of incorrectly created accounts; backup retained');
  });
  console.log(JSON.stringify({deleted:users.map(u=>u.email),count:ids.length,managerPreserved:true},null,2));
 }finally{platformDb().close();}
}
main().catch(e=>{console.error('Deletion stopped; transaction was not applied:',e.message);process.exitCode=1;});
