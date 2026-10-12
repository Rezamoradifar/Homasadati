import {render,screen,within,cleanup,fireEvent} from "@testing-library/react";
import {afterEach,it,expect} from "vitest";
import {ClubAccountCard} from "./ClubAccountCard";
afterEach(cleanup);
it("shows one purchased card and seven separate positions with immediate purchase progress",()=> {
 const {container}=render(<ClubAccountCard status={{desks:1,level:1,cardName:"جوانه",totalPurchase:0,qualifyingPurchaseTotal:10_000_000,paidPurchaseTotal:10_000_000,live:true}}/>);
 const slots=within(screen.getByRole("list",{name:"وضعیت هفت جایگاه"})).getAllByRole("listitem");
 expect(slots).toHaveLength(7);
 expect(screen.getByText("جوانه")).toBeTruthy();
 slots.forEach((slot,i)=> {
   expect(within(slot).getByText("جایگاه "+(i+1).toLocaleString("fa-IR"))).toBeTruthy();
   expect(slot.getAttribute("data-position")).toBe(String(i+1));
 });
 expect(container.querySelectorAll('.club-slots .is-active')).toHaveLength(1);
 expect(container.querySelector('.club-purchase-progress strong')!.textContent).toBe('۱۰۰٬۰۰۰٬۰۰۰ ریال');
});
it("lets the member inspect active and inactive positions without changing account values",()=> {
 render(<ClubAccountCard status={{desks:1,level:1,qualifyingPurchaseTotal:10_000_000,live:true}}/>);
 const first=screen.getByRole("button",{name:"جایگاه ۱ روشن"});
 const second=screen.getByRole("button",{name:"جایگاه ۲ خاموش"});
 fireEvent.click(first);
 expect(first.getAttribute("aria-pressed")).toBe("true");
 expect(screen.getByRole("status").textContent).toContain("این جایگاه فعال است.");
 fireEvent.click(second);
 expect(first.getAttribute("aria-pressed")).toBe("false");
 expect(second.getAttribute("aria-pressed")).toBe("true");
 expect(screen.getByRole("status").textContent).toContain("این جایگاه هنوز فعال نشده است.");
 expect(document.querySelectorAll('.club-slots .is-active')).toHaveLength(1);
});
