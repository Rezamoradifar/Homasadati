import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {MemberStartGuide} from "./MemberStartGuide";
import {api} from './client';
vi.mock('./client',async()=>({...await vi.importActual<typeof import('./client')>('./client'),api:vi.fn(async()=>({state:'ready',code:'hn-demo'}))}));
import {buildStartGuide} from "./start-guide-model";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.mocked(api).mockReset().mockResolvedValue({state:"ready",code:"hn-demo"});});
const guide=()=>buildStartGuide({profileComplete:false,bankStatus:null,twoFactor:false,activeDesks:7,permanent:true,companyNeedsPurchase:false,invitationState:"ready",directMembers:0,hasNetworkActivity:false});
it("shows the five real steps and routes each action to its account section",()=>{
 const navigate=vi.fn();render(<MemberStartGuide guide={guide()} code="hn-demo" onNavigate={navigate}/>);
 expect(screen.getAllByRole("listitem")).toHaveLength(5);
 fireEvent.click(screen.getByRole("button",{name:"تکمیل پروفایل"}));expect(navigate).toHaveBeenLastCalledWith("profile");
 fireEvent.click(screen.getByRole("button",{name:"تنظیم محل ورود"}));expect(navigate).toHaveBeenLastCalledWith("network");
 fireEvent.click(screen.getByRole("button",{name:"سابقه و زمان آزادسازی"}));expect(navigate).toHaveBeenLastCalledWith("commissions");
 expect(screen.getByText(/خرید برای فعال‌سازی لازم نیست/)).toBeTruthy();
});
it("copies a same-origin invitation without marking registration complete",async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
 const d=guide();render(<MemberStartGuide guide={d} code="hn-demo" onNavigate={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"کپی لینک دعوت"}));
 await waitFor(()=>expect(writeText).toHaveBeenCalledWith(location.origin+"/register?ref=hn-demo"));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("پس از ثبت‌نام عضو جدید"));
 expect(d.steps.find(s=>s.id==="invite")!.status).toBe("action");
});
it("offers a manual copy field when clipboard access is unavailable",async()=>{
 Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error("denied"))}});
 render(<MemberStartGuide guide={guide()} code="hn-demo" onNavigate={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"کپی لینک دعوت"}));
 await waitFor(()=>expect((screen.getByLabelText("لینک دعوت برای کپی دستی") as HTMLInputElement).value).toContain("/register?ref=hn-demo"));
});

it("refuses a stale ready guide after the next placement was consumed",async()=>{
 vi.mocked(api).mockResolvedValueOnce({state:'placement_required',code:'hn-demo'});const writeText=vi.fn(),navigate=vi.fn();Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
 render(<MemberStartGuide guide={guide()} code="hn-demo" onNavigate={navigate}/>);fireEvent.click(screen.getByRole('button',{name:'کپی لینک دعوت'}));
 await waitFor(()=>expect(navigate).toHaveBeenCalledWith('network'));expect(writeText).not.toHaveBeenCalled();expect(screen.queryByLabelText('لینک دعوت برای کپی دستی')).toBeNull();
});
