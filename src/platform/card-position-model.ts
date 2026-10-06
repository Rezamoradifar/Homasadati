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
