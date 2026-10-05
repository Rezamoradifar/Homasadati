import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Registration from "./Registration";
import { api } from "./client";

vi.mock("./client", () => ({ api: vi.fn() }));
vi.mock("./Captcha", () => ({
  useCaptcha: () => ({ ready: true, token: undefined, element: null, reset: vi.fn() }),
}));
vi.mock("./GoogleAccess", () => ({ default: () => null }));
vi.mock("../commerce/ThemeToggle", () => ({ default: () => null }));
vi.mock("./RecoveryCodes", () => ({ RecoveryCodes: () => null }));
vi.mock("./Widgets", () => ({
  Notice: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
}));

const challenge = "00000000-0000-4000-8000-000000000000";
const apiMock = vi.mocked(api);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  apiMock.mockReset();
  apiMock.mockImplementation(async (path) => {
    if (path === "auth/config") return { smsRegistration: true };
    if (path === "auth/otp") return { challenge, retryAfter: 60 };
    if (path === "auth/verify-email" || path === "auth/verify-contact")
      return { verificationToken: "a".repeat(64) };
    throw new Error("Unexpected API call in registration form test");
  });
});
afterEach(cleanup);

async function verifyEmail(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("ایمیل"), "member@example.test");
  await user.click(screen.getByRole("button", { name: "دریافت کد تأیید ایمیل" }));
  await user.type(await screen.findByLabelText("کد تأیید ایمیل"), "123456");
  await user.click(screen.getByRole("button", { name: "تأیید ایمیل و ادامه" }));
}

async function fillRequiredDetails(user: ReturnType<typeof userEvent.setup>, country: string) {
  await user.type(await screen.findByLabelText("نام"), "عضو");
  await user.type(screen.getByLabelText("نام خانوادگی"), "آزمون");
  await user.type(screen.getByLabelText("کد ملی (۱۰ رقم)"), "1234567891");
  await user.type(screen.getByLabelText("شماره موبایل به نام خودتان (مثلاً ۰۹۱۲…)"), "09121234567");
  await user.type(screen.getByLabelText("کشور محل سکونت"), country);
  await user.type(screen.getByLabelText("شهر محل سکونت"), "شیراز");
  await user.click(screen.getByRole("checkbox", { name: /قوانین عضویت و خرید/ }));
  await user.click(screen.getByRole("checkbox", { name: /سیاست حریم خصوصی/ }));
  await user.click(screen.getByRole("checkbox", { name: /حداقل ۱۸ سال/ }));
}

it("sends a canonical SMS target and ASCII OTP when the user enters Persian digits", async () => {
  const user = userEvent.setup();
  render(<Registration onLogin={vi.fn()} onBack={vi.fn()} />);
  const sms = screen.getByRole("button", { name: "پیامک" });
  await waitFor(() => expect((sms as HTMLButtonElement).disabled).toBe(false));
  await user.click(sms);
  await user.type(screen.getByLabelText("شماره موبایل (۰۹… یا +۹۸…)"), "۰۹۱۲۱۲۳۴۵۶۷");
  await user.click(screen.getByRole("button", { name: "دریافت کد پیامک" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("auth/otp", "POST", {
    target: "+989121234567",
    purpose: "register",
    captchaToken: undefined,
  }));
  await user.type(await screen.findByLabelText("کد تأیید پیامک"), "۱۲٣۴۵٦");
  await user.click(screen.getByRole("button", { name: "تأیید موبایل و ادامه" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("auth/verify-contact", "POST", {
    target: "+989121234567",
    challenge,
    code: "123456",
  }));
  expect(await screen.findByRole("heading", { name: "عضویت به انتخاب شما" })).toBeTruthy();
});

it("names and focuses a whitespace-only country without attempting account creation", async () => {
  const user = userEvent.setup();
  render(<Registration onLogin={vi.fn()} onBack={vi.fn()} />);
  await verifyEmail(user);
  await fillRequiredDetails(user, "   ");
  const country = screen.getByLabelText("کشور محل سکونت");
  await user.click(screen.getByRole("button", { name: "ساخت حساب" }));
  expect((await screen.findByRole("alert")).textContent).toContain("کشور محل سکونت");
  expect(country.getAttribute("aria-invalid")).toBe("true");
  await waitFor(() => expect(document.activeElement).toBe(country));
  expect(apiMock.mock.calls.some(([path]) => path === "auth/register")).toBe(false);
});

it("identifies and focuses a malformed invitation before checking it on the server", async () => {
  const user = userEvent.setup();
  render(<Registration onLogin={vi.fn()} onBack={vi.fn()} />);
  await verifyEmail(user);
  await fillRequiredDetails(user, "ایران");
  await user.click(screen.getByRole("radio", { name: /با کد دعوت/ }));
  const referral = screen.getByRole("textbox", { name: /^کد دعوت/ });
  await user.type(referral, "abc");
  await user.click(screen.getByRole("button", { name: "ساخت حساب" }));
  expect((await screen.findByRole("alert")).textContent).toContain("کد دعوت");
  expect(referral.getAttribute("aria-invalid")).toBe("true");
  await waitFor(() => expect(document.activeElement).toBe(referral));
  expect(apiMock.mock.calls.some(([path]) => path === "referrals/check" || path === "auth/register"))
    .toBe(false);
});
