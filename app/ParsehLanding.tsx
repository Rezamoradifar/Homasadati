'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ShoppingBag } from '@phosphor-icons/react';
import ResponsiveImage from '../src/components/media/ResponsiveImage';
import { useSiteSettings } from '../src/platform/SiteSettings';
import type { SiteLocale } from '../src/i18n/core';
import words from './parseh-copy.json';
import styles from './ParsehLanding.module.css';

export type GuideId = keyof typeof words.fa.guides;
const destinations = ['isfahan', 'yazd', 'hormuz'] as const;
const services = [
  { id: 'tourism', href: '/worlds/tourism' }, { id: 'craft', href: '/worlds/craft' },
  { id: 'beauty', href: '/worlds/beauty' }, { id: 'content', href: null },
  { id: 'ai', href: '/worlds/ai' }, { id: 'club', href: '/club' },
] as const;
const image = (id: string) => `/assets/parseh/parseh-${id}.webp`;

function Wordmark({ locale }: { locale: SiteLocale }) {
  const { site_logo } = useSiteSettings();
  return <a href="/" className={styles.wordmark} aria-label={words[locale].home}>
    <img src={site_logo || '/assets/parseh/wing.webp'} width="51" height="44" alt="" />
    <span>{words[locale].brand}</span>
  </a>;
}

export function ParsehHeader({ locale, menuButton }: { locale: SiteLocale; menuButton: ReactNode }) {
  const c = words[locale];
  return <header className={styles.header}>
    <div className={styles.bar}>
      <Wordmark locale={locale} />
      <nav className={styles.mainNav} aria-label={c.nav}>
        <a href="#hex-products">{c.services}</a>
        <a href="#destinations">{c.destinations}</a>
        <a href="#club">{c.club}</a>
      </nav>
      <div className={styles.actions}>
        <a className={styles.bag} href="/cart" aria-label={c.cart}><ShoppingBag size={25} weight="light" /></a>
        <a className={styles.signIn} href="/account">{c.account}</a>
        {menuButton}
      </div>
    </div>
  </header>;
}

export function ParsehFooter({ locale, children }: { locale: SiteLocale; children: ReactNode }) {
  const c = words[locale];
  return <div className={styles.footer}>
    <footer className={styles.footRow}>
      <Wordmark locale={locale} />
      <div className={styles.footLinks}>
        <a href="/about">{c.about}</a><a href="/support">{c.support}</a><a href="/contact">{c.contact}</a>
      </div>
    </footer>
    <details className={styles.more}><summary>{c.more}</summary>{children}</details>
  </div>;
}

export function ParsehGuide({ locale, id, onEnquire }: { locale: SiteLocale; id: GuideId; onEnquire: (topic: string) => void }) {
  const c = words[locale], guide = c.guides[id];
  return <div className={styles.guide}>
    <ResponsiveImage src={image(id)} alt="" sizes="(max-width: 700px) 90vw, 640px" />
    <h2 id="dialog-title">{id === 'kashan' ? c.kashan : guide.name}</h2>
    {guide.stops.map(stop => <p key={stop}>{stop}</p>)}
    <button type="button" className={styles.gold} onClick={() => onEnquire(guide.name)}>{c.ask}</button>
  </div>;
}

export default function ParsehLanding({ locale, values, onGuide, onEnquire }: {
  locale: SiteLocale; values: Record<string, string>; onGuide: (id: GuideId) => void; onEnquire: (topic: string) => void;
}) {
  const c = words[locale];
  const label = (key: string, fallback: string) => values[`${locale}.${key}`] || fallback;
  const [slide, setSlide] = useState(0);
  const slides = [
    { src: values['image.hero'] || image('hero'), name: c.parseh },
    { src: image('isfahan'), name: c.guides.isfahan.name },
    { src: image('yazd'), name: c.guides.yazd.name },
  ];
  const Arrow = locale === 'en' ? ArrowRight : ArrowLeft;

  return <div id="home" className={styles.landing} data-home-design="parseh">
    <section className={styles.hero} aria-labelledby="parseh-title">
      <ResponsiveImage className={styles.heroPhoto} src={slides[slide].src} alt={slides[slide].name} loading="eager"
        fetchPriority={slide === 0 ? 'high' : 'auto'} sizes="100vw" />
      <div className={styles.heroCopy}>
        <h1 id="parseh-title">{label('hero.hero', c.hero)}</h1>
        <a className={styles.gold} href="#destinations">{label('hero.explore', c.discover)} <Arrow size={23} /></a>
      </div>
      <div className={styles.dots} role="group" aria-label={c.gallery}>
        {slides.map((item, i) => <button key={i} type="button" aria-label={item.name} aria-pressed={slide === i}
          onClick={() => setSlide(i)}><span aria-hidden="true" /></button>)}
      </div>
    </section>

    <section id="hex-products" className={styles.services} aria-labelledby="parseh-services">
      <div className={styles.wrap}>
        <h2 id="parseh-services">{label('parseh.services', c.services)}</h2>
        <ul className={styles.serviceGrid}>{services.map(({ id, href }) => {
          const iconAndName = <><img src={`/assets/parseh/service-${id}.webp`} width="154" height="136" alt="" /><span>{c.service[id]}</span></>;
          return <li key={id}>{href ? <a href={href}>{iconAndName}</a>
            : <button type="button" onClick={() => onEnquire(c.service[id])}>{iconAndName}</button>}</li>;
        })}</ul>
      </div>
    </section>

    <section id="destinations" className={styles.destinations} aria-labelledby="parseh-destinations">
      <div className={styles.wrap}>
        <h2 id="parseh-destinations">{label('parseh.featured', c.featured)}</h2>
        <div className={styles.gallery}>
          {destinations.map((id, index) => <button key={id} type="button" className={styles.destination} onClick={() => onGuide(id)}>
            <ResponsiveImage src={image(id)} alt="" sizes={index === 0 ? '(max-width: 690px) 95vw, 58vw' : '(max-width: 690px) 46vw, 36vw'} />
            <span>{c.guides[id].name}</span>
          </button>)}
        </div>
      </div>
    </section>

    <section id="club" className={styles.club} aria-labelledby="parseh-club">
      <ResponsiveImage className={styles.clubPhoto} src={image('club')} alt="" sizes="100vw" />
      <div className={styles.clubCopy}>
        <h2 id="parseh-club">{label('parseh.club', c.club)}</h2>
        <a className={styles.outline} href="/club">{label('parseh.clubEntry', c.clubEntry)} <Arrow size={18} /></a>
      </div>
    </section>

    <section id="journal" className={styles.journal} aria-labelledby="parseh-journal">
      <div className={styles.journalRow}>
        <ResponsiveImage className={styles.journalPhoto} src={values['image.story'] || image('kashan')} alt={c.guides.kashan.name}
          sizes="(max-width: 690px) 94vw, 61vw" />
        <div className={styles.journalCopy}>
          <p>{label('parseh.journal', c.journal)}</p>
          <h2 id="parseh-journal">{label('parseh.kashan', c.kashan)}</h2>
          <button className={styles.outline} type="button" onClick={() => onGuide('kashan')}>{label('parseh.read', c.read)} <Arrow size={18} /></button>
        </div>
      </div>
    </section>
  </div>;
}
