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
