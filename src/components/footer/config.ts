import type {FooterColumnConfig, FooterOption} from './types';
const group = (id: string, routes: string[]): FooterColumnConfig => ({
  id, titleKey: `columns.${id}`, links: routes.map(route => ({href: `/${route}`, labelKey: `links.${route}`}))
});
export const defaultColumns: readonly FooterColumnConfig[] = [
  group('verticals', ['tourism', 'beauty', 'handicrafts', 'leather', 'content', 'club', 'ai']),
  group('services', ['booking', 'concierge', 'api', 'partners']),
  group('company', ['about', 'careers', 'press', 'sustainability', 'contact']),
  group('support', ['help', 'faq', 'terms', 'privacy', 'refund'])
];
export const defaultLanguages: readonly FooterOption[] = [
  {value: 'en', labelKey: 'languages.en'}, {value: 'fa', labelKey: 'languages.fa'}, {value: 'ar', labelKey: 'languages.ar'}
];
export const defaultCurrencies: readonly FooterOption[] = [
  {value: 'USD', labelKey: 'currencies.USD'}, {value: 'EUR', labelKey: 'currencies.EUR'},
  {value: 'AED', labelKey: 'currencies.AED'}, {value: 'IRR', labelKey: 'currencies.IRR'}
];
export function localeDirection(locale: string): 'rtl' | 'ltr' {
  const parts = locale.toLowerCase().split('-');
  if (parts.includes('latn')) return 'ltr';
  return parts.includes('arab') || parts.includes('hebr') || ['fa', 'ar', 'he', 'ur', 'ps', 'dv', 'yi', 'ckb'].includes(parts[0]) ? 'rtl' : 'ltr';
}
export function localizedHref(path: string, locale: string) {
  return path.startsWith('/') && !path.startsWith('//') ? `/${locale}${path === '/' ? '' : path}` : path;
}
