# Landing update

The app includes a multilingual landing, persistent SQLite forms, private request tracking and an authenticated admin dashboard. Start with `LANDING-README.md` for setup and `API.md` for endpoints. The reusable footer documentation follows.

# Homay Saadat · reusable international footer

Next.js 14 / React 18 / TypeScript / Tailwind CSS 3 / next-intl 3 / Framer Motion 11.

## Run the included demo

```sh
npm ci
npm run setup
npm run dev
# http://localhost:3000
npm run typecheck
npm test
npm run build
npm run storybook
# http://localhost:6006
```

The landing newsletter now registers requests in SQLite. Sending emails and accepting payments require external providers. Social, payment and certification rows are configurable; sample Storybook data is illustrative only. All landing footer destinations open translated content or working enquiry forms.

## Add to an existing Next.js 14 application

1. Copy `src/components/footer` into your project (omit demo-data and stories if unnecessary).
2. Merge the `Footer` namespace in `src/messages/en.json`, `fa.json`, and `ar.json` into your application's dictionaries.
3. Install `next-intl@^3.26.5`, `framer-motion@^11.18.2`, and `lucide-react@^0.468.0`. Keep React 18 and your Next.js 14 setup. The lockfile records the versions used by this demo.
4. Ensure your Tailwind `content` includes the component files. CSS Modules handle the divider. No Tailwind plugins or custom theme tokens are required.
5. Render inside your existing `NextIntlClientProvider`. Set `<html lang={locale} dir={localeDirection(locale)}>` in the app layout as well; the footer sets its own direction, but cannot determine your whole application's language.
6. Use a client wrapper for callbacks and icon React elements. Don't pass ordinary functions or React component constructors from a Server Component to this Client Component.

```tsx
'use client';
import {useState} from 'react';
import {Footer} from './components/footer';
import {Instagram} from 'lucide-react';

export function SiteFooter({year}: {year: number}) {
  const [currency, setCurrency] = useState('USD');
  return (
    <Footer
      year={year}
      currency={currency}
      onCurrencyChange={async value => {
        // Update your application-wide pricing context/cookie here.
        setCurrency(value);
      }}
      onLocaleChange={async locale => {
        // Example for prefix-based routing. Retains query and hash.
        // Use your next-intl router instead if you have translated pathnames.
        const url = new URL(window.location.href);
        const segments = url.pathname.split('/');
        const supported = ['en', 'fa', 'ar'];
        if (supported.includes(segments[1])) segments[1] = locale;
        else segments.splice(1, 0, locale);
        url.pathname = segments.join('/');
        window.location.assign(url.toString());
      }}
      onSubscribe={async (email, {locale}) => {
        const response = await fetch('/api/newsletter', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email, locale, consent: true})
        });
        if (!response.ok) throw new Error('Subscription failed');
      }}
      socials={[
        // Replace this illustrative URL with the verified company profile.
        {id: 'instagram', href: 'https://www.instagram.com/',
          labelKey: 'socials.instagram', icon: <Instagram size={18} />}
      ]}
      backToTopTargetId="main-content"
    />
  );
}
```

Implement `/api/newsletter` on your server and connect it to your email provider; validate and normalize the email there, enforce consent policy, and return non-2xx on failure. This package intentionally includes no subscription database or provider credentials. Form fields and the submit button are disabled if `onSubscribe` is omitted. It never reports success without a resolving callback.

Currency and language controls are controlled. Supply `onLocaleChange` to navigate and update the provider, and supply `currency` plus `onCurrencyChange` to update the pricing state. Without callbacks the respective select is disabled. Rejected asynchronous callbacks show a translated error. Changing the currency control alone does not convert prices.

## Exports and configuration

```tsx
import {
  Footer, FooterColumn, FooterLink,
  defaultColumns, defaultLanguages, defaultCurrencies,
  localeDirection, localizedHref
} from './components/footer';
import type {
  FooterProps, FooterColumnProps, FooterLinkProps,
  FooterColumnConfig, FooterOption, FooterSocial, FooterBadge
} from './components/footer';
```

