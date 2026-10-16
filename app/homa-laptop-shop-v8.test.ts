import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';

const css=readFileSync('app/homa-laptop-shop-v8.css','utf8');
const layout=readFileSync('app/layout.tsx','utf8');
const shop=readFileSync('src/commerce/Storefront.tsx','utf8');
const shell=readFileSync('src/commerce/Shell.tsx','utf8');

describe('HOMA V8 laptop, shop and footer layouts', () => {
  it('loads after the old V7 system and overrides its obsolete oversized card layout', () => {
    expect(layout.indexOf("import './homa-laptop-shop-v8.css';")).toBeGreaterThan(
      layout.indexOf("import './homa-all-pages-v7.css';")
    );
    const stale=readFileSync('app/mobile.css','utf8');
    expect(stale).toContain('minmax(min(100%,470px),1fr)');
    expect(css).toContain('html[data-theme] body .commerce .shop-grid');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr)) !important');
    expect(css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr)) !important');
  });

  it('provides laptop, desktop, tablet and mobile breakpoints', () => {
    for(const size of ['max-width: 1599px','min-width: 1600px','max-width: 1023px',
      'min-width: 1000px','max-width: 1040px','max-width: 767px']){
      expect(css,size).toContain(size);
    }
    expect(css).toContain('discovery-desktop-nav');
    expect(css).toContain('discovery-menu-trigger');
    expect(css).toContain('discovery-header-actions');
    expect(css).toContain('shop-toolbar');
    expect(css).toContain('shop-card');
    expect(css).toContain('hex-products-row');
  });

  it('keeps filtering, cart actions and real catalog data flow intact', () => {
    expect(shop).toContain('catalog?vertical=');
    expect(shop).toContain('setVertical(e.target.value)');
    expect(shop).toContain('AddToCart id={p.id} stock={p.stock}');
    expect(shop).toContain('<Money toman={p.price}/>');
  });

  it('retains essential and legal footer links, with optional extra links', () => {
    expect(shell).toContain('className="commerce-footer commerce-footer-compact"');
    expect(shell).toContain('className="commerce-footer-more"');
    expect(shell).toContain('پیوندهای بیشتر');
    for(const route of ['/shop','/cart','/support','/contact','/legal/terms',
      '/legal/privacy','/income-plan','/club/ranks','/about']){
      expect(shell,route).toContain('href="'+route+'"');
    }
    expect(shell).toContain('<ContactDetails compact hideNav />');
    expect(shell).toContain('<FooterBrandLogo />');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});
