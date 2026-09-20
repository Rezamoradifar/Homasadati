import {body,fail,json,publicGuard,sameOrigin,hash} from '../../../../src/server/http';
import {cookie,newSession,requireAdmin,sessionToken,verifyPassword} from '../../../../src/server/auth';
import {db} from '../../../../src/server/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{publicGuard(request,'login',5);verifyPassword((await body(request)).password);const response=json({ok:true});response.headers.set('Set-Cookie',cookie(newSession()));return response;}catch(error){return fail(error);}}
export async function GET(request:Request){try{requireAdmin(request);return json({ok:true});}catch(error){return fail(error);}}
export async function DELETE(request:Request){try{sameOrigin(request);db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(sessionToken(request)));const response=json({ok:true});response.headers.set('Set-Cookie',cookie('',0));return response;}catch(error){return fail(error);}}
