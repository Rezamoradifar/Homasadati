# API contract

Next.js Node runtime; JSON responses; `Cache-Control: no-store`. All public writes require `Content-Type: application/json` and a matching `Origin`. Browser fetch supplies Origin automatically. Payload limit: 16 KiB. Server validation is authoritative. Errors return `{error: string}` with 400/401/403/404/409/413/415/429/500/503 as applicable. No CORS access is granted to other origins.

## DigiPay checkout and reconciliation

The following routes belong to the authenticated platform. The provider callback
is the narrow cross-origin exception described below; it does not grant a session.

| Method / route | Contract |
| --- | --- |
| `GET /api/platform/payment/methods` | Adds `digipay:boolean`, true only when explicitly enabled and configured. |
| `POST /api/platform/checkouts` | Accepts `method:"digipay"` through the existing server-priced basket contract. Requires a saved Iranian mobile and approved product metadata; rejects vouchers. |
| `POST /api/platform/checkouts/{id}/payment` | Owner only; opens/resumes one attempt, returning `{status:"redirect",url}` or `{status:"paid",id}`. |
| `POST /api/platform/payment/digipay/callback?pid={attemptId}` | Cross-origin form-urlencoded or JSON, at most 8 KiB. Accepts provider fields `providerId`, `trackingCode`, `amount`, `type`, `result`; verifies server-side and redirects with 303 to the result page. Query `pid` cannot be replaced by a body field. |
| `GET /api/platform/payment/digipay/callback?pid={attemptId}` | Redirect only; never verifies or changes a payment from GET fields. |
| `GET /api/platform/payments/digipay/{id}` | Owner-only sanitized summary: status, amount in stored toman, verified reference, order IDs, `checkoutPaid`, receipt and non-refunded purchase volume. No ticket/credentials returned. |
| `POST /api/platform/payments/digipay/{id}/verify` | Owner-only, same-origin, rate-limited retry using stored provider identifiers; no browser-supplied amount/status. |
| `POST /api/platform/orders/{id}/cancel` | For DigiPay requires `{providerRefundConsent:true}`. Records cancellation only after provider refund inquiry confirms completion; ambiguous status returns `digipay_refund_pending`. |
| `GET /api/platform/admin/digipay-payments` | Finance/owner or specifically delegated permission; paged operational reconciliation view. |
| `POST /api/platform/admin/digipay-payments` | Authorized finance action `{id,trackingCode,type,reason}`. Numeric type is `0`, `5`, `11`, `13` or `24`; requests authenticated provider verification, without a manual paid-state override. |

See [DigiPay deployment and operations](docs/digipay-credit-setup.md) for private
configuration, fulfillment, refunds and the explicit limits of callback recovery.

## POST /api/requests

Header `Idempotency-Key`: a cryptographically random UUID; reuse the same key after a network failure when retrying the same payload. Changed data with the same key returns 409.

```json
{"kind":"enquiry","name":"Example Visitor","email":"visitor@example.com","interest":"Tourism","message":"Please contact me","locale":"fa","currency":"USD","consent":true}
```

`kind`: enquiry or club; `locale`: en/fa/ar; `currency`: USD/EUR/AED/IRR. Name 2–100, interest 2–200, message up to 4000 characters. Optional honeypot `website` must be empty. Success 201: `{id, trackingCode}`. Code is `<id>.<idempotency-key>`; treat it as a secret. Store and transmit it privately, never put it in a public URL. Limit 12/minute.

## POST /api/status

Body `{code: trackingCode}`. Success returns id, kind, status, created_at, updated_at, never name/email/message. Status is new/in_progress/closed. 404 for unknown codes. Limit 30/minute.

## POST /api/newsletter

Body `{email, locale, consent:true}`. 202 `{ok:true, unsubscribeToken?}`. A newly registered address receives its private 64-character cancellation token once. Existing addresses never disclose their token and unsubscribed addresses are not silently reactivated. New rows remain pending/unverified. No mail service is configured; do not use pending rows as a verified mailing list. Limit 10/minute.

## POST /api/unsubscribe

Body `{token}`. Always 200 `{ok:true}` for structurally valid tokens; matching subscriber changes to unsubscribed. The `/unsubscribe?token=…` UI requires explicit confirmation and performs no mutation on GET. Link holders can cancel; keep tokens private. Limit 30/minute.

## Administration

- POST `/api/admin/session`, `{password}`: password from ADMIN_PASSWORD (minimum 16 characters); creates an 8-hour HttpOnly, SameSite=Strict session. Secure cookie in production. Limit 5/minute. No default password.
- GET `/api/admin/session`: 200 if authenticated, 401 otherwise.
- DELETE `/api/admin/session`: invalidates session and cookie; same-origin required.
- GET `/api/admin/records?type=requests&page=1`: authenticated, 50 records per page. Alternative type: subscribers. Returns `{rows,total,page,pageSize}`. Secret hashes and tokens excluded.
- PATCH `/api/admin/records`, `{id,status}`: authenticated and same-origin; status new/in_progress/closed.

Password rotation alone does not revoke existing sessions: clear the sessions table during credential rotation. Back up the DB before administrative maintenance. Application data persists until the operator removes it. The admin interface exports the current page only, with CSV formula escaping.

Do not expose the database directory, `.env.local`, backups or admin credentials in public static folders. Configure trusted proxy rate limiting and HTTPS before public operation. See LANDING-README.md.