| Prop | Purpose |
| --- | --- |
| `columns` | Four default navigation groups; override links/titles by message key. |
| `resolveHref(path, locale)` | Defaults to `/{locale}/path` for root-relative paths. External, fragment, mail, and telephone URLs remain intact. Use unprefixed input paths, or override for your routing convention. |
| `homeHref` | Explicit brand home destination. Otherwise uses the resolver. |
| `logo` | Decorative React node; the link supplies a translated accessible name. Default is a simple custom bird mark. |
| `socials` | Verified destinations, message keys, and icon nodes. Empty by default. |
| `paymentMethods` | Supported payment badges, each with an icon node and translated label. Empty by default. |
| `certifications` | Actual certifications, optionally linking to issuer verification pages. Empty by default. |
| `languages`, `currencies` | Option arrays with `value` and `labelKey`. Include the current selected value. |
| `direction` | Explicit `rtl` or `ltr` override; otherwise derived from locale, with Latin-script override support. |
| `year` | Supply from the server for deterministic hydration; defaults to current UTC year. |
| `backToTopTargetId` | Focus destination on returning to top. Falls back to the first main or h1. |
| `className`, `id` | Root customization and page anchoring. |

All built-in text, statuses, aria names, select labels, badge labels, and link labels use `useTranslations('Footer')`. New message keys must exist in every locale. `FooterLink` also accepts standard anchor props, a decorative `icon`, and `ariaLabelKey`. It adds `noopener noreferrer` when opening a new tab. It deliberately uses semantic anchors rather than tying the reusable component to a particular next-intl navigation factory; same-origin links perform normal navigation.

`FooterColumn` accepts `titleKey`, `links`, `children`, `defaultOpen`, and `className`. `FooterLink` can be used independently wherever a provider is present. For a standalone column/link, use a dark background matching the footer or override its styles.

## Layout and accessibility

- Five equal columns from Tailwind's `md` breakpoint (768 px); below that each of the five sections is an independent accordion. The brand starts open, and the four navigation groups start closed.
- Accordion buttons support native Enter/Space, `aria-expanded`, `aria-controls`, unique `useId()` identifiers, and visible focus rings. Closed mobile content is removed from the tab order with `display:none`; desktop content remains visible regardless of mobile state.
- Semantic footer, headings, lists, labeled form/select controls, 44+ pixel interactive targets, localized validation/status messages, decorative hidden icons, and logical spacing support RTL/LTR.
- Newsletter blocks duplicate in-flight submissions and preserves email after server failure. Client email validation uses the native input validity API, with a translated status instead of browser-generated validation copy.
- Framer Motion reveal is subtle and runs once; content starts visible for SSR and animation failure resilience. `prefers-reduced-motion` suppresses reveal, smooth scrolling, and the animated gold divider.
- Back-to-top moves keyboard focus to the chosen page target and restores its original tabindex on blur.
- Supply actual approved payment/certification artwork through the badge icon slots. No unsupported accreditation or payment acceptance is implied by default.

## Storybook

`Footer.stories.tsx` includes English, Persian, Arabic, Mobile, MobileRTL, SubscriptionError, SubscriptionPending, and Unconfigured stories, typed with `Meta` and `StoryObj`. Language/currency controls work in the stories. Click submit after entering an email to see asynchronous form states. Storybook uses a standalone React/Vite preview; the runnable demo uses Next.js 14. The a11y addon is included for inspection; it does not replace a full accessibility audit. To inspect reduced motion, emulate the OS preference in browser devtools.

## References

- [next-intl translation hooks and ICU messages](https://next-intl.dev/docs/usage/translations)
- [Motion reduced-motion behavior](https://motion.dev/docs/react-use-reduced-motion)

See `VALIDATION.md` for checks actually completed on this package.
