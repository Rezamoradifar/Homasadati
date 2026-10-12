# Approve the reviewed Homay release

The Homa Server bridge accepts only the exact `approved_release` stored by root.
It also uses a separately installed copy of `deploy-zibal.sh`; changing the app
repository alone does not update that copy.

This release builds on the approved `6ca21c0e2e74153553fbd602e79e55cefd7ebfe4`.
It replaces product taxonomy slugs with customer-facing labels, simplifies the
purchase notice in Persian, English and Arabic, improves narrow-screen product,
cart and menu controls, and adds read-only notification configuration and queue
summaries to service diagnostics. Prices, refunds, payment and club rules are
unchanged. The existing checkout-permission and restricted-PATH repairs remain.

After reviewing the release commit, the server owner runs the following as root.
Replace `REVIEWED_FULL_COMMIT_SHA` with the exact reviewed 40-character revision.
The expected approval below is the value verified when this release was prepared;
the script refuses to overwrite a different approval.

```bash
bash <<'HOMA'
set -euo pipefail
umask 077
release=REVIEWED_FULL_COMMIT_SHA
expected=6ca21c0e2e74153553fbd602e79e55cefd7ebfe4
g() { git -c safe.directory=/opt/homay/app -C /opt/homay/app "$@"; }
g fetch --no-tags https://github.com/Rezamoradifar/Homasadati.git "$release"
approval=$(mktemp /root/homa-approve.XXXXXXXX.py)
trap 'rm -f "$approval"' EXIT
g show "$release:scripts/approve-homa-release.py" > "$approval"
python3 "$approval" "$release" "$expected"
HOMA
```

This does not deploy the application, restart services, change the app checkout,
or change database, merchant or card settings. It requires an idle management
queue, holds the bridge and deployment locks, verifies that the new revision
descends from the expected approval, backs up the two management files privately,
and atomically installs the reviewed deployer and approval. All other bridge
configuration fields are preserved. A failed approval write restores the previous
deployer. An interrupted process leaves the backups for root to inspect.

After approval, read `homa_status` and submit `homa_upgrade` for that exact SHA.
Reuse its request ID if submission times out. Track the returned job to completion
and verify both services and HTTP health. The deployment stages a merge with the
installed checkout to preserve existing server-only changes, runs build and tests,
backs up the database before activation, and preserves merchant/card schedules.
Unrecognized merge conflicts stop before activation.

Local verification passed: 62 focused tests, TypeScript, English translation
coverage and a production build. The deployment gate now also runs product-page
and service-diagnostic tests. Product tests cover all three languages and retain
published prices and merchant specifications. Message checks use isolated test
databases and mocked providers; they do not send customer messages.

The cloud browser confirmed the old product-page issues on the live website but
cannot access the local preview or emulate a phone viewport. Visually review the
new narrow-screen layout after installation. SMS template approval and actual
message delivery remain unverified until the provider/live test confirms them.
No new verified company photography was available, so no replacement company
photos or invented authenticity claims are included.
