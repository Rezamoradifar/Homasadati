import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import ResponsiveImage from './ResponsiveImage';
afterEach(cleanup);
it('offers uploaded product image variants with the actual card size and lazy decoding',()=>{
 const src='/api/platform/media/00000000-0000-4000-8000-000000000001.webp';
 render(<ResponsiveImage src={src} alt="Product fixture" sizes="96px" loading="lazy"/>);
 const image=screen.getByRole('img');
 expect(image.getAttribute('srcset')).toContain(src+'?w=320 320w');
 expect(image.getAttribute('srcset')).toContain(src+'?w=1440 1440w');
 expect(image.getAttribute('sizes')).toBe('96px');
 expect(image.getAttribute('loading')).toBe('lazy');
 expect(image.getAttribute('decoding')).toBe('async');
});
it('preserves external product image delivery without inventing variant URLs',()=>{
 render(<ResponsiveImage src="https://catalog.example/photo.jpg" alt="External fixture" sizes="96px"/>);
 const image=screen.getByRole('img');
 expect(image.getAttribute('src')).toBe('https://catalog.example/photo.jpg');
 expect(image.hasAttribute('srcset')).toBe(false);
});
