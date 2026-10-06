import { translatedMetadata } from "../../src/i18n/server";

import Localized from "../../src/i18n/Localized";
import ImageBrandMark from "../../src/components/media/ImageBrandMark";
import ResponsiveImage from "../../src/components/media/ResponsiveImage";
import { CommerceShell } from "../../src/commerce/Shell";
export async function generateMetadata() {
  return translatedMetadata({
    title: "روایت ایران؛ کوروش، شیردال و سیمرغ | هما نت",
  });
}
const chapters = [
  {
    id: "persepolis",
    title: "تخت‌جمشید",
    body: "تخت‌جمشید از روزگار داریوش اول شکل گرفت. ستون‌ها و نقش‌برجسته‌های آن، بخشی از میراث معماری هخامنشی را نشان می‌دهند. برای بازدید، زمانی برای دیدن جزئیات و همراهی با راهنمای محلی در نظر بگیرید.",
    href: "https://whc.unesco.org/en/list/114/",
    source: "یونسکو · تخت‌جمشید",
  },
  {
    id: "cyrus",
    title: "کوروش و پاسارگاد",
    body: "پاسارگاد با نام کوروش پیوند دارد. آرامگاه، باغ‌ها و بقایای کاخ‌ها، بخش‌هایی از این مجموعه تاریخی هستند. در سفر به فارس، می‌توانید درباره بازدید از پاسارگاد هم پرس‌وجو کنید.",
    href: "https://whc.unesco.org/en/list/1106/",
    source: "یونسکو · پاسارگاد",
  },
  {
    id: "griffin",
    title: "شیردال در هنر ایران",
    body: "شیردال در این تصویر با پیکر شیر، بال و سر عقاب نشان داده شده است. این ترکیب در تصویرسازی و نقش‌های الهام‌گرفته از هنر کهن دیده می‌شود.",
    href: "https://www.britishmuseum.org/collection/galleries/ancient-iran",
    source: "موزه بریتانیا · ایران باستان",
  },
  {
    id: "simurgh",
    title: "سیمرغ در داستان‌های ایرانی",
    body: "سیمرغ در داستان‌های ایرانی، از روایت زال تا آثار عطار، حضور دارد. نقش این پرنده در هنر و تصویرسازی ایرانی همچنان دیده می‌شود.",
    href: "https://www.iranicaonline.org/articles/simorg/",
    source: "دانشنامه ایرانیکا · سیمرغ",
  },
];
export default function Page() {
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="brand-body">
          <header className="brand-chapter">
            <p>دفتر فرهنگ هما نت</p>
            <h1>آشنایی با فرهنگ ایران</h1>
            <p>
              چند یادداشت کوتاه درباره بناها و نمادهای ایران. برای مطالعه بیشتر،
              منابع هر بخش در پایان همان یادداشت آمده است.
            </p>
          </header>
          {chapters.map((c) => (
            <Localized key={c.id}>
              <section className="brand-chapter heritage-chapter" id={c.id}>
                <div className="heritage-visual">
                  <ResponsiveImage
                    src={
                      "/assets/heritage/" +
                      c.id +
                      (["cyrus", "simurgh"].includes(c.id)
                        ? "-editorial-v2"
                        : "") +
                      ".webp"
                    }
                    alt={c.title}
                    loading="lazy"
                  />
                  {["cyrus", "simurgh"].includes(c.id) && <ImageBrandMark />}
                </div>
                <h2>{c.title}</h2>
                <p>{c.body}</p>
                <a href={c.href} target="_blank" rel="noreferrer">
                  {c.source}
                </a>
              </section>
            </Localized>
          ))}
          <section className="brand-chapter">
            <h2>سفر و هنر دست</h2>
            <p>
              برای دیدن خدمات سفر یا انتخاب صنایع‌دستی، به بخش مربوط سر بزنید.
              مشخصات و شرایط هر محصول را پیش از سفارش بررسی کنید.
            </p>
            <a href="/worlds/craft">شناخت همای تمدن و صنایع‌دستی</a> ·{" "}
            <a href="/worlds/tourism">سفر با هما نت</a>
          </section>
          <section className="brand-chapter" id="media-credit">
            <h2>درباره تصاویر</h2>
            <p>
              تصاویر این مجموعه، تصویرسازی‌هایی با الهام از تاریخ و داستان‌های
              ایرانی هستند.
            </p>
          </section>
        </main>
      </CommerceShell>
    </Localized>
  );
}
