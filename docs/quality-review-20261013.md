# Homay quality review

This release closes verified issues rather than assigning a perfect score.

- Populated shared English and Arabic dictionaries from the existing authored member-toolkit and learning translations. The previous full suite failed English coverage despite standalone locale branches working.
- Added stable source-position keys in all locales. Translation no longer emits sibling-key warnings, and regression tests confirm that uncontrolled form inputs survive language changes. The initial key approach caused a reset; the full suite caught it and it was corrected before publication.
- The public member toolkit now has one main heading, while the account retains a section heading with the same styling.
- Added a branded three-language 404 page with recovery links to home, shop and orders.
- Scroll reveal now responds to first intersection and restores any still-hidden sections when its observer is disposed.
- Updated production lockfile and minimum direct versions to Next 15.5.27 and Sharp 0.35.5, with source-map-js 1.2.2. Production dependency audit moved from two high and one moderate package reports to zero known reports. No broader absence-of-vulnerabilities claim is made.
- Added localization coverage, input-state, reveal and 404 checks to the server deployment gate.

## Verification

The complete suite passed: 87 files and 469 tests. Production build and TypeScript checks passed. Sharp resized a real asset successfully. Shell syntax and deployment regression tests passed.

Isolated financial fixtures used 256 and 10,000 balanced accounts plus 2,000 left-heavy accounts. Independent expected-value checks passed for volume, caps, voucher sequencing, weekly processing and idempotency. Each fixture completed 120 authenticated loopback requests with concurrency six and no failures; the 10,000-account fixture's p95 was about 217 ms. These are synthetic paid orders, not bank transactions or evidence of production solvency/capacity.

An isolated Next production server with an empty fixture database served home, shop and member-kit with HTTP 200 and the missing-page route with HTTP 404. Toolkit and missing-page HTML each had one H1. A separate 120-read benchmark completed with zero failures, p95 28 ms; the first cold home request took 600 ms. This fixture has no production catalogue/user data and does not replace the populated scale checks.

A public home request from this executor returned 200. TLS setup occupied about 4.28 s of its 4.56 s total; time from pretransfer to first byte was about 230 ms. This is a single network-path observation, not mobile Core Web Vitals.

See `quality-review-20261013.json` and `quality-scale-20261013.json` for scope and results. Mobile-device verification, signed-in production flows, a fresh production restore rehearsal and real SMS delivery remain outside the independently verified scope. Purchase and OTP success were reported by the owner.

## Security references

- https://github.com/advisories/GHSA-4jqv-mc3x-m676
- https://github.com/advisories/GHSA-wq5f-xc86-pv6w
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q

Deployment requires exact root approval based on `ec37c018c4ac02cb19c61be6d78e491e9f61ea2a` and preserves the existing server merge.

## Deployment compatibility correction

The first production staging attempt for `b874787584c7f0bcd4eb0ecb786fd56549bd94cb` stopped before changing running services: npm reported a missing `@swc/helpers@0.5.23` lockfile entry. The same error was reproduced with npm 10.9.4, while npm 11 accepted the previous lockfile. Regenerating the lockfile with npm 10 added the optional peer entry under next-intl; no declared dependency versions changed. A clean npm 10 installation with lifecycle scripts disabled then passed. Local native SQLite rebuilding used existing Node headers because this executor cannot extract headers with npm's ownership operation; production lifecycle execution remains part of the server gate.

A fresh TypeScript check also found an incomplete IntersectionObserver test fixture. The fixture now supplies every required entry field. After these corrections, TypeScript, all 469 tests, eight deployment checks and the production build passed; the production dependency audit still reported zero known vulnerabilities. This corrected release requires new exact root approval with the failed release as the expected prior approval. Until activation succeeds, the prior installed production release remains in use.
