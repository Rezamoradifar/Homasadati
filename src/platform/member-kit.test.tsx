import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import MemberKit from './MemberKit';
import {memberKitCopy} from './member-kit-content';
const state=vi.hoisted(()=>({locale:'fa' as 'fa'|'en'|'ar'}));
vi.mock('../i18n/SiteLocale',()=>({useSiteLocale:()=>({locale:state.locale})}));
afterEach(()=>{cleanup();state.locale='fa';vi.unstubAllGlobals();});
it('copies the selected introduction text without sending it',async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}});
 render(<MemberKit/>);fireEvent.click(screen.getByRole('button',{name:/کپی متن.*معرفی کوتاه/}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('متن کپی شد.'));
 expect(writeText).toHaveBeenCalledWith(memberKitCopy.fa.templates[0].text);
});
it('offers manual copying when clipboard access is refused',async()=>{
 vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});
 render(<MemberKit/>);fireEvent.click(screen.getByRole('button',{name:/کپی متن.*معرفی کوتاه/}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('متن را انتخاب و کپی کنید.'));
 expect(document.querySelector('.member-kit-copy')?.textContent).toBe(memberKitCopy.fa.templates[0].text);
});
it.each(['fa','en','ar'] as const)('keeps downloads accessible in %s',locale=>{
 state.locale=locale;const {container}=render(<MemberKit/>);
 expect(container.querySelector('section')?.getAttribute('dir')).toBe(locale==='en'?'ltr':'rtl');
 expect(container.querySelector('a[href="/member-kit/guide-fa.pdf"]')?.hasAttribute('download')).toBe(true);
 expect(container.querySelector('a[href="/income-plan/presentation"]')?.hasAttribute('download')).toBe(false);
});
it('uses a single main heading on the public page and a section heading in the account',()=>{
 const {rerender}=render(<MemberKit pageHeading/>);
 expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
 rerender(<MemberKit/>);expect(screen.queryByRole('heading',{level:1})).toBeNull();
 expect(screen.getByRole('heading',{level:2,name:memberKitCopy.fa.title})).toBeTruthy();
});
