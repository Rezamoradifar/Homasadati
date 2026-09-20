import {db} from '../../../src/server/db';
import {body,fail,hash,json,publicGuard,string} from '../../../src/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{publicGuard(request,'unsubscribe');const input=await body(request);const token=string(input.token,64,64);db().prepare("UPDATE subscribers SET status='unsubscribed',updated_at=? WHERE unsubscribe_hash=?").run(new Date().toISOString(),hash(token));return json({ok:true});}catch(error){return fail(error);}}
