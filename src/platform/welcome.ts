import { randomUUID } from "node:crypto";
import { renderEmail, type EmailBrand } from "./email-template";
import { now, one, run } from "./schema";

/** First contact with a new member: an in-app notice and, if they allow
 * email, a welcome email with their referral code and first steps. The email
 * is queued in the outbox with a small JSON body that marks its template. */
const TITLE = "به هما نت خوش آمدید";

export function welcomeMember(userId: string) {
  const u = one("SELECT * FROM p_users WHERE id=?", userId);
  if (!u) return;
  const preferences = JSON.parse(u.preferences);
  if (preferences.inApp)
    run(
      "INSERT INTO p_notifications VALUES(?,?,?,?,NULL,?)",
      randomUUID(),
      userId,
      TITLE,
      `عضویت شما در باشگاه مشتریان هما نت انجام شد. کد معرف شما ${u.referral_code} است؛ از بخش «شبکه و دعوت» می‌توانید لینک دعوت خود را بردارید. برای برداشت از کیف پول، تأیید دومرحله‌ای را از بخش امنیت حساب فعال کنید.`,
      now(),
    );
  if (preferences.email && u.email)
    run(
      "INSERT INTO p_outbox(id,user_id,channel,target,subject,body,created_at) VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      userId,
      "email",
      u.email,
      TITLE,
      JSON.stringify({ template: "welcome", name: u.name, code: u.referral_code }),
      now(),
    );
}

export function isWelcomeJob(body: string) {
  return body.startsWith('{"template":"welcome"');
}

export function welcomeEmail(body: string, brand: EmailBrand) {
  const { name, code } = JSON.parse(body) as { name: string; code: string };
  const origin = brand.origin.replace(/\/$/, "");
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return renderEmail(
    {
      subject: `${first ? first + " عزیز، " : ""}به خانوادهٔ ${brand.name} خوش آمدید`,
      preheader: `عضویت شما انجام شد؛ کد معرف شما ${code} است.`,
      heading: `${first ? first + " عزیز، " : ""}به ${brand.name} خوش آمدید`,
      paragraphs: [
        `عضویت شما در باشگاه مشتریان ${brand.name} با موفقیت انجام شد و حساب کاربری‌تان آماده است.`,
        "کد معرف اختصاصی شما در کادر زیر است. هر کس با این کد یا لینک دعوت شما عضو شود، در شبکهٔ شما قرار می‌گیرد:",
      ],
      code,
      button: { label: "ورود به پنل کاربری", url: origin + "/account" },
      steps: {
        title: "سه گام برای شروع",
        items: [
          "از بخش امنیت حساب، تأیید دومرحله‌ای را فعال کنید؛ برای برداشت از کیف پول لازم است.",
          `در فروشگاه، محصولات صنایع‌دستی، چرم، زیبایی و سفرهای ${brand.name} را ببینید.`,
          "از بخش «شبکه و دعوت» در پنل، لینک دعوت خود را برای دوستانتان بفرستید.",
        ],
      },
      note: "اگر این عضویت را شما انجام نداده‌اید، لطفاً با پشتیبانی هما نت تماس بگیرید.",
    },
    brand,
  );
}
