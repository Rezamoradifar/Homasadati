import {render,screen,within,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {ReferralCard} from "./ReferralCard";
import SevenCards from "../commerce/SevenCards";
import PlanText from "../commerce/PlanText";
const {api,data}=vi.hoisted(()=>({api:vi.fn().mockResolvedValue({}),data:{code:"hn-demo",active:false,requiresPurchase:false,directMembers:0,directBuyers:0,recentMembers:0,latest:[],canChange:false,nextChange:null,placement:{mandatory:true,key:"ordinal",nextDesk:null,slots:[{desk:1,value:1,label:"شاخه ۱ · جایگاه ۴ · چپ",enabled:true,occupied:false},{desk:2,value:2,label:"شاخه ۲ · جایگاه ۷ · راست",enabled:true,occupied:false},{desk:3,value:3,label:"شاخه ۳",enabled:false,occupied:false}]}}}));
vi.mock("./client",async()=>({...await vi.importActual<typeof import("./client")>("./client"),api}));
vi.mock("./Widgets",async()=>({...await vi.importActual<typeof import("./Widgets")>("./Widgets"),useData:()=>({data,loading:false,error:""})}));
afterEach(()=>{cleanup();api.mockClear();});
it("lets Javaneh choose one of its two endpoints with the destination position and leg visible",async()=> {
 render(<ReferralCard refresh={0}/>);
 expect(screen.getByText("منتظر انتخاب محل ورود")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"انتخاب محل ورود نفر بعدی"}));
 expect(document.activeElement).toBe(screen.getByLabelText("محل ورودی بعدی"));
 const select=screen.getByLabelText("محل ورودی بعدی") as HTMLSelectElement;
 expect(Array.from(select.options).map(o=>o.value)).toEqual(["","1","2"]);
 expect(screen.getByRole("option",{name:"شاخه ۲ · جایگاه ۷ · راست"})).toBeTruthy();
 fireEvent.change(select,{target:{value:"2"}});fireEvent.click(screen.getByRole("button",{name:"ثبت محل رفرال بعدی"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("referral/placement","POST",{ordinal:2}));
});
it("shows seven card levels with 1–7 positions, 2–8 branches and 15–105m caps",()=> {
 render(<SevenCards/>);const rows=within(screen.getByRole("table")).getAllByRole("row").slice(1);
 expect(rows).toHaveLength(7);expect(screen.queryByText("آریا")).toBeNull();
 rows.forEach((row,i)=>{const cells=within(row).getAllByRole("cell");expect(cells[3].textContent).toBe((i+1).toLocaleString("fa-IR"));expect(cells[4].textContent).toBe((i+2).toLocaleString("fa-IR"));expect(cells[5].textContent).toBe(((i+1)*15_000_000).toLocaleString("fa-IR"));});
});
it("renders the owner's seven-card text with the open-ended Simurgh range",()=> {
 render(<PlanText/>);expect(screen.getByRole("heading",{name:"طرح هفت کارت باشگاه"})).toBeTruthy();
 expect(screen.queryByRole("heading",{name:"۸. خرید کارت آریا"})).toBeNull();
 expect(screen.getByText("۷۰ میلیون تومان به بالا")).toBeTruthy();expect(screen.getByText("۱۰۵ میلیون تومان")).toBeTruthy();
});
