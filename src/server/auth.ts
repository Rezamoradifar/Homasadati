import {randomBytes,timingSafeEqual} from 'node:crypto';
import {db} from './db';
import {ApiError,hash} from './http';
export const COOKIE='homay_admin';
export function verifyPassword(password:unknown){
 const expected=process.env.ADMIN_PASSWORD;
 if(!expected||expected.length<16)throw new ApiError(503,'admin_not_configured');
 if(typeof password!=='string'||password.length>512)throw new ApiError(401,'unauthorized');
 if(!timingSafeEqual(Buffer.from(hash(password)),Buffer.from(hash(expected))))throw new ApiError(401,'unauthorized');
}
export function newSession(){const token=randomBytes(32).toString('hex');db().prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());db().prepare('INSERT INTO sessions(token_hash,expires) VALUES (?,?)').run(hash(token),Date.now()+8*3600000);return token;}
export function sessionToken(request:Request){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
export function requireAdmin(request:Request){const token=sessionToken(request);if(!token||!db().prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires>?').get(hash(token),Date.now()))throw new ApiError(401,'unauthorized');}
export function cookie(token:string,age=28800){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
