# Customer club interface and languages

The existing application defaults to Persian. The shared language picker supports Persian, English and Arabic. It persists a validated `homay-locale` cookie across the home page, commerce and account pages; server rendering uses the same locale and direction. The home page retains its existing next-intl messages.

`src/i18n/en.json` and `ar.json` translate existing authored UI, errors, legal text and brand stories. `Localized` translates React text and display attributes during rendering; it does not mutate DOM nodes, input values, IDs, links, event handlers or API payloads. Dynamic message templates preserve placeholders. Keep keys on `Localized` when wrapping a mapped element, and use `translate="no"` for personal names, addresses and identifiers. New UI copy needs entries in both dictionaries. The dictionaries do not call an external translation service.

Published product titles and descriptions use the existing `titleEn`, `descriptionEn`, `titleAr` and `descriptionAr` fields. Missing merchant translations retain the original text. New CMS posts, custom product specifications and customer-entered content do not receive invented translations. Provide authored translations before claiming those contents are available in all languages. Editor fields and stored order snapshots are not rewritten when changing language.

The seven public card prices are **proposals in IRR**, beginning at IRR 100,000,000 (10,000,000 tomans). They do not implement card checkout, alter rank qualification or assign travel credit. Issued member cards show their actual initial credit converted from tomans to rials. Database balances, payment calculations and other explicitly labelled toman fields retain their existing units.

The first card is copper and the second dark forest green. Card layout includes a price row with enough room at narrow mobile widths. The theme toggle uses one persistent state and touch-sized controls in commerce, registration and the home page.

Validation: `npm test`, `npm run build`; browser checks cover default locale, preference persistence, RTL/LTR, form value preservation, seven card prices and mobile/desktop layouts. Provider delivery and Google sign-in activation require the configuration and implementation described in `AUTHENTICATION.md`.
