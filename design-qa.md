# Discovery homepage option 3 — design QA — 2026-10-02

## Result

Implementation and the captured Persian visual comparison are complete. The new
opening matches the selected light concept on the inspected mobile and desktop
views, and the production build and 37 focused tests pass. Full browser sign-off
is **blocked** because the supervised preview process stopped during language
verification. Its exit cause was not available. No production deployment was
performed. The older September 20 review is retained below as historical evidence;
its interaction results do not count as verification of this change.

## Target and scope

Base: `claude/cool-hamilton-e5ipv2` at
`e357f1039607ba73133a0a41d3a41d883a90ca2c`.
Implementation branch: `codex/homay-discovery-design`.

The user selected the last of three previous concepts: a cream background, short
introductory heading, arched Persepolis artwork, four service cards, a prominent
teal store action and an Iranian craft feature. The recovered source image is
`/workspace/scratch/92f587f60261/generated_images/exec-c1cb845b-c670-4513-94ad-46e15fdbad4c.png`
(853 × 1844). Existing configurable Homanet branding and all lower homepage
sections remain. Shared navigation now uses the same header on commerce pages.
Backend APIs, catalogue records, checkout logic and production security headers
were not edited.

## Rendered evidence and normalization

Evidence directory: `/workspace/scratch/6cac6e348c5f/homa-review/`.

| Capture | State and scope |
| --- | --- |
| `desktop-fixed.jpg` | Persian, light, desktop opening, closed menu |
| `mobile-fixed.jpg` | Persian, light, 390 × 844 iframe; 375 px content width after its native scrollbar |
| `mobile-menu.jpg` | Persian mobile drawer, real links and tracking action |
| `desktop-dark.jpg` | Persian desktop opening after the theme transition completed |
| `desktop-menu-dark.jpg` | Persian dark drawer with readable store action |
| `comparison-final.jpg` | Selected source and implemented mobile normalized to the same 375 px content width, alongside desktop adaptation |

The source was resized proportionally to 375 px wide. The mobile screenshot was
cropped at x=502..877, y=42..886 to exclude the neutral QA frame and scrollbar.
Desktop capture has 1333 px of content after its native scrollbar; the comparison
shows it at 860 px wide. No nonuniform scaling was used. The source and actual
render were inspected together, and an independent visual pass reached the same
result: no P0/P1/P2 visual defect in the supplied light-mode views. This does not
claim coverage of uninspected widths or languages.

The consolidated user-facing proof is `homanet-option3-preview.jpg`, delivered
with the implementation summary in the task conversation.

## Findings fixed during this change

- **P2, fixed:** Global RTL heading rules overrode the new service-title scale and
  weight. Scoped selectors now render 22 px desktop service titles and 16.575 px
  mobile titles at the tested viewport; the mobile hero is 26.91 px / weight 800.
- **P2, fixed:** The initial hero curve faced the wrong direction. The logical
  start-start corner now places the arch at the top right of the left-side image
  in RTL, matching the selected concept.
- **P2, fixed:** The shared commerce link rule could override the drawer store
  action's text color. The scoped menu selector preserves the intended light and
  dark colors. In the settled dark view the CTA uses rgb(17,24,39) text on
  rgb(58,163,163), approximately 5.87:1 contrast.
- **P2, fixed:** Existing unfinished concept components referenced missing WebP
  files. Six valid WebP assets are now included with intrinsic dimensions and
  responsive image sizing. Total bytes fell from 14,419,626 in the six original
  PNGs to 1,585,562 in WebP, an 89.00% asset-byte reduction. This is not a measured
  improvement in site loading time.
- **Interaction, fixed and tested:** Closing the drawer completes scroll/focus
  cleanup before opening the existing request-tracking dialog. A delayed native
  close event cannot release the new dialog's lock or steal its focus.

## Required visual surfaces

**Fonts and copy.** The existing Vazirmatn font remains; weight 800 is explicitly
loaded for the selected heading. The configured site name and logo remain
editable through existing settings. Eighteen exact phrases were added to each
English and Arabic dictionary, including descriptive alt text and navigation
labels. There are no new catalogue claims, testimonials or invented statistics.

**Layout and spacing.** Four service cards form two columns on mobile and four on
desktop. The observed mobile document has clientWidth=375 and scrollWidth=375.
The store action spans the grid and has a usable touch height. All lower editorial,
club, enquiry, FAQ and footer sections are retained.

**Color.** Cream, navy, coral, muted gold and teal use existing Homanet tokens.
The theme switch and dark drawer were visually inspected. The existing theme
preference was returned to light after the check. Focus-visible styles and
reduced-motion handling are present.

**Images.** The selected Iranian artwork is sharp at inspected sizes, with no
missing opening images. Responsive-image metadata records all six dimensions.
The assets are editorial illustrations and do not create real products.

**Minor deviations.** The implemented mobile store action starts about 27 px
lower than the normalized mockup. Readable labels, a taller action and section
spacing place the feature image about 80 px lower; its concluding link continues
below the 844 px capture. Real font shapes and image crops differ slightly from
the generated concept. These are acceptable responsive adaptations, not missing
content.

## Verification actually completed

- TypeScript: `npm run typecheck` passed.
- Next.js production build passed after the final visual CSS changes. Existing
  application routes remain in the build output.
- `SiteHeader.test.tsx`: 2 passed (drawer cleanup and tracking handoff).
- `localization.test.tsx`: 10 passed.
- `english-render.test.tsx`: 4 passed.
- `platform/ui.test.tsx`: 21 passed.
- Mobile drawer opens; Escape closes it, returns focus to the trigger and restores
  the body's previous overflow value.
