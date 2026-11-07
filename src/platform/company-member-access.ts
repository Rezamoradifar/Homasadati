import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, hash } from "../server/http";
import { atomic, now, one, run, type Row } from "./schema";
import { audit, tokenOf } from "./security";
import { id } from "./validation";
import {
  companyAccessMetadata,
  setCompanyAuditContext,
  type CompanyAccessContext,
} from "./company-audit-context";

export { companyAccessMetadata } from "./company-audit-context";

const HEADER = "x-homa-company-member";
const LEASE_MS = 30 * 60_000;

export interface ResolvedCompanyMemberAccess {
  user: Row;
  context: CompanyAccessContext;
}

const beginSchema = z.object({
  userId: id,
  reason: z.string().trim().max(500).optional().default(""),
}).strict();
const endSchema = z.object({ userId: id }).strict();

/** Re-check the original owner and exact browser session on every use. */
function ownerSessionHash(req: Request, actor: Row): string {
  if (!actor || actor.role !== "superadmin" || actor.blocked)
    throw new ApiError(403, "company_access_denied");
  const token = tokenOf(req);
  if (!token) throw new ApiError(403, "company_access_denied");
  const sessionHash = hash(token);
  const valid = one(
    `SELECT u.id FROM p_users u JOIN p_sessions s ON s.user_id=u.id
     WHERE u.id=? AND u.role='superadmin' AND u.blocked=0
       AND s.token_hash=? AND s.expires>?`,
    actor.id, sessionHash, Date.now(),
  );
  if (!valid) throw new ApiError(403, "company_access_denied");
  return sessionHash;
}

/** A support owner may select only an active ordinary, non-delegated member. */
function ordinaryTarget(targetId: string): Row {
  const target = one(
    `SELECT u.*,
      EXISTS(SELECT 1 FROM p_archived_users a WHERE a.user_id=u.id) AS archived,
      EXISTS(SELECT 1 FROM p_access_assignments a WHERE a.user_id=u.id) AS privileged
     FROM p_users u WHERE u.id=?`,
    targetId,
  );
  if (!target) throw new ApiError(404, "not_found");
  if (target.role !== "user" || Boolean(target.blocked) || Boolean(target.archived) || Boolean(target.privileged))
    throw new ApiError(403, "company_access_target_inactive");
  return target;
}

/** Start a short, session-bound lease without replacing the owner cookie. */
export function beginCompanyMemberAccess(actor: Row, req: Request, input: unknown) {
  const data = beginSchema.parse(input);
  const sessionHash = ownerSessionHash(req, actor);
  if (data.userId === actor.id) throw new ApiError(403, "company_access_denied");
  const target = ordinaryTarget(data.userId);
  const expiresAt = Date.now() + LEASE_MS;
  return atomic(() => {
    // Each selected member has a separate lease, so other member tabs stay valid.
    run(`UPDATE p_company_member_access SET revoked_at=?,revoked_by=?
      WHERE owner_id=? AND owner_session_hash=? AND target_id=? AND revoked_at IS NULL`,
      now(), actor.id, actor.id, sessionHash, target.id);
    run(`INSERT INTO p_company_member_access
      (id,owner_id,owner_session_hash,target_id,reason,created_at,expires_at,revoked_at,revoked_by)
      VALUES(?,?,?,?,?,?,?,NULL,NULL)`,
      randomUUID(), actor.id, sessionHash, target.id, data.reason, now(), expiresAt);
    audit(actor.id, "company-member-access.enter", target.id, null, {
      targetId: target.id, expiresAt,
    }, data.reason);
    return { userId: target.id, targetName: target.name, expiresAt };
  });
}

/** Stop only this owner session's selected-member lease; safe to repeat. */
export function endCompanyMemberAccess(actor: Row, req: Request, input: unknown) {
  const data = endSchema.parse(input);
  const sessionHash = ownerSessionHash(req, actor);
  return atomic(() => {
    const changed = run(`UPDATE p_company_member_access SET revoked_at=?,revoked_by=?
      WHERE owner_id=? AND owner_session_hash=? AND target_id=? AND revoked_at IS NULL`,
      now(), actor.id, actor.id, sessionHash, data.userId);
    if (changed.changes)
      audit(actor.id, "company-member-access.exit", data.userId, null, { targetId: data.userId });
    return { ok: true as const };
  });
}

/** All selected-member GETs are allowed; only explicit non-financial writes are not. */
export function assertCompanyMemberOperation(path: string[], method: string) {
  const verb = method.toUpperCase();
  if (verb === "GET") return;
  const resource = path[0];
  const allowed =
    (resource === "profile" && ["POST", "PATCH", "PUT"].includes(verb)) ||
    (resource === "member-details" && ["POST", "PATCH", "PUT"].includes(verb)) ||
    (resource === "addresses" && ["POST", "PATCH", "PUT", "DELETE"].includes(verb)) ||
    (resource === "tickets" && ["POST", "PATCH"].includes(verb)) ||
    (resource === "notifications" && ["POST", "PATCH"].includes(verb)) ||
    (resource === "wishlist" && ["POST", "DELETE"].includes(verb));
  if (!allowed) throw new ApiError(403, "company_access_operation_forbidden");
}

/** Resolve and revalidate a selected member for each header-bearing request. */
export function resolveCompanyMemberAccess(
  req: Request,
  actor: Row,
  path: string[],
  method: string,
): ResolvedCompanyMemberAccess | null {
  const rawTarget = req.headers.get(HEADER);
  if (!rawTarget) return null;
  const targetId = id.parse(rawTarget);
  const sessionHash = ownerSessionHash(req, actor);
  const lease = one(`SELECT id,expires_at FROM p_company_member_access
    WHERE owner_id=? AND owner_session_hash=? AND target_id=? AND revoked_at IS NULL
    ORDER BY created_at DESC LIMIT 1`, actor.id, sessionHash, targetId);
  if (!lease) throw new ApiError(403, "company_access_denied");
  if (Number(lease.expires_at) <= Date.now()) throw new ApiError(403, "company_access_expired");
  const user = ordinaryTarget(targetId);
  assertCompanyMemberOperation(path, method);
  const context: CompanyAccessContext = {
    actorId: actor.id,
    actorName: actor.name,
    targetId: user.id,
    targetName: user.name,
    expiresAt: Number(lease.expires_at),
  };
  setCompanyAuditContext(context);
  return { user, context };
}

function safePath(path: string[]) {
  return path.map(part => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)
    ? ":id" : part.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80))
    .filter(Boolean).join("/");
}

/** Catch successful delegated mutations that have no domain-specific audit call. */
export function auditCompanyMemberRequest(
  context: CompanyAccessContext,
  path: string[],
  method: string,
  status: number,
) {
  const verb = method.toUpperCase();
  if (verb === "GET" || status < 200 || status >= 400) return;
  audit(context.actorId, "company-member-access.write", context.targetId, null, {
    companyAccess: { targetId: context.targetId },
    method: verb,
    path: safePath(path),
    status,
  });
}
