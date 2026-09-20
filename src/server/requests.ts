import {randomUUID} from 'node:crypto';
import {db} from './db';
import {ApiError,email,hash,oneOf,string} from './http';
export function saveRequest(input:Record<string,unknown>,key:string){
 if(!/^[a-f0-9-]{36}$/i.test(key))throw new ApiError(400,'invalid_idempotency_key');
 if(input.consent!==true||input.website)throw new ApiError(400,'invalid_input');
 const record={kind:oneOf(input.kind,['enquiry','club']),name:string(input.name,2,100),email:email(input.email),interest:string(input.interest,2,200),message:string(input.message??'',0,4000),locale:oneOf(input.locale,['en','fa','ar']),currency:oneOf(input.currency,['USD','EUR','AED','IRR'])};
 const fingerprint=hash(JSON.stringify(record)),secretHash=hash(key),database=db();
 return database.transaction(()=>{
  const existing=database.prepare('SELECT id,payload_hash FROM requests WHERE idem_hash=?').get(secretHash) as {id:string;payload_hash:string}|undefined;
  if(existing){if(existing.payload_hash!==fingerprint)throw new ApiError(409,'idempotency_conflict');return {id:existing.id,trackingCode:existing.id+'.'+key};}
  const id=randomUUID(),now=new Date().toISOString();
  database.prepare(`INSERT INTO requests (id,idem_hash,payload_hash,kind,name,email,interest,message,locale,currency,created_at,updated_at) VALUES (@id,@idem_hash,@payload_hash,@kind,@name,@email,@interest,@message,@locale,@currency,@created_at,@updated_at)`).run({...record,id,idem_hash:secretHash,payload_hash:fingerprint,created_at:now,updated_at:now});
  return {id,trackingCode:id+'.'+key};
 }).immediate();
}
export function requestStatus(code:unknown){
 const value=string(code,73,73),[id,secret]=value.split('.');
 const row=db().prepare('SELECT id,status,kind,created_at,updated_at FROM requests WHERE id=? AND idem_hash=?').get(id,hash(secret||''));
 if(!row)throw new ApiError(404,'not_found');return row;
}
