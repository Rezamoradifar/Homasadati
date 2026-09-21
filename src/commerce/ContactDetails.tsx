"use client";
import Localized from "../i18n/Localized";
import { useSiteSettings } from "../platform/SiteSettings";

export default function ContactDetails({
  compact = false,
}: {
  compact?: boolean;
}) {
  const settings = useSiteSettings();
  const email = settings.site_email?.trim();
  const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <Localized>
      <div className={compact ? "company-contact compact" : "company-contact"}>
        <p className="company-identity">
          همای سعادت، برند شرکت میراث جاویدان ایرانیان
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
        ) : (
          !compact && (
            <p className="contact-pending">ایمیل رسمی هنوز اعلام نشده است.</p>
          )
        )}
        {!compact && (
          <p className="contact-pending">
            شماره تلفن ثابت پس از تکمیل اطلاعات اضافه می‌شود.
          </p>
        )}
        {settings.site_contact && (
          <p className="contact-extra" translate="no">
            {settings.site_contact}
          </p>
        )}
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
