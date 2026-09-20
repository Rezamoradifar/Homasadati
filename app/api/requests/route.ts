import {body,fail,json,publicGuard} from '../../../src/server/http';
import {saveRequest} from '../../../src/server/requests';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{publicGuard(request,'request',12);return json(saveRequest(await body(request),request.headers.get('idempotency-key')||''),201);}catch(error){return fail(error);}}
