# Catalogue card appearance update

The owner approved a visual update to public shop cards and member-panel product cards. This release builds on production-approved source `9a5fba8d6a6f1c43f31f357de8729b20431d7c9e`.

Changes are scoped to those two card types in a final stylesheet:

- Public desktop cards allocate 46% of their width to the image, replacing 40%.
- Public cards stack image and copy below 700 pixels. Member cards stack below 640 pixels instead of the narrow 105-pixel image column.
- Whole product images remain contained in square frames.
- Product descriptions show two lines while the full text remains in the DOM and on the product page.
- Price typography, 18-pixel outer corners, spacing and 48-pixel purchase buttons are consistent. The shared turquoise comes from existing theme tokens; dark-mode purchase buttons use dark text on the lighter turquoise.
- The public product-details link is visible again on small screens with a 44-pixel target.

No product data, pricing, basket behavior, authentication, account permissions or financial rules changed. Account controls and unrelated panel cards are outside the stylesheet's scope.

Validation: fresh TypeScript and final production build passed; CSS is compiled through the production build and git diff whitespace checks passed. No new implementation-mirroring test was added for this reversible style-only change. Native phone rendering and signed-in account visual QA are not verified in this environment. These are implemented responsive rules, not a claim that a phone screenshot has been checked. Activation requires exact root approval of the new source commit and the usual server deployment gate.
