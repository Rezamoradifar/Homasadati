import type {AnchorHTMLAttributes, ReactNode} from 'react';

/** All message keys are relative to the next-intl `Footer` namespace. */
export interface FooterLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'aria-label'> {
  href: string;
  labelKey: string;
  /** Adds a localized accessible name if the visible label alone is insufficient. */
  ariaLabelKey?: string;
  icon?: ReactNode;
}
export interface FooterColumnProps {
  titleKey: string;
  links?: readonly FooterLinkProps[];
  children?: ReactNode;
  /** Mobile panels begin closed by default. Desktop panels are always visible. */
  defaultOpen?: boolean;
  className?: string;
}
export interface FooterColumnConfig {
  id: string;
  titleKey: string;
  links: readonly FooterLinkProps[];
}
export interface FooterOption {
  value: string;
  labelKey: string;
}
export interface FooterSocial {
  id: string;
  labelKey: string;
  href: string;
  icon: ReactNode;
}
export interface FooterBadge {
  id: string;
  labelKey: string;
  /** Supply authorized SVG/image artwork. Its accessible label is supplied by labelKey. */
  icon: ReactNode;
  /** Link certifications to the issuing authority's verification page. */
  href?: string;
}
export interface FooterProps {
  id?: string;
  className?: string;
  /** Override direction for languages/scripts beyond the built-in RTL mapping. */
  direction?: 'rtl' | 'ltr';
  /** Decorative logo: the surrounding home link gets its name from next-intl. */
  logo?: ReactNode;
  homeHref?: string;
  /** Defaults to locale-prefixed routes. Override for custom next-intl pathname mapping. */
  resolveHref?: (pathname: string, locale: string) => string;
  columns?: readonly FooterColumnConfig[];
  socials?: readonly FooterSocial[];
  paymentMethods?: readonly FooterBadge[];
  certifications?: readonly FooterBadge[];
  languages?: readonly FooterOption[];
  currencies?: readonly FooterOption[];
  currency?: string;
  /** Parent owns navigation/provider update; rejected promises show localized errors. */
  onLocaleChange?: (locale: string) => void | Promise<void>;
  /** Parent owns persistence and pricing updates. */
  onCurrencyChange?: (currency: string) => void | Promise<void>;
  /** Resolve only after the backend accepts the subscription; reject on failure. */
  onSubscribe?: (email: string, context: {locale: string}) => Promise<void>;
  /** Optional follow-up content, displayed only after successful subscription. */
  newsletterSuccessContent?: ReactNode;
  /** Pass a server-generated year to keep the initial render deterministic. */
  year?: number;
  /** Optional focus destination (usually main or a heading with tabIndex={-1}). */
  backToTopTargetId?: string;
}
