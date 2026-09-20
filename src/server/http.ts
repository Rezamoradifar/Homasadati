import {createHash} from 'node:crypto';
import {db} from './db';
export class ApiError extends Error {constructor(public status:number,public code:string){super(code);}}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function fail(error:unknown){if(error instanceof ApiError)return json({error:error.code},error.status);console.error('API operation failed',error instanceof Error?error.name:'UnknownError');return json({error:'server_error'},500);}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(!origin)throw new ApiError(403,'origin_required');
 let parsed:URL;try{parsed=new URL(origin);}catch{throw new ApiError(403,'origin_denied');}if(!['http:','https:'].includes(parsed.protocol))throw new ApiError(403,'origin_denied');
 const configured=process.env.APP_ORIGIN;
 if(configured){if(origin!==new URL(configured).origin)throw new ApiError(403,'origin_denied');}
 else if(parsed.host!==request.headers.get('host'))throw new ApiError(403,'origin_denied');
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'origin_denied');
}
export async function body(request:Request,maxBytes=16384):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'json_required');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'invalid_input');
 let bytes=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();throw new ApiError(413,'too_large');}chunks.push(value);}}finally{reader.releaseLock();}
 try {const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed;}catch{throw new ApiError(400,'invalid_input');}
}
export function string(value:unknown,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new ApiError(400,'invalid_input');return value.trim();}
export function email(value:unknown){const e=string(value,3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new ApiError(400,'invalid_email');return e;}
export function oneOf<T extends string>(value:unknown,values:readonly T[]):T {if(typeof value!=='string'||!values.includes(value as T))throw new ApiError(400,'invalid_input');return value as T;}
export function limit(key:string,max:number,seconds:number){
 const database=db(), now=Date.now();
 const allowed=database.transaction(()=>{
  database.prepare('DELETE FROM limits WHERE expires < ?').run(now);
  const row=database.prepare('SELECT count FROM limits WHERE key=?').get(key) as {count:number}|undefined;
  if(row&&row.count>=max)return false;
  database.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+seconds*1000);return true;
 }).immediate();
 if(!allowed)throw new ApiError(429,'rate_limited');
}
export function publicGuard(request:Request,scope:string,max=30){sameOrigin(request);const ip=process.env.TRUST_PROXY==='1'?(request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown'):'shared';limit(scope+':'+hash(ip),max,60);}
