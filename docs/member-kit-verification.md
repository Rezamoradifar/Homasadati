# Member introduction toolkit

The `/member-kit` public page and the `member-kit` account tab share one component. It provides four copyable introductions in Persian, English and Arabic, links to the existing plan presentation, a two-page Persian PDF and a Persian portrait introduction image. Copying does not send messages. Failed clipboard access leaves selectable text and displays a manual-copy explanation.

The account component loads on demand. Download assets are not fetched until selected; the PDF is about 71 KiB and the portrait about 62 KiB. No static plan reward figures or promises were added. The navigation label now says “Cards and positions” rather than naming an inconsistent card count.

## Verification

- TypeScript check and production build: passed.
- 29 focused tests: passed, covering copying, clipboard rejection, all three language directions, download attributes, purchase flow, localization and the deployment script.
- Both PDF pages were rendered and visually inspected; portrait image inspected.
- Existing production shop: catalogue loaded; a product was added to the browser basket and the server quote showed 200,000,000 IRR with no extra shipping fee.
- Production account requires sign-in. Signed-in positions, final purchase and real OTP delivery remain unverified.
- Cloud browser has no mobile viewport emulation. Narrow-screen CSS was implemented; no device audit is claimed.
- Latest installed release health: main app and worker running, HTTP probe 200.
- Deployment diagnostics report OTP configured, template approval unknown, notification SMS sender not configured and email configured. The connector cannot edit sender settings.

## Deployment

Based on reviewed release `9c24a79eb1db0e15e935f0716d78d99be0bbd6fc`; the installed server merge is `1e3184812c56056e2ab9e8fecf53479624aa89f0`. The new release must be approved by root before the Homa connector can deploy it. The deployer stages a merge, runs checks, takes a database backup and preserves the installed server changes.

Generate assets with `python3 scripts/generate-member-kit.py` (ReportLab, Pillow, arabic-reshaper, python-bidi and Poppler required). It uses the existing logo and DejaVu Sans.
