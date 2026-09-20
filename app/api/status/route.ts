import {body,fail,json,publicGuard} from '../../../src/server/http';
import {requestStatus} from '../../../src/server/requests';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{publicGuard(request,'status',30);return json(requestStatus((await body(request)).code));}catch(error){return fail(error);}}
