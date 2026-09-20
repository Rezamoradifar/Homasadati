> Historical visual verification. Forms now persist to SQLite; see VALIDATION.md and LANDING-README.md for current functionality.

# Homay Saadat landing — visual QA

final result: passed

Scope: responsive, interactive landing similar to the supplied images, extending the existing Next.js 14 footer project. This is a frontend prototype, not a live booking/membership service or a pixel-for-pixel reproduction of all seven supplied pages.

## Visual truth and evidence

- Primary source: `../upload/02-1000212759.png` (941 × 1672).
- Hero source: `../upload/01-1000212763.png` (1672 × 941).
- Supporting sources: supplied Tourism, Handicrafts, AI Studio, International screens.
- Desktop: `../homay-landing-en.jpg` and `../homay-landing-fa.jpg`; actual cloud-browser viewport 1363 × 936 CSS pixels, captured full-page at 1×. Full-page height differs because the existing five-column footer and the supplied International concept are included.
- Mobile: `../homay-landing-mobile-review.jpg`, with a 390 × 844 iframe containing the actual page (375 px content viewport after scrollbar). Cropped image: `../homay-landing-mobile-fa.jpg`. This tests CSS responsiveness, not a physical phone.
- Full combined comparison: `../landing-comparison.jpg` — source and implementation displayed together at a normalized width of 941 pixels.
- Focused comparison: `../landing-comparison-hero.jpg` — top 550 pixels of the same normalized views. Used for header, hero typography, spacing, image crop, and values-strip review.

## Required fidelity surfaces

- Typography: Cormorant Garamond provides the reference's editorial serif; Vazirmatn supplies readable, correctly joined Persian/Arabic. Brand English remains serif in RTL. All main copy is real selectable text.
- Layout: large landscape hero, four portrait service cards, horizontal image gallery, dark club band, International feature, three editorial statements, and the existing responsive footer. Mobile uses two-card rows, a menu, horizontally scrolling gallery, and footer accordions. No unintended page overflow observed.
- Color: deep petroleum/navy, warm gold buttons and line icons, warm white section backgrounds closely follow the references. Solid translucent card treatments deliberately maintain legibility.
- Assets: custom generated hero and four vertical photographs follow the source art direction. Supplied logo and gallery/international imagery are source extracts. All image requests completed; no broken images in browser. The gallery originals are lower resolution than the regenerated main images.
- Content: corrected Persian brand to «همای سعادت». Three locales supported. Reference testimonial identities/ratings were not represented as real customers; editorial brand values retain the three-card region instead. No unverifiable certifications, partner logos, or payment acceptance claims are introduced.

## Comparison history and fixes

1. Initial browser pass: tourism source extract looked soft when enlarged (P2). Replaced with a matching high-resolution generated photograph; re-captured and compared.
2. Initial footer pass: newsletter icon overlapped input text and heading hierarchy was too small (P2). Added scoped padding and heading size; verified in English and Persian captures.
3. Integration: repeated resolved footer anchors generated duplicate React keys (P2). Changed item identity to translation key plus href; final log inspection found no new application errors. Existing browser-extension metadata errors are outside the application.
4. Capture-only issue: an early full-page capture occurred before lazy images were painted. Checked actual image completion, then re-captured all populated regions. A focused skip-link state was also cleared through ordinary navigation before final screenshots.
5. Final comparison: no remaining actionable P0/P1/P2 issues for the requested similar-to-reference landing scope. Main hero and category image subjects, relative composition, color, and content hierarchy are preserved. Additional International section and larger footer intentionally reflect the supplied reference set and earlier explicit footer requirements.

## Primary interactions tested in the cloud browser

- Tourism navigation opens its experience dialog.
- Selecting Isfahan carries the selected experience into the request form.
- Name/email entry and submit produce a local review explicitly stating that nothing was sent.
- Gallery opens and next control advances the counter.
- Locale switch changes Persian/Arabic text and RTL direction.
- Mobile navigation opens and closes.
- Mobile footer accordion opens with `aria-expanded=true`.
- Mobile back-to-top returns to page start.
- Desktop and mobile page width checked for overflow.
- Application error logs checked after fixes: none newly emitted.

## Follow-up polish / limits

- P3: Replace small supplied gallery crops with original full-resolution photography when available.
- P3: Card imagery, line icons, and serif glyph details are close interpretations rather than identical source artwork.
- Operational: enquiries remain a clearly labeled local prototype; newsletter is disabled until a real handler is provided. Legal/support pages without supplied content show an unpublished notice. No payment, booking, membership account, or email is created.
- No deployment performed; local cloud-browser preview remains available.
