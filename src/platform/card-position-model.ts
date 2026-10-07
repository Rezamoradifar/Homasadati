/** aa.pdf: breadth-first personal positions and stable direct endpoints. */
export const POSITION_PATHS = ["", "L", "R", "LL", "LR", "RL", "RR"] as const;
export const DIRECT_PATHS = ["LLL", "RRR", "LRL", "RLL", "LLR", "LRR", "RLR", "RRL"] as const;
export function directCapacity(desks: number) { return desks > 0 ? Math.min(8, desks + 1) : 0; }
export function directRoutes(ordinal: number, desks: number) {
  const path = DIRECT_PATHS[ordinal - 1];
  if (!path) throw new Error("invalid_direct_position");
  return POSITION_PATHS.slice(0, desks).flatMap((prefix, i) =>
    path.startsWith(prefix) ? [{desk: i + 1, leg: path[prefix.length] === "L" ? "left" : "right"}] : []);
}

/** One shared referral code fills one endpoint per active leaf, left to right. */
export const FOUR_DIRECT_PATHS = ["LLL", "LRL", "RLL", "RRL"] as const;
export const FOUR_REFERRAL_VERSION = "manual-referrals-2026-10-07";
export function fourDirectCapacity(desks: number) {
  return desks >= 1 ? 4 : 0;
}
export function fourDirectRoutes(ordinal: number, desks: number) {
  const path = FOUR_DIRECT_PATHS[ordinal - 1];
  if (!path) throw new Error("invalid_direct_position");
  return POSITION_PATHS.slice(0, desks).flatMap((prefix, i) =>
    path.startsWith(prefix) ? [{desk: i + 1, leg: path[prefix.length] === "L" ? "left" : "right"}] : []);
}
