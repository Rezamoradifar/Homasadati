# Member learning and SMS sender fallback

The introduction toolkit now includes four illustrated steps (registration, shopping, orders and support), five expandable FAQs in Persian, English and Arabic, and four Persian 1080 x 1920 story images in a downloadable ZIP. Images are authored brand graphics, not simulated account screenshots. They load lazily and reserve their intrinsic aspect ratio.

## SMS fix

Kavenegar documents `sender` as optional. If omitted, `sms/send` uses the account's configured `defaultsender`: https://kavenegar.com/rest.html (Send and AccountConfig).

Previously outbox delivery threw `sms_not_configured` when the site's `sms_sender` was absent, even if the Kavenegar account had a default line. Delivery now omits `sender` when unset, retains any explicit override and preserves existing retry behavior if the provider rejects the request. It does not modify provider settings, keys, recipients or message preferences. Service diagnostics report whether the provider default is available and whether the site uses an explicit line or the provider default, without printing the line or key. Configuration is not proof of live delivery.

## Verification

32 focused tests passed, including explicit sender preservation, omitted sender fallback, rejected-provider retry, read-only diagnostics, copying and three language directions. TypeScript and production build passed. All four images were visually inspected and the ZIP contents and 1080 x 1920 dimensions verified. No test sends real messages.

The owner's purchase and OTP tests were reported successful. Notification SMS still requires a real provider/account check after deployment; no live delivery is claimed. Deployment needs root approval of the exact release, based on `af28f51a27f938cd24444969949170751eff6894`.

Generate assets with `python3 scripts/generate-member-stories.py` using ReportLab, Pillow, arabic-reshaper, python-bidi and Poppler.
