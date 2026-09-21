// Public membership-price proposals in IRR. These are not travel-credit balances,
// purchase thresholds or an instruction to charge a member.
export const clubTiers = [
  {
    level: 1,
    name: "جوانه",
    english: "Javaneh",
    tone: "jade",
    priceRial: 100_000_000,
  },
  {
    level: 2,
    name: "سرو",
    english: "Sarv",
    tone: "forest",
    priceRial: 200_000_000,
  },
  {
    level: 3,
    name: "فیروزه",
    english: "Turquoise",
    tone: "turquoise",
    priceRial: 350_000_000,
  },
  {
    level: 4,
    name: "یاقوت",
    english: "Ruby",
    tone: "ruby",
    priceRial: 500_000_000,
  },
  {
    level: 5,
    name: "زمرد",
    english: "Emerald",
    tone: "emerald",
    priceRial: 750_000_000,
  },
  {
    level: 6,
    name: "پارسه",
    english: "Parseh",
    tone: "gold",
    priceRial: 1_000_000_000,
  },
  {
    level: 7,
    name: "سیمرغ",
    english: "Simurgh",
    tone: "obsidian",
    priceRial: 1_500_000_000,
  },
] as const;
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