- Selecting request tracking from the mobile drawer opens the existing tracking
  dialog. The menu is closed, focus moves into tracking, and scroll stays locked.
  Escape closes the tracking dialog.
- Desktop genuine-backdrop click closes the drawer and restores focus/scroll.
- The settled dark opening and dark drawer were inspected; the theme was restored.
- Independent final source review found no blocking integration regression.
- `git diff --check` passed. Generated Next route references were restored; local
  preview harness, preview database, dependencies and build output are excluded.

## Runtime limitation and remaining verification

Switching to English requested the deferred translation chunk and returned a
`ChunkLoadError`. The file exists in the exact current production build, but the
preview supervisor reported stopped and no Next/npm preview process remained.
No retained runtime log exposed its exit cause. There is no evidence that this
is a locale or header implementation defect. The preview was not repeatedly
restarted speculatively.

The already loaded page still allowed client-side drawer/theme checks. New-route
navigation, English/Arabic browser rendering, tablet/320 px browser checks and
commerce-page visual interaction therefore remain unverified in this session.
Automated localization checks passed, but they do not substitute for those
browser checks. External purchases, payments, emails and production data writes
were not exercised.

Before production release, run this branch in a normal staging environment and
finish those specific browser checks. This is a reviewable code change, not a
claim of a complete accessibility audit, performance score or production rollout.

final result: blocked

---

# Historical review (2026-09-20; unchanged evidence for the earlier design)

# Expanded landing design QA — 2026-09-20

## Target and evidence

Source visual truth: `/workspace/scratch/1a72a0e0c449/redesign-before.jpg`
(1348 × 4181 pixels), the existing Persian landing. The brief authorizes an
expanded redesign, not a pixel-identical reproduction. The retained identity is
Persian imagery, the bird logo, deep green, warm paper and muted gold.

Implementation: browser preview at terminal.local:4173, captured in
`/home/oai/share/1a72a0e0c449/homay-expanded-landing.jpg` (browser shared file).
CSS viewport 1363 × 936, content width 1348 with native scrollbar, density 1.
Final document height 9187 CSS pixels. Both full views were visually inspected;
the before/after images were emitted together in the comparison input. Their
unequal heights reflect the requested new content, not a density mismatch.

State: Persian, desktop, closed dialogs, first travel interest selected. English
and Arabic were also switched in-browser. Mobile used a 390 × 844 iframe, with
native scrollbar, at the same route. Mobile hero and expanded Services footer
were inspected separately. Focused desktop newsletter, columns and journal states
were inspected at full viewport scale for readable text and controls.

## Findings and iterations

- [P2, fixed] Low-resolution gallery thumbnails were enlarged in journal and
  travel panels. The first rendered journal view visibly blurred. Replaced these
  sources with existing high-resolution source photography; journal and travel
  captions now describe interests rather than incorrectly identifying locations.
- [P2, fixed] The portrait travel source expanded its grid row excessively in the
  second capture (`redesign-after.jpg`, 1348 × 9635). Constrained the image to its
  450px desktop panel using absolute positioning; mobile reserves 280px. Final
  browser inspection confirms a 450px feature and balanced photograph/text panel.
- [P2, fixed] Mobile footer breakpoint was 760px while accordion behavior changes
  at 768px. Aligned the design layer to 767px.
- [P3, fixed] Corrected duplicated Persian brand wording in newsletter copy.

## Required surfaces

- Fonts: locally served Vazirmatn 400/500/600/700 for RTL; Manrope for Latin UI;
  Cormorant Garamond for Latin display. Smaller consistent footer headings replace
  the original oversized headings. No heading clipping seen at tested widths.
- Spacing: expanded sections have consistent margins and intentional variation in
  column structure; mobile collapses sections and uses an accordion footer.
  Desktop DOM width check shows no horizontal overflow.
- Colors: retained green/gold identity with warm cream, sage travel/business
  sections, a soft neutral beauty section and a dark green footer. Controls retain
  visible gold focus outlines. Decorative wordmark is intentionally low contrast.
- Images: retained original brand assets, replaced enlarged tiny thumbnails, fixed
  travel crop. Final DOM has no completed broken images. Lazy-loaded images were
  brought into view before the final full-page screenshot.
- Copy: all new user-facing narrative translated in next-intl for fa/en/ar.
  No invented client counts, testimonials or certifications. Enquiries explicitly
  do not confirm bookings. Journal notes are original editorial text, not reports.

## Interaction checks

- Travel selection updates panel and prefills the contact form with the interest.
- Craft enquiry, beauty detail, gallery and international detail open.
- Journal opens a readable article and closes with Escape.
- Mobile Services accordion reveals its links with expanded state.
- Language switches English/Persian/Arabic and currency selection persists.
- Back-to-top returns scrollY to 0 after the smooth animation.
- Console checked: browser-extension metadata errors only in sampled log; no
  application exceptions observed. This is not a complete accessibility audit.
- Existing 12 tests pass (footer and SQLite API); TypeScript passes; production
  build passes after the final source changes.

## Implementation checklist

- [x] Expanded sections and typed enquiry callbacks
- [x] Three-language copy and RTL/LTR rendering
- [x] Reusable footer variant and mobile accordion
- [x] Review desktop/mobile, fix image quality and sizing
- [x] Verify existing tests, types and production build

## Follow-up polish

P3: More commissioned photography unique to each business line would reduce
repeated imagery. Current original assets are reused intentionally. Tablet and
physical-device testing, full accessibility audit and external email/payment
integrations are outside this redesign verification.

final result: passed

---

Current review (2026-10-02):

final result: blocked
