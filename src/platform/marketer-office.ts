import { z } from "zod";
import { all, one, atomic } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import { placementPath } from "./network-tree";
import { ApiError } from "../server/http";
import { id, text } from "./validation";
import { candles, activityQuery } from "./activity-chart";
import { positionPath, positionMode } from "./card-positions";

export const officeGrantSchema = z.object({ userId: id, level: z.number().int().min(0).max(7), reason: text }).strict();
export function officeAccess(userId: string) {
  const raw = Number(setting("marketer_office:" + userId));
  const level = Number.isInteger(raw) && raw >= 1 && raw <= 7 ? raw : 0;
  return { enabled: level > 0, level, maxDepth: level ? level + 5 : 5 };
}
export function requireOffice(userId: string) {
  const user = one("SELECT blocked FROM p_users WHERE id=?", userId);
  const access = officeAccess(userId);
  if (!user || user.blocked || !access.enabled) throw new ApiError(403, "forbidden");
  return access;
}
export function grantOffice(actor: string, input: unknown) {
  // Financial rank/purchase amounts never grant this private workspace.
  if (one("SELECT role,blocked FROM p_users WHERE id=?", actor)?.role !== "superadmin" || one("SELECT blocked FROM p_users WHERE id=?", actor)?.blocked) throw new ApiError(403, "forbidden");
  const d = officeGrantSchema.parse(input);
  if (!one("SELECT id FROM p_users WHERE id=?", d.userId)) throw new ApiError(404, "not_found");
  atomic(() => {
    const before = officeAccess(d.userId);
    saveSetting("marketer_office:" + d.userId, String(d.level));
    audit(actor, "marketer-office.access", d.userId, before, officeAccess(d.userId), d.reason);
  });
  return officeAccess(d.userId);
}
export function officeChart(userId: string, input: unknown, now = Date.now()) {
  const access = requireOffice(userId);
  const q = activityQuery.extend({ series: z.enum(["sales", "commission"]).default("sales") }).parse(input);
  const relation = positionMode()
    ? "SELECT child_id id FROM p_card_direct_positions WHERE sponsor_id=? UNION SELECT d.child_id FROM p_card_direct_positions d JOIN sub ON d.sponsor_id=sub.id"
    : "SELECT id FROM p_users WHERE parent_id=? UNION SELECT u.id FROM p_users u JOIN sub ON u.parent_id=sub.id";
  const orders = all(`WITH RECURSIVE sub(id) AS (${relation}) SELECT amount,paid_at,refunded_at FROM p_orders WHERE paid_at IS NOT NULL AND user_id IN (SELECT id FROM sub)`, userId);
  const events = q.series === "sales"
    ? orders.flatMap(row => [ {t: Date.parse(row.paid_at), d: row.amount}, ...(row.refunded_at ? [{t:Date.parse(row.refunded_at),d:-row.amount}] : []) ])
    : all("SELECT created_at,available_delta,pending_delta,debt_delta FROM p_ledger WHERE user_id=? AND kind IN ('commission','reversal','card_reward_pending','card_reward','card_reward_reversal')", userId).map(row => ({t:Date.parse(row.created_at),d:row.available_delta+row.pending_delta-row.debt_delta}));
  const recorded = events.filter(e => Number.isFinite(e.t) && e.t <= now);
  const rows = candles(recorded, q.interval, now, 1);
  return { ...access, series:q.series, interval:q.interval, unit:"toman", candles:rows, current:rows.at(-1)!.c, change:rows.at(-1)!.c-rows[0].o, updatedAt:new Date(now).toISOString(), scope:"member", empty:recorded.length===0 };
}

export function officeNetwork(userId: string, root: string, depth: number) {
  const access = requireOffice(userId);
  const path = positionMode() ? positionPath(userId, root) : placementPath(userId, root);
  if (!path) throw new ApiError(403, "forbidden");
  const d = Math.max(1,Math.min(Math.trunc(depth)||6,access.maxDepth));
  const join = positionMode()
    ? "SELECT p.child_id,sub.depth+1 FROM p_card_direct_positions p JOIN sub ON p.sponsor_id=sub.id WHERE sub.depth<?"
    : "SELECT p.id,sub.depth+1 FROM p_users p JOIN sub ON p.parent_id=sub.id WHERE sub.depth<?";
  // LIMIT inside the recursive CTE bounds traversal, not only the final response.
  const rows = all(`WITH RECURSIVE sub(id,depth) AS (SELECT ?,0 UNION ALL ${join} LIMIT 201)
    SELECT u.id,u.name,u.referral_code,sub.depth,
    (SELECT COALESCE(SUM(amount),0) FROM p_orders WHERE user_id=u.id AND paid_at IS NOT NULL AND refunded_at IS NULL) personalVolume
    FROM sub JOIN p_users u ON u.id=sub.id ORDER BY sub.depth,u.id`,root,d);
  return { ...access,root,depth:d,path,rows:rows.slice(0,200),truncated:rows.length>200 };
}
