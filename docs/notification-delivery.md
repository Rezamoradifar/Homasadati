# Account notification delivery

The notification worker calls `processOutbox()` from `maintenance()`. This
processes account notifications only; OTPs remain synchronous and newsletter
delivery keeps its separate queue.

## Recipient and queue safeguards

- Check the current contact and channel preference before delivery, including
  after asynchronous email rendering. Cancel a queued message if its original
  email/phone no longer belongs to the account. Do not forward old private
  messages to a replacement contact. Existing in-app notices remain available.
- Recheck status, due time and the eight-attempt limit inside the claim
  transaction. A candidate processed by another worker is no longer eligible.
- Keep a two-minute lease per attempt. A late worker cannot overwrite another
  attempt's result; a worker that lost its lease before submission skips sending.
- Retry failures after 1, 2, 4, 8, 16, 32, 64 and 128 minutes. After attempt eight,
  the existing monitoring/readiness checks flag the exhausted queue item.
- Keep the original job ID as the email provider's idempotency key across retries.
  `sent` means the provider accepted the request, not confirmed handset or inbox
  delivery. SMS delivery is still at least once: a timeout after provider
  acceptance may cause a duplicate on retry. No claim of exactly-once SMS delivery
  is made.
- Store only application error codes in the outbox; never provider credentials or
  raw provider errors. Unsupported channels are cancelled.

Iranian mobile numbers are sent to Kavenegar in `09...` format for both OTP and
account notifications, following its [REST examples](https://kavenegar.com/rest.html).
The account contact and OTP identity retain their original stored form; other
international numbers retain the existing `00` provider prefix. This formatting
does not confirm provider approval, credit, foreign coverage or real delivery.

## Validation and rollout

`src/platform/outbox.test.ts` exercises contact/preference changes, asynchronous
rendering, competing workers, late provider results, retry exhaustion and actual
outbound request formatting with mocked providers and an isolated SQLite database.
`src/platform/message-delivery.test.ts` also checks the full maintenance path and
OTP template selection. The deployment validation includes both files.

```sh
npm exec -- vitest run src/platform/outbox.test.ts src/platform/message-delivery.test.ts
npm run typecheck
npm test
npm run api:spec
git diff --exit-code -- docs/openapi.json
npm run build
```

Deploy only after checking the installed server revision against the release and
preserving its settings/data. Use `deploy-zibal.sh <release-sha>
--skip-merchant --preserve-schedule` to leave both gateway settings and the
existing card schedule unchanged. Without `--preserve-schedule`, the installer
also configures the card schedule. It remains a full release installer, not a
notifications-only restart. Confirm that the installed revision already includes
the base commit below before installing this notification release.
After installation, restart both the application and worker and check the
existing service diagnostics. A real SMS/OTP test remains a separate authorized
operation using the production provider settings.

The changes are based on `2a519fbb5acd90be85027bec7c4791be8dd6c7a0` from
`codex/four-referral-positions`. The old localization test expected eight public
purchase tiers; it now checks the exact seven names, prices in rials and invalid
tier boundaries used by the current UI. Economic code and legacy card data are
unchanged. OpenAPI is regenerated from the existing schema, including its three
previously missing craft fields; no endpoint/schema change is introduced.
