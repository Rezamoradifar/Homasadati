# Email registration and account security

This updates the existing Homasadati application and SQLite database. It is not a separate demo site. A GitHub commit does not deploy the Node server.

## Member flow

1. Verify an email address with a six-digit, five-minute, single-use code. New registration accepts email; existing phone accounts retain phone login.
2. Choose **with invitation code** or **without invitation code**. Complete required name, surname, country, city, password and confirmations. An invited registration validates an active sponsor on the server; direct registration has no sponsor or binary placement.
3. Connect a time-based authenticator and prove possession with a current code. New accounts are created only after verified email, required details/consents and the authenticator confirmation. The enrollment ticket is random, stored hashed, bound to the email, expires after 15 minutes and permits five code attempts.
4. Save ten recovery codes, shown once. Each substitutes for the authenticator once and still requires the first factor. Only hashed codes are stored. Regeneration invalidates previous codes and all sessions.

Email verification establishes control of the mailbox. Names, age and residence are self-declared; this does **not** implement government identity or bank-account verification. No identity documents are collected by this change.

## Production activation — before replacing the running release

- Use supported Node.js (the existing server uses Node 22), a persistent SQLite directory, HTTPS and the existing `PLATFORM_MASTER_KEY`. Never regenerate a key when encrypted data exists. Back up the database and original master key before migration.
- Set `APP_ORIGIN` to the exact HTTPS origin. Configure a reverse proxy that removes incoming `X-Forwarded-For` and sets a trusted value, then set `TRUST_PROXY=1`. Otherwise the limiter conservatively shares one IP bucket across visitors.
- Create a Cloudflare Turnstile widget restricted to that hostname. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in the server environment. They can also be stored through superadmin settings (`turnstile_site_key`, `turnstile_secret_key`); the secret is encrypted and never returned. Environment values take precedence. Set the environment keys before upgrading to avoid locking administrators out while the widget is unconfigured.
- Configure `resend_key` and `email_from` in superadmin settings, using a verified sender domain in Resend. DNS records and successful delivery need checking in the real provider account. No SMTP/Turnstile credentials are embedded in the repository.
- Run `npm ci`, `npm run auth:preflight`, `npm run typecheck`, `npm test`, and `npm run build` on the release checkout, then use the existing server deployment procedure. `auth:preflight` reports configuration presence without displaying secrets or sending mail. It cannot prove provider validity or DNS configuration.
- On the actual HTTPS domain, complete a real email registration and authenticator setup; save recovery codes; sign out and test password + authenticator, a recovery code used once, and reset requiring the second factor. Test an existing administrator before switching traffic. Verify the Turnstile dashboard hostname and delivery provider status.

Production **fails closed** when CAPTCHA keys or the origin are absent, when provider validation fails, or when the provider is unavailable. Cloudflare test keys are rejected in production. Only explicitly named `development`/`test` environments can run without configured CAPTCHA. There is no production bypass flag. Unconfigured production public OTP/login/reset/registration is unavailable by design.

## Controls

- Turnstile server-side Siteverify for public OTP requests, email verification, registration, password/OTP login and password reset. Validation requires success, matching action, exact origin hostname, and a fresh challenge timestamp. Provider duplicate rejection is honored. Tokens are not logged or persisted.
- OTP target/IP limits, 60-second resend cooldown, five verification attempts, expiration, purpose and target binding, and invalidation of older codes when resending. Codes are never returned in an API response or written to logs.
- Email account existence is disclosed only after verifying the mailbox. Invalid password login uses a generic error and performs password-hash work for nonexistent accounts.
- New password hashes use scrypt N=32768, r=8, p=3 and random salts. Existing hashes remain usable and are upgraded after a successful password + second-factor login. Password spaces and Unicode are preserved.
- TOTP secrets use authenticated AES-256-GCM encryption with the existing master key. Previously accepted TOTP time steps cannot be replayed. Setup on existing accounts expires after ten minutes. Recovery codes have 80 bits of random entropy, are hashed and consumed atomically.
- Password, contact and MFA changes require reauthentication and limits; contact changes on protected accounts require TOTP and revoke other sessions. Password reset does not bypass MFA. Changes are audited without passwords, codes, recovery tokens or secrets.
- Session tokens are random and stored hashed; cookies are HttpOnly, SameSite=Lax and Secure in production. Account mutations enforce same-origin JSON requests. API responses disable caching. Frame embedding is blocked; object loading and cross-origin form submission are restricted by headers.
- Additive schema migration 7 creates enrollment, recovery and authenticator-setup tables; it does not delete accounts, orders, financial records or existing authenticators.

## Runtime maintenance

Next.js was updated to the patched 15.5 line; dynamic route parameters now use the async API. next-intl, sharp/libvips, PostCSS and ExcelJS's UUID dependency were also updated. The production dependency audit returned zero known advisories at verification time (2026-09-21). This is not a guarantee against undiscovered vulnerabilities or a penetration-test certification. Maintain dependency updates, encrypted backups, access controls, monitoring and key rotation on the actual host.

## References

- [Cloudflare: server-side token validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [OWASP: multifactor authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [Next.js: version 15 migration](https://nextjs.org/docs/app/guides/upgrading/version-15)

## SMS and Google activation information

Current status: new accounts use the verified-email enrollment flow above. Existing mobile accounts can request a login/reset OTP through Kavenegar. Enabling provider credentials alone does **not** add phone-first enrollment. Google sign-in and its callback are not implemented in this release.

For SMS, provide the final HTTPS domain, provider name, supported countries, and approved verification-template name. The existing integration uses Kavenegar `verify/lookup` with `receptor`, `token`, and `template`. Configure `kavenegar_key` and `sms_template` in superadmin service settings; the API key is encrypted and never returned. Confirm template approval, account balance and actual delivery using the provider account. `sms_sender` is for notification messages, not this lookup OTP flow. An international audience may require a different provider and routing.

For Google, create a Web application OAuth client in Google Cloud under an account controlled by the site owner. Supply the public Client ID, final domain, support email and consent-screen brand information. The implementation must register an exact callback URI, validate issuer/audience/signature/expiry and state/nonce, and integrate verified identity with invitation selection, required profile/consents and existing two-factor requirements. Account linking must not silently merge accounts based only on an unverified email. No callback URL is active yet. Store the Client Secret only in server configuration when the integration is implemented; do not commit or send it in chat. The site's `/legal/privacy` and `/legal/terms` URLs are available for the consent screen.

Turnstile domain restriction, public Site Key and private Secret Key are also required in production as described above. Share only public configuration in messages. Do not share Google account passwords, SMS API secrets, authenticator seeds or recovery codes.

Reference: [Google OpenID Connect configuration](https://developers.google.com/identity/openid-connect/openid-connect).
