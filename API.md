# API contract

Next.js Node runtime; JSON responses; `Cache-Control: no-store`. All public writes require `Content-Type: application/json` and a matching `Origin`. Browser fetch supplies Origin automatically. Payload limit: 16 KiB. Server validation is authoritative. Errors return `{error: string}` with 400/401/403/404/409/413/415/429/500/503 as applicable. No CORS access is granted to other origins.

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
