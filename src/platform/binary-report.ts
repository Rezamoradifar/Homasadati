import {now} from "./schema";
import {binaryRules,binaryEligible,dailyBinaryEarned} from "./network-rules";
import { all, one, atomic } from "./schema";
import { ApiError } from "../server/http";

/** Placement relationships are independent of sponsor relationships. This report never awards money. */
export function binaryReport(userId: string, page = 1) {
  return atomic(() => {
    const root = one(
      "SELECT id,name,parent_id,leg,referral_code FROM p_users WHERE id=?",
      userId,
    );
    if (!root) throw new ApiError(404, "not_found");
    const nodes = all(
      `WITH RECURSIVE tree(id,depth) AS (
      SELECT id,1 FROM p_users WHERE parent_id=?
      UNION ALL SELECT u.id,t.depth+1 FROM p_users u JOIN tree t ON u.parent_id=t.id WHERE t.depth<3
    ) SELECT u.id,u.name,u.parent_id,u.leg,u.blocked,t.depth FROM tree t JOIN p_users u ON u.id=t.id ORDER BY t.depth,u.leg,u.id`,
      userId,
    );
    const volumes = all(
      `SELECT leg,COALESCE(SUM(volume),0) total,COALESCE(SUM(CASE WHEN t.expires_at IS NULL OR t.expires_at>? THEN remaining ELSE 0 END),0) remaining,
      COALESCE(SUM(CASE WHEN t.expires_at<=? THEN remaining ELSE 0 END),0) expired,
      COALESCE(SUM(volume-remaining),0) consumed FROM p_binary_lots l LEFT JOIN p_binary_lot_terms t ON t.lot_id=l.id WHERE user_id=? AND void=0 GROUP BY leg`,
      now(),now(),userId,
    );
    const left = volumes.find((r) => r.leg === "left") || {
      total: 0,
      remaining: 0,
      consumed: 0,
      expired:0,
    };
    const right = volumes.find((r) => r.leg === "right") || {
      total: 0,
      remaining: 0,
      consumed: 0,
      expired:0,
    };
    const rows = all(
      `SELECT l.id,l.order_id,l.leg,l.volume,l.remaining,l.void,l.created_at,t.expires_at FROM p_binary_lots l LEFT JOIN p_binary_lot_terms t ON t.lot_id=l.id
      WHERE l.user_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 31 OFFSET ?`,
      userId,
      (page - 1) * 30,
    );
    const matches = all(
      `SELECT m.id,m.volume,m.void,m.left_lot,m.right_lot,COALESCE(t.left_volume,m.volume) left_volume,COALESCE(t.right_volume,m.volume) right_volume,c.amount,c.status,c.available_at,c.created_at
      FROM p_binary_matches m JOIN p_commissions c ON c.id=m.commission_id LEFT JOIN p_binary_match_terms t ON t.match_id=m.id
      WHERE c.user_id=? ORDER BY c.created_at DESC,m.id DESC LIMIT 31 OFFSET ?`,
      userId,
      (page - 1) * 30,
    );
    const commissions = one(
      `SELECT COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending,
      COALESCE(SUM(CASE WHEN status='available' THEN amount ELSE 0 END),0) available,
      COALESCE(SUM(CASE WHEN status='reversed' THEN amount ELSE 0 END),0) reversed FROM p_commissions WHERE user_id=? AND kind='binary'`,
      userId,
    );
    const events = all(
      "SELECT id,action,before_json,after_json,reason,created_at FROM p_audit WHERE entity_id=? AND action='network.move' ORDER BY created_at DESC,id DESC LIMIT 100",
      userId,
    );
    const rules=binaryRules();
    return {
      rules,eligible:binaryEligible(userId,rules),dailyEarned:dailyBinaryEarned(userId),
      root,
      nodes,
      left,
      right,
      commissions,
      events,
      matchable: Math.min(Math.floor(left.remaining/rules.leftRatio), Math.floor(right.remaining/rules.rightRatio)),
      rows: rows.slice(0, 30),
      hasMore: rows.length > 30,
      page,
      matches: matches.slice(0, 30),
      matchesHasMore: matches.length > 30,
    };
  });
}
