import { handle } from "../../../../src/platform/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = (request: Request, { params }: { params: { path: string[] } }) =>
  handle(request, params.path);
export { route as GET, route as POST, route as PATCH, route as DELETE };
