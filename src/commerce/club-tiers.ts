import { sevenCards } from "../platform/seven-card-model";
// Purchase lower bounds in rial; matching and caps use toman in the shared model.
export const clubTiers = sevenCards.map((card) => ({
  ...card,
  priceRial: card.minToman * 10,
}));
export function tierPriceRial(level?: number) {
  return clubTiers.find((tier) => tier.level === level)?.priceRial;
}
export function tomanToRial(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER / 10
  )
    throw new RangeError("Invalid toman amount");
  return value * 10;
}
