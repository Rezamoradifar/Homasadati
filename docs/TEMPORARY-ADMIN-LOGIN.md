# Temporary administrator password login

This opt-in setup window allows only an existing, unblocked `superadmin` to
authenticate with an email and correct password without Turnstile. Existing
two-factor authentication, account/IP rate limits, origin checks and secure
session cookies remain enforced. It does not create accounts or reset passwords.
Member login, OTP delivery, registration, password reset and Google login keep
their existing CAPTCHA requirements.

The server setting `TEMP_ADMIN_PASSWORD_LOGIN_UNTIL` is an ISO timestamp. Missing,
invalid, expired or more-than-24-hours-away values disable the exception. Both
the UI configuration endpoint and login API evaluate the deadline on each request.
An expired UI must be refreshed. Existing sessions are not revoked on expiry.

On a host deployment using `.env.local`, from the app directory:

```sh
node scripts/admin-login-window.mjs https://homanets.com
```

This sets the canonical origin and a two-hour window, preserving all other
settings and saving an owner-readable backup in `.env.admin-login-backup-*.local`
(ignored by Git). Restart the app with its existing service manager. Do not
change `NODE_ENV` or `TRUST_PROXY` to enable this feature. Process-manager or
container environment overrides must match; `.env.local` cannot override values
already injected into the running process.

Sign in at `/admin` with the existing administrator email and password. Keep
email/SMS-code login unchecked. Leave the second-factor field empty only if the
account has never enabled two-factor authentication. Configure real Turnstile
keys in administrator settings and enable two-factor authentication.

To close the window early:

```sh
node scripts/admin-login-window.mjs off
```

Restart the application again. Without valid Turnstile configuration, fresh
password logins will become unavailable after the window closes or expires.

This hotfix is based on deployed revision `30a58ab`, so it does not require the
unrelated dashboard and translation updates. Local validation includes actual
API/SQLite tests, an administrator UI login, full regression tests and a
production build. Deployment and a real server login still require verification.
