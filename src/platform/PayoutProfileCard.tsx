"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { api, RecordData } from "./client";
import { Form } from "./Widgets";

const statusText: Record<string, string> = {
  pending: "در انتظار بررسی کارشناس مالی",
  verified: "تأییدشده",
  rejected: "رد شده",
};

/** Member's bank details for rial withdrawals: national code, card and IBAN.
 * Numbers come back masked; any change goes back to review. */
export function PayoutProfileCard({
  profile,
  twoFactor,
  onSaved,
}: {
  profile: RecordData | null;
  twoFactor: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!profile);
  return (
    <Localized>
      <div className="portal-card payout-profile">
        <h2>اطلاعات بانکی برداشت</h2>
        <p>
          برداشت ریالی فقط به حساب بانکی به نام خود شما و پس از تأیید کارشناس
          مالی انجام می‌شود. کد ملی، شماره کارت و شبا باید متعلق به یک نفر باشند.
        </p>
        {profile && (
          <dl className="payout-profile-summary">
            <div>
              <dt>وضعیت</dt>
              <dd className={"payout-status " + profile.status}>{statusText[profile.status]}</dd>
            </div>
            <div>
              <dt>نام صاحب حساب</dt>
              <dd>{profile.holderName}</dd>
            </div>
            <div>
              <dt>کد ملی</dt>
              <dd dir="ltr">{profile.nationalId}</dd>
            </div>
            <div>
              <dt>شماره کارت</dt>
              <dd dir="ltr">{profile.cardNumber}</dd>
            </div>
            <div>
              <dt>شماره شبا</dt>
              <dd dir="ltr">{profile.iban}</dd>
            </div>
            {profile.status === "rejected" && profile.reason && (
              <div>
                <dt>دلیل رد</dt>
                <dd>{profile.reason}</dd>
              </div>
            )}
          </dl>
        )}
        {!twoFactor ? (
          <p className="portal-notice">
            برای ثبت یا تغییر اطلاعات بانکی، ابتدا تأیید دومرحله‌ای را در بخش{" "}
            <a href="?tab=security">امنیت حساب</a> فعال کنید.
          </p>
        ) : editing ? (
          <Form
            fields={[
              { name: "holderName", label: "نام و نام خانوادگی صاحب حساب" },
              { name: "nationalId", label: "کد ملی", hint: "۱۰ رقم", max: 10 },
              { name: "cardNumber", label: "شماره کارت", hint: "۱۶ رقم روی کارت بانکی", max: 19 },
              { name: "iban", label: "شماره شبا", hint: "IR به همراه ۲۴ رقم" },
              { name: "totp", label: "کد برنامه رمزساز", max: 6 },
            ]}
            submit={profile ? "ثبت تغییرات و ارسال برای بررسی" : "ثبت و ارسال برای بررسی"}
            onSubmit={async (v) => {
              await api("payout-profile", "POST", v);
              setEditing(false);
              onSaved();
            }}
          />
        ) : (
          <button className="portal-button secondary" onClick={() => setEditing(true)}>
            تغییر اطلاعات بانکی
          </button>
        )}
      </div>
    </Localized>
  );
}
