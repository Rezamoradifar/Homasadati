# Seven-card plan — draft implementation

Version: `seven-cards-2026-09`. All financial model amounts are integer toman.

## Implemented

- Shared seven-card catalog: lower thresholds 10/20/30/40/50/60/70 million toman; Diamond replaces Parseh in the new catalog. Upper boundaries are exclusive; Simurgh is unbounded within the validated monetary range.
- Public table, homepage cards, member plan tab, admin decisions form and server-backed simulator. Existing travel entitlements remain a separate system.
- Validated backend calculation: full 30m/30m matches, 5.4m rewards, 15m per-desk weekly cap, unlimited carry in the preview, entire eighth reward as voucher, funding budget constraint.
- Initial single-purchase Simurgh cashback eligibility function (6m); staged purchases do not qualify.
- Draft decisions saved transactionally in existing settings storage, with audit entries and optimistic revision checks; API permissions, validation and rate limits.
- English translations. Existing temporary administrator login fix included.

## Deliberately NOT live

`liveSettlement` is always false. This release does **not** replace legacy commission settlement, create desks, consume production network volume, issue/redeem vouchers or credit cashback. Saving all decisions does not activate payment. Member UI explicitly shows preparation status, not a fictitious card balance.

The simulator assumes whole-match carry, even if the draft decision selects split rewards. It is explicitly labelled as a whole-match preview for one desk/week, not the eventual configured settlement engine. Its `previousMatches` is an explicit caller-supplied simulation counter, not a persisted financial sequence.

## Decisions required before implementing live settlement

1. Third 5.4m reward would exceed a 15m desk cap: hold the entire match or split its reward across weeks?
2. Eighth counter belongs to each desk or each member? Does the voucher use weekly capacity?
3. Exact topology of the member's multiple desks, treatment of existing descendants and later upgrades.
4. Initial purchase credit: purchase value itself or additional spendable credit?
5. Week boundary in Tehran time. No reset/boundary has been silently chosen.

Remaining engineering after these rules: versioned purchase enrollment and order-policy snapshots; desk graph and volume attribution excluding own first desk; transactional FIFO matching; funding allocation; weekly scheduling; cash/voucher ledgers; voucher checkout; one-time cashback posting; idempotency and refunds including spent-voucher debt; migration of existing memberships only under an explicit migration policy. Existing p_orders/p_commissions and travel ranks are not retroactively changed.

## API

- Public `GET /api/platform/card-plan`
- Member `GET /api/platform/seven-card-plan`
- Authorized staff `GET/POST /api/platform/admin/seven-card-plan`
- Authorized staff `POST /api/platform/admin/seven-card-simulate`

Updates require `decisions`, current `revision`, and a nonempty `reason`. Undecided values are null. Extra fields including `enabled` are rejected. A stale revision returns 409.

## Deployment scope

This is a review branch, not a VPS deployment or activation of financial rules. Preserve production environment files and database. Build/test the branch before any deployment. Do not advertise the new plan as operational until the remaining settlement work passes integration/refund tests.
