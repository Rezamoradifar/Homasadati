
import { UsdNote } from "../src/commerce/currency";
import Localized from "../src/i18n/Localized";
import PrivilegeCard from "./PrivilegeCard";
import PlanStatusNote from "./PlanStatusNote";
import { sevenCards } from "../src/platform/seven-card-model";
const ranks = sevenCards.map(card => [card.name, card.english, card.tone]);
export default function ClubCards({ locale = "fa" }: { locale?: string }) {
  const fa = locale !== "en";
  return (
    <Localized><section
      className="club-preview content-section"
      aria-labelledby="ranks-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">کارت‌های باشگاه همای</p>
          <h2 id="ranks-title">
            {fa
              ? "هشت رتبه، هشت رنگ همراهی"
              : "Eight ranks. Your next chapter."}
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
            href="/income-plan"
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
      <UsdNote/>
      <PlanStatusNote fa={fa} />
    </section></Localized>
  );
}
