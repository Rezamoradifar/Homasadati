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
