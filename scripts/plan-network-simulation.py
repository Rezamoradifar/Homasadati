"""Network simulation of the eight-card plan up to 1,000,000 members.

Answers one question: as the network grows, do the plan's payouts stay below
the money that comes in, or does the math turn "inverse" (payouts > sales)?

Rules (from src/platform/card-levels.ts and seven-card-model.ts), in toman:
  * card level L: minimum purchase L×10m (Aria, L=8: 100m); desks = min(7, floor(purchase / 10m))
  * a match = 30m volume on BOTH legs → reward 4.9m; volume is consumed
  * weekly cap 15m per desk → at most 2 matches per desk per week
  * every 8th lifetime match is paid as a purchase voucher instead of cash
  * Simurgh cashback 6m for a single initial purchase ≥ 70m
  * unused volume is carried forward ("saved"), never flushed

Network model (deliberately the WORST case for the company):
  * a perfectly balanced binary tree, filled in join order (spillover), so
    both legs grow evenly and pair as fully as possible;
  * every purchase's volume counts for every ancestor up to the root;
  * the cap is applied per member (desks summed), which is an upper bound
    on the per-desk cap the site applies.

Run: python3 scripts/plan-network-simulation.py  → prints a summary and
writes docs/plan-network-simulation.json for the workbook.
"""
import json
import math
import sys

import numpy as np

MV, RW, DESK_CAP, CASHBACK, VOUCHER_EVERY = 30_000_000, 4_900_000, 15_000_000, 6_000_000, 8
MATCHES_PER_DESK = DESK_CAP // RW  # 3
PRICES = np.array([0, 10, 20, 30, 40, 50, 60, 70, 100], dtype=np.int64) * 1_000_000


def growth(total, weeks):
    """Members joining each week on an S-curve reaching `total`."""
    t = np.arange(1, weeks + 1)
    curve = total / (1 + np.exp(-(t - weeks / 2) / (weeks / 10)))
    cum = np.minimum(total, np.round(curve).astype(np.int64))
    cum[-1] = total
    return np.diff(np.concatenate([[0], cum]))


def simulate(name, mix, total=1_000_000, growth_weeks=104, tail_weeks=52, seed=7,
             pool=None, depth=None, carry_cap=None):
    """pool: weekly rewards (cash+voucher) capped at this share of the week's
    sales, scaled down pro rata; depth: volume counts only this many levels up;
    carry_cap: saved volume per leg is capped at this many toman."""
    rng = np.random.default_rng(seed)
    levels = rng.choice(np.arange(1, 9), size=total, p=np.array(mix) / sum(mix)).astype(np.int64)
    price = PRICES[levels]
    cap = np.minimum(7, price // 10_000_000) * MATCHES_PER_DESK
    left = np.zeros(total, dtype=np.int64)
    right = np.zeros(total, dtype=np.int64)
    lifetime = np.zeros(total, dtype=np.int64)
    joined = growth(total, growth_weeks)
    weeks = growth_weeks + tail_weeks
    rows, start = [], 0
    cum = dict(sales=0, cash=0, voucher=0, cashback=0)
    for w in range(weeks):
        n_new = int(joined[w]) if w < growth_weeks else 0
        new = np.arange(start, start + n_new)
        start += n_new
        sales = int(price[new].sum())
        cashback = int((price[new] >= 70_000_000).sum()) * CASHBACK
        # Each new purchase adds volume to the leg it sits in, for every ancestor.
        node, amt = new, price[new]
        level = 0
        while node.size and (depth is None or level < depth):
            level += 1
            keep = node > 0
            node, amt = node[keep], amt[keep]
            if not node.size:
                break
            parent = (node - 1) // 2
            is_left = node % 2 == 1
            np.add.at(left, parent[is_left], amt[is_left])
            np.add.at(right, parent[~is_left], amt[~is_left])
            node = parent
        # Weekly matching for everyone who has joined.
        live = slice(0, start)
        m = np.minimum(np.minimum(left[live], right[live]) // MV, cap[live])
        v = (lifetime[live] + m) // VOUCHER_EVERY - lifetime[live] // VOUCHER_EVERY
        left[live] -= m * MV
        right[live] -= m * MV
        lifetime[live] += m
        if carry_cap is not None:
            np.minimum(left[live], carry_cap, out=left[live])
            np.minimum(right[live], carry_cap, out=right[live])
        cash, voucher = int((m - v).sum()) * RW, int(v.sum()) * RW
        if pool is not None:
            budget = pool * sales
            if cash + voucher > budget:
                scale = budget / (cash + voucher) if cash + voucher else 0
                cash, voucher = int(cash * scale), int(voucher * scale)
        earners = int((m > 0).sum())
        cum["sales"] += sales
        cum["cash"] += cash
        cum["voucher"] += voucher
        cum["cashback"] += cashback
        paid = cum["cash"] + cum["voucher"] + cum["cashback"]
        rows.append(dict(
            week=w + 1, members=start, new=n_new, sales=sales, cash=cash, voucher=voucher,
            cashback=cashback, earners=earners,
            cum_sales=cum["sales"], cum_paid=paid,
            ratio=paid / cum["sales"] if cum["sales"] else 0.0,
            saved_volume=int(left[:start].sum() + right[:start].sum()),
        ))
    paid = cum["cash"] + cum["voucher"] + cum["cashback"]
    summary = dict(
        name=name, mix=mix, members=total, weeks=weeks,
        sales=cum["sales"], cash=cum["cash"], voucher=cum["voucher"], cashback=cum["cashback"],
        paid=paid, ratio=paid / cum["sales"],
        peak_week_ratio=max((r["cash"] + r["voucher"] + r["cashback"]) / r["sales"] for r in rows if r["sales"]),
        post_growth_paid=sum(r["cash"] + r["voucher"] for r in rows[growth_weeks:]),
        depth=int(math.floor(math.log2(total))) + 1,
    )
    return summary, rows


SCENARIOS = [
    ("همه جوانه (۱۰ میلیون)", [1, 0, 0, 0, 0, 0, 0, 0]),
    ("ترکیب واقع‌بینانه", [40, 20, 12, 9, 7, 5, 4, 3]),
    ("کارت‌های بالا", [10, 10, 10, 10, 15, 15, 15, 15]),
    ("همه آریا (۱۰۰ میلیون)", [0, 0, 0, 0, 0, 0, 0, 1]),
]

if __name__ == "__main__":
    total = int(sys.argv[1]) if len(sys.argv) > 1 else 1_000_000
    out = []
    for name, mix in SCENARIOS:
        s, rows = simulate(name, mix, total=total)
        out.append(dict(summary=s, weekly=rows))
        print(f"{name}: sales {s['sales']/1e12:.2f}T  paid {s['paid']/1e12:.2f}T  ratio {s['ratio']:.1%}  peak-week {s['peak_week_ratio']:.1%}")
    with open("docs/plan-network-simulation.json", "w") as f:
        json.dump(out, f, ensure_ascii=False)
