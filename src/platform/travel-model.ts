import { z } from "zod";
import { id, money, text } from "./validation";
export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "تاریخ معتبر نیست",
  );
export const travelRuleSchema = z
  .object({
    rankId: id,
    amount: money,
    validDays: z.number().int().min(8).max(3650),
    active: z.boolean(),
    reason: text,
  })
  .strict();
export const travelCalendarSchema = z
  .object({
    weekends: z.array(z.number().int().min(0).max(6)).max(6),
    holidays: z.array(isoDay).max(500),
    reason: text,
  })
  .strict();
export const travelRequestSchema = z
  .object({
    cardId: id,
    productId: id,
    travelDate: isoDay,
    amount: money,
    note: z.string().trim().min(5).max(1000),
    idempotencyKey: id,
  })
  .strict();
export const travelReviewSchema = z
  .object({
    id,
    status: z.enum(["approved", "rejected", "redeemed", "cancelled"]),
    reason: text,
    reference: z.string().trim().max(200).default(""),
  })
  .strict();
export function tehranDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
// Exclude request date and travel date: seven complete working days must be available before departure.
export function workingDaysBefore(
  from: string,
  to: string,
  weekends: number[],
  holidays: string[],
) {
  const start = new Date(from + "T00:00:00Z"),
    end = new Date(to + "T00:00:00Z");
  let count = 0;
  for (let i = 0; i < 3660; i++) {
    start.setUTCDate(start.getUTCDate() + 1);
    if (start >= end) break;
    const day = start.toISOString().slice(0, 10);
    if (!weekends.includes(start.getUTCDay()) && !holidays.includes(day))
      count++;
  }
  return count;
}
