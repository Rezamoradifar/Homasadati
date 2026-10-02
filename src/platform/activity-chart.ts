import { z } from "zod";
import { all, one } from "./schema";

/** Candlestick series for the member panel, built only from recorded events.
 * Each candle is one period of a running total: open is the total when the
 * period starts, close when it ends, high and low the extremes reached in
 * between. Periods with no events are flat. Day and week boundaries follow
 * Tehran time; weeks start on Saturday. */
export const activityQuery = z.object({
  series: z.enum(["wallet", "network", "members"]).default("wallet"),
  interval: z.enum(["hour", "day", "week"]).default("day"),
});
export type Candle = { t: number; o: number; h: number; l: number; c: number; n: number };

const HOUR = 3600_000,
  DAY = 24 * HOUR,
  TEHRAN = 3.5 * HOUR;
const plan = { hour: { size: HOUR, count: 48 }, day: { size: DAY, count: 30 }, week: { size: 7 * DAY, count: 26 } };

function bucketStart(ms: number, interval: keyof typeof plan) {
  if (interval === "hour") return ms - (ms % HOUR);
  const local = ms + TEHRAN,
    midnight = local - (local % DAY);
  if (interval === "day") return midnight - TEHRAN;
  const back = (new Date(midnight).getUTCDay() - 6 + 7) % 7; // back to Saturday
  return midnight - back * DAY - TEHRAN;
}

export function candles(events: { t: number; d: number }[], interval: keyof typeof plan, now = Date.now()) {
  const { size, count } = plan[interval];
  const first = bucketStart(now, interval) - (count - 1) * size;
  const sorted = [...events].sort((a, b) => a.t - b.t);
  let total = 0,
    i = 0;
  for (; i < sorted.length && sorted[i].t < first; i++) total += sorted[i].d;
  const out: Candle[] = [];
  for (let k = 0; k < count; k++) {
    const t = first + k * size,
      end = t + size;
    const c: Candle = { t, o: total, h: total, l: total, c: total, n: 0 };
    for (; i < sorted.length && sorted[i].t < end; i++) {
      total += sorted[i].d;
      c.h = Math.max(c.h, total);
      c.l = Math.min(c.l, total);
      c.n++;
    }
    c.c = total;
    out.push(c);
  }
  return out;
}

const ms = (iso: string) => Date.parse(iso);

export function activityChart(userId: string, input: unknown, now = Date.now()) {
  const q = activityQuery.parse(input);
  let events: { t: number; d: number }[];
  if (q.series === "wallet")
    events = all("SELECT created_at,available_delta FROM p_ledger WHERE user_id=? AND available_delta<>0", userId).map(
      (r) => ({ t: ms(r.created_at), d: r.available_delta }),
    );
  else if (q.series === "network")
    events = all("SELECT created_at,volume FROM p_card_lots WHERE user_id=? AND void=0", userId).map((r) => ({
      t: ms(r.created_at),
      d: r.volume,
    }));
  else events = all("SELECT created_at FROM p_users").map((r) => ({ t: ms(r.created_at), d: 1 }));
  const rows = candles(events, q.interval, now);
  const last = rows[rows.length - 1];
  const before = rows[0].o;
  return {
    series: q.series,
    interval: q.interval,
    unit: q.series === "members" ? "count" : "toman",
    candles: rows,
    current: last.c,
    change: last.c - before,
    updatedAt: new Date(now).toISOString(),
    // Wallet and network are the member's own; membership is site-wide.
    scope: q.series === "members" ? "site" : "member",
    empty: !one(
      q.series === "wallet"
        ? "SELECT 1 FROM p_ledger WHERE user_id=? LIMIT 1"
        : q.series === "network"
          ? "SELECT 1 FROM p_card_lots WHERE user_id=? LIMIT 1"
          : "SELECT 1 FROM p_users WHERE ?<>'' LIMIT 1",
      userId,
    ),
  };
}
