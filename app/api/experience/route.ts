import { ZodError } from "zod";
import { ApiError, body, fail, publicGuard } from "../../../src/server/http";
import { recordExperience } from "../../../src/platform/experience-metrics";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  try {
    publicGuard(request,"experience",60);
    recordExperience(await body(request,4096));
    return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
  } catch(error) {return fail(error instanceof ZodError ? new ApiError(400,"invalid_input") : error);}
}
