"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { useData } from "./Widgets";

/** Live candlestick chart for the member panel. Every candle is one period
 * of a running total recorded by the site (wallet ledger, network volume or
 * site membership); rising candles are hollow and falling ones filled, so
 * direction never rests on colour alone. Refreshes every 30s while visible. */
type Candle = { t: number; o: number; h: number; l: number; c: number; n: number };
const seriesList = [
  ["wallet", "موجودی کیف پول"],
  ["network", "حجم شبکهٔ من"],
  ["members", "اعضای سایت"],
] as const;
const intervals = [
  ["hour", "ساعتی"],
  ["day", "روزانه"],
  ["week", "هفتگی"],
] as const;
const H = 250,
  PAD = { top: 14, right: 70, bottom: 26, left: 8 };

const fa = (v: number) => v.toLocaleString("fa-IR");
// SVG text is laid out left to right here; an embedding keeps Persian word
// order ("۱۲ میلیون") while anchoring stays predictable.
const rtl = (text: string) => "\u202B" + text + "\u202C";
function short(v: number, unit: string) {
  if (unit === "count") return fa(v);
  if (Math.abs(v) >= 1e9) return fa(+(v / 1e9).toFixed(1)) + " میلیارد";
  if (Math.abs(v) >= 1e6) return fa(+(v / 1e6).toFixed(1)) + " میلیون";
  if (Math.abs(v) >= 1e3) return fa(+(v / 1e3).toFixed(0)) + " هزار";
  return fa(v);
}
function when(t: number, interval: string) {
  const d = new Date(t);
  const opts: Intl.DateTimeFormatOptions =
    interval === "hour"
      ? { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }
      : { timeZone: "Asia/Tehran", day: "numeric", month: "short" };
  return d.toLocaleString("fa-IR-u-ca-persian", opts);
}

