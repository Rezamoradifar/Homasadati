import React from "react";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Portal from "./Portal";
import Storefront from "../commerce/Storefront";
import Cart from "../commerce/Cart";
import Registration from "./Registration";
import { handle } from "./api";
import { platformDb, run, one, now } from "./schema";
import { passwordHash, session, SESSION_COOKIE, totp } from "./security";
import { saveSetting } from "./providers";
let authCookie = "",
  member: string,
  admin: string,
  contentAdmin: string;
const dir = mkdtempSync(join(tmpdir(), "homay-ui-"));
const password = "test-password-for-ui-only";
let forceOffline = false;
let registrationOtp = "";
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "ui.sqlite");
  process.env.PLATFORM_MASTER_KEY = "b".repeat(64);
  process.env.APP_ORIGIN = "http://localhost";
  for (const role of ["user", "superadmin", "content"]) {
    const id = randomUUID();
    run(
      "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?)",
      id,
      role + "@test.example",
      role === "user" ? "کاربر آزمون" : "مدیر آزمون",
      passwordHash(password),
      role,
      role + "-code",
      now(),
      now(),
      "test",
    );
    run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
    const cookie = SESSION_COOKIE + "=" + session(id, "UI test");
    if (role === "user") {
      member = cookie;
    } else if (role === "superadmin") admin = cookie;
    else contentAdmin = cookie;
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      if (forceOffline) throw new TypeError("offline");
      if (String(input).includes("api.resend.com")) {
        registrationOtp = JSON.parse(String(init.body)).text.match(/\d{6}/)[0];
        return Response.json({ id: randomUUID() });
      }
      const url = new URL(input, "http://localhost");
      const method = init.method || "GET";
      const response = await handle(
        new Request(url, {
          method,
          headers: {
            origin: "http://localhost",
            host: "localhost",
            "Content-Type": "application/json",
            cookie: authCookie,
          },
          ...(method !== "GET" ? { body: init.body } : {}),
        }),
        url.pathname.replace("/api/platform/", "").split("/"),
      );
      const set = response.headers.get("set-cookie");
      if (set) authCookie = set.split(";")[0];
      return response;
    }),
  );
  // Native modal methods are not implemented by jsdom; dialog semantics still render.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  forceOffline = false;
});
afterAll(() => {
  vi.unstubAllGlobals();
  platformDb().close();
  rmSync(dir, { recursive: true, force: true });
});
describe("Panels use actual APIs and SQLite", () => {
  it("retries an unavailable account connection without presenting a false signed-out state", async () => {
    authCookie = member;
    forceOffline = true;
    const user = userEvent.setup();
    render(<Portal />);
    await screen.findByRole("heading", { name: "اتصال به حساب برقرار نشد" });
    expect(screen.queryByRole("button", { name: "ورود به حساب" })).toBeNull();
    forceOffline = false;
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText("موجودی قابل برداشت");
    expect(
      screen.queryByRole("heading", { name: "اتصال به حساب برقرار نشد" }),
    ).toBeNull();
  });

  it("opens personal notifications from live activity counts and updates the count after reading", async () => {
    authCookie = member;
    const owner = one("SELECT id FROM p_users WHERE role='user'")!.id;
    const other = one("SELECT id FROM p_users WHERE role='content'")!.id;
    const ownId = randomUUID(),
      otherId = randomUUID();
    run(
      "INSERT INTO p_notifications VALUES(?,?,?,?,NULL,?)",
      ownId,
      owner,
      "پیام حساب من",
      "جزئیات پیام من",
      now(),
    );
    run(
      "INSERT INTO p_notifications VALUES(?,?,?,?,NULL,?)",
      otherId,
      other,
      "پیام خصوصی عضو دیگر",
      "نباید نمایش یابد",
      now(),
    );
    const user = userEvent.setup();
    render(<Portal />);
    const counter = await screen.findByRole("link", {
      name: "۱ اعلان خوانده‌نشده",
    });
    expect(screen.queryByRole("link", { name: "مدیریت" })).toBeNull();
    await user.click(counter);
    await screen.findByText("پیام حساب من");
    expect(window.location.search).toBe("?tab=notifications");
    expect(screen.queryByText("پیام خصوصی عضو دیگر")).toBeNull();
    await user.click(screen.getByRole("button", { name: "همه خوانده شدند" }));
    await waitFor(() =>
      expect(
        one("SELECT read_at FROM p_notifications WHERE id=?", ownId)!.read_at,
      ).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: "نمای کلی" }));
    await screen.findByRole("link", { name: "۰ اعلان خوانده‌نشده" });
    expect(
      one("SELECT read_at FROM p_notifications WHERE id=?", otherId)!.read_at,
    ).toBeNull();
    run("DELETE FROM p_notifications WHERE id IN (?,?)", ownId, otherId);
  });

  it.each(["سفارش‌ها", "تازه‌سازی"])(
    "removes private data when %s encounters an expired session",
    async (action) => {
      authCookie = member;
      const user = userEvent.setup();
      render(<Portal />);
      await screen.findByText("موجودی قابل برداشت");
      authCookie = "";
      await user.click(screen.getByRole("button", { name: action }));
      await screen.findByText(
        "نشست شما پایان یافته است؛ دوباره وارد حساب شوید.",
      );
      await screen.findByRole("button", { name: "ورود به حساب" });
      expect(
        screen.queryByRole("navigation", { name: "بخش‌های حساب" }),
      ).toBeNull();
      expect(screen.queryByText("موجودی قابل برداشت")).toBeNull();
    },
  );

  it("creates a private support thread, replies as staff and hides internal notes from its owner", async () => {
    authCookie = member;
    window.history.replaceState(null, "", "/account?tab=tickets");
    const user = userEvent.setup();
    render(<Portal />);
    await user.type(
      await screen.findByLabelText("موضوع درخواست"),
      "پیگیری خرید آزمایشی",
    );
    await user.type(
      screen.getByLabelText("شرح درخواست"),
      "لطفاً وضعیت سفارش را بررسی کنید.",
    );
    await user.click(screen.getByRole("button", { name: "ثبت درخواست" }));
    await screen.findByRole("heading", { name: "پیگیری خرید آزمایشی" });
    const ticket = one(
      "SELECT id FROM p_tickets WHERE subject=?",
      "پیگیری خرید آزمایشی",
    )!;
    cleanup();
    authCookie = admin;
    window.history.replaceState(null, "", "/admin?tab=tickets");
    render(<Portal admin />);
    await user.click(
      await screen.findByRole("button", { name: "مشاهده گفت‌وگو" }),
    );
    await user.type(
      await screen.findByLabelText("متن پاسخ"),
      "یادداشت محرمانه همکاران",
    );
    await user.click(screen.getByLabelText("یادداشت داخلی؛ فقط برای پشتیبانی"));
    await user.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await screen.findByText("یادداشت محرمانه همکاران");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("متن پاسخ") as HTMLTextAreaElement).value,
      ).toBe(""),
    );
    await user.type(screen.getByLabelText("متن پاسخ"), "سفارش شما بررسی شد.");
    await user.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await screen.findByText("سفارش شما بررسی شد.");
    cleanup();
    authCookie = member;
    window.history.replaceState(null, "", "/account?tab=tickets");
    render(<Portal />);
    await user.click(
      await screen.findByRole("button", { name: "مشاهده گفت‌وگو" }),
    );
    await screen.findByText("سفارش شما بررسی شد.");
    expect(screen.queryByText("یادداشت محرمانه همکاران")).toBeNull();
    expect(
      one("SELECT status FROM p_tickets WHERE id=?", ticket.id)!.status,
    ).toBe("waiting_user");
  });
  it("saves binary rules and calculates a scenario through the management form", async () => {
    authCookie = admin;
    window.history.replaceState(null, "", "/admin?tab=binary-rules");
    const user = userEvent.setup();
    render(<Portal admin />);
    const ratio = await screen.findByLabelText("ضریب شاخه چپ");
    await user.clear(ratio);
    await user.type(ratio, "2");
    await user.type(screen.getByLabelText("دلیل تغییر"), "تأیید قواعد آزمایشی");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() =>
      expect(
        JSON.parse(
          one("SELECT value FROM p_settings WHERE key='binary_rules'")!.value,
        ).leftRatio,
      ).toBe(2),
    );
    await user.type(await screen.findByLabelText("حجم چپ"), "2000");
    await user.type(screen.getByLabelText("حجم راست"), "1000");
    await user.type(
      screen.getByLabelText("بودجه باقی‌مانده سفارش پس از سایر پورسانت‌ها"),
      "500",
    );
    await user.type(screen.getByLabelText("نرخ باینری (%)"), "10");
    await user.click(screen.getByRole("button", { name: "محاسبه سناریو" }));
    await screen.findByText("پورسانت محاسبه‌شده");
    expect(one("SELECT COUNT(*) n FROM p_binary_matches")!.n).toBe(0);
  });
  it("opens assigned management tools for a member without changing their base role", async () => {
    const userId = one("SELECT id FROM p_users WHERE role='user'")!.id,
      roleId = randomUUID();
    run(
      "INSERT INTO p_access_roles VALUES(?,?,'[\"binary:read\"]',1,?)",
      roleId,
      "نقش گزارش",
      now(),
    );
    run(
      "INSERT INTO p_access_assignments VALUES(?,?,?)",
      userId,
      roleId,
      now(),
    );
    authCookie = member;
    window.history.replaceState(null, "", "/admin?tab=binary");
    render(<Portal admin />);
    await screen.findByRole("heading", { name: "درخت جایگاه باینری" });
    expect(
      screen.queryByRole("button", { name: "نقش‌ها و مجوزها" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "تسویه پذیرندگان" }),
    ).toBeNull();
    run(
      "DELETE FROM p_access_assignments WHERE user_id=? AND role_id=?",
      userId,
      roleId,
    );
  });

  it("grants club points and redeems an approved benefit through the actual UI", async () => {
    authCookie = admin;
    window.history.replaceState(null, "", "/admin?tab=rewards");
    const user = userEvent.setup();
    let view = render(<Portal admin />);
    await user.click(
      await screen.findByRole("button", { name: "افزودن مزیت باشگاه" }),
    );
    const modal = screen.getByRole("dialog");
    await user.type(within(modal).getByLabelText("عنوان"), "مزیت آزمون");
    await user.type(within(modal).getByLabelText("امتیاز لازم"), "25");
    await user.type(within(modal).getByLabelText("ظرفیت باقی‌مانده"), "2");
    await user.type(
      within(modal).getByLabelText("دلیل تغییر"),
      "تأیید برای آزمون",
    );
    await user.click(within(modal).getByLabelText("فعال"));
    await user.click(within(modal).getByRole("button", { name: "ذخیره" }));
    await screen.findByRole("cell", { name: "مزیت آزمون" });
    await user.click(screen.getByRole("button", { name: "مدیریت امتیازات" }));
    await user.type(
      await screen.findByLabelText("شناسهٔ کاربر"),
      one("SELECT id FROM p_users WHERE role='user'")!.id,
    );
    await user.type(screen.getByLabelText("تغییر امتیاز؛ مثبت یا منفی"), "40");
    await user.type(screen.getByLabelText("دلیل تغییر"), "سند امتیاز آزمون");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await screen.findByRole("cell", { name: "سند امتیاز آزمون" });
    view.unmount();
    authCookie = member;
    window.history.replaceState(null, "", "/account?tab=loyalty");
    view = render(<Portal />);
    await user.click(
      await screen.findByRole("button", { name: "درخواست مزیت" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "تأیید و کسر امتیاز",
      }),
    );
    await screen.findByRole("cell", { name: "در انتظار بررسی" });
    expect(
      one(
        "SELECT SUM(delta) n FROM p_points_ledger WHERE user_id=(SELECT id FROM p_users WHERE role='user')",
      )!.n,
    ).toBe(15);
  });

  it("opens the manager workspace and keeps section navigation in the URL", async () => {
    authCookie = admin;
    const user = userEvent.setup();
    render(<Portal admin />);
    await screen.findByRole("heading", { name: "کارهای امروز، در یک نگاه" });
    await user.click(
      screen.getByRole("link", { name: /محصولات و تورها ثبت و ویرایش/ }),
    );
    await screen.findByRole("button", { name: "افزودن محصول / تور / پلن" });
    expect(new URLSearchParams(location.search).get("tab")).toBe("products");
    window.history.replaceState(null, "", "/admin?tab=home");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await screen.findByRole("heading", { name: "کارهای امروز، در یک نگاه" });
  });
  it("filters management navigation and recovers from an empty search", async () => {
    authCookie = admin;
    const user = userEvent.setup();
    render(<Portal admin />);
    const search = await screen.findByRole("searchbox", {
      name: "جست‌وجوی بخش‌ها",
    });
    await user.type(search, "برداشت");
    const nav = screen.getByRole("navigation", { name: "بخش‌های مدیریت" });
    expect(
      within(nav).getByRole("button", { name: "درخواست‌های برداشت" }),
    ).toBeTruthy();
    expect(
      within(nav).queryByRole("button", { name: "اعضای مجموعه" }),
    ).toBeNull();
    await user.clear(search);
    await user.type(search, "zzzzzz");
    expect(within(nav).getByRole("status").textContent).toContain(
      "بخشی با این نام پیدا نشد.",
    );
    await user.clear(search);
    expect(
      within(nav).getByRole("button", { name: "اعضای مجموعه" }),
    ).toBeTruthy();
  });
  it("limits content managers to their permitted tools, including direct links", async () => {
    authCookie = contentAdmin;
    const view = render(<Portal admin />);
    await screen.findByRole("heading", { name: "کارهای امروز، در یک نگاه" });
    expect(screen.getByRole("button", { name: "مدیریت محتوا" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "درخواست‌های برداشت" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /درخواست‌های برداشت/ }),
    ).toBeNull();
    expect(screen.queryByText("فروش خالص سفارش‌های بازه")).toBeNull();
    view.unmount();
    window.history.replaceState(null, "", "/admin?tab=withdrawals");
    render(<Portal admin />);
    await screen.findByText("بخش انتخاب‌شده در دسترس نیست.");
  });

  it("shows real empty dashboard and persists profile preferences through the API", async () => {
    authCookie = member;
    const user = userEvent.setup();
    render(<Portal />);
    await screen.findByText("موجودی قابل برداشت");
    expect(screen.getAllByText("هنوز موردی ثبت نشده است.")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "پروفایل" }));
    await user.clear(screen.getByLabelText("نام و نام خانوادگی"));
    await user.type(
      screen.getByLabelText("نام و نام خانوادگی"),
      "نام ویرایش‌شده",
    );
    await user.click(screen.getByLabelText("اعلان پیامکی"));
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await screen.findByText("تنظیمات ذخیره شد.");
    expect(
      one("SELECT name,preferences FROM p_users WHERE role='user'")!.name,
    ).toBe("نام ویرایش‌شده");
    expect(
      JSON.parse(
        one("SELECT preferences FROM p_users WHERE role='user'")!.preferences,
      ).sms,
    ).toBe(true);
  });
  it("creates and edits a product in the admin UI with persisted inventory", async () => {
    authCookie = admin;
    const user = userEvent.setup();
    render(<Portal admin />);
    await screen.findByRole("button", { name: "محصولات و تورها" });
    await user.click(screen.getByRole("button", { name: "محصولات و تورها" }));
    await user.click(
      await screen.findByRole("button", { name: "افزودن محصول / تور / پلن" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("عنوان"), "سفال آزمون");
    await user.selectOptions(within(dialog).getByLabelText("حوزه"), "craft");
    await user.type(within(dialog).getByLabelText(/نوع/), "product");
    await user.type(within(dialog).getByLabelText("قیمت (تومان)"), "250000");
    await user.type(
      within(dialog).getByLabelText("موجودی / ظرفیت قابل فروش"),
      "3",
    );
    await user.type(within(dialog).getByLabelText("مدت اشتراک AI (روز)"), "30");
    await user.type(
      within(dialog).getByLabelText("مهلت لغو پس از پرداخت (ساعت)"),
      "24",
    );
    await user.type(
      within(dialog).getByLabelText("توضیحات"),
      "شرح محصول در دیتابیس موقت آزمون",
    );
    await user.type(
      within(dialog).getByLabelText("کد انبار SKU"),
      "CRAFT-TEST",
    );
    await user.type(
      within(dialog).getByLabelText("نام هنرمند / کارگاه"),
      "کارگاه آزمون",
    );
    expect(within(dialog).queryByLabelText("ترکیبات")).toBeNull();
    await user.click(within(dialog).getByLabelText("منتشر شود"));
    await user.click(within(dialog).getByRole("button", { name: "ذخیره" }));
    await screen.findByRole("cell", { name: "سفال آزمون" });
    expect(
      one(
        "SELECT price,stock,published FROM p_products WHERE title='سفال آزمون'",
      ),
    ).toEqual({ price: 250000, stock: 3, published: 1 });
    expect(
      JSON.parse(
        one("SELECT details FROM p_product_details WHERE sku='CRAFT-TEST'")!
          .details,
      ).artisan,
    ).toBe("کارگاه آزمون");
    await user.click(screen.getByRole("button", { name: "ویرایش" }));
    const editorDialog = screen.getByRole("dialog");
    const sku = await within(editorDialog).findByLabelText("کد انبار SKU");
    expect((sku as HTMLInputElement).value).toBe("CRAFT-TEST");
    const stock = within(editorDialog).getByLabelText(
      "موجودی / ظرفیت قابل فروش",
    );
    await user.clear(stock);
    await user.type(stock, "8");
    await user.click(
      within(editorDialog).getByRole("button", { name: "ذخیره" }),
    );
    await screen.findByRole("cell", { name: "۸" });
    expect(
      one("SELECT stock FROM p_products WHERE title='سفال آزمون'")!.stock,
    ).toBe(8);
  });
  it("denies user access to admin and shows network errors instead of an empty table", async () => {
    authCookie = member;
    const user = userEvent.setup();
    const view = render(<Portal admin />);
    await screen.findByText("این حساب دسترسی مدیریتی ندارد.");
    view.unmount();
    render(<Portal />);
    await screen.findByText("موجودی قابل برداشت");
    forceOffline = true;
    await user.click(screen.getByRole("button", { name: "سفارش‌ها" }));
    await screen.findByText(
      "ارتباط شبکه قطع است. اتصال اینترنت را بررسی کنید.",
    );
    expect(screen.queryByText("هنوز موردی ثبت نشده است.")).toBeNull();
  });
  it("adds a real catalog item to the basket and completes wallet checkout through the UI", async () => {
    authCookie = member;
    localStorage.clear();
    sessionStorage.clear();
    const buyer = one("SELECT id FROM p_users WHERE role='user'")!.id;
    run("UPDATE p_wallets SET available=1000000 WHERE user_id=?", buyer);
    run(
      "INSERT INTO p_addresses VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      buyer,
      "خانه",
      "ایران",
      "تهران",
      "1234567890",
      "آدرس آزمون خرید",
    );
    saveSetting(
      "commission_policy",
      JSON.stringify({
        directBps: 0,
        levels: [],
        binaryBps: 0,
        maxPayoutBps: 0,
        warningBps: 5000,
        criticalBps: 8000,
        withdrawMin: 1,
        withdrawMax: 1000000,
        paused: false,
      }),
    );
    const user = userEvent.setup(),
      view = render(<Storefront />);
    await user.click(
      await screen.findByRole("button", { name: "افزودن به سبد خرید" }),
    );
    await screen.findByText("به سبد خرید اضافه شد.");
    view.unmount();
    render(<Cart />);
    await screen.findByRole("option", { name: /خانه — تهران/ });
    await user.selectOptions(screen.getByLabelText("روش پرداخت"), "wallet");
    const addressSelect = screen.getByRole("combobox", { name: /آدرس ارسال/ });
    await user.selectOptions(
      addressSelect,
      one("SELECT id FROM p_addresses WHERE user_id=?", buyer)!.id,
    );
    await user.click(
      screen.getByRole("button", { name: "ثبت سفارش و پرداخت" }),
    );
    await screen.findByText(/پرداخت ثبت شد/);
    expect(
      one("SELECT available FROM p_wallets WHERE user_id=?", buyer)!.available,
    ).toBe(750000);
    expect(
      one("SELECT status FROM p_checkouts WHERE user_id=?", buyer)!.status,
    ).toBe("paid");
    expect(JSON.parse(localStorage.getItem("homa-basket-v1")!)).toEqual([]);
  });
});

