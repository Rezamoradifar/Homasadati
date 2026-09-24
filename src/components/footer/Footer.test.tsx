import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {NextIntlClientProvider} from 'next-intl';
import {Footer} from './Footer';
import {FooterColumn} from './FooterColumn';
import {FooterLink} from './FooterLink';
import type {ReactNode} from 'react';
import en from '../../messages/en.json';
import fa from '../../messages/fa.json';
afterEach(cleanup);
function provider(child: ReactNode, locale = 'en') {
  return <NextIntlClientProvider locale={locale} messages={locale === 'fa' ? fa : en} timeZone="UTC">{child}</NextIntlClientProvider>;
}
describe('Footer integration', () => {
  it('submits only valid email and announces server success', async () => {
    const user = userEvent.setup();
    const onSubscribe = vi.fn().mockResolvedValue(undefined);
    render(provider(<Footer onSubscribe={onSubscribe} />));
    await user.click(screen.getByRole('button', {name: 'Join our newsletter'}));
    expect(onSubscribe).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    await user.type(screen.getByLabelText('Email address'), 'reader@example.com');
    await user.click(screen.getByRole('button', {name: 'Join our newsletter'}));
    expect(onSubscribe).toHaveBeenCalledWith('reader@example.com', {locale: 'en'});
    expect(await screen.findByText('Thank you. Your subscription request has been received.')).toBeTruthy();
  });
  it('blocks duplicate in-flight subscriptions and permits retry after failure', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, r) => {reject = r;});
    const onSubscribe = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    render(provider(<Footer onSubscribe={onSubscribe} />));
    fireEvent.change(screen.getByLabelText('Email address'), {target: {value: 'reader@example.com'}});
    const form = screen.getByRole('form');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(onSubscribe).toHaveBeenCalledTimes(1);
    reject(new Error('Unavailable'));
    expect(await screen.findByText('We couldn’t subscribe you. Please try again.')).toBeTruthy();
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('reader@example.com');
    fireEvent.submit(form);
    await screen.findByText('Thank you. Your subscription request has been received.');
    expect(onSubscribe).toHaveBeenCalledTimes(2);
  });
  it('uses keyboard-operable accordion buttons and stable panel associations', async () => {
    const user = userEvent.setup();
    render(provider(<FooterColumn titleKey="columns.verticals" links={[{href: '/tourism', labelKey: 'links.tourism'}]} />));
    const button = screen.getByRole('button', {name: 'The world of Homay Saadat'});
    const panel = document.getElementById(button.getAttribute('aria-controls')!);
    expect(panel?.classList.contains('hidden')).toBe(true);
    button.focus(); await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.classList.contains('hidden')).toBe(false);
    await user.keyboard(' ');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
  it('localizes RTL markup and default destinations', () => {
    render(provider(<Footer />, 'fa'));
    const footer = screen.getByRole('contentinfo');
    expect(footer.getAttribute('dir')).toBe('rtl');
    expect(footer.getAttribute('lang')).toBe('fa');
    expect(screen.getByText('گردشگری').getAttribute('href')).toBe('/fa/tourism');
  });
  it('delegates preference changes and announces rejected changes', async () => {
    const user = userEvent.setup();
    const onLocaleChange = vi.fn().mockRejectedValue(new Error('Unavailable'));
    const onCurrencyChange = vi.fn();
    render(provider(<Footer onLocaleChange={onLocaleChange} onCurrencyChange={onCurrencyChange} />));
    await user.selectOptions(screen.getByLabelText('Language'), 'fa');
    expect(onLocaleChange).toHaveBeenCalledWith('fa');
    await screen.findByText('Couldn’t update your preference. Please try again.');
    await user.selectOptions(screen.getByLabelText('Currency'), 'EUR');
    expect(onCurrencyChange).toHaveBeenCalledWith('EUR');
  });
  it('disables unavailable integrations and protects new-tab links', () => {
    render(provider(<><Footer /><FooterLink href="https://example.com" labelKey="links.about" target="_blank" /></>));
    expect((screen.getByRole('button', {name: 'Join our newsletter'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Language') as HTMLSelectElement).disabled).toBe(true);
    expect(document.querySelector('a[target="_blank"]')?.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('returns focus to main and respects reduced motion for scrolling', async () => {
    window.scrollTo = vi.fn();
    render(provider(<><main id="main">Content</main><Footer backToTopTargetId="main" /></>));
    await userEvent.click(screen.getByRole('button', {name: 'Back to top'}));
    expect(document.activeElement?.id).toBe('main');
    expect(window.scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'auto'});
    fireEvent.blur(screen.getByRole('main'));
    await waitFor(() => expect(screen.getByRole('main').hasAttribute('tabindex')).toBe(false));
  });
});
