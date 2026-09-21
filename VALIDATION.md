# Validation — functional landing update

- Strict TypeScript check: passed.
- Next.js 14 production build: passed, including all six API endpoints, admin and cancellation pages.
- Vitest: 12 tests passed (7 footer integration tests and 5 server workflow tests).
- Server tests: persistent database writes read by a second database connection; idempotent retry; changed retry conflict; tracking without personal details; invalid tracking secret; input validation; cross-origin rejection; oversized body; newsletter deduplication and cancellation; unauthenticated access rejection; login, status change and logout revocation; rate limiting.
- Live Chromium: contact form submitted to SQLite, receipt appeared, private tracking returned Received, Privacy footer dialog opened with operational content.
- Live testing identified unavailable crypto.randomUUID on HTTP preview. Replaced with cryptographically random UUID construction using getRandomValues, inside error handling; successful submission and tracking rechecked.
- Live Chromium Persian newsletter: registration succeeded, private cancellation page opened, cancellation flow exercised.
- Reference visual layout and desktop/mobile captures were completed during the preceding design pass (see design-qa.md for that historical pass). Historical statements about frontend-only forms there are superseded by this update.
- Storybook build was verified in the preceding footer implementation. It was not rebuilt for the server addition; public Footer props remain compatible.

No live payment, booking supplier or email delivery service is configured or claimed tested. Admin authentication and state changes were exercised through API integration tests, not browser credential entry. Production HTTPS deployment, reverse proxy policy and backups must be configured on the target host. Screen-reader testing has not been performed.

## Landing completion pass

Added translated on-page FAQ, final contact CTA, receipt copy feedback, inline newsletter cancellation follow-up and mobile Escape focus handling. Corrected shortened Persian brand labels. TypeScript and all 12 existing component/server tests pass. Visual screenshots from the preceding pass predate these sections; a fresh browser layout review is still needed.

## September 21, 2026 — Persian playback and visual refinement

- `npm run typecheck`: passed. `npm test`: 69 tests across 11 files passed.
- `npm run build`: production bundle compiled and all routes generated.
- Browser checks: 15-image hero advances, pause works, horizontal thumbnail movement does not move the page vertically; six leather concept images and seven club cards render; day/night toggle works; no page errors on home, ranks, tourism and leather routes.
- Persian is the homepage default; remembered English/Arabic choices remain supported.
- Narration uses a supplied Persian recording when configured, otherwise only a Persian device voice. A browser without a Persian voice receives a clear message and transcript. No recorded narrator asset has been supplied.
- User inventory photos are still needed for faithful product enhancement. Existing leather pictures are explicitly labelled brand concepts, and do not create catalog stock.
- This update is source code; publication on the separately hosted production server is not verified by these checks.

## Tourism hero placement follow-up

- Production build passed after moving the original homepage movie into the tourism hero.
- Browser verification decoded the original downloaded WebM bytes via a local test route: automatic muted/inline/loop playback, persistent manual pause, resume, reduced-motion behavior and failed-media fallback passed. The source URL separately returned HTTP 200.
- Exactly one video and seven rank cards render; the rank section immediately follows the hero. Width checks passed at 1440px and 320px with no horizontal page overflow or JavaScript errors.
