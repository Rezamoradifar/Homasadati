'use client';
import {useId, useRef, useState, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {motion, useReducedMotion} from 'framer-motion';
import {ArrowUp, ArrowUpRight, Globe2, Mail, Sparkles} from 'lucide-react';
import {FooterColumn} from './FooterColumn';
import {focusRing} from './FooterLink';
import {defaultColumns, defaultCurrencies, defaultLanguages, localeDirection, localizedHref} from './config';
import type {FooterBadge, FooterProps} from './types';
import styles from './footer.module.css';

function BadgeRow({items, titleKey}: {items: readonly FooterBadge[]; titleKey: string}) {
  const t = useTranslations('Footer');
  if (!items.length) return null;
  return <section aria-label={t(titleKey)} className="space-y-3">
    <h2 className="text-xs font-medium uppercase tracking-wider text-[#b9cad5]">{t(titleKey)}</h2>
    <ul className="flex flex-wrap gap-3">{items.map(item => {
      const body = <><span aria-hidden="true" className="inline-flex shrink-0 items-center">{item.icon}</span><span>{t(item.labelKey)}</span></>;
      const cls = 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs text-[#e7eef0]';
      return <li key={item.id}>{item.href ? <a href={item.href} className={`${cls} hover:border-[#ceb798] ${focusRing}`}>{body}</a> : <span className={cls}>{body}</span>}</li>;
    })}</ul>
  </section>;
}

export function Footer({variant = 'default', introduction, signature, id, className = '', direction, logo, homeHref, resolveHref = localizedHref,
  columns = defaultColumns, socials = [], paymentMethods = [], certifications = [],
  languages = defaultLanguages, currencies = defaultCurrencies, currency = 'USD',
  onLocaleChange, onCurrencyChange, onSubscribe, newsletterSuccessContent, year = new Date().getUTCFullYear(), backToTopTargetId}: FooterProps) {
  const t = useTranslations('Footer');
  const locale = useLocale();
  const reducedMotion = useReducedMotion();
  const uid = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error' | 'invalid'>('idle');
  const [switchStatus, setSwitchStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const subscribeLock = useRef(false);
  const switchLock = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const inputClass = `min-h-12 rounded-lg border border-white/25 bg-[#2b3544] px-3 text-sm text-white ${focusRing}`;

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSubscribe || subscribeLock.current) return;
    if (!emailRef.current?.validity.valid) {
      setStatus('invalid'); emailRef.current?.focus(); return;
    }
    subscribeLock.current = true;
    setStatus('pending');
    try { await onSubscribe(email.trim(), {locale}); setStatus('success'); setEmail(''); }
    catch { setStatus('error'); }
    finally { subscribeLock.current = false; }
  }
  async function changePreference(value: string, callback?: (value: string) => void | Promise<void>) {
    if (!callback || switchLock.current) return;
    switchLock.current = true; setSwitchStatus('pending');
    try { await callback(value); setSwitchStatus('idle'); }
    catch { setSwitchStatus('error'); }
    finally { switchLock.current = false; }
  }
  function backToTop() {
    const target = backToTopTargetId ? document.getElementById(backToTopTargetId) : document.querySelector<HTMLElement>('main, h1');
    if (target) {
      const previous = target.getAttribute('tabindex');
      target.setAttribute('tabindex', '-1');
      target.focus({preventScroll: true});
      target.addEventListener('blur', () => previous === null ? target.removeAttribute('tabindex') : target.setAttribute('tabindex', previous), {once: true});
    }
    window.scrollTo({top: 0, behavior: reducedMotion ? 'auto' : 'smooth'});
  }

  return <footer data-variant={variant} id={id} dir={direction ?? localeDirection(locale)} lang={locale} aria-label={t('aria.footer')}
    className={`${styles.root} relative overflow-hidden bg-[#212834] text-[#e7eef0] ${className}`}>
    <div aria-hidden="true" className={styles.divider} />
    <motion.div initial={false} whileInView={reducedMotion ? undefined : {y: [12, 0], opacity: [0.8, 1]}}
      viewport={{once: true, amount: 0.08}} transition={{duration: 0.5, ease: 'easeOut'}}
      className="footer-inner mx-auto max-w-7xl px-5 pb-6 pt-10 sm:px-8 lg:px-12 lg:pt-14">
      {introduction}
      <section data-footer-newsletter aria-labelledby={`${uid}-newsletter`} className="grid gap-6 border-b border-white/15 pb-9 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div><p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#ceb798]"><Sparkles size={15} aria-hidden="true" />{t('newsletter.eyebrow')}</p>
          <h2 id={`${uid}-newsletter`} className="text-2xl font-medium leading-snug text-[#eee6db] sm:text-3xl">{t('newsletter.title')}</h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-[#b9cad5]">{t('newsletter.description')}</p>
        </div>
        <form onSubmit={subscribe} noValidate aria-label={t('newsletter.title')} aria-busy={status === 'pending'}>
          <label htmlFor={`${uid}-email`} className="mb-2 block text-sm">{t('newsletter.email')}</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1"><Mail aria-hidden="true" size={18} className="pointer-events-none absolute start-4 top-4 text-[#b9cad5]" />
              <input ref={emailRef} id={`${uid}-email`} name="email" type="email" required autoComplete="email" inputMode="email" dir="ltr"
                value={email} onChange={event => {setEmail(event.target.value); if (status !== 'pending') setStatus('idle');}}
                disabled={!onSubscribe || status === 'pending'} aria-invalid={status === 'invalid'} aria-describedby={`${uid}-notice ${uid}-status`}
                placeholder={t('newsletter.placeholder')} className={`${inputClass} w-full px-11 disabled:opacity-60`} />
            </div>
            <button disabled={!onSubscribe || status === 'pending'} type="submit" className={`flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-lg bg-[#ceb798] px-5 text-sm font-semibold text-[#212834] transition-colors hover:bg-[#e0d2be] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}>
              {t(status === 'pending' ? 'newsletter.pending' : 'newsletter.submit')}<ArrowUpRight aria-hidden="true" size={17} className="rtl:-scale-x-100" />
            </button>
          </div>
          <p id={`${uid}-notice`} className="mt-3 text-xs leading-5 text-[#b9cad5]">{t(onSubscribe ? 'newsletter.notice' : 'newsletter.unavailable')}</p>
          <p id={`${uid}-status`} role="status" aria-live="polite" aria-atomic="true" className="mt-2 min-h-5 text-sm text-[#eee6db]">
            {status !== 'idle' && t(`newsletter.${status}`)}
          </p>
          {status === 'success' && newsletterSuccessContent}
        </form>
      </section>

      <div data-footer-columns className="grid gap-x-6 py-8 md:grid-cols-5 md:gap-x-5 md:py-12 lg:gap-x-10">
        <FooterColumn titleKey="brand.name" defaultOpen>
          <a href={homeHref ?? resolveHref('/', locale)} aria-label={t('aria.home')} className={`inline-flex rounded-sm text-[#ceb798] ${focusRing}`}>
            <span aria-hidden="true">{logo ?? <svg width="52" height="42" viewBox="0 0 52 42" fill="none"><path d="M26 32C17 18 8 26 3 7c11 10 16 3 23 15C33 10 38 17 49 7c-5 19-14 11-23 25Z" stroke="currentColor" strokeWidth="1.6"/><path d="m19 32 7 7 7-7M26 22V8m-4 4 4-8 4 8" stroke="currentColor" strokeWidth="1.6"/></svg>}</span>
          </a>
          <p className="mt-4 max-w-xs text-sm leading-7 text-[#b9cad5]">{t('brand.tagline')}</p>
          {socials.length > 0 && <ul aria-label={t('aria.socials')} className="mt-5 flex flex-wrap gap-2">{socials.map(social => <li key={social.id}>
            <a href={social.href} aria-label={t(social.labelKey)} className={`flex size-11 items-center justify-center rounded-full border border-white/20 text-[#d5e1e5] transition-colors hover:border-[#ceb798] hover:text-[#ceb798] ${focusRing}`}><span aria-hidden="true">{social.icon}</span></a>
          </li>)}</ul>}
        </FooterColumn>
        {columns.map(column => <FooterColumn key={column.id} titleKey={column.titleKey} links={column.links.map(link => ({...link, href: resolveHref(link.href, locale)}))} />)}
      </div>

      {(paymentMethods.length > 0 || certifications.length > 0) && <div className="grid gap-7 border-t border-white/15 py-7 sm:grid-cols-2">
        <BadgeRow items={paymentMethods} titleKey="payments.title" /><BadgeRow items={certifications} titleKey="certifications.title" />
      </div>}
      <div data-footer-preferences className="flex flex-col gap-5 border-t border-white/15 py-6 md:flex-row md:items-end md:justify-between">
        <p className="flex items-center gap-2 text-sm text-[#b9cad5]"><Globe2 size={18} aria-hidden="true" />{t('global')}</p>
        <div>
          <div className="flex flex-wrap gap-4" aria-busy={switchStatus === 'pending'}>
            <label className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-[#b9cad5]" htmlFor={`${uid}-language`}>{t('switchers.language')}
              <select id={`${uid}-language`} value={locale} disabled={!onLocaleChange || switchStatus === 'pending'} onChange={event => void changePreference(event.target.value, onLocaleChange)} className={`${inputClass} w-full disabled:opacity-60`}>
                {languages.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-[#b9cad5]" htmlFor={`${uid}-currency`}>{t('switchers.currency')}
              <select id={`${uid}-currency`} value={currency} disabled={!onCurrencyChange || switchStatus === 'pending'} onChange={event => void changePreference(event.target.value, onCurrencyChange)} className={`${inputClass} w-full disabled:opacity-60`}>
                {currencies.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
              </select>
            </label>
          </div>
          <p role="status" aria-live="polite" className="mt-2 text-xs">{switchStatus !== 'idle' && t(`switchers.${switchStatus}`)}</p>
        </div>
      </div>
      {signature}
      <div data-footer-legal className="flex flex-col gap-4 border-t border-white/15 pt-6 text-xs leading-6 text-[#b9cad5] lg:flex-row lg:items-center lg:justify-between">
        <p>{t('copyright', {year: String(year)})}</p><p>{t('madeWithLove')}</p>
        <button type="button" onClick={backToTop} className={`inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-sm px-1 text-[#eee6db] hover:text-[#ceb798] ${focusRing}`}>{t('backToTop')}<ArrowUp size={16} aria-hidden="true" /></button>
      </div>
    </motion.div>
  </footer>;
}
