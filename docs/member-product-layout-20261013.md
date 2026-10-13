# Member product cards

The owner's dark-mode phone screenshot shows a full-width square image dominating the card, a stretched wishlist button, low-contrast description and purchase controls below optional details. On phones up to 640px, the image now uses a contained 180–240px frame. Gaps and margins are reduced, the wishlist remains a 44px touch target without stretching, and description/stock text follow theme colors. Price tracking is reset for readable amounts.

Stock and AddToCart precede variants and expandable specifications in DOM order, keeping keyboard and visual order aligned. Optional specifications remain available. Stock, pricing, wishlist persistence and purchase logic are unchanged.

Validation: relevant existing tests and production build including TypeScript. Visual evidence is the supplied owner screenshot; the signed-in member screen and a real phone have not been visually retested after the change.
