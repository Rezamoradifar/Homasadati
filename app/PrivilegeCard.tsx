import {Money} from '../src/commerce/currency';
import {tierPriceRial,tomanToRial} from '../src/commerce/club-tiers';
import {TOP_CARD_LEVEL} from '../src/platform/seven-card-model';

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
    <Localized><div className={"privilege-card rank-" + tone + (holder ? " has-holder" : "")}>
      <div className="privilege-card-lines" aria-hidden="true" />
      <img
        className="privilege-watermark"
        src="/assets/brand-mark.png"
        alt=""
        loading="lazy"
      />
      <div className="privilege-top">
        <span dir="ltr">
          HOMAY <b>PRIVILEGE</b>
        </span>
        <img src="/assets/brand-mark.png" alt="" loading="lazy" />
      </div>
      <div className="privilege-title">
        <small>{fa ? "باشگاه مشتریان" : "CUSTOMERS CLUB"}</small>
        <h3>{name}</h3>
      </div>
      {amountRial!==undefined&&<div className="privilege-price"><small>{creditToman!==undefined?"اعتبار اولیه کارت":"حداقل مبلغ خرید کارت"}</small><strong><Money rial={amountRial}/></strong></div>}
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
          <strong translate={holder ? "no" : undefined}>{holder || (fa ? "هما نت" : "HOMANET")}</strong>
        </div>
        <span className="privilege-level" dir="ltr">
          {level ? (
            <>
              <b>{String(level).padStart(2, "0")}</b>
              <i>/ {String(TOP_CARD_LEVEL).padStart(2, "0")}</i>
            </>
          ) : (
            <b>HOMAY</b>
          )}
        </span>
      </div>
    </div></Localized>
  );
}
