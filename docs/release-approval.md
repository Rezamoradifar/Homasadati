# Approve the reviewed Homay release

The Homa Server bridge accepts only the exact `approved_release` stored by root.
It also uses a separately installed copy of `deploy-zibal.sh`; changing the app
repository alone does not update that copy. This release fixes the root checkout
permissions that caused the worker's `EACCES` failures under the bridge's private
`umask 077`.

The first attempt to install the landing polish stopped in staging because the
bridge's restricted `PATH=/usr/bin:/bin` omitted `runuser`. No live files or
services were changed. The follow-up deployer adds the standard sbin directories;
a regression test executes the real `runuser --version` with that restricted
incoming environment.

After reviewing the release commit, the server owner runs the following as root.
Replace `REVIEWED_FULL_COMMIT_SHA` with the exact reviewed 40-character revision.
The expected approval below is the value verified when this release was prepared;
the script refuses to overwrite a different approval.

```bash
bash <<'HOMA'
set -euo pipefail
umask 077
release=REVIEWED_FULL_COMMIT_SHA
expected=287b1a8f318fd3a98f0543b7cbf3c98e463345d7
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

The public catalogue and landing copy changes have automated component coverage.
The local production build was verified, but a browser could not reach the local
preview, so the new mobile layout still needs visual review after installation.
No live payment, SMS delivery, customer order or notification was submitted during
this code review.
