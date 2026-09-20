import {db} from '../../../../src/server/db';
import {requireAdmin} from '../../../../src/server/auth';
import {ApiError,body,fail,json,oneOf,sameOrigin,string} from '../../../../src/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 requireAdmin(request);const url=new URL(request.url);const type=url.searchParams.get('type')==='subscribers'?'subscribers':'requests';
 const page=Math.max(1,Math.min(100000,Math.floor(Number(url.searchParams.get('page')))||1));const limit=50;
 const rows=type==='requests'?db().prepare('SELECT id,kind,name,email,interest,message,locale,currency,status,created_at,updated_at FROM requests ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit,(page-1)*limit):db().prepare('SELECT id,email,locale,status,created_at,updated_at FROM subscribers ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit,(page-1)*limit);
 const total=(db().prepare(type==='requests'?'SELECT count(*) AS count FROM requests':'SELECT count(*) AS count FROM subscribers').get() as {count:number}).count;
 return json({rows,total,page,pageSize:limit});
 }catch(error){return fail(error);}}
export async function PATCH(request:Request){try{sameOrigin(request);requireAdmin(request);const input=await body(request),id=string(input.id,36,36),status=oneOf(input.status,['new','in_progress','closed']);const result=db().prepare('UPDATE requests SET status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),id);if(!result.changes)throw new ApiError(404,'not_found');return json({ok:true});}catch(error){return fail(error);}}
