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
