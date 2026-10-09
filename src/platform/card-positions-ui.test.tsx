import {render,screen,cleanup,fireEvent} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {PersonalPositions} from "./NetworkTree";
import {POSITION_PATHS,DIRECT_PATHS} from "./card-position-model";
afterEach(cleanup);
function fixture(desks:number){const build=(desk:number):any=>({desk,path:POSITION_PATHS[desk-1],active:desk<=desks,left:desk<4?build(desk*2):null,right:desk<4?build(desk*2+1):null,leftVolume:30_000_000,rightVolume:20_000_000,savings:{left:10_000_000,right:0}});return{desks,directCapacity:desks+1,tree:build(1),directs:DIRECT_PATHS.map((path,i)=>({ordinal:i+1,path,enabled:i<desks+1,member:i===0?{child_id:"first",name:"عضو اول"}:null}))};}
it.each([1,2,3,4,5,6,7])("shows the fixed 1–2–4 diagram with %s active positions and accessible direct drill-down",desks=>{
 const open=vi.fn();const{container}=render(<PersonalPositions data={fixture(desks)} onOpen={open}/>);
 expect(container.querySelectorAll('.personal-position')).toHaveLength(7);
 expect(container.querySelectorAll('.personal-position.lit')).toHaveLength(desks);
 expect(container.querySelectorAll('.personal-direct.enabled')).toHaveLength(desks+1);
 expect(Array.from(container.querySelectorAll('.personal-direct')).map(n=>n.getAttribute('aria-label')!.match(/[۱-۸]/)![0])).toEqual(['۱','۵','۳','۶','۴','۷','۸','۲']);
 fireEvent.click(screen.getByRole('button',{name:/دایرکت ۱/}));expect(open).toHaveBeenCalledWith('first');
 expect((screen.getByRole('button',{name:/دایرکت ۲/}) as HTMLButtonElement).disabled).toBe(true);
});

it("opens details in one shared inspector without growing the diagram",()=>{const{container}=render(<PersonalPositions data={fixture(3)} onOpen={()=>{}}/>);const diagram=container.querySelector('.position-diagram')!;const before=diagram.textContent;fireEvent.click(screen.getByRole('button',{name:'جایگاه 3 فعال'}));expect(screen.getByRole('button',{name:'جایگاه 3 فعال'}).getAttribute('aria-pressed')).toBe('true');expect(container.querySelectorAll('.position-inspector')).toHaveLength(1);expect(container.querySelector('.position-inspector-title')!.textContent).toContain('جایگاه ۳');expect(diagram.textContent).toBe(before);fireEvent.click(screen.getByRole('button',{name:'جایگاه 7 خاموش'}));expect(container.querySelector('.position-badge')!.textContent).toBe('خاموش');});

it("shows one endpoint under each of positions 4–7 in physical left-to-right order",()=> {
 const data=fixture(1);data.directCapacity=4;
 data.directs=(["LLL","LRL","RLL","RRL"] as const).map((path,i)=>({ordinal:i+1,path,enabled:true,member:i===0?{child_id:"first",name:"عضو اول"}:null}));
 const open=vi.fn(),{container}=render(<PersonalPositions data={data} onOpen={open}/>);
 expect(container.querySelectorAll('.personal-direct')).toHaveLength(4);
 expect(container.querySelectorAll('.personal-direct.enabled')).toHaveLength(4);
 expect(Array.from(container.querySelectorAll('.personal-direct strong')).map(n=>n.textContent)).toEqual(['۴','۵','۶','۷']);
 fireEvent.click(screen.getByRole('button',{name:/رفرال جایگاه ۴/}));expect(open).toHaveBeenCalledWith('first');
 expect(container.querySelectorAll('.personal-position.lit')).toHaveLength(1);
});
it("shows permanent company positions without purchase qualification or a deadline",()=>{
  render(<PersonalPositions data={{...fixture(7),company:{status:"qualified",exempt:true,activeDesks:7,requiredToman:0,remainingDays:0,deadline:null}}} onOpen={()=>{}}/>);
  expect(screen.getByText("جایگاه‌های دائماً فعال")).toBeTruthy();
  expect(screen.getByText("این حساب شرط خرید و مهلت زمانی ندارد.")).toBeTruthy();
  expect(screen.queryByText(/شرط خرید واقعی تکمیل شد|۲۰ میلیون تومان|روز باقی‌مانده/)).toBeNull();
});

it('marks only manager-activated owners and referrals with text as well as green styling',()=>{
 const data:any={...fixture(7),member:{name:'هما نت',referral_code:'hn-test'},managerActivated:true};
 data.directs[0].member.managerActivated=true;
 const {container}=render(<PersonalPositions data={data} onOpen={()=>{}}/>);
 expect(container.querySelector('.personal-positions.manager-activated')).toBeTruthy();
 expect(screen.getByText('فعال‌شده توسط مدیر')).toBeTruthy();
 expect(screen.getByText('مدیر')).toBeTruthy();
 expect(container.querySelectorAll('.personal-direct.manager-activated')).toHaveLength(1);
});
