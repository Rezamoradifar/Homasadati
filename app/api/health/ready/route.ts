import {
  monitorAuthorized,
  operationalStatus,
} from "../../../../src/platform/monitoring";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!monitorAuthorized(req.headers.get("authorization")))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const result = operationalStatus();
  return Response.json(result, {
    status: result.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
