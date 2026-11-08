import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {readFileSync, existsSync} from 'node:fs';
import OriginalLandingHero from './OriginalLandingHero';
import PremiumHomeExact from './PremiumHomeExact';
import {copy, type Locale} from './landing-copy';

vi.mock('./VisualCollections', () => ({
  CivilizationHero: () => <img className="hero-photo" data-testid="original-gallery" src="/assets/backdrop/persepolis.webp" alt=""/>,
}));
vi.mock('../src/components/media/ResponsiveImage', () => ({
  default: ({quality, fetchPriority, ...props}: any) => <img {...props}/>,
}));
vi.mock('../src/components/media/useHeroPerformance', () => ({
  useHeroPerformance: () => ({heroRef: null, onPointerMove: undefined, onPointerLeave: undefined}),
}));
vi.mock('../src/platform/SiteSettings', () => ({
  useSiteSettings: () => ({site_logo: '/assets/brand-mark.png'}),
}));
const homepageValues = vi.hoisted(() => ({current: {} as Record<string, string>}));
vi.mock('../src/platform/Widgets', () => ({
  useData: () => ({data: {values: homepageValues.current}, loading:false}),
}));
vi.mock('../src/platform/PublicContent', () => ({default: () => <div data-testid="published-content"/>}));
vi.mock('../src/commerce/currency', () => ({Money: ({toman}: {toman:number}) => <span>{toman}</span>}));
vi.mock('../src/commerce/AddToCart', () => ({default: ({id}: {id:string}) => <button data-product-id={id}>Add to cart</button>}));

afterEach(() => { cleanup(); homepageValues.current = {}; });

describe('restored eNamad-era public landing hero', () => {
  it.each(['fa','en','ar'] as Locale[])('uses the original brand copy and existing local gallery in %s', locale => {
    const {container} = render(<OriginalLandingHero locale={locale}/>);
    expect(screen.getByRole('heading', {level:1}).textContent).toBe(copy[locale].hero);
    expect(container.querySelector('section')?.getAttribute('dir')).toBe(locale==='en'?'ltr':'rtl');
    expect(screen.getByTestId('original-gallery').getAttribute('src')).toBe('/assets/backdrop/persepolis.webp');
    expect(screen.getByRole('link', {name:copy[locale].explore}).getAttribute('href')).toBe('/shop');
    expect(screen.getByRole('link', {name:copy[locale].story}).getAttribute('href')).toBe('/about');
  });

  it('mounts the original hero first by default, not both competing banners', () => {
    const {container} = render(<PremiumHomeExact locale="fa"/>);
    expect(container.querySelector('.homa-exact > section')?.getAttribute('data-hero-version')).toBe('enamad-era-2026-09-29');
    expect(container.querySelector('.hex-hero')).toBeNull();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByTestId('published-content')).toBeTruthy();
    expect(container.querySelector('#hex-products')).toBeNull();
    expect(container.querySelector('a[href="/shop/real-product"]')).toBeNull();
    expect(container.querySelector('button[data-product-id="real-product"]')).toBeNull();
    for(const route of ['/shop','/account','/club','/income-plan']) {
      expect(container.querySelector(`a[href="${route}"]`),route).toBeTruthy();
    }
  });

  it('retains an explicit premium-hero fallback without changing the rest of the homepage', () => {
    const {container} = render(<PremiumHomeExact locale="en" heroVariant="premium"/>);
    expect(container.querySelector('.hex-hero')).toBeTruthy();
    expect(container.querySelector('[data-hero-version]')).toBeNull();
    expect(container.querySelector('button[data-product-id="real-product"]')).toBeNull();
  });

  it('uses the manager’s headline and image when provided', () => {
    render(<OriginalLandingHero locale="fa" values={{'fa.hero.hero':'عنوان تازه', 'image.hero':'/assets/example.webp'}}/>);
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('عنوان تازه');
    expect(document.querySelector('.hero-photo')?.getAttribute('src')).toBe('/assets/example.webp');
    expect(screen.queryByTestId('original-gallery')).toBeNull();
  });

  it('applies the saved homepage text and story image to the main page', () => {
    homepageValues.current = {'fa.hero.hero':'عنوان مدیر', 'fa.premium.bright':'متن مدیر', 'image.story':'/assets/story.webp'};
    const {container} = render(<PremiumHomeExact locale="fa"/>);
    expect(screen.getByRole('heading', {level: 1}).textContent).toBe('عنوان مدیر');
    expect(screen.getByText('متن مدیر')).toBeTruthy();
    expect(container.querySelector('.hex-story img')?.getAttribute('src')).toBe('/assets/story.webp');
  });

  it('uses the historical six local images and does not replace the real trust seal', () => {
    const gallery = readFileSync('app/VisualCollections.tsx','utf8');
    for(const name of ['persepolis','darius','pasargadae','apadana','isfahan','yazd']) {
      expect(gallery).toContain(`["${name}",`);
      expect(existsSync(`public/assets/backdrop/${name}.webp`)).toBe(true);
    }
    expect(readFileSync('src/commerce/EnamadSeal.tsx','utf8')).toContain('trustseal.enamad.ir');
    const css=readFileSync('app/OriginalLandingHero.module.css','utf8');
    expect(css).toContain('@media (max-width: 700px)');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('overflow-x: auto');
  });
});
