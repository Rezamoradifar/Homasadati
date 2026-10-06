import { ApiError } from "../server/http";
import { one } from "./schema";
import { setting } from "./providers";
export { UPDATED_DESK_WEEKLY_CAP } from "./card-levels";
export const PLAN_WEEK_MS = 7 * 86400_000;
export const updatedCardSchedule = () => setting("seven_card_schedule_version") === "2026-10-06";
/** Monday midnight in Tehran, expressed as UTC milliseconds. */
export function mondayStart(ms: number) {
  const local = ms + 12600_000;
  const midnight = local - local % 86400_000;
  return midnight - ((new Date(local).getUTCDay() + 6) % 7) * 86400_000 - 12600_000;
}
export function assertPurchasesOpen(ms = Date.now()) {
  if (!updatedCardSchedule() || setting("seven_card_live") !== "1") return;
  const current = mondayStart(ms);
  const since = Number(setting("seven_card_live_since") || current);
  if (mondayStart(since) >= current) return;
  const key = new Date(current - PLAN_WEEK_MS).toISOString().slice(0,16) + "Z";
  if (!one("SELECT week FROM p_card_weeks WHERE week=?", key))
    throw new ApiError(423, "weekly_calculation_in_progress");
}
