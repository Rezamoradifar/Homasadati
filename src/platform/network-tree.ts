import { ApiError } from "../server/http";
import { all, one, Row } from "./schema";

/** Binary placement tree (p_users.parent_id + leg) read straight from the
 * database. Each node carries its own paid purchases and, per leg, the member
 * count and the paid purchase volume of the whole subtree, so what the member
 * sees is the same volume the binary settlement reads. */
export type TreeNode = {
  id: string;
  name: string;
  joinedAt: string;
  leg: string | null;
  sponsoredByRoot: boolean;
  active: boolean;
  personalVolume: number;
  level: number;
  left: LegStats;
  right: LegStats;
  children: { left: TreeNode | null; right: TreeNode | null } | null;
};
type LegStats = { members: number; volume: number; carry: number };

const ACTIVE_DAYS = 30;

/** Paid, not refunded orders; the same filter the commission engine uses. */
const PAID = "paid_at IS NOT NULL AND refunded_at IS NULL";

function legStats(parent: string, leg: "left" | "right", carry: number): LegStats {
  const child = one("SELECT id FROM p_users WHERE parent_id=? AND leg=?", parent, leg);
  if (!child) return { members: 0, volume: 0, carry };
  const r = one(
    `WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT u.id FROM p_users u JOIN sub s ON u.parent_id=s.id)
     SELECT (SELECT COUNT(*) FROM sub) members,
            (SELECT COALESCE(SUM(amount),0) FROM p_orders WHERE ${PAID} AND user_id IN (SELECT id FROM sub)) volume`,
    child.id,
  )!;
  return { members: r.members, volume: r.volume, carry };
}

function carryOf(user: string, leg: string) {
  try {
    return one("SELECT COALESCE(SUM(remaining),0) n FROM p_card_lots WHERE user_id=? AND leg=? AND void=0", user, leg)!.n;
  } catch {
    return 0; // card tables absent on very old databases
  }
}

function node(row: Row, rootId: string, depth: number, activeSince: string): TreeNode {
  const personal = one(
    `SELECT COALESCE(SUM(amount),0) total, MAX(paid_at) last FROM p_orders WHERE user_id=? AND ${PAID}`,
    row.id,
  )!;
  const level = one("SELECT level FROM p_card_members WHERE user_id=?", row.id)?.level || 0;
  const kids = depth > 0 ? all("SELECT id,name,created_at,leg,sponsor_id FROM p_users WHERE parent_id=?", row.id) : [];
  const kid = (leg: string) => {
    const k = kids.find((c) => c.leg === leg);
    return k ? node(k, rootId, depth - 1, activeSince) : null;
  };
  return {
    id: row.id,
    name: row.name,
    joinedAt: row.created_at,
    leg: row.leg,
    sponsoredByRoot: row.sponsor_id === rootId,
    active: !!personal.last && personal.last >= activeSince,
    personalVolume: personal.total,
    level,
    left: legStats(row.id, "left", carryOf(row.id, "left")),
    right: legStats(row.id, "right", carryOf(row.id, "right")),
    children: depth > 0 ? { left: kid("left"), right: kid("right") } : null,
  };
}

/** Ancestors from `top` down to `target`, or null when target is not in
 * top's placement subtree. Walks up, so it costs the depth, not the tree. */
export function placementPath(top: string, target: string) {
  const path: Row[] = [];
  let current = one("SELECT id,name,parent_id FROM p_users WHERE id=?", target);
  for (let i = 0; current && i < 100000; i++) {
    path.unshift({ id: current.id, name: current.name });
    if (current.id === top) return path;
    current = current.parent_id ? one("SELECT id,name,parent_id FROM p_users WHERE id=?", current.parent_id) : undefined;
  }
  return null;
}

export function placementTree(viewer: string, root: string, depth = 3, admin = false) {
  const d = Math.min(Math.max(Math.trunc(depth) || 3, 1), 5);
  const path = admin ? placementPath(root, root) : placementPath(viewer, root);
  if (!path) throw new ApiError(403, "forbidden");
  const row = one("SELECT id,name,created_at,leg,sponsor_id FROM p_users WHERE id=?", root);
  if (!row) throw new ApiError(404, "not_found");
  const activeSince = new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString();
  return { path, depth: d, activeDays: ACTIVE_DAYS, tree: node(row, viewer, d, activeSince) };
}

/** Finds members in the viewer's placement subtree by name or referral code. */
export function searchTree(viewer: string, query: string, admin = false) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const like = "%" + q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";
  if (admin)
    return all(
      "SELECT id,name,referral_code,created_at FROM p_users WHERE lower(name) LIKE ? ESCAPE '\\' OR referral_code=? ORDER BY created_at LIMIT 20",
      like,
      q,
    );
  return all(
    `WITH RECURSIVE sub(id) AS (SELECT id FROM p_users WHERE parent_id=? UNION ALL SELECT u.id FROM p_users u JOIN sub s ON u.parent_id=s.id)
     SELECT u.id,u.name,u.referral_code,u.created_at FROM p_users u JOIN sub ON sub.id=u.id
     WHERE lower(u.name) LIKE ? ESCAPE '\\' OR u.referral_code=? ORDER BY u.created_at LIMIT 20`,
    viewer,
    like,
    q,
  );
}
