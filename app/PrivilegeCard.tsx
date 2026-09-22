import {tierPriceRial,tomanToRial} from '../src/commerce/club-tiers';

import Localized from "../src/i18n/Localized";
type Props = {
  name: string;
  tone: string;
  level?: number;
  locale?: string;
  holder?: string;
  creditToman?: number;
  showPurchaseMinimum?: boolean;
};
export default function PrivilegeCard({
  name,
  tone,
  level,
  locale = "fa",
  holder,
  creditToman,
  showPurchaseMinimum = true,
}: Props) {
  const fa = locale !== "en";
  const amountRial=creditToman!==undefined?tomanToRial(creditToman):holder || !showPurchaseMinimum ?undefined:tierPriceRial(level);
  return (
    <Localized><div className={"privilege-card rank-" + tone}>
      <div className="privilege-card-lines" aria-hidden="true" />
      <img
        className="privilege-watermark"
        src="/assets/brand-mark.png"
        alt=""
        loading="lazy"
      />
      <div className="privilege-top">
        <span dir="ltr">
          HOMA <b>PRIVILEGE</b>
        </span>
        <img src="/assets/brand-mark.png" alt="" loading="lazy" />
      </div>
      <div className="privilege-title">
        <small>{fa ? "باشگاه مشتریان" : "CUSTOMERS CLUB"}</small>
        <h3>{name}</h3>
      </div>
      {amountRial!==undefined&&<div className="privilege-price"><small>{creditToman!==undefined?"اعتبار اولیه کارت":"حداقل مبلغ خرید کارت"}</small><strong><bdi>{amountRial.toLocaleString("fa-IR")}</bdi> <span>ریال</span></strong></div>}
      <div className="privilege-bottom">
        <div>
          <span>
            {holder
              ? fa
                ? "دارنده کارت"
                : "CARDHOLDER"
              : fa
                ? "مجموعه کارت‌های سفر"
                : "TRAVEL COLLECTION"}
          </span>
          <strong translate={holder ? "no" : undefined}>{holder || (fa ? "همای سعادت" : "HOMAY SAADAT")}</strong>
        </div>
        <span className="privilege-level" dir="ltr">
          {level ? (
            <>
              <b>{String(level).padStart(2, "0")}</b>
              <i>/ 07</i>
            </>
          ) : (
            <b>HOMA</b>
          )}
        </span>
      </div>
    </div></Localized>
  );
}