export default function LiveChart() {
  const [series, setSeries] = useState<string>("wallet");
  const [interval, setInterval_] = useState<string>("day");
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the plot's real width, so text keeps its size on phones.
  const plot = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const fit = (width: number) => setW(Math.max(280, Math.round(width)));
    // Older browsers (and test DOMs) lack ResizeObserver: measure once.
    if (typeof ResizeObserver === "undefined") return fit(el.clientWidth || 720);
    const observer = new ResizeObserver(([entry]) => fit(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((x) => x + 1);
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const state = useData(`activity-chart?series=${series}&interval=${interval}`, tick);
  const d = state.data as
    | { candles: Candle[]; unit: string; current: number; change: number; updatedAt: string; scope: string; empty: boolean }
    | null;

  const geo = useMemo(() => {
    if (!d) return null;
    const lo = Math.min(...d.candles.map((c) => c.l)),
      hi = Math.max(...d.candles.map((c) => c.h));
    const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1) || 1;
    const min = lo - span * 0.08,
      max = hi + span * 0.08;
    const plotW = W - PAD.left - PAD.right,
      plotH = H - PAD.top - PAD.bottom;
    const step = plotW / d.candles.length;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;
    const ticks = Array.from({ length: 4 }, (_, i) => min + ((max - min) * (i + 0.5)) / 4);
    return { step, y, ticks, body: Math.max(3, Math.min(14, step * 0.62)) };
  }, [d, W]);

  const focus = d && hover !== null ? d.candles[hover] : null;
  return (
    <Localized>
      <section className="portal-card live-chart" aria-labelledby="live-chart-title">
        <header className="live-chart-head">
          <div>
            <h2 id="live-chart-title">
              <span className="live-dot" aria-hidden="true" /> نمودار زنده
            </h2>
            <small>
              {d?.scope === "site" ? "آمار کل سایت" : "فقط حساب شما"} · به‌روزرسانی خودکار هر ۳۰ ثانیه
            </small>
          </div>
          {d && (
            <div className="live-chart-now">
              <strong>
                {short(d.current, d.unit)} {d.unit === "toman" ? "تومان" : "عضو"}
              </strong>
              <span className={d.change > 0 ? "up" : d.change < 0 ? "down" : ""}>
                {d.change > 0 ? "▲" : d.change < 0 ? "▼" : "■"} {short(Math.abs(d.change), d.unit)} در این بازه
              </span>
            </div>
          )}
        </header>
        <div className="live-chart-filters">
          <div role="tablist" aria-label="نوع نمودار">
            {seriesList.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={series === k} onClick={() => setSeries(k)}>
                {label}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="بازهٔ هر شمع">
            {intervals.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={interval === k} onClick={() => setInterval_(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {state.error && <p className="live-chart-empty">{state.error}</p>}
        {!d && !state.error && <div className="live-chart-skeleton" aria-busy="true" />}
        {d && geo && (
          <div className="live-chart-plot" dir="ltr" ref={plot} onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نمودار شمعی؛ جزئیات در جدول زیر">
              {geo.ticks.map((v) => (
                <g key={v} className="live-grid">
                  <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(v)} y2={geo.y(v)} />
                  <text x={W - 2} y={geo.y(v) + 4} textAnchor="end">
                    {rtl(short(Math.round(v), d.unit))}
                  </text>
                </g>
              ))}
              {d.candles.map((c, i) => {
                const x = PAD.left + geo.step * (i + 0.5);
                const up = c.c >= c.o;
                const top = geo.y(Math.max(c.o, c.c)),
                  bottom = geo.y(Math.min(c.o, c.c));
                return (
                  <g key={c.t} className={"candle " + (up ? "up" : "down") + (hover === i ? " active" : "")}>
                    <line className="wick" x1={x} x2={x} y1={geo.y(c.h)} y2={geo.y(c.l)} />
                    <rect
                      x={x - geo.body / 2}
                      y={top}
                      width={geo.body}
                      height={Math.max(1.5, bottom - top)}
                      rx={1.5}
                    />
                    <rect
                      className="hit"
                      x={x - geo.step / 2}
                      y={0}
                      width={geo.step}
                      height={H}
                      onMouseEnter={() => setHover(i)}
                      onTouchStart={() => setHover(i)}
                    />
                  </g>
                );
              })}
              {[0, Math.floor(d.candles.length / 2), d.candles.length - 1].map((i) => (
                <text key={i} className="live-axis" x={PAD.left + geo.step * (i + 0.5)} y={H - 6} textAnchor={i === 0 ? "start" : i === d.candles.length - 1 ? "end" : "middle"}>
                  {rtl(when(d.candles[i].t, interval))}
                </text>
              ))}
            </svg>
            {focus && hover !== null && (
              <div
                className="live-tooltip"
                dir="rtl"
                style={{ left: `${Math.min(82, Math.max(18, ((PAD.left + geo.step * (hover + 0.5)) / W) * 100))}%` }}
              >
                <b>{when(focus.t, interval)}</b>
                <span>باز: {short(focus.o, d.unit)}</span>
                <span>بیشترین: {short(focus.h, d.unit)}</span>
                <span>کمترین: {short(focus.l, d.unit)}</span>
                <span>بسته: {short(focus.c, d.unit)}</span>
                <span>{fa(focus.n)} رویداد</span>
              </div>
            )}
          </div>
        )}
        {d?.empty && <p className="live-chart-empty">هنوز رویدادی برای این نمودار ثبت نشده است؛ با اولین خرید یا واریز، شمع‌ها شکل می‌گیرند.</p>}
        {d && (
          <details className="live-chart-table">
            <summary>نمایش جدول</summary>
            <table>
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>باز</th>
                  <th>بیشترین</th>
                  <th>کمترین</th>
                  <th>بسته</th>
                </tr>
              </thead>
              <tbody>
                {d.candles
                  .filter((c) => c.n > 0)
                  .reverse()
                  .map((c) => (
                    <tr key={c.t}>
                      <td>{when(c.t, interval)}</td>
                      <td>{fa(c.o)}</td>
                      <td>{fa(c.h)}</td>
                      <td>{fa(c.l)}</td>
                      <td>{fa(c.c)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </Localized>
  );
}
