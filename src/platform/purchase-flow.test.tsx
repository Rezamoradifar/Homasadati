import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {TicketsPanel} from './SupportPanels';
import {PurchaseActivationReceipt} from './PurchaseActivationReceipt';
vi.mock('./Widgets',async()=>({...await vi.importActual<typeof import('./Widgets')>('./Widgets'),useData:()=>({data:{rows:[],hasMore:false},loading:false,error:'',retry:vi.fn()})}));
afterEach(()=>{cleanup();window.history.replaceState({},'', '/');});
it('opens an order support request with the order field and category already filled',()=>{
 const id='4616b0fc-a31f-4aeb-a0d2-7794285c01dc';window.history.replaceState({},'', '/account?tab=tickets&order='+id);
 render(<TicketsPanel refresh={0} onChange={()=>{}}/>);
 expect((screen.getByLabelText('شناسه سفارش مرتبط') as HTMLInputElement).value).toBe(id);
 expect((screen.getByLabelText('موضوع پشتیبانی') as HTMLSelectElement).value).toBe('order');
});
it('does not inject an invalid order parameter into the support form',()=>{
 window.history.replaceState({},'', '/account?tab=tickets&order=invalid');render(<TicketsPanel refresh={0} onChange={()=>{}}/>);
 expect((screen.getByLabelText('شناسه سفارش مرتبط') as HTMLInputElement).value).toBe('');
});
it('explains existing entitlements and inactive settlement without promising income',()=>{
 render(<PurchaseActivationReceipt receipt={{activePositions:[1,2,3,4,5,6,7],referralCapacity:8,weeklyCapToman:105000000,live:false}}/>);
 expect(screen.getByText('این وضعیت فعلی حساب است؛ جایگاه‌های قبلی و فعال‌سازی مدیر را هم شامل می‌شود.')).toBeTruthy();
 expect(screen.getByText('تسویه باشگاه هنوز فعال نیست.')).toBeTruthy();
 expect(screen.getByText(/سقف پاداش به معنی درآمد قطعی نیست/)).toBeTruthy();
});