it("completes email, invitation, profile and authenticator steps before showing one-time recovery codes", async () => {
  authCookie = "";
  saveSetting("resend_key", "test-provider", true);
  saveSetting("email_from", "test@homay.test");
  const done = vi.fn(),
    user = userEvent.setup();
  render(<Registration onLogin={done} onBack={() => {}} />);
  await user.type(
    screen.getByLabelText("ایمیل", { exact: true }),
    "registration-ui@example.test",
  );
  const send = screen.getByRole("button", { name: "دریافت کد تأیید ایمیل" });
  await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
  await user.click(send);
  await screen.findByText(/کد شش‌رقمی به ایمیل شما ارسال شد/);
  await user.type(screen.getByLabelText("کد تأیید ایمیل"), registrationOtp);
  await user.click(screen.getByRole("button", { name: "تأیید ایمیل و ادامه" }));
  await screen.findByRole("heading", { name: "عضویت به انتخاب شما" });
  await user.click(screen.getByRole("radio", { name: /با کد دعوت/ }));
  await user.type(
    screen.getByRole("textbox", { name: /^کد دعوت/ }),
    "user-code",
  );
  for (const [label, value] of [
    ["نام", "لیلا"],
    ["نام خانوادگی", "آزمون"],
    ["کشور محل سکونت", "ایران"],
    ["شهر محل سکونت", "تهران"],
    ["رمز عبور؛ حداقل ۱۲ نویسه", "ui-registration-pass"],
    ["تکرار رمز عبور", "ui-registration-pass"],
  ])
    await user.type(screen.getByLabelText(label, { exact: true }), value);
  await user.click(screen.getByLabelText(/قوانین عضویت و خرید/));
  await user.click(screen.getByLabelText(/سیاست حریم خصوصی/));
  await user.click(screen.getByLabelText(/حداقل ۱۸ سال دارم/));
  await user.click(
    screen.getByRole("button", { name: "ادامه و فعال‌سازی دومرحله‌ای" }),
  );
  await screen.findByRole("heading", { name: "اتصال برنامه رمزساز" });
  const secret = document.querySelector(".auth-secret")!.textContent!;
  await user.type(screen.getByLabelText("کد شش‌رقمی رمزساز"), totp(secret));
  await user.click(
    screen.getByRole("button", { name: "تأیید و ساخت حساب امن" }),
  );
  await screen.findByRole("heading", { name: "کدهای بازیابی را نگه دارید" });
  expect(done).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".recovery-grid code")).toHaveLength(10);
  await user.click(screen.getByLabelText(/کدها را در محل امنی/));
  await user.click(screen.getByRole("button", { name: "ادامه" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  const u = one(
    "SELECT id,sponsor_id FROM p_users WHERE email='registration-ui@example.test'",
  )!;
  expect(u.sponsor_id).toBeTruthy();
  expect(
    JSON.parse(
      one("SELECT details FROM p_member_details WHERE user_id=?", u.id)!
        .details,
    ).city,
  ).toBe("تهران");
  expect(
    one("SELECT marketing FROM p_consents WHERE user_id=?", u.id)!.marketing,
  ).toBe(0);
});
