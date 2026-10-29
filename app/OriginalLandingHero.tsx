'use client';

import {ArrowLeft, ArrowRight} from '@phosphor-icons/react';
import {CivilizationHero} from './VisualCollections';
import {copy, type Locale} from './landing-copy';
import styles from './OriginalLandingHero.module.css';

/** Restore only the public hero from the eNamad-era landing.
 * Historical reference: e55c252fb337d1f1bc986bda3c3fe439cee9199b.
 * The existing header, real trust-seal component, store and member routes stay intact.
 * This deliberately reuses the original local six-image gallery, not a generated mockup.
 */
export default function OriginalLandingHero({locale}: {locale: Locale}) {
  const c = copy[locale];
  const Arrow = locale === 'en' ? ArrowRight : ArrowLeft;
  return (
    <section className={styles.hero} dir={locale === 'en' ? 'ltr' : 'rtl'}
      aria-labelledby="homanet-original-hero-title" data-hero-version="enamad-era-2026-09-29">
      <CivilizationHero/>
      <div className={styles.shade} aria-hidden="true"/>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <h1 id="homanet-original-hero-title" className={styles.title}>{c.hero}</h1>
        <p className={styles.subtitle}>{c.sub}</p>
        <p className={styles.description}>{c.line}</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#hex-products">{c.explore}<Arrow size={21} aria-hidden="true"/></a>
          <a className={styles.secondary} href="/about">{c.story}<Arrow size={19} aria-hidden="true"/></a>
        </div>
        <p className={styles.quote}>{c.quote}</p>
      </div>
    </section>
  );
}
