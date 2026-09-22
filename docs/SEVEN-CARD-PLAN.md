# Seven-card plan — draft implementation

Version: `seven-cards-2026-09`. All financial model amounts are integer toman.

## Implemented

- Shared seven-card catalog: lower thresholds 10/20/30/40/50/60/70 million toman; Diamond replaces Parseh in the new catalog. Upper boundaries are exclusive; Simurgh is unbounded within the validated monetary range.
- Public table, homepage cards, member plan tab, admin decisions form and server-backed simulator. Existing travel entitlements remain a separate system.
- Validated backend calculation: full 30m/30m matches, 5.4m rewards, 15m per-desk weekly cap, unlimited carry in the preview, entire eighth reward as voucher, funding budget constraint.
- Initial single-purchase Simurgh cashback eligibility function (6m); staged purchases do not qualify.
- Draft decisions saved transactionally in existing settings storage, with audit entries and optimistic revision checks; API permissions, validation and rate limits.
- English translations. Existing temporary administrator login fix included.

## Live settlement engine (`src/platform/seven-card-engine.ts`)

Owner decisions recorded 2026-09: carry the whole match when a desk's cap is reached; eighth-match counter per desk; the voucher counts toward the 15m cap; extra desks are the member's own capacity under their first desk (`own-desks`, filled in order); initial purchase credit is the purchase value itself; weeks start Saturday 00:00 Tehran time. The operator confirmed a network-marketing licence.

- **Off by default.** `POST /api/platform/admin/seven-card-live` switches it on only when every decision is recorded, with a funding share (basis points of the week's counted sales) and a reason; the change is audited. While live, the legacy binary engine creates no new lots.
- **Volume.** A paid order counts once its cancellation window has ended, it is not refunded, and it was paid after activation (history is never paid retroactively). Its amount becomes a lot on the left/right leg of every ancestor in the placement tree.
- **Cards and desks.** Level = `cardForPurchase(total counted purchases)`; level n gives n desks. Only enrolled, unblocked members earn.
- **Weekly settlement** (worker, idempotent per week, at most four missed weeks per run): 30m/30m → 5.4m, desks filled in order, 15m cap per desk, whole-match carry, eighth match of a desk becomes a voucher, weekly funding budget with unused budget carried forward. Cash goes to the wallet ledger (settling any debt first); vouchers go to the immutable `p_card_voucher_ledger`.
- **Simurgh cashback.** 6m to the wallet for a single first counted purchase of 70m or more.
- **Refunds.** Refunding an order voids its lots, reverses every match that used them (cash beyond the available balance becomes debt; vouchers get a negative entry), restores the other side's volume, lowers the member's total and reverses any cashback.
- **Preview.** `GET /api/platform/admin/seven-card-preview` runs the current week's settlement in a rolled-back transaction.
- **Member view.** `GET /api/platform/seven-card-plan` includes the member's level, desks, leg volumes, desk counters, voucher balance and recent matches.

Still to build: spending vouchers at checkout (balances accrue and are shown, but cannot yet pay for orders); split-reward and per-member counter variants (only the chosen rules are implemented).

## API

- Public `GET /api/platform/card-plan`
- Member `GET /api/platform/seven-card-plan`
- Authorized staff `GET/POST /api/platform/admin/seven-card-plan`
- Authorized staff `POST /api/platform/admin/seven-card-simulate`
- Authorized staff `GET/POST /api/platform/admin/seven-card-live` (status, weeks; switch on/off)
- Authorized staff `GET /api/platform/admin/seven-card-preview`

Updates require `decisions`, current `revision`, and a nonempty `reason`. Undecided values are null. Extra fields including `enabled` are rejected. A stale revision returns 409.

## Deployment scope

This is a review branch, not a VPS deployment or activation of financial rules. Preserve production environment files and database. Build/test the branch before any deployment. Do not advertise the new plan as operational until the remaining settlement work passes integration/refund tests.
