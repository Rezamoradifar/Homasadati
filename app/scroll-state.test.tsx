import {render,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import ScrollState from './ScrollState';
afterEach(()=>{cleanup();vi.unstubAllGlobals();document.body.innerHTML='';});
it('reveals a tall section as soon as it intersects and restores hidden content on cleanup',()=>{
 document.body.innerHTML='<main><section id="tall"><a href="/shop">Shop</a></section><section id="later">Later</section></main>';
 const tall=document.getElementById('tall')!,later=document.getElementById('later')!;
 for(const el of [tall,later])vi.spyOn(el,'getBoundingClientRect').mockReturnValue({top:10000,height:20000} as DOMRect);
 let callback:IntersectionObserverCallback=()=>{};const unobserve=vi.fn();
 class Observer {constructor(cb:IntersectionObserverCallback,options:IntersectionObserverInit){callback=cb;expect(options.threshold).toBe(0);expect(options.rootMargin).toBe('0px');}observe=vi.fn();unobserve=unobserve;disconnect=vi.fn();}
 vi.stubGlobal('IntersectionObserver',Observer);vi.stubGlobal('matchMedia',()=>({matches:false}));
 const {unmount}=render(<ScrollState/>);
 expect(tall.dataset.reveal).toBe('');
 callback([{target:tall,isIntersecting:true,intersectionRatio:0.01}] as IntersectionObserverEntry[],{} as IntersectionObserver);
 expect(tall.dataset.reveal).toBe('in');expect(unobserve).toHaveBeenCalledWith(tall);
 unmount();expect(later.hasAttribute('data-reveal')).toBe(false);
});
