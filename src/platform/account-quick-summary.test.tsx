import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {it,expect,vi,afterEach} from "vitest";
import {AccountQuickSummary} from "./AccountQuickSummary";
afterEach(cleanup);
it("shows the real cap, carry balances and directs the member to required placement",()=>{
  const navigate=vi.fn();render(<AccountQuickSummary club={{desks:7,weeklyCapToman:105000000,leftVolume:30000000,rightVolume:20000000}} invitation={{state:"placement_required"}} wallet={{available:4900000}} onNavigate={navigate}/>);
  expect(screen.getByText("منتظر انتخاب محل ورود")).toBeTruthy();
  expect(screen.getByText("۱۰۵٬۰۰۰٬۰۰۰ تومان")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"انتخاب محل ورود"}));expect(navigate).toHaveBeenCalledWith("network");
});
it.each([["purchase_required","خرید و فعال‌سازی","catalog"],["blocked","تماس با پشتیبانی","tickets"]])("routes %s to the relevant action",(state,label,tab)=>{
  const navigate=vi.fn();render(<AccountQuickSummary club={{desks:0}} invitation={{state}} wallet={{available:0}} onNavigate={navigate}/>);
  fireEvent.click(screen.getByRole("button",{name:label}));expect(navigate).toHaveBeenCalledWith(tab);
});
