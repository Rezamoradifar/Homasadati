import { UPDATED_DESK_WEEKLY_CAP } from "./card-levels";
import { z } from "zod";

export * from "./card-levels";
import { CARD_PLAN_VERSION, DESK_WEEKLY_CAP, MATCH_REWARD, MATCH_VOLUME, SIMURGH_CASHBACK, TOP_CARD_LEVEL, cardMinimum, sevenCards, desksForPurchase } from "./card-levels";
const money = z.number().int().nonnegative().max(1_000_000_000_000);
export function cardForPurchase(amount: number) {
  money.parse(amount);
  const card = [...sevenCards].reverse().find((card) => amount >= card.minToman);
  if (!card) return null;
  const desks = desksForPurchase(amount);
  return { ...card, desks, weeklyCapToman: desks * UPDATED_DESK_WEEKLY_CAP };
}
// Nullable decisions are deliberate: an unanswered business rule is not a payout default.
export const cardDecisionsSchema = z
  .object({
    overflow: z.enum(["carry-whole", "split-reward", "flush"]).nullable(),
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
    earnedThisWeek: money.max(UPDATED_DESK_WEEKLY_CAP),
    previousMatches: z.number().int().nonnegative().max(1_000_000_000),
    budget: money,
    voucherCountsTowardCap: z.boolean(),
  })
  .strict();
/** Capped reward and flush preview for ONE desk/week; does not mutate wallets or consume lots.
 * The eighth sequence index is lifetime, not reset every week. */
export function previewCardMatches(input: unknown, weeklyCap = UPDATED_DESK_WEEKLY_CAP) {
  const d = cardSimulationSchema.extend({earnedThisWeek:money.max(weeklyCap)}).parse(input);
  let left = d.left,
    right = d.right,
    allowance = weeklyCap - d.earnedThisWeek;
  let budget = d.budget,
    cash = 0,
    voucher = 0,
    count = 0, flushed = 0;
  while (
    left >= MATCH_VOLUME &&
    right >= MATCH_VOLUME
  ) {
    const isVoucher = (d.previousMatches + count + 1) % 8 === 0;
    const capCost = !isVoucher || d.voucherCountsTowardCap ? MATCH_REWARD : 0;
    if (capCost && allowance<=0) {
      const n=Math.floor(Math.min(left,right)/MATCH_VOLUME);
      flushed+=n*MATCH_REWARD;left-=n*MATCH_VOLUME;right-=n*MATCH_VOLUME;break;
    }
    const pay=capCost ? Math.min(MATCH_REWARD,allowance) : MATCH_REWARD;
    if(budget<pay) break;
    left -= MATCH_VOLUME; right -= MATCH_VOLUME; budget -= pay;
    allowance -= capCost ? pay : 0; count++;
    flushed+=MATCH_REWARD-pay;
    if(isVoucher) voucher+=pay; else cash+=pay;
  }
  return {
    matches: count,
    cash,
    voucher,
    gross: cash + voucher,
    flushed,
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
