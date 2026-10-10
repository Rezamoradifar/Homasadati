import {render,screen,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {OrderTracking} from "./OrderTracking";
const {current}=vi.hoisted(()=>({current:{id:'order',status:'pending',created_at:'2026-10-10T10:00:00Z',paid_at:null as string|null,refunded_at:null as string|null,payment_ref:null as string|null}}));
vi.mock('./Widgets',async()=>({...await vi.importActual<typeof import('./Widgets')>('./Widgets'),useData:()=>({data:current,loading:false,error:''})}));
afterEach(cleanup);
it('uses freshly loaded order data without showing a successful payment for an unpaid order',()=>{
 render(<OrderTracking order={{id:'order',status:'processing'}}/>);expect(screen.getByText('پرداخت این سفارش هنوز تأیید نشده است.')).toBeTruthy();expect(screen.queryByText('پرداخت تأیید شد')).toBeNull();
});
it('shows actual payment and refund facts with a support path instead of inventing a cancellation reason',()=>{
 current.status='refunded';current.paid_at='2026-10-10T10:01:00Z';current.refunded_at='2026-10-10T10:03:00Z';current.payment_ref='reference';
 render(<OrderTracking order={{id:'order'}}/>);expect(screen.getByText('پرداخت تأیید شد')).toBeTruthy();expect(screen.getByText('برگشت وجه ثبت شد')).toBeTruthy();expect(screen.getByText('reference')).toBeTruthy();expect(screen.getByRole('link',{name:'پیگیری از پشتیبانی'}).getAttribute('href')).toBe('/account?tab=tickets');
});
