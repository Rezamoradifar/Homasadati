# Seven personal positions and four referrals

Version: `manual-referrals-2026-10-07`.

Each account has seven personal positions, displayed as 1 / 2–3 / 4–5–6–7.
Every 10,000,000 toman (100,000,000 IRR) of confirmed eligible purchases lights one additional position, up to seven. Existing company grants retain their previous qualification rules.

A single existing personal referral code points to four member endpoints under leaves 4–7. The owner must select a free endpoint before each incoming registration. The first confirmed 10m toman purchase opens all four referral endpoints, even while personal positions 4–7 remain unlit. The owner chooses a free position 4, 5, 6 or 7 for the next incoming referral in the invitation panel. Registration consumes this choice atomically; the owner must select again before another incoming referral can join. No automatic placement is allowed. Each personal position independently receives volume only from referred purchases paid while that position was active. Purchase payment time is the eligibility timestamp, even if maturity and settlement occur after activation; pre-activation purchases never become deferred volume. An active ancestor can earn volume while its leaf remains inactive. Positions 1–3 have no external referral endpoint in this version. At most four direct members may join. No overflow placement is allowed when all enabled endpoints are occupied. Refunds extinguish positions without moving previously bound members.

Historical `aa-2026-10-06` and `four-referrals-2026-10-07` networks retain their routes and volume rules. The new mode is opt-in. Setup refuses an existing sponsored network, direct binding, position lot, card order, match, or live settlement; those require a reviewed migration, not automatic rewriting. No accounts or financial entries are deleted by setup.

After installing this branch on a suitable non-live, empty network:

```sh
node --import tsx scripts/configure-four-referrals.ts
```

The command backs up the database, verifies an active superadmin, updates the mode atomically and writes an audit record. It does not enable settlement. Existing registration already binds the shared referral code atomically, so the server uses the owner’s saved endpoint and rejects registration when no endpoint has been selected.
