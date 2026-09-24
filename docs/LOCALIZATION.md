# English translation maintenance

The website locale is stored in the `homay-locale` cookie. Persian remains the
default; English uses left-to-right layout, Latin digits and Gregorian dates in
the Asia/Tehran time zone. Monetary units are translated, never converted.

## Sources and rendering

- `src/i18n/en.json` translates authored interface and system messages. It has
  2,425 entries, including complete sentences with numbered placeholders.
- Landing-page copy and footer messages also have explicit locale branches in
  `app/*-copy.ts` and `src/messages/en.json`; keep their terminology consistent.
- `Localized` translates visible text, accessible labels and image descriptions.
  Adjacent text and numeric children can form a complete translated sentence so
  English word order is preserved. More specific templates take precedence.
- Translatable page metadata uses `translatedMetadata`; the cookie controls
  English titles and descriptions. The root layout has explicit locale branches.
- Input values, explicit option values, identifiers and elements with
  `translate="no"` remain intact. An option without a value retains its original
  source-language value when its label is translated.
- Verification email subject and body follow the website locale. OTP generation,
  hashing, rate limits and expiry are unchanged. SMS wording belongs to the
  configured provider template.

## Checks

```sh
npm run i18n:check
npm test
npm run build
```

The source scanner checks 2,279 unique authored Persian messages in `app` and
`src`, including string interpolation and concatenation. It excludes tests,
stories, SQL definitions, single-character normalisation maps and three files
with explicit locale branches. It fails when an English dictionary entry is
missing. This is a coverage check, not proof of linguistic quality.

Regression tests cover complete English sentences, template placeholders,
language changes without lost form values, homepage text and accessible image
descriptions, registration and sign-in, account summaries, Gregorian dates,
member wallet and administrator rule forms using the actual API and a temporary
SQLite database, and English OTP delivery through a mocked email provider.

## Content and release boundaries

Catalogue text uses authored English title and description fields when supplied.
Member names, support messages and other member- or merchant-authored content
retain their actual language. No production database content is machine-translated.

This change is verified locally through React rendering, API integration tests
and the production build. Browser visual verification and installation on the
live server are separate release steps and have not been completed for this
change. Email delivery is tested with a mocked provider, not a live recipient.
