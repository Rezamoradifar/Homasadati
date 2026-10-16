import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TourismExperienceLanding from "./TourismExperienceLanding";

vi.mock("../src/components/media/ResponsiveImage", () => ({
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() { this.setAttribute("open", ""); },
    },
    close: {
      configurable: true,
      value() { this.removeAttribute("open"); },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
afterAll(() => {
  for (const [name, original] of [
    ["showModal", originalShow],
    ["close", originalClose],
  ] as const) {
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

describe("Iran tourism experience", () => {
  it("renders actual Iranian destinations, travel information and an accessible inquiry search", () => {
    const {container}=render(<TourismExperienceLanding />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ایران، سفری فراتر از همیشه");
    expect(container.querySelector(".tourism-hero-photo img")?.getAttribute("src")).toBe("/assets/heritage/isfahan.webp");
    expect(container.querySelectorAll(".tourism-destination-card")).toHaveLength(5);
    expect(container.querySelectorAll(".tourism-experience-card")).toHaveLength(4);
    expect(screen.getByRole("link",{name:/خدمات منتشرشده/}).getAttribute("href")).toBe("/shop?vertical=tourism");
    expect(container.textContent).toContain("ارسال درخواست، رزرو قطعی نیست");
    expect(screen.getByRole("button",{name:/انتخاب مقصد: اصفهان/})).toBeTruthy();
  });

  it("opens the real travel request form from a destination, uses the secure lead API and shows tracking code", async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({trackingCode:"public-id.example-tracking-key"}),{
      status:201,headers:{"content-type":"application/json"},
    }));
    vi.stubGlobal("fetch",fetcher);
    vi.stubGlobal("crypto",{randomUUID:()=>"a0a0a0a0-0000-4000-8000-111111111111"});
    render(<TourismExperienceLanding />);
    fireEvent.click(screen.getByRole("button",{name:"انتخاب مقصد: اصفهان"}));
    const modal=screen.getByRole("dialog",{name:"درخواست برنامه سفر در ایران"}) as HTMLDialogElement;
    expect(modal.hasAttribute("open")).toBe(true);
    expect(within(modal).getByText("اصفهان")).toBeTruthy();
    fireEvent.change(within(modal).getByRole("textbox",{name:"نام و نام خانوادگی"}),{target:{value:"Tourism Customer"}});
    fireEvent.change(within(modal).getByRole("textbox",{name:"ایمیل برای پیگیری"}),{target:{value:"traveler@example.com"}});
    fireEvent.click(within(modal).getByRole("checkbox",{name:/موافقم اطلاعات/}));
    fireEvent.click(within(modal).getByRole("button",{name:"ثبت درخواست سفر"}));
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0][0]).toBe("/api/requests");
    const init=fetcher.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("a0a0a0a0-0000-4000-8000-111111111111");
    const body=JSON.parse(init.body);
    expect(body).toMatchObject({
      kind:"enquiry",email:"traveler@example.com",name:"Tourism Customer",locale:"fa",currency:"IRR",consent:true,
    });
    expect(body.message).toContain("اصفهان");
    expect(body.message).toContain("مسافران: 2");
    expect(await within(modal).findByText("public-id.example-tracking-key")).toBeTruthy();
    expect(within(modal).getByRole("link",{name:"پیگیری از پشتیبانی"}).getAttribute("href")).toBe("/support");
  });

  it("shows a visible failure instead of claiming a booking when the backend rejects a request", async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:"rate_limited"}),{
      status:429,headers:{"content-type":"application/json"}
    }));
    vi.stubGlobal("fetch",fetcher);
    vi.stubGlobal("crypto",{randomUUID:()=>"b0b0b0b0-0000-4000-8000-111111111111"});
    render(<TourismExperienceLanding />);
    fireEvent.click(screen.getByRole("button",{name:"انتخاب مقصد: شیراز"}));
    const modal=screen.getByRole("dialog",{name:"درخواست برنامه سفر در ایران"});
    fireEvent.change(within(modal).getByRole("textbox",{name:"نام و نام خانوادگی"}),{target:{value:"Example Name"}});
    fireEvent.change(within(modal).getByRole("textbox",{name:"ایمیل برای پیگیری"}),{target:{value:"name@example.com"}});
    fireEvent.click(within(modal).getByRole("checkbox",{name:/موافقم اطلاعات/}));
    fireEvent.click(within(modal).getByRole("button",{name:"ثبت درخواست سفر"}));
    expect(await within(modal).findByRole("alert")).toHaveTextContent("درخواست‌های زیادی ثبت شده است");
    expect(within(modal).queryByText("درخواست شما ثبت شد")).toBeNull();
  });
});
