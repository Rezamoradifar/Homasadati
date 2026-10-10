import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function probe(origin,request=fetch) {
  const base=new URL(origin);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('HTTPS origin required');
  const checks=await Promise.all(['/', '/api/health'].map(async path=>{
    const started=Date.now();
    try {const r=await request(new URL(path,base),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
      let valid=r.status===200;
      if(path==='/api/health')valid=valid&&(await r.json()).status==='ok';
      else valid=valid&&(r.headers.get('content-type')||'').includes('text/html');
      await r.body?.cancel().catch(()=>{});
      return {path,ok:valid,http:r.status,durationMs:Date.now()-started};
    }catch{return {path,ok:false,http:0,durationMs:Date.now()-started};}
  }));
  return {service:'homay-public',status:checks.every(c=>c.ok)?'ok':'unavailable',checkedAt:new Date().toISOString(),checks};
}
export function shouldAlert(previous,report,at=Date.now()) {
  return report.status==='unavailable' ? previous?.alertStatus!=='unavailable'||at-(previous.lastAlert||0)>=3600000 : previous?.alertStatus==='unavailable';
}
export async function main() {
  const report=await probe(process.env.MONITOR_ORIGIN||'https://homanets.com');
  const file=process.env.MONITOR_STATE_PATH||'/var/lib/homay-external-monitor/state.json';
  let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch{}
  const webhook=process.env.ALERT_WEBHOOK_URL;
  let alerted=false;
  if(process.argv.includes('--notify')&&webhook&&shouldAlert(previous,report)) {
    const url=new URL(webhook);if(url.protocol!=='https:'||url.username||url.password)throw Error('HTTPS alert endpoint required');
    try {const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report),redirect:'error',signal:AbortSignal.timeout(10000)});alerted=r.ok;}catch{}
  }
  const state={status:report.status,alertStatus:alerted?report.status:previous?.alertStatus,lastAlert:alerted?Date.now():previous?.lastAlert||0};
  await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file+'.tmp',file);
  console.log(JSON.stringify({...report,alertConfigured:!!webhook,alerted}));
  if(report.status!=='ok')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('External monitoring failed; inspect private configuration.');process.exitCode=1;});
