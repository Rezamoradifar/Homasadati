import React from "react";
import {
  beforeAll,
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
import { handle } from "./api";
import { platformDb, run, one, now } from "./schema";
import { passwordHash, session, SESSION_COOKIE } from "./security";
import { saveSetting } from "./providers";
let authCookie = "",
  member: string,
  admin: string;
const dir = mkdtempSync(join(tmpdir(), "homay-ui-"));
const password = "test-password-for-ui-only";
let forceOffline = false;
beforeAll(() => {
  process.env.DATABASE_PATH = join(dir, "ui.sqlite");
  process.env.PLATFORM_MASTER_KEY = "b".repeat(64);
  process.env.APP_ORIGIN = "http://localhost";
  for (const role of ["user", "superadmin"]) {
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
    } else admin = cookie;
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      if (forceOffline) throw new TypeError("offline");
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
