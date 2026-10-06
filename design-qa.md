# Member club design QA — selected option 1

Source visual truth: /workspace/scratch/87dac29dd1b8/generated_images/exec-909c0a85-15f9-4f91-b72f-3c17334a0e93.png
Browser-rendered implementation: /workspace/scratch/87dac29dd1b8/club-panel-top-proof.jpg and /workspace/scratch/87dac29dd1b8/club-panel-top.jpg (top and scrolled lower view).
Source: 853 × 1844 pixels. Reference normalized to a 390px-wide mobile content column; browser screenshot 1363 × 936 pixels, 390 CSS px component, 1x density. Browser viewport is desktop, mobile component measured directly. A physical 390px browser viewport was unavailable through this browser API. Container queries were used to ensure card content responds to its own width.
State: preview fixture, 25m counted purchases, Sarv, two active positions, 4.9m pending, zero available and vouchers, 21m weekly cap. Production uses authenticated API values; fixture is not a production route or API.

## Findings and comparison history
- Initial preview JSX runtime error corrected in preview-only Vite config; production Next runtime passed typecheck and build.
- P1: desktop media rules squeezed membership text and pushed logo outside card in the narrow preview. Fixed with border-box sizing, container queries, nonshrinking logo and responsive typography. Post-fix screenshots show both brand text and logo inside the card.
- P2: full-page capture timed out. Used normal screenshots of top and scrolled lower sections; primary controls and balance rows are visible in lower evidence.
- Preserved the existing production panel navigation and other dashboard modules. The reference's separate phone bottom bar was not duplicated inside the new account card.
- Intentional additional content: explicit active/inactive text, counted purchase wording and actual weekly cap. These add height compared with the concept image but communicate real accounting state.

## Fidelity surfaces
- Typography: existing Vazirmatn, bold membership hierarchy, responsive 25–48px display text and readable financial labels. Exact concept lettering is illustrative; application text remains editable and localized.
- Spacing/layout: same ordered header, membership card, seven positions, purchase progress, reward balances, two primary actions. Narrow brand overflow fixed. Existing panel chrome retained.
- Colors: midnight navy, warm gold membership type, coral active states and purchase CTA; muted blue secondary action. Contrast and focus outline checked visually.
- Assets: supplied actual transparent Homanet logo, generated navy/Persian engraved texture compressed to 46KB WebP, Phosphor outline icons. No fabricated logos or decorative SVG drawings.
- Content: all financial values from account API in production; no hardcoded example rewards. Seven fixed positions, capped progress and all-active state. FA/EN/AR copy covered by English completeness check.

## Interactions and checks
- Purchase button invoked catalog navigation; tree button invoked network navigation in the fixture. Production receives existing Portal tab handler on dashboard; cards page links use its observed `tab` parameter.
- Empty account switched all seven positions off, zero balances/cap, first-position purchase target.
- Console reviewed: obsolete React error occurred only before preview rebuild; subsequent page interactions produced no application exceptions. Browser extension metadata errors are unrelated to app.
- TypeScript passed; production build passed; 44 finance/UI integration tests passed; English completeness passed.

## Residual verification limits
Authenticated production dashboard cannot be visually checked without a user session. Narrow content was checked inside the desktop browser, rather than browser-device emulation. Full mobile viewport and all-active visual state remain follow-up checks. No server deployment has occurred.

final result: passed

## Checkout release — 2026-10-06
- Replaced the one-screen basket with item selection, address/payment, final review, and a server-confirmed receipt. Inline address creation, stock-aware quantity controls, voucher totals, configured gateway selection, resumable pending payments, and submission idempotency retained.
- Desktop and 390px iframe viewport inspected in cloud browser. At 390px body clientWidth and scrollWidth both 390. Product rows and summary stack; step labels and quantity buttons remain visible. Selected an address and voucher and reached final review. No real payment was submitted.
- Preview fixtures are local only, not shipped. Production cart was inspected before changes and showed the old design; deployment is not confirmed.
- Real SQLite integration verifies paid multi-item checkout contributes once, pending purchases do not contribute, refunds remove paid purchase volume, and own purchases produce no own commission. Eligible plan counting retains cancellation windows and weekly settlement/live controls.
- Paid purchase total displayed separately from counted plan volume on membership card. Existing duplicate slot display removed from historical details.
- Validation: all 276 tests across 43 files passed; TypeScript passed; isolated-database production build passed; 2884 source messages with zero missing English translations; new Arabic translations added.
- Production marker: data-checkout-version="2026-10-06". Requires deployment of this release on the Homay server and authenticated production checkout verification. Gateway credentials/provider approval and live financial settings are preserved.

## Natural copy, image branding and compact member account — 2026-10-06
- Simplified heritage headings, category labels, captions and cultural-page prose in FA/EN/AR; removed repeated artistic-process labels from homepage/carousel. Kept image context in the cultural page's existing media credit section.
- Edited the Cyrus and Simurgh illustrations with built-in image generation to remove only the large central brand plaques. Saved optimized sibling WebP assets and retained original illustrations. Prompt: preserve scene, subjects and composition; remove the plaque and restore scenery behind it. Source generation history remains illustration, not documentary photography.
- Added actual supplied Homanet logo as a small corner mark on the two updated images, so branding remains visible through responsive cropping. Adjusted portrait crops to wider image frames and removed asymmetric card offset.
- Compacted member-only account title, membership card, seven positions, balances and actions using navy/coral. Paid purchase total stays visible; calculated volume and cap remain available in expandable details. Admin styling and financial settings remain unchanged.
- Replaced account-catalog direct-order form with shared stock-aware basket controls and real basket count. Catalog prices use Money/IRR; checkout handles address, voucher, gateway and final review through the existing validated checkout API.
- Browser fixture inspected at 375px content width: body scrollWidth equals clientWidth; both heritage corner marks rendered at 19x19px; product add button updated basket count to one and displayed the basket link. Fixtures and preview image alias are not shipped.
- Real SQLite integration completed wallet checkout from both the public storefront and account catalog. TypeScript and production build passed; 33 relevant UI/localization tests passed, then 23 UI/coverage checks passed after compact detail changes. No real gateway payment was sent, and deployment remains unconfirmed.
