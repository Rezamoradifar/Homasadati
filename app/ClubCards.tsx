
import Localized from "../src/i18n/Localized";
import PrivilegeCard from "./PrivilegeCard";
const ranks = [
  ["جوانه", "Javaneh", "jade"],
  ["سرو", "Sarv", "forest"],
  ["فیروزه", "Turquoise", "turquoise"],
  ["یاقوت", "Ruby", "ruby"],
  ["زمرد", "Emerald", "emerald"],
  ["پارسه", "Parseh", "gold"],
  ["سیمرغ", "Simurgh", "obsidian"],
];
export default function ClubCards({ locale = "fa" }: { locale?: string }) {
  const fa = locale !== "en";
  return (
    <Localized><section
      className="club-preview content-section"
      aria-labelledby="ranks-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">HOMA PRIVILEGE</p>
          <h2 id="ranks-title">
            {fa
              ? "هفت رتبه، هفت رنگ همراهی"
              : "Seven ranks. Your next chapter."}
          </h2>
        </div>
        <a className="editorial-link" href="/club/ranks">
          {fa
            ? "شناخت رتبه‌ها و شرایط کارت سفر"
            : "Explore ranks and travel cards"}{" "}
          <span aria-hidden="true">{fa ? "←" : "→"}</span>
        </a>
      </div>
      <div className="club-preview-grid">
        {ranks.map(([name, en, tone], i) => (
          <Localized key={tone}><a
            href={"/club/ranks#rank-" + (i + 1)}
            className={"rank-card rank-" + tone}
            aria-label={fa ? "رتبه " + name : en + " rank"}
          >
            <PrivilegeCard
              name={fa ? name : en}
              tone={tone}
              level={i + 1}
              locale={locale}
            />
          </a></Localized>
        ))}
      </div>
      <p className="club-preview-note">
        {fa
          ? "قیمت‌های روی کارت، پیشنهاد عضویت به ریال هستند؛ خرید مستقیم کارت هنوز فعال نیست. اعتبار سفر و شرایط احراز هر رتبه را در جزئیات باشگاه ببینید."
          : "Card prices are membership proposals in Iranian rials; direct card purchase is not yet enabled. See the club for travel credit and qualification details."}
      </p>
    </section></Localized>
  );
}
