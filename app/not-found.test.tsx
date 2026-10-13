import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import NotFound from './not-found';
vi.mock('../src/commerce/Shell',()=>({CommerceShell:({children}:any)=>children}));
const state=vi.hoisted(()=>({locale:'fa' as 'fa'|'en'|'ar'}));
vi.mock('../src/i18n/SiteLocale',()=>({useSiteLocale:()=>({locale:state.locale})}));
afterEach(cleanup);
it.each(['fa','en','ar'] as const)('gives %s visitors clear recovery links',locale=>{
 state.locale=locale;render(<NotFound/>);
 expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
 expect(screen.getAllByRole('link').map(link=>link.getAttribute('href'))).toEqual(['/','/shop','/account?tab=orders']);
});
