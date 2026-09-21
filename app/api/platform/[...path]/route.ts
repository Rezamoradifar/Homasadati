import { handle } from "../../../../src/platform/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = async (
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) => handle(request, (await params).path);
export { route as GET, route as POST, route as PATCH, route as DELETE };
