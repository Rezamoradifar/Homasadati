import { SEVEN_LEVEL_VERSION, SEVEN_LEVEL_DESK_CAP, sevenLevelCards } from "./card-levels";
import { positionMode, sevenLevelMode } from "./card-positions";
import { UPDATED_DESK_WEEKLY_CAP, updatedCardSchedule } from "./card-schedule";
import { ApiError } from "../server/http";
import { atomic } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import {
  CARD_PLAN_VERSION,
  DESKS_PER_MEMBER,
  PURCHASE_PER_DESK,
  MATCH_REWARD,
  MATCH_VOLUME,
  cardDecisionsSchema,
  cardRulesUpdateSchema,
  sevenCards,
  undecidedCardRules,
} from "./seven-card-model";

export function cardPlan() {
  const raw = setting("seven_card_plan_draft");
  const stored = raw ? JSON.parse(raw) : null;
  const decisions = stored
    ? cardDecisionsSchema.parse(stored.decisions)
    : { ...undecidedCardRules };
  return {
    version: sevenLevelMode() ? SEVEN_LEVEL_VERSION : CARD_PLAN_VERSION,
    status: setting("seven_card_live") === "1" ? "live" : "draft",
    positionVersion: positionMode() ? setting("seven_card_position_version") : null,
    liveSettlement: setting("seven_card_live") === "1",
    revision: stored?.revision ?? 0,
    cards: sevenLevelMode() ? sevenLevelCards : sevenCards,
    desksPerMember: DESKS_PER_MEMBER,
    purchasePerDeskToman: PURCHASE_PER_DESK,
    matchVolumeToman: MATCH_VOLUME,
    matchRewardToman: MATCH_REWARD,
    ownPurchaseCommission: false,
    deskWeeklyCapToman: sevenLevelMode() ? SEVEN_LEVEL_DESK_CAP : UPDATED_DESK_WEEKLY_CAP,
    scheduleVersion: updatedCardSchedule() ? "2026-10-06" : "legacy",
    paymentDelayWeeks: updatedCardSchedule() ? 1 : 0,
    officialIdentityInquiry: "not_configured",
    decisions,
    unresolved: Object.entries(decisions)
      .filter(([, value]) => value === null)
      .map(([key]) => key),
  };
}
export function saveCardPlan(actor: string, input: unknown) {
  const d = cardRulesUpdateSchema.parse(input);
  return atomic(() => {
    if(updatedCardSchedule() && (d.decisions.overflow!=="flush" || d.decisions.counterScope!=="member" || d.decisions.voucherCountsTowardCap!==true || d.decisions.topology!=="own-desks" || d.decisions.purchaseCredit!=="purchase-value" || d.decisions.weekStart!==1)) throw new ApiError(409,"approved_plan_rules_required");
    const before = cardPlan();
    if (before.revision !== d.revision)
      throw new ApiError(409, "idempotency_conflict");
    const after = { decisions: d.decisions, revision: before.revision + 1 };
    saveSetting("seven_card_plan_draft", JSON.stringify(after));
    audit(
      actor,
      "seven-card.draft",
      CARD_PLAN_VERSION,
      before,
      after,
      d.reason,
    );
    return cardPlan();
  });
}
