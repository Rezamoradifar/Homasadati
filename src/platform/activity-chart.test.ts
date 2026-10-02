import { expect, it } from "vitest";
import { candles } from "./activity-chart";

const H = 3600_000;
it("builds open/high/low/close from a running total, flat when idle", () => {
  const now = Date.parse("2026-09-26T10:30:00Z");
  const hour = now - (now % H);
  const rows = candles(
    [
      { t: hour - 50 * H, d: 100 }, // before the window: becomes the opening total
      { t: hour + 60_000, d: 50 },
      { t: hour + 120_000, d: -80 },
      { t: hour + 180_000, d: 10 },
    ],
    "hour",
    now,
  );
  expect(rows).toHaveLength(48);
  expect(rows[46]).toMatchObject({ o: 100, h: 100, l: 100, c: 100, n: 0 });
  expect(rows[47]).toMatchObject({ o: 100, h: 150, l: 70, c: 80, n: 3 });
});

it("starts days at Tehran midnight and weeks on Saturday", () => {
  const now = Date.parse("2026-09-26T10:00:00Z"); // Saturday 13:30 in Tehran
  const days = candles([], "day", now);
  expect(new Date(days[29].t).toISOString()).toBe("2026-09-25T20:30:00.000Z");
  const weeks = candles([], "week", now);
  expect(new Date(weeks[25].t).toISOString()).toBe("2026-09-25T20:30:00.000Z");
});
