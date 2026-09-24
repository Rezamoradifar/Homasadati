import { randomUUID } from "node:crypto";
import { all, one, run, atomic, now, Row } from "./schema";
import { ApiError } from "../server/http";
import { audit } from "./security";
import {
  defaultPermissions,
  hasPermission,
  accessRoleSchema,
  accessAssignmentSchema,
} from "./access-model";
export function effectivePermissions(u: Row) {
  const inherited = defaultPermissions(u.role);
  if (inherited.includes("*")) return inherited;
  const assigned = all(
    "SELECT r.permissions FROM p_access_roles r JOIN p_access_assignments a ON a.role_id=r.id WHERE a.user_id=? AND r.active=1",
    u.id,
  ).flatMap((r) => JSON.parse(r.permissions) as string[]);
  return [...new Set([...inherited, ...assigned])];
}
export function assertAccess(u: Row, resource: string, write = false) {
  if (!hasPermission(effectivePermissions(u), resource, write))
    throw new ApiError(403, "forbidden");
}
export function saveAccessRole(actor: string, input: unknown) {
  const d = accessRoleSchema.parse(input);
  return atomic(() => {
    const id = d.id || randomUUID(),
      old = one("SELECT * FROM p_access_roles WHERE id=?", id);
    if (d.id && !old) throw new ApiError(404, "not_found");
    run(
      "INSERT INTO p_access_roles VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions=excluded.permissions,active=excluded.active,updated_at=excluded.updated_at",
      id,
      d.name,
      JSON.stringify([...new Set(d.permissions)]),
      Number(d.active),
      now(),
    );
    audit(actor, "access.role", id, old || null, d, d.reason);
    return { id };
  });
}
export function assignAccessRole(actor: string, input: unknown) {
  const d = accessAssignmentSchema.parse(input);
  return atomic(() => {
    if (
      !one("SELECT id FROM p_users WHERE id=?", d.userId) ||
      !one("SELECT id FROM p_access_roles WHERE id=?", d.roleId)
    )
      throw new ApiError(404, "not_found");
    if (d.assigned)
      run(
        "INSERT OR IGNORE INTO p_access_assignments VALUES(?,?,?)",
        d.userId,
        d.roleId,
        now(),
      );
    else
      run(
        "DELETE FROM p_access_assignments WHERE user_id=? AND role_id=?",
        d.userId,
        d.roleId,
      );
    // Every request checks the database; revoked permission takes effect immediately without relying on UI state.
    audit(actor, "access.assignment", d.userId, null, d, d.reason);
    return { ok: true };
  });
}
