import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {PlacementPicker} from "./PlacementPicker";
import {AccountAlerts} from "./AccountAlerts";
afterEach(cleanup);
const placement={mandatory:true,nextDesk:null,slots:[{desk:1,value:1,parentPosition:4,parentActive:false,side:'left',enabled:true,occupied:false},{desk:2,value:2,parentPosition:7,parentActive:true,side:'right',enabled:true,occupied:false},{desk:3,enabled:true,occupied:true}]};
it('previews the exact position and side without saving before confirmation',async()=>{
 const save=vi.fn().mockResolvedValue({});render(<PlacementPicker placement={placement} onSave={save}/>);
 fireEvent.change(screen.getByLabelText('محل ورودی بعدی'),{target:{value:'1'}});expect(screen.getByText('جایگاه ۴ · چپ')).toBeTruthy();expect(screen.getByText(/جایگاه مقصد خاموش/)).toBeTruthy();expect(save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('محل ورودی بعدی'),{target:{value:'2'}});expect(screen.getByText('جایگاه ۷ · راست')).toBeTruthy();expect(screen.getByText(/جایگاه مقصد فعال/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'ثبت محل رفرال بعدی'}));await waitFor(()=>expect(save).toHaveBeenCalledWith(2));
});
it('reports a stale slot rejected by the server without claiming success',async()=>{
 render(<PlacementPicker placement={placement} onSave={async()=>{throw Error('Slot occupied');}}/>);fireEvent.change(screen.getByLabelText('محل ورودی بعدی'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button'));expect((await screen.findByRole('alert')).textContent).toBe('Slot occupied');
});
it('excludes permanent grants from deadline alerts and uses real action labels',()=>{
 const navigate=vi.fn();render(<AccountAlerts guide={{steps:[{id:'placement',status:'action',description:'Choose a slot',label:'تنظیم محل ورود',tab:'network'}]}} company={{exempt:true,status:'grace',remainingDays:1}} onNavigate={navigate}/>);expect(screen.queryByText(/مهلت فعال‌سازی/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'تنظیم محل ورود'}));expect(navigate).toHaveBeenCalledWith('network');
});
