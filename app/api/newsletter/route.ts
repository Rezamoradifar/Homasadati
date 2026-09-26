import {randomBytes,randomUUID} from 'node:crypto';
import {db} from '../../../src/server/db';
import {ApiError,body,email,fail,hash,json,oneOf,publicGuard} from '../../../src/server/http';
import {newsletterSignedUp} from '../../../src/platform/newsletter';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 publicGuard(request,'newsletter',10);const input=await body(request);if(input.consent!==true||input.website)throw new ApiError(400,'invalid_input');
 const address=email(input.email),locale=oneOf(input.locale,['en','fa','ar']),token=randomBytes(32).toString('hex'),now=new Date().toISOString();
 const id=randomUUID(),result=db().prepare(`INSERT OR IGNORE INTO subscribers(id,email,locale,unsubscribe_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)`).run(id,address,locale,hash(token),now,now);
 // New subscribers get a confirmation email carrying their own unsubscribe link.
 // Queuing the email must never lose the subscription itself.
 if(result.changes)try{newsletterSignedUp(id,token);}catch(e){console.error("newsletter welcome not queued",e);}
 // Never disclose an existing subscriber's token or reactivate an unsubscribed address.
 return json({ok:true,...(result.changes?{unsubscribeToken:token}:{})},202);
 }catch(error){return fail(error);}}
