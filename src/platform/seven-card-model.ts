import { z } from "zod";

export * from "./card-levels";
import { CARD_PLAN_VERSION, DESK_WEEKLY_CAP, MATCH_REWARD, MATCH_VOLUME, SIMURGH_CASHBACK, TOP_CARD_LEVEL, cardMinimum, sevenCards } from "./card-levels";
const money = z.number().int().nonnegative().max(1_000_000_000_000);
export function cardForPurchase(amount: number) {
  money.parse(amount);
  return (
    [...sevenCards].reverse().find((card) => amount >= card.minToman) ?? null
  );
}
// Nullable decisions are deliberate: an unanswered business rule is not a payout default.
export const cardDecisionsSchema = z
  .object({
    overflow: z.enum(["carry-whole", "split-reward"]).nullable(),
    counterScope: z.enum(["desk", "member"]).nullable(),
    voucherCountsTowardCap: z.boolean().nullable(),
    topology: z.enum(["own-desks", "left-chain", "right-chain", "manual"]).nullable(),
    purchaseCredit: z.enum(["purchase-value", "additional-credit"]).nullable(),
    weekStart: z.number().int().min(0).max(6).nullable(),
  })
  .strict();
export type CardDecisions = z.infer<typeof cardDecisionsSchema>;
export const undecidedCardRules: CardDecisions = {
  overflow: null,
  counterScope: null,
  voucherCountsTowardCap: null,
  topology: null,
  purchaseCredit: null,
  weekStart: null,
};
export const cardRulesUpdateSchema = z
  .object({
    decisions: cardDecisionsSchema,
    revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export const cardSimulationSchema = z
  .object({
    left: money,
    right: money,
    earnedThisWeek: money.max(DESK_WEEKLY_CAP),
    previousMatches: z.number().int().nonnegative().max(1_000_000_000),
    budget: money,
    voucherCountsTowardCap: z.boolean(),
  })
  .strict();
/** Whole-match preview for ONE desk/week; does not mutate wallets or consume lots.
 * The eighth sequence index is lifetime, not reset every week. */
export function previewCardMatches(input: unknown) {
  const d = cardSimulationSchema.parse(input);
  let left = d.left,
    right = d.right,
    allowance = DESK_WEEKLY_CAP - d.earnedThisWeek;
  let budget = d.budget,
    cash = 0,
    voucher = 0,
    count = 0;
  while (
    left >= MATCH_VOLUME &&
    right >= MATCH_VOLUME &&
    budget >= MATCH_REWARD
  ) {
    const isVoucher = (d.previousMatches + count + 1) % 8 === 0;
    const capCost = !isVoucher || d.voucherCountsTowardCap ? MATCH_REWARD : 0;
    if (capCost > allowance) break;
    left -= MATCH_VOLUME;
    right -= MATCH_VOLUME;
    budget -= MATCH_REWARD;
    allowance -= capCost;
    count++;
    if (isVoucher) voucher += MATCH_REWARD;
    else cash += MATCH_REWARD;
  }
  return {
    matches: count,
    cash,
    voucher,
    gross: cash + voucher,
    leftCarry: left,
    rightCarry: right,
    nextMatchNumber: d.previousMatches + count + 1,
    remainingWeeklyAllowance: allowance,
    remainingBudget: budget,
  };
}
/** Only a single settled initial purchase qualifies, never accumulated upgrades. */
export function simurghCashbackEligibility(
  amount: number,
  earlierPurchases: number,
) {
  money.parse(amount);
  z.number().int().nonnegative().parse(earlierPurchases);
  return amount >= 70_000_000 && earlierPurchases === 0 ? SIMURGH_CASHBACK : 0;
}
