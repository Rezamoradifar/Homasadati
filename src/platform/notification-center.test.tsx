import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {NotificationCenter} from './NotificationCenter';
const mocks=vi.hoisted(()=>({api:vi.fn(),rows:[{id:'notice-one',title:'وضعیت سفارش تغییر کرد',body:'shipped',created_at:'2026-10-10T12:00:00Z',read_at:null}]}));
vi.mock('./client',async()=>({...await vi.importActual('./client'),api:mocks.api}));
vi.mock('./Widgets',async()=>({...await vi.importActual('./Widgets'),useData:()=>({data:{rows:mocks.rows,hasMore:false},loading:false,error:'',retry:()=>{}})}));
afterEach(()=>{cleanup();mocks.api.mockReset();});
it('shows a readable message card with the correct action and marks only the selected notice',async()=>{
 mocks.api.mockResolvedValue({ok:true});const change=vi.fn();
 render(<NotificationCenter refresh={0} onChange={change}/>);
 expect(screen.getByText('سفارش شما ارسال شد. وضعیت و جزئیات ارسال در بخش سفارش‌ها قابل پیگیری است.')).toBeTruthy();
 expect(screen.getByRole('link',{name:'پیگیری سفارش‌ها'}).getAttribute('href')).toBe('/account?tab=orders');
 fireEvent.click(screen.getByRole('button',{name:'خواندم'}));
 await waitFor(()=>expect(change).toHaveBeenCalledTimes(1));
 expect(mocks.api).toHaveBeenCalledWith('notifications','PATCH',{id:'notice-one'});
});
it('keeps failed read actions visible and never reports success',async()=>{
 mocks.api.mockRejectedValue(new Error('خطای آزمون'));const change=vi.fn();render(<NotificationCenter refresh={0} onChange={change}/>);
 fireEvent.click(screen.getByRole('button',{name:'همه خوانده شدند'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('خطای آزمون'));expect(change).not.toHaveBeenCalled();
});
