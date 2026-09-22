import {siteLocale} from "../../src/i18n/server";
import {loadDictionary,translateText} from "../../src/i18n/core";
import { CommerceShell } from "../../src/commerce/Shell";
import ResponsiveImage from "../../src/components/media/ResponsiveImage";
import Localized from "../../src/i18n/Localized";
import { all } from "../../src/platform/schema";
const documents = [
  {
    file: "trade-license",
    title: "پروانه کسب صنایع‌دستی",
    holder: "پیشگامان میراث جاویدان",
    issuer: "اتحادیه فروشندگان اشیای قدیمی و صنایع‌دستی شهرستان تهران",
    activity: "خرده‌فروشی صنایع‌دستی",
  },
  {
    file: "craft-house-permit",
    title: "مجوز تأسیس و بهره‌برداری خانه صنایع‌دستی",
    holder: "میراث جاویدان و ماندگار ایرانیان",
    issuer: "اداره کل میراث فرهنگی، گردشگری و صنایع‌دستی استان سمنان",
    activity: "تأسیس و بهره‌برداری خانه صنایع‌دستی",
  },
];
export default async function About() {
  const locale=await siteLocale(),dictionary=await loadDictionary(locale);
  const t=(text:string)=>translateText(text,locale,dictionary);
  const ceo = all(
    "SELECT value FROM p_settings WHERE key='site_ceo_name' AND secret=0",
  )[0]?.value;
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="shop-wrap company-page">
          <header className="company-heading">
            <p className="commerce-eyebrow">ریشه در ایران، رو به جهان.</p>
            <h1>میراث جاویدان ایرانیان</h1>
            <p className="company-brand">
              هما نت، برند شرکت میراث جاویدان ایرانیان
            </p>
            <p>
              هما نت با کنار هم قرار دادن سفر، هنر ایرانی، صنایع‌دستی، چرم،
              زیبایی و فناوری، فضایی برای شناخت و انتخاب آگاهانه فراهم می‌کند.
            </p>
            <div className="company-actions">
              <a className="commerce-button" href="/contact">
                ارتباط با ما
              </a>
              <a className="commerce-button outline" href="#licenses">
                مجوزها و اسناد
              </a>
            </div>
          </header>
          <section id="management" className="management-panel">
            <p className="commerce-eyebrow">مدیریت مجموعه</p>
            <h2>اصالت در انتخاب، مسئولیت در همراهی</h2>
            {ceo && (
              <p>
                <span>مدیرعامل</span>: <strong translate="no">{ceo}</strong>
              </p>
            )}
            <p>
              رویکرد مدیریت میراث جاویدان ایرانیان، معرفی روشن محصولات و خدمات،
              توجه به هنر و فرهنگ ایرانی و ارتباط پاسخ‌گو با مشتریان است. هما
              نت این رویکرد را در تجربه خرید و خدمات باشگاه دنبال می‌کند.
            </p>
            <div className="management-principles">
              <article>
                <h3>معرفی روشن</h3>
                <p>
                  مشخصات، قیمت و شرایط هر محصول باید پیش از انتخاب در دسترس
                  باشد.
                </p>
              </article>
              <article>
                <h3>احترام به اصالت</h3>
                <p>
                  داستان هنر، مواد و شیوه ساخت، بخشی از معرفی آثار ایرانی است.
                </p>
              </article>
              <article>
                <h3>ارتباط پاسخ‌گو</h3>
                <p>
                  مسیر تماس و پیگیری سفارش، بخشی از تجربه همراهی با مجموعه است.
                </p>
              </article>
            </div>
          </section>
          <section id="licenses" className="company-licenses">
            <h2>{t("مجوزها و اسناد ارائه‌شده")}</h2>
            <p>
              {t("تصاویر اسناد ارسالی مجموعه؛ عنوان دارنده، مرجع صادرکننده و موضوع فعالیت مطابق اصل هر سند درج شده است.")}
            </p>
            <div className="license-grid">
              {documents.map((d, i) => (
                <Localized key={d.file}>
                  <article className="license-card">
                    <a className="license-preview" href={`/assets/licenses/${d.file}.jpg`} target="_blank" rel="noopener noreferrer" aria-label={t(`مشاهده تصویر کامل ${t(d.title)}`)}>
                      <ResponsiveImage src={`/assets/licenses/${d.file}.jpg`} alt={t(d.title)} sizes="(max-width: 700px) 90vw, 44vw" quality={95}/>
                    </a>
                    <div className="license-copy">
                      <span className="license-number" aria-hidden="true">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3>{t(d.title)}</h3>
                      <dl>
                        <dt>{t("عنوان دارنده در سند")}</dt>
                        <dd>{t(d.holder)}</dd>
                        <dt>{t("مرجع صادرکننده")}</dt>
                        <dd>{t(d.issuer)}</dd>
                        <dt>{t("موضوع فعالیت")}</dt>
                        <dd>{t(d.activity)}</dd>
                      </dl>
                      <a className="license-open" href={`/assets/licenses/${d.file}.jpg`} target="_blank" rel="noopener noreferrer">{t("مشاهده سند در اندازه کامل")}</a>
                    </div>
                  </article>
                </Localized>
              ))}
            </div>
          </section>
        </main>
      </CommerceShell>
    </Localized>
  );
}
