import { ApiError } from "../server/http";
import { atomic } from "./schema";
import { setting, saveSetting } from "./providers";
import { audit } from "./security";
import {
  CARD_PLAN_VERSION,
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
    version: CARD_PLAN_VERSION,
    status: setting("seven_card_live") === "1" ? "live" : "draft",
    liveSettlement: setting("seven_card_live") === "1",
    revision: stored?.revision ?? 0,
    cards: sevenCards,
    decisions,
    unresolved: Object.entries(decisions)
      .filter(([, value]) => value === null)
      .map(([key]) => key),
  };
}
export function saveCardPlan(actor: string, input: unknown) {
  const d = cardRulesUpdateSchema.parse(input);
  return atomic(() => {
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
