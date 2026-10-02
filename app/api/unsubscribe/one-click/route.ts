import {db} from '../../../../src/server/db';
import {fail,hash,json,limit,string} from '../../../../src/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
// RFC 8058 one-click unsubscribe: mail apps POST here from the List-Unsubscribe
// header, without a page or cookies, so the token itself is the authority.
export async function POST(request:Request){try{const token=string(new URL(request.url).searchParams.get('token'),64,64);limit('one-click:'+hash(token).slice(0,16),10,60);db().prepare("UPDATE subscribers SET status='unsubscribed',updated_at=? WHERE unsubscribe_hash=?").run(new Date().toISOString(),hash(token));return json({ok:true});}catch(error){return fail(error);}}
