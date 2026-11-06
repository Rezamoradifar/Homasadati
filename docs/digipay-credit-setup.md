# DigiPay credit checkout for Homa Net

## Scope and release base

This release adds DigiPay UPG to the existing Homa checkout. It was prepared from
the retrievable approved revision `4e4145c830fe68c74b93405d398c8d4c4356a437`.
Production reported a different installed revision (`b61e772f…`), so deployment
must stage a merge with the installed source and run its gates before activation.
Do not replace the installed checkout with another branch's entire source tree.

The existing payment methods remain available. The DigiPay option is hidden
until explicitly enabled and configured. No merchant credential, live payment,
loan application or production transaction is included in this change.

## Provider prerequisites

Reference: [official UPG documentation](https://www.mydigipay.com/developers/docs/upg/).
The merchant must have the credit/instalment facilities enabled for its actual
catalogue and domain. CPG spends a customer's bank-loan-funded instalment wallet;
BPG spends eligible purchase credit/BNPL. Credit approval and repayment terms
belong to DigiPay. The integration does not create loans or promise eligibility.

UPG creates a type-11 ticket, then returns the actual purchase type in a POST
callback. Only authenticated verification can complete a Homa order. Amounts
are sent in rials; Homa's stored toman amounts are multiplied by ten exactly once.
Credit delivery is reported after real fulfillment. Refund acceptance is followed
by a separate status inquiry before Homa records the reversal.

## Private server configuration

Put these server-only variables in the installation's private `.env.local` or
existing secret-management mechanism. Do not use `NEXT_PUBLIC_` names, commit
values, send credentials through chat, or paste credentials into shell history.
The template is in [`.env.example`](../.env.example).

| Variable | Required value |
| --- | --- |
| `APP_ORIGIN` | Exact HTTPS origin, normally `https://homanets.com` |
| `DIGIPAY_ENABLED` | `1` to offer new checkouts; keep `0` before acceptance testing |
| `DIGIPAY_ENVIRONMENT` | `production` for live merchant credentials; `sandbox` for isolated tests |
| `DIGIPAY_USERNAME`, `DIGIPAY_PASSWORD` | Merchant integration login |
| `DIGIPAY_CLIENT_ID`, `DIGIPAY_CLIENT_SECRET` | Merchant OAuth client credentials |
| `DIGIPAY_SELLER_ID`, `DIGIPAY_SUPPLIER_ID` | Merchant-approved basket identifiers |
| `DIGIPAY_CATEGORY_MAP_JSON` | Approved category ID and product type for each eligible Homa vertical |
| `DIGIPAY_DEFAULT_BRAND` | Optional, truthful fallback for products without their own Brand field |

Category mapping shape, with a placeholder that must be replaced:

```json
{"craft":{"categoryId":"REPLACE_WITH_APPROVED_CATEGORY","productType":1}}
```

Only map verticals approved by the merchant's agreement. A product uses its saved
brand and SKU (or internal product ID); the seller, supplier and category values
are snapshotted with the order. An unmapped or unbranded product is rejected before
inventory is reserved. The buyer must have an Iranian mobile number on the account.
Vouchers cannot be combined with this payment method in this release.

Production processes refuse sandbox payments. Use a separate test database and
non-production process for UAT; never point sandbox tests at the production DB.
Keep the saved environment stable for existing attempts. Disabling new checkout
with `DIGIPAY_ENABLED=0` still allows existing attempts to verify/refund when the
same environment and credentials remain available.

Register the callback endpoint with the merchant account:

```text
https://homanets.com/api/platform/payment/digipay/callback
```

The application adds a unique `pid` query parameter for each attempt. The proxy
must pass query parameters and POST bodies through unchanged. This endpoint must
not be redirected to a maintenance page or protected with browser-only challenges.

Read-only configuration check (no provider call, no credential values printed):

```bash
cd /opt/homay/app
NODE_ENV=production npm run digipay:check
```

`readyForCheckout` is configuration readiness, not proof of merchant activation,
successful authentication, a successful payment, or settlement by DigiPay.
Use `-- --require-ready` to make an incomplete configuration fail an operator gate.
Older test branches stored `digipay_*` database settings; this release uses the
documented environment variables and does not silently copy a test credential.

### Explicit authentication check

After installing this release, authenticate from the actual server using its
existing private configuration with `NODE_ENV=production npm run digipay:auth-check`.
Alternatively, run `python3 scripts/digipay-auth-prompt.py` in a private terminal
to enter all four credentials with echo disabled. The prompt passes values only
to the child process, disables new checkout in that process and writes no files.
Never put credentials in command arguments. Both commands call only the OAuth
endpoint and print an allowlisted result, never an access/refresh token or secret.

OAuth requests use URL-encoded form fields and the `Agent: WEB` and
`Digipay-Version: 2022-02-02` headers, matching `DPGateway.php` in DigiPay's
[official UPG WordPress plugin](https://www.mydigipay.com/api/website/proxy/get-file/public/2026/10/wp-digipay-V1.7.2.zip).
The public UPG page also shows multipart examples. Credential characters are
encoded by the form serializer; do not manually escape or HTML-decode the values.

A successful result proves authentication at that time, not credit-service
activation, product eligibility or a successful purchase. A failure exits nonzero
and may include an HTTP status, a numeric `providerStatus` and a recognized OAuth
error. Raw provider messages and response bodies are never printed. A generic 401 cannot
identify which credential or account permission needs correction. Use the actual
server when the merchant's access rules may depend on its source IP.

## Deployment

Publish and review the exact release before installing. Use the existing staged
installer with both preservation flags; it builds/tests in a worktree, backs up
the database before activation, preserves installed changes through a merge, and
rolls back code/build when activation fails. The release adds its payment tests
to that installer. An unknown source conflict stops deployment for review.

Run as the server administrator, replacing the placeholder with the reviewed
full commit from the release/PR. This is not a command that was run in production
while preparing this change.

```bash
set -euo pipefail
homa_app=/opt/homay/app
homa_release=REPLACE_WITH_REVIEWED_40_CHARACTER_COMMIT
[[ "$homa_release" =~ ^[a-f0-9]{40}$ ]]
git -c safe.directory="$homa_app" -C "$homa_app" fetch origin "$homa_release"
git -c safe.directory="$homa_app" -C "$homa_app" cat-file -e "$homa_release^{commit}"
homa_installer=$(mktemp /tmp/homa-digipay-deploy.XXXXXXXX)
trap 'rm -f "$homa_installer"' EXIT
git -c safe.directory="$homa_app" -C "$homa_app" show "$homa_release:scripts/deploy-zibal.sh" > "$homa_installer"
bash "$homa_installer" "$homa_release" --skip-merchant --preserve-schedule
cd "$homa_app"
NODE_ENV=production npm run digipay:check
```

The connected Homa management bridge accepts only its configured exact
`approved_release`; publishing a feature branch does not update that target or
deploy it. Use the established server release process to approve/select the
reviewed revision. No change to the bridge's approval policy is part of this work.

## Payment, refund and fulfillment behavior

- Checkout prices and quantities come from stored server-side orders. A callback
  is an identifier, never evidence that money moved. Verification binds the
  attempt ID, tracking code, amount and environment.
- Concurrency claims and unique tracking references prevent a repeated callback
  from creating another order settlement, purchase volume or commission.
- An authenticated provider success is persisted before local settlement, so a
  local failure can resume without interpreting an undocumented provider error.
- Refunds use a separately persisted ID. An uncertain request is queried using
  the same ID rather than submitted a second time. A provider-confirmed failed
  refund may be retried explicitly; failed attempt history is retained.
- A confirmed DigiPay refund reverses the original order's inventory/rewards but
  never deposits credit principal into Homa's withdrawable cash wallet. Shipping
  and new reward release from an unresolved refund are held until resolution.
- Actual delivery of all remaining lines queues the credit-provider delivery
  report. A successful checkout alone does not send a delivery confirmation.

## Reconciliation and operational limits

The finance/owner payment view lists DigiPay attempts and exposes a verify-only
recovery action. A finance operator can obtain the tracking code and purchase
type from the merchant panel, enter them with the Homa attempt ID and a reason,
and request server verification. There is no manual "mark paid" override.

Operator API: `GET /api/platform/admin/digipay-payments` and authenticated,
same-origin `POST` with `{id,trackingCode,type,reason}`. This is permission-checked
and audited. The customer's result/status endpoints enforce order ownership.

A missing callback or unresolved verification older than 24 hours moves to
`review`; reserved inventory is retained while payment is uncertain. The supplied
provider documentation does not define a purchase inquiry without a tracking
code or a reliable already-verified success code. Obtain provider confirmation
for abandoned/uncertain attempts; do not clear database rows, release stock, or
mark orders paid based only on browser text. A process failure after provider
verification but before its local durable write remains such a reconciliation
case. This limitation requires an operational agreement with DigiPay before a
wide production rollout.

Delivery retries stop in review after 20 unsuccessful attempts. Refund inquiries
continue with the original reference. Inspect `p_digipay_payments`,
`p_digipay_refunds`, and `p_digipay_deliveries` through authorized operations;
never export raw customer or credential records into public logs.

## Acceptance before opening to all customers

Use the merchant's authorized testing procedure to verify credit/BNPL acceptance,
buyer return, duplicate return, declined payment, provider timeout, actual
delivery and full/partial refund. Confirm the same transaction in Homa and the
DigiPay merchant panel. The automated tests mock the provider boundary; they do
not establish real merchant readiness or execute a real credit purchase.
