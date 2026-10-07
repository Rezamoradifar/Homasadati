import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {ReferralCard} from "./ReferralCard";
const {api,data}=vi.hoisted(()=>({api:vi.fn().mockResolvedValue({}),data:{code:"hn-demo",active:true,requiresPurchase:false,directMembers:0,directBuyers:0,recentMembers:0,latest:[],canChange:false,nextChange:null,placement:{nextDesk:null,slots:[4,5,6,7].map(desk=>({desk,enabled:true,occupied:desk===5}))}}}));
vi.mock("./client",async()=>({...await vi.importActual<typeof import("./client")>("./client"),api}));
vi.mock("./Widgets",async()=>({...await vi.importActual<typeof import("./Widgets")>("./Widgets"),useData:()=>({data,loading:false,error:""})}));
afterEach(()=>{cleanup();api.mockClear();});
it("lets the owner choose a free slot for the next referral and save automatic placement",async()=> {
 render(<ReferralCard refresh={0}/>);
 const select=screen.getByLabelText("محل ورودی بعدی") as HTMLSelectElement;
 expect(select.value).toBe("auto");
 expect(Array.from(select.options).map(o=>o.value)).toEqual(["","auto","4","6","7"]);
 fireEvent.change(select,{target:{value:"7"}});
 fireEvent.click(screen.getByRole("button",{name:"ثبت محل رفرال بعدی"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("referral/placement","POST",{desk:7}));
 await waitFor(()=>expect((screen.getByRole("button",{name:"ثبت محل رفرال بعدی"}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.change(select,{target:{value:"auto"}});fireEvent.click(screen.getByRole("button",{name:"ثبت محل رفرال بعدی"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("referral/placement","POST",{desk:null}));
});
