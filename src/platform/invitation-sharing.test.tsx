import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {ReferralCard} from './ReferralCard';
const {api,data}=vi.hoisted(()=>({api:vi.fn(),data:{state:'ready',code:'hn-old',active:true,directMembers:0,directBuyers:0,recentMembers:0,latest:[],canChange:false,nextChange:null,placement:{mandatory:true,key:'ordinal',nextDesk:1,slots:[{desk:1,value:1,label:'شاخه ۱',parentPosition:4,side:'left',parentActive:true,enabled:true,occupied:false}]}}}));
vi.mock('./client',async()=>({...await vi.importActual<typeof import('./client')>('./client'),api}));
vi.mock('./Widgets',async()=>({...await vi.importActual<typeof import('./Widgets')>('./Widgets'),useData:()=>({data,loading:false,error:''})}));
afterEach(()=>{cleanup();api.mockReset();data.state='ready';data.active=true;vi.restoreAllMocks();});
it('checks a consumed placement before copying and focuses the placement picker',async()=>{
 api.mockResolvedValue({state:'placement_required',code:'hn-old'});const writeText=vi.fn();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 render(<ReferralCard refresh={0}/>);fireEvent.click(screen.getByRole('button',{name:'کپی لینک دعوت'}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('محل ورود نفر بعدی'));
 expect(writeText).not.toHaveBeenCalled();expect(document.activeElement).toBe(screen.getByLabelText('محل ورودی بعدی'));
});
it('copies the freshly renamed code rather than the code in a stale card',async()=>{
 api.mockResolvedValue({state:'ready',code:'hn-current'});const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 render(<ReferralCard refresh={0}/>);fireEvent.click(screen.getByRole('button',{name:'کپی لینک دعوت'}));
 await waitFor(()=>expect(writeText).toHaveBeenCalledWith(location.origin+'/register?ref=hn-current'));
 expect(api).toHaveBeenCalledWith('referral');
});
it('hides shareable QR and external links until a next placement is ready',()=>{
 data.state='placement_required';data.active=false;render(<ReferralCard refresh={0}/>);
 expect(screen.queryByRole('img',{name:'کد QR لینک دعوت'})).toBeNull();
 for(const name of ['واتس‌اپ','تلگرام','پیامک'])expect(screen.getByRole('link',{name}).getAttribute('href')).toBe('#referral-invitation');
});
