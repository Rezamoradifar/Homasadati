import { z } from "zod";
import { id, text } from "./validation";
export const ticketCategories = [
  "order",
  "payment",
  "network",
  "account",
  "other",
] as const;
export const ticketPriorities = ["normal", "high", "urgent"] as const;
export const ticketStatuses = [
  "waiting_support",
  "waiting_user",
  "closed",
] as const;
const message = z.string().trim().min(1).max(8000);
export const ticketCreateSchema = z
  .object({
    subject: text,
    category: z.enum(ticketCategories),
    priority: z.enum(ticketPriorities),
    body: message,
    orderId: id.nullable().default(null),
    idempotencyKey: id,
  })
  .strict();
export const ticketReplySchema = z
  .object({
    body: message,
    internal: z.boolean().default(false),
    idempotencyKey: id,
  })
  .strict();
export const ticketReviewSchema = z
  .object({
    status: z.enum(ticketStatuses),
    priority: z.enum(ticketPriorities),
    assigneeId: id.nullable(),
    expectedVersion: z.number().int().min(1),
    reason: text,
  })
  .strict();
export const ticketCloseSchema = z
  .object({ expectedVersion: z.number().int().min(1), reason: text })
  .strict();
export const merchantReviewSchema = z
  .object({ id, action: z.enum(["confirm", "reject"]), reason: text })
  .strict();
export const binaryScheduleSchema = z
  .object({
    mode: z.enum(["immediate", "daily", "weekly"]),
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(0).max(6),
  })
  .strict();
export const binaryScheduleUpdateSchema = z
  .object({ schedule: binaryScheduleSchema, reason: text })
  .strict();
export const defaultBinarySchedule = {
  mode: "immediate" as const,
  hour: 3,
  weekday: 6,
};
export type BinarySchedule = z.infer<typeof binaryScheduleSchema>;
// 0 is Sunday; dates and cutoff hours use Tehran time. Delayed workers catch up
// with the latest completed boundary, never a boundary preceding payment.
export function binaryCycle(schedule: BinarySchedule, at = new Date()) {
  if (schedule.mode === "immediate") return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (key: string) =>
    Number(parts.find((p) => p.type === key)!.value);
  const day = new Date(
    Date.UTC(value("year"), value("month") - 1, value("day")),
  );
  if (value("hour") < schedule.hour) day.setUTCDate(day.getUTCDate() - 1);
  if (schedule.mode === "weekly")
    day.setUTCDate(
      day.getUTCDate() - ((day.getUTCDay() - schedule.weekday + 7) % 7),
    );
  // Tehran's current civil offset is +03:30. Use Intl below to derive the actual
  // offset for the selected day rather than assuming historical DST behavior.
  const nominal = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    schedule.hour,
  );
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(nominal))
    .find((p) => p.type === "timeZoneName")!.value;
  const offset = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) throw new Error("Unsupported Tehran offset");
  const minutes =
    (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
  const cutoff = new Date(nominal - minutes * 60000).toISOString();
  return {
    key: `${schedule.mode}:${schedule.hour}:${schedule.weekday}:${day.toISOString().slice(0, 10)}`,
    cutoff,
  };
}
