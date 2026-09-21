type Props = {
  name: string;
  tone: string;
  level?: number;
  locale?: string;
  holder?: string;
};
export default function PrivilegeCard({
  name,
  tone,
  level,
  locale = "fa",
  holder,
}: Props) {
  const fa = locale !== "en";
  return (
    <div className={"privilege-card rank-" + tone}>
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
        <small>{fa ? "باشگاه همراهان هما" : "HOMA MEMBERS CLUB"}</small>
        <h3>{name}</h3>
      </div>
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
          <strong>{holder || (fa ? "همای سعادت" : "HOMAY SAADAT")}</strong>
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
    </div>
  );
}
