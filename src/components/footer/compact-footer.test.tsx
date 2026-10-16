import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {NextIntlClientProvider} from 'next-intl';
import {Footer} from './Footer';
import en from '../../messages/en.json';
import fa from '../../messages/fa.json';
import type {ReactNode} from 'react';

afterEach(cleanup);
const translated = (child: ReactNode, locale: 'en'|'fa'='en') =>
  <NextIntlClientProvider locale={locale} messages={locale==='en'?en:fa} timeZone="UTC">{child}</NextIntlClientProvider>;

describe('compact homepage footer', () => {
  it('renders three primary links and keeps secondary routes in accessible disclosures', () => {
    const view=render(translated(<Footer variant="editorial" compactColumns />));
    const footer=view.container.querySelector('footer')!;
    const groups=footer.querySelectorAll('[data-footer-columns] .footer-extra-links details');
    expect(groups.length).toBeGreaterThan(0);
    expect(footer.querySelector('[href="/en/tourism"]')).toBeTruthy();
    // Neither routes nor their labels disappear; extra destinations are collapsible.
    expect(footer.querySelector('[href="/en/club"]')).toBeTruthy();
    expect(screen.getAllByText('More links').length).toBeGreaterThan(0);
    const list=footer.querySelector('[data-footer-columns] section:nth-child(2) ul')!;
    expect(list.querySelectorAll(':scope > li')).toHaveLength(4); // 3 links and the disclosure
  });

  it('retains RTL labels and all destinations when collapsed', () => {
    const view=render(translated(<Footer variant="editorial" compactColumns />, 'fa'));
    expect(view.container.querySelector('footer')?.getAttribute('dir')).toBe('rtl');
    expect(screen.getAllByText('پیوندهای بیشتر').length).toBeGreaterThan(0);
    expect(view.container.querySelector('[href="/fa/privacy"]')).toBeTruthy();
  });

  it('keeps full link lists for non-compact footers', () => {
    const view=render(translated(<Footer />));
    expect(view.container.querySelectorAll('.footer-extra-links')).toHaveLength(0);
    expect(view.container.querySelector('[href="/en/club"]')).toBeTruthy();
  });
});
