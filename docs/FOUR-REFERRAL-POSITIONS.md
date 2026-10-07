# Seven personal positions and four referrals

Version: `four-referrals-2026-10-07`.

Each account has seven personal positions, displayed as 1 / 2–3 / 4–5–6–7.
Every 10,000,000 toman (100,000,000 IRR) of confirmed eligible purchases lights one additional position, up to seven. Existing company grants retain their previous qualification rules.

A single existing personal referral code fills one external member endpoint under each active leaf, in physical left-to-right order. Position 4 requires four active personal positions (40m cumulative), position 5 requires five (50m), then 6 (60m) and 7 (70m). Positions 1–3 have no external referral endpoint in this version. At most four direct members may join. No overflow placement is allowed when all enabled endpoints are occupied. Refunds extinguish positions without moving previously bound members.

Historical `aa-2026-10-06` networks keep their eight endpoints and financial routes. The new mode is opt-in. Setup refuses an existing sponsored network, direct binding, position lot, card order, match, or live settlement; those require a reviewed migration, not automatic rewriting. No accounts or financial entries are deleted by setup.

After installing this branch on a suitable non-live, empty network:

```sh
node --import tsx scripts/configure-four-referrals.ts
```

The command backs up the database, verifies an active superadmin, updates the mode atomically and writes an audit record. It does not enable settlement. Existing registration already binds the shared referral code atomically, so the server determines the next available active endpoint.
