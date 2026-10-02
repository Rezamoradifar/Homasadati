# Settlement correctness hotfix

Based on 1ef54ad110850942bdce452515cf0c3584f5cb95. Fixes three reproduced bugs: cashback for a non-initial purchase made after activation, cashback when a later order matures first, and duplicate binary rewards when the card plan is paused and resumed.

Payment confirmation now atomically snapshots `binaryEngine` and `initialPaidPurchase` in the existing order policy. All paid purchase history, including before activation and refunded orders, prevents re-opening the initial bonus. Confirmation replay returns the existing paid order. Engine ownership is assigned at actual payment confirmation, not basket creation. Cards-v1 orders cannot enter legacy binary scheduling. Card settlement only takes explicitly owned orders without legacy lots.

Important rollout: previously paid orders lacking the new ownership snapshot are held out of new card processing. Already counted orders and existing carry lots are preserved. Do not bulk tag historical orders: some may have already earned legacy rewards. Read-only summary:

```sh
node --import tsx scripts/card-settlement-review.ts
```

Review unclassified history and previously paid incorrect cashback/duplicate rewards separately. This patch does not claw back money or rewrite historical payouts. No live settings are changed. Stop both website and worker during installation so an older process cannot confirm or settle an order concurrently. Preserve the database and environment and use the normal backup procedure before deployment. Restart both services on the same release.

Validation: 70 tests passed across card engine (24), model/API (7), finance (13), checkout (8), and Bale payments (18, mocked provider). Six regression tests cover the three reproduced defects, reverse creation/payment order, pause/resume of legitimately card-owned orders, and holding unclassified historical sales. Full frontend production build not run in this focused backend repair.
