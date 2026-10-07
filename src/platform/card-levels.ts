/** The eight club cards and their constants, without validation code, so
 * pages that only show the cards don't ship the schema library. */
/** All amounts in this model are integer TOMAN, never rial. */
export const CARD_PLAN_VERSION = "eight-cards-2026-10-06";
export const MATCH_VOLUME = 30_000_000;
export const MATCH_REWARD = 4_900_000;
export const PURCHASE_PER_DESK = 10_000_000;
export const DESKS_PER_MEMBER = 7;
export const desksForPurchase = (amount: number) => Math.min(DESKS_PER_MEMBER, Math.floor(amount / PURCHASE_PER_DESK));
export const DESK_WEEKLY_CAP = 15_000_000; // Legacy settlements retain their original rules.
export const UPDATED_DESK_WEEKLY_CAP = 10_500_000;
export const SIMURGH_CASHBACK = 6_000_000;
export const TOP_CARD_LEVEL = 8;
/** Cards 1–7 start every 10m toman; the Aria card starts at 100m. */
export function cardMinimum(level: number) {
  return level >= 8 ? 100_000_000 : level * 10_000_000;
}
export const sevenCards = [
  { level: 1, name: "جوانه", english: "Javaneh", tone: "jade" },
  { level: 2, name: "سرو", english: "Sarv", tone: "forest" },
  { level: 3, name: "فیروزه", english: "Turquoise", tone: "turquoise" },
  { level: 4, name: "یاقوت", english: "Ruby", tone: "ruby" },
  { level: 5, name: "زمرد", english: "Emerald", tone: "emerald" },
  { level: 6, name: "الماس", english: "Diamond", tone: "gold" },
  { level: 7, name: "سیمرغ", english: "Simurgh", tone: "obsidian" },
  // Owner decision: an eighth card from 100m toman; Simurgh covers 70m up to it.
  { level: 8, name: "آریا", english: "Aria", tone: "lapis" },
].map((card, i, list) => ({
  ...card,
  minToman: cardMinimum(card.level),
  maxExclusiveToman: i === list.length - 1 ? null : cardMinimum(card.level + 1),
  desks: desksForPurchase(cardMinimum(card.level)),
  branches: Math.min(8, desksForPurchase(cardMinimum(card.level)) + 1),
  weeklyCapToman: desksForPurchase(cardMinimum(card.level)) * UPDATED_DESK_WEEKLY_CAP,
}));

/** Owner-approved seven-level plan; historical eight-card settlements stay versioned. */
export const SEVEN_LEVEL_VERSION = "seven-level-manual-2026-10-07";
export const SEVEN_LEVEL_DESK_CAP = 15_000_000;
export const sevenLevelCards = sevenCards.slice(0,7).map((card,i)=>({
  ...card, maxExclusiveToman:i===6 ? null : (i+2)*PURCHASE_PER_DESK,
  branches:i+2,weeklyCapToman:(i+1)*SEVEN_LEVEL_DESK_CAP,
}));
export function sevenLevelCardForPurchase(amount:number) {
  if(!Number.isSafeInteger(amount) || amount<0 || amount>1_000_000_000_000) throw new Error("invalid_purchase_amount");
  return [...sevenLevelCards].reverse().find(card=>amount>=card.minToman) || null;
}
