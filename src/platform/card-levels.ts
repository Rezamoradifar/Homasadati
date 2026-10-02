/** The eight club cards and their constants, without validation code, so
 * pages that only show the cards don't ship the schema library. */
/** All amounts in this model are integer TOMAN, never rial. */
export const CARD_PLAN_VERSION = "seven-cards-2026-09";
export const MATCH_VOLUME = 30_000_000;
export const MATCH_REWARD = 5_400_000;
export const DESK_WEEKLY_CAP = 15_000_000;
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
  desks: card.level,
  branches: card.level + 1,
  weeklyCapToman: card.level * DESK_WEEKLY_CAP,
}));
