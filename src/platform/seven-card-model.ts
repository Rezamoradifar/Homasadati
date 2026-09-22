import { z } from "zod";

/** All amounts in this model are integer TOMAN, never rial. */
export const CARD_PLAN_VERSION = "seven-cards-2026-09";
export const MATCH_VOLUME = 30_000_000;
export const MATCH_REWARD = 5_400_000;
export const DESK_WEEKLY_CAP = 15_000_000;
export const SIMURGH_CASHBACK = 6_000_000;
export const sevenCards = [
  { level: 1, name: "جوانه", english: "Javaneh", tone: "jade" },
  { level: 2, name: "سرو", english: "Sarv", tone: "forest" },
  { level: 3, name: "فیروزه", english: "Turquoise", tone: "turquoise" },
  { level: 4, name: "یاقوت", english: "Ruby", tone: "ruby" },
  { level: 5, name: "زمرد", english: "Emerald", tone: "emerald" },
  { level: 6, name: "الماس", english: "Diamond", tone: "gold" },
  { level: 7, name: "سیمرغ", english: "Simurgh", tone: "obsidian" },
].map((card) => ({
  ...card,
  minToman: card.level * 10_000_000,
  maxExclusiveToman: card.level === 7 ? null : (card.level + 1) * 10_000_000,
  desks: card.level,
  branches: card.level + 1,
  weeklyCapToman: card.level * DESK_WEEKLY_CAP,
}));
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
