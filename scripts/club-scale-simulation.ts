/** Offline fixtures only. Always creates a new temporary database; never loads .env. */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const self=resolve(process.argv[1]);
async function main(){
const members=Number(process.argv[3]);
if(process.argv[2]==='--worker') {
  assert(Number.isInteger(members)&&members>=16&&members<=10000,'Fixture size must be 16..10000');
  const shape=process.argv[4]||'balanced';assert(['balanced','left-heavy'].includes(shape));
  const fanout=shape==='left-heavy'?2:8;
  const parentOf=(child:number)=>Math.floor((child-1)/fanout);
  const ordinalOf=(child:number)=>shape==='left-heavy'?([1,5][(child-1)%2]):(child-1)%8+1;
  const dir=mkdtempSync(join(tmpdir(),'homay-scale-'));
  process.env.DATABASE_PATH=join(dir,'fixture.sqlite');process.env.APP_ORIGIN='https://scale.test';process.env.PLATFORM_MASTER_KEY='a'.repeat(64);
  const loopbackFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async()=>{throw Error('Network is disabled in the simulation');};
  const {run,all,one,atomic,now,platformDb}=await import('../src/platform/schema');
  const {saveSetting}=await import('../src/platform/providers');
  const {configureSevenLevelPlan,bindDirect,personalPositionTree}=await import('../src/platform/card-positions');
  const {setReferralPlacement}=await import('../src/platform/referral');
  const {createOrder,settleOrder}=await import('../src/platform/finance');
  const {runCardSettlement,weekStartAt,releaseCardRewards}=await import('../src/platform/seven-card-engine');
  const {searchTree,placementTree}=await import('../src/platform/network-tree');
  const {cardActivityReport}=await import('../src/platform/card-activity-report');
  const {randomUUID}=await import('node:crypto');
  try {
    const start=performance.now(),price=70000000,matchVolume=30000000,reward=4900000,cap=15000000;
    saveSetting('seven_card_schedule_version','2026-10-06');configureSevenLevelPlan();
    saveSetting('seven_card_plan_draft',JSON.stringify({revision:1,decisions:{overflow:'flush',counterScope:'member',voucherCountsTowardCap:true,topology:'own-desks',purchaseCredit:'purchase-value',weekStart:1}}));
    saveSetting('seven_card_live','1');saveSetting('seven_card_budget_unlimited','1');saveSetting('seven_card_live_since',String(Date.now()-1000));
    saveSetting('commission_policy',JSON.stringify({directBps:0,levels:[],binaryBps:0,maxPayoutBps:0,warningBps:5000,criticalBps:8000,withdrawMin:1,withdrawMax:1000000000,paused:false}));
    const product=randomUUID();run("INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,cancel_hours,published,created_at,updated_at) VALUES(?,?,?,'craft','card',?,?,0,1,?,?)",product,'Scale fixture','',price,members+100,now(),now());
    const ids=Array.from({length:members},(_,i)=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0'));
    atomic(()=>{
      for(let i=0;i<members;i++) {
        const parent=i?parentOf(i):null,ordinal=i?ordinalOf(i):null;
        run("INSERT INTO p_users(id,name,password,referral_code,sponsor_id,preferences,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,'fixture')",ids[i],'عضو آزمایشی '+i,'not-a-login',ids[i],parent===null?null:ids[parent],JSON.stringify({inApp:false,email:false,sms:false}),now(),now());run('INSERT INTO p_wallets(user_id) VALUES(?)',ids[i]);
        if(parent!==null){setReferralPlacement(one('SELECT * FROM p_users WHERE id=?',ids[parent])!,{ordinal:ordinal!});bindDirect(ids[parent],ids[i]);assert(!one('SELECT * FROM p_referral_endpoint_choice WHERE user_id=?',ids[parent]),'placement choice must be consumed');}
        const order=createOrder(ids[i],product,1,'zibal',randomUUID());settleOrder(order.id,'fixture-bank-'+i);
      }
    });
    const seedMs=performance.now()-start;process.stderr.write('Seeded '+members+' members in '+Math.round(seedMs)+'ms; RSS '+Math.round(process.memoryUsage().rss/1024/1024)+'MiB; settling…\n');
    // Independent oracle: the agreed fixed 1–2–4 positions and eight endpoints.
    // No use of directRoutes, previewCardMatches or settlement output in this calculation.
    const paths=['','L','R','LL','LR','RL','RR'],endpoints=['LLL','RRR','LRL','RLL','LLR','LRR','RLR','RRL'];
    const pools=new Map<string,{left:number;right:number}>();let expectedLots=0;
    for(let buyer=1;buyer<members;buyer++)for(let child=buyer;child>0;child=parentOf(child)) {
      const parent=parentOf(child),path=endpoints[ordinalOf(child)-1];
      paths.forEach((prefix,index)=>{if(path.startsWith(prefix)){const key=ids[parent]+':'+(index+1),pool=pools.get(key)||{left:0,right:0};pool[path[prefix.length]==='L'?'left':'right']+=price;pools.set(key,pool);expectedLots++;}});
    }
    let expectedCash=0,expectedVoucher=0,expectedFlush=0,expectedMatches=0;
    const expected=new Map<string,{left:number;right:number;due:number;flushed:number;cash:number;voucher:number}>();
    for(let i=0;i<members;i++){let sequence=0;for(let desk=1;desk<=7;desk++) {
      const key=ids[i]+':'+desk,pool=pools.get(key)||{left:0,right:0};const count=Math.floor(Math.min(pool.left,pool.right)/matchVolume);let allowance=cap,due=0,cash=0,voucher=0,flush=0;
      for(let n=0;n<Math.min(count,4);n++){const pay=Math.min(reward,allowance);sequence++;due+=pay;allowance-=pay;if(sequence%8===0)voucher+=pay;else cash+=pay;flush+=reward-pay;expectedMatches++;}
      flush+=Math.max(0,count-4)*reward;expectedCash+=cash;expectedVoucher+=voucher;expectedFlush+=flush;
      if(pool.left||pool.right)expected.set(key,{left:pool.left-count*matchVolume,right:pool.right-count*matchVolume,due,flushed:flush,cash,voucher});
    }}
    const cutoff=weekStartAt(Date.now(),1)+7*86400000+3600000;
    const began=performance.now();const weeks=runCardSettlement(cutoff);const settlementMs=performance.now()-began;
    assert.equal(one('SELECT COUNT(*) n FROM p_card_orders')!.n,members,'every order, including batches above 2000, must count');
    assert.equal(one('SELECT COUNT(*) n FROM p_card_position_lots')!.n,expectedLots);
    assert.equal(one('SELECT COUNT(*) n FROM p_card_position_lots l JOIN p_orders o ON o.id=l.order_id WHERE l.user_id=o.user_id')!.n,0,'own purchases must not create own commission volume');
    assert.equal(one('SELECT SUM(sales) n FROM p_card_weeks')!.n,members*price);
    const actualPools=all("SELECT user_id,desk,SUM(CASE WHEN leg='left' THEN remaining ELSE 0 END) l,SUM(CASE WHEN leg='right' THEN remaining ELSE 0 END) r FROM p_card_position_lots GROUP BY user_id,desk");
    for(const row of actualPools){const e=expected.get(row.user_id+':'+row.desk)!;assert.deepEqual([row.l,row.r],[e.left,e.right],'remaining volume '+row.user_id+':'+row.desk);}
    const rewards=one("SELECT SUM(CASE WHEN kind='cash' THEN amount ELSE 0 END) cash,SUM(CASE WHEN kind='voucher' THEN amount ELSE 0 END) voucher FROM p_card_due")!;
    assert.equal(rewards.cash||0,expectedCash);assert.equal(rewards.voucher||0,expectedVoucher);assert.equal(one('SELECT COALESCE(SUM(amount),0) n FROM p_card_flush')!.n,expectedFlush);
    assert.equal(one('SELECT COUNT(*) n FROM p_card_matches WHERE sequence>0')!.n,expectedMatches);
    assert.equal(all('SELECT d.user_id,m.desk FROM p_card_due d JOIN p_card_matches m ON m.id=d.match_id GROUP BY d.user_id,m.desk HAVING SUM(d.amount)>?',cap).length,0);
    assert.equal(one('SELECT COUNT(*) n FROM p_card_matches WHERE sequence>0 AND ((sequence%8=0 AND kind!=\'voucher\') OR (sequence%8!=0 AND kind!=\'cash\'))')!.n,0);
    const before=one('SELECT COUNT(*) n FROM p_card_matches')!.n;assert.deepEqual(runCardSettlement(cutoff),[]);assert.equal(one('SELECT COUNT(*) n FROM p_card_matches')!.n,before);
    process.stderr.write('Financial oracle passed; releasing and measuring reads…\n');
    const releaseStart=performance.now();releaseCardRewards(cutoff+7*86400000);const releaseMs=performance.now()-releaseStart;assert.equal(releaseCardRewards(cutoff+7*86400000),0);
    assert.equal(one("SELECT COALESCE(SUM(amount),0) n FROM p_card_payouts WHERE kind='cash'")!.n,expectedCash);
    assert.equal(one('SELECT SUM(amount) n FROM p_card_voucher_ledger')!.n||0,expectedVoucher);assert.equal(one('SELECT SUM(pending) n FROM p_wallets')!.n,0);
    const measure=(action:()=>unknown)=>{const durations=[];for(let i=0;i<15;i++){const t=performance.now();action();durations.push(performance.now()-t);}durations.sort((a,b)=>a-b);return {samples:15,p50Ms:+durations[7].toFixed(2),p95Ms:+durations[14].toFixed(2)};};
    const tree=personalPositionTree(ids[0]);
    const inspect=(node:any)=>{const key=ids[0]+':'+node.desk,pool=pools.get(key)||{left:0,right:0},remaining=expected.get(key)||{left:0,right:0};assert.deepEqual([node.leftVolume,node.rightVolume,node.savings.left,node.savings.right,node.weeklySales],[pool.left,pool.right,remaining.left,remaining.right,pool.left+pool.right]);if(node.left)inspect(node.left);if(node.right)inspect(node.right);};inspect(tree.tree);
    const reads={positionTree:measure(()=>personalPositionTree(ids[0])),placementTree:measure(()=>placementTree(ids[0],ids[0],3)),search:measure(()=>searchTree(ids[0],'عضو آزمایشی')),report:measure(()=>cardActivityReport(ids[0],1))};
    assert.equal(personalPositionTree(ids[0]).desks,7);assert.equal(searchTree(ids[members-1],'عضو آزمایشی').length,0);assert.equal((platformDb().pragma('foreign_key_check') as unknown[]).length,0);
    // Real authenticated API handlers behind an isolated loopback HTTP server.
    const {handle}=await import('../src/platform/api');const {session,SESSION_COOKIE}=await import('../src/platform/security');
    const cookie=SESSION_COOKIE+'='+session(ids[0],'fixture');
    const server=createServer(async(req,res)=>{try{const url=new URL(req.url!,'https://scale.test');const response=await handle(new Request(url,{headers:{cookie:req.headers.cookie||'',host:'scale.test'}}),url.pathname.replace('/api/platform/','').split('/'));res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());}catch{res.writeHead(500);res.end('{}');}});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert(address&&typeof address!=='string');
    const apiPaths=['network-tree?depth=3','network-search?q='+encodeURIComponent('عضو آزمایشی'),'binary','referral'];
    const durations:number[]=[];let cursor=0,failures=0;
    try{const denied=await loopbackFetch('http://127.0.0.1:'+address.port+'/api/platform/network-tree');assert.equal(denied.status,401);await denied.arrayBuffer();await Promise.all(Array.from({length:6},async()=>{while(cursor<120){const index=cursor++,t=performance.now();try{const response=await loopbackFetch('http://127.0.0.1:'+address.port+'/api/platform/'+apiPaths[index%apiPaths.length],{headers:{cookie},signal:AbortSignal.timeout(10000)});const body=await response.json();if(response.status!==200||!body)failures++;}catch{failures++;}durations.push(performance.now()-t);}}));}
    finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
    assert.equal(failures,0,'authenticated loopback HTTP requests must succeed');durations.sort((a,b)=>a-b);
    const http={requests:120,concurrency:6,failures,p50Ms:+durations[60].toFixed(2),p95Ms:+durations[114].toFixed(2),scope:'loopback API server with actual handlers and session; excludes Next.js rendering, Nginx, Cloudflare and WAN'};
    const cashback=one('SELECT COALESCE(SUM(amount),0) n FROM p_card_cashbacks WHERE reversed=0')!.n;
    const result={members,positions:members*7,scenario:shape==='left-heavy'?'left-heavy-two-endpoint':'balanced-eight-endpoint',purchasePerMemberToman:price,maxRssMiB:+(process.resourceUsage().maxRSS/1024).toFixed(1),seedMs:+seedMs.toFixed(1),settlementMs:+settlementMs.toFixed(1),releaseMs:+releaseMs.toFixed(1),reads,http,salesToman:members*price,cashRewardToman:expectedCash,voucherToman:expectedVoucher,cashbackToman:cashback,flushedToman:expectedFlush,rewardAndCashbackPercent:+((expectedCash+expectedVoucher+cashback)/(members*price)*100).toFixed(2),positionLots:expectedLots,matches:expectedMatches,settledWeeks:weeks.length,checks:'passed',scope:'isolated SQLite, actual application functions and loopback HTTP API load; simulated paid fixtures, no live bank traffic'};
    console.log(JSON.stringify(result));
  } finally {platformDb().close();rmSync(dir,{recursive:true,force:true});}
} else {
  const counts=process.argv.slice(2).filter(x=>/^\d+$/.test(x)).map(Number);if(!counts.length)counts.push(1000,10000);
  const shapeFlag=process.argv.indexOf('--shape');const shape=shapeFlag<0?'balanced':process.argv[shapeFlag+1];
  const outputFlag=process.argv.indexOf('--output');const output=resolve(outputFlag<0?'docs/club-scale-results.json':process.argv[outputFlag+1]);
  const results=[];
  for(const count of counts){process.stderr.write('Running isolated '+count+' member fixture…\n');results.push(JSON.parse(execFileSync(process.execPath,['--import','tsx',self,'--worker',String(count),shape],{encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024})));}
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),baseRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes:Object.fromEntries(['scripts/club-scale-simulation.ts','src/platform/schema.ts','src/platform/card-positions.ts','src/platform/card-position-model.ts','src/platform/seven-card-engine.ts','src/platform/finance.ts','src/platform/card-levels.ts','src/platform/company-members.ts'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(dirname(self),'..',path))).digest('hex')])),results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
