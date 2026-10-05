# Zibal and Kavenegar setup

The deployment is not an account activation. Use the existing production database and PLATFORM_MASTER_KEY. Never replace the key or commit provider credentials.

1. Deploy this release with the existing staged deployment script (`scripts/deploy-bank-transfer.sh FULL_COMMIT_SHA`). Fetch the commit first. The script preserves server configuration and builds before swapping the running release.
2. Open `/admin`, then service settings. Save the real **zibal_merchant** in the Zibal merchant field. It is encrypted in the database and redacted from audit records. Do not use `zibal` as a production merchant (it is the sandbox value).
3. Configure the approved domain in Zibal. Callback: `https://homanets.com/api/platform/payment/callback?gateway=zibal`. APP_ORIGIN must be the exact production HTTPS origin.
4. In service settings, save **kavenegar_key**, **sms_template** (the exact approved name, previously HomanetsOTP), and **sms_sender** for notification messages. The template must contain `%token` and be Approved in Kavenegar. Account verification and template approval are provider-controlled.
5. From `/opt/homay/app`, run `runuser -u homay -- npm run services:check`. It reads the configured account, credit, debug mode, and template approval without sending messages or revealing API keys. A configured credential alone does not confirm live delivery. Unknown values require checking the provider console.
6. Test one OTP to the owner's phone through the existing registration flow. Confirm delivery. Then create a small real product order, choose Zibal, complete payment manually, and confirm that the order is paid exactly once. Failed or mismatched verification must keep the order unpaid.

Existing Zarinpal orders retain their provider. Zibal amounts are converted from internal toman accounting to rials; provider amounts must match before settlement. Existing orders, indexes, triggers, and foreign keys are preserved by the database migration. Sandbox credentials are rejected in production.

Provider references: https://github.com/zibalco/gateway-nodejs and https://kavenegar.com/rest.html
