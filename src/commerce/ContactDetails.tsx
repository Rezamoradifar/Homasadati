"use client";
import Localized from "../i18n/Localized";
import { useSiteSettings } from "../platform/SiteSettings";

export default function ContactDetails({
  compact = false,
}: {
  compact?: boolean;
}) {
  const settings = useSiteSettings();
  const landline = settings.site_landline?.trim();
  const email = settings.site_email?.trim();
  const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <Localized>
      <div className={compact ? "company-contact compact" : "company-contact"}>
        <p className="company-identity">
          هما نت، برند شرکت میراث جاویدان ایرانیان
        </p>
        <a className="contact-phone" href="tel:+989051838200">
          <span>تماس با مجموعه</span>
          <bdi dir="ltr" translate="no">
            +98 905 183 8200
          </bdi>
        </a>
        {validEmail ? (
          <a className="contact-email" href={`mailto:${email}`}>
            <span>ایمیل رسمی</span>
            <bdi dir="ltr" translate="no">
              {email}
            </bdi>
          </a>
        ) : null}
        {landline && /^0\d{10}$/.test(landline) && (
          <a className="contact-phone" href={"tel:+98" + landline.slice(1)}>
            <span>تلفن ثابت</span>
            <bdi dir="ltr" translate="no">
              {landline.slice(0, 3)} {landline.slice(3)}
            </bdi>
          </a>
        )}
        {settings.site_address && (
          <p className="contact-address">
            <span>نشانی</span> {settings.site_address}
            {settings.site_postal_code && (
              <>
                {" · "}کد پستی <bdi translate="no">{settings.site_postal_code}</bdi>
              </>
            )}
          </p>
        )}
        {!compact && (settings.company_national_id || settings.company_registration_no) && (
          <p className="contact-registry">
            {settings.company_registration_no && (
              <>
                شماره ثبت <bdi translate="no">{settings.company_registration_no}</bdi>
              </>
            )}
            {settings.company_national_id && settings.company_registration_no && " · "}
            {settings.company_national_id && (
              <>
                شناسه ملی <bdi translate="no">{settings.company_national_id}</bdi>
              </>
            )}
          </p>
        )}
        {settings.site_contact && (
          <p className="contact-extra" translate="no">
            {settings.site_contact}
          </p>
        )}
        <TrustBadge id={settings.enamad_id} code={settings.enamad_code} />
        {compact && (
          <nav aria-label="درباره شرکت و ارتباط">
            <a href="/about">درباره شرکت و مدیریت</a>
            <a href="/about#licenses">مجوزها و اسناد</a>
            <a href="/contact">ارتباط با ما</a>
          </nav>
        )}
      </div>
    </Localized>
  );
}

/** The e-commerce trust seal (eNamad), built from the id and code the
 * E-Commerce Development Centre issues — never pasted HTML. Its verifier
 * needs the site's origin in the referrer, hence referrerPolicy="origin". */
function TrustBadge({ id, code }: { id?: string; code?: string }) {
  if (!id || !code || !/^\d{3,12}$/.test(id) || !/^[A-Za-z0-9]{8,64}$/.test(code)) return null;
  const query = `id=${id}&Code=${code}`;
  return (
    <a
      className="trust-badge"
      href={`https://trustseal.enamad.ir/?${query}`}
      target="_blank"
      rel="noopener"
      referrerPolicy="origin"
      aria-label="نماد اعتماد الکترونیکی"
    >
      <img src={`https://trustseal.enamad.ir/logo.aspx?${query}`} alt="نماد اعتماد الکترونیکی" referrerPolicy="origin" width={96} height={104} loading="lazy" style={{ cursor: "pointer" }} />
    </a>
  );
}
