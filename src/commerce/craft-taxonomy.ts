/** Handicraft catalogue structure: category → technique (copper only) → item.
 * Slugs are stored on products (details.craftCategory/craftTechnique/craftItem)
 * and used in shop links, so they must stay stable once products use them. */
/** `onlyWith` limits an item to some copper techniques; absent means all. */
export type CraftNode = { id: string; name: string; onlyWith?: string[] };
export type CraftCategory = CraftNode & {
  vertical: "craft" | "leather";
  techniques?: CraftNode[];
  items?: CraftNode[];
};

export const copperItems: CraftNode[] = [
  { id: "sugar-bowl", name: "قندان" },
  { id: "chocolate-dish", name: "شکلات‌خوری" },
  { id: "sherbet-set", name: "شربت‌خوری" },
  { id: "nut-bowl", name: "آجیل‌خوری" },
  { id: "tea-set", name: "چای‌خوری" },
  { id: "sweets-dish", name: "شیرینی‌خوری" },
  { id: "vase", name: "گلدان" },
  { id: "hyacinth-holder", name: "سنبلدان" },
  { id: "laleh", name: "لاله" },
  { id: "samovar-tea-set", name: "ست کامل سماور و چای‌خوری", onlyWith: ["turquoise"] },
  { id: "samovar-set", name: "ست کامل سماور", onlyWith: ["khatam"] },
];

/** Items offered under a category, narrowed to one technique when given. */
export function itemsFor(category: CraftCategory, technique = "") {
  return (category.items || []).filter((i) => !technique || !i.onlyWith || i.onlyWith.includes(technique));
}

export const craftCategories: CraftCategory[] = [
  {
    id: "copper",
    name: "محصولات مس",
    vertical: "craft",
    techniques: [
      { id: "turquoise", name: "فیروزه‌کاری" },
      { id: "khatam", name: "خاتم‌کاری" },
      { id: "diamond-cut", name: "الماس‌تراش" },
      { id: "pardaz", name: "پرداز" },
      { id: "silver-inlay", name: "نقره‌کوب" },
    ],
    items: copperItems,
  },
  {
    id: "leather",
    name: "محصولات چرمی",
    vertical: "leather",
    items: [
      { id: "bag", name: "کیف" },
      { id: "belt", name: "کمربند" },
    ],
  },
  { id: "backgammon", name: "محصولات تخته‌نرد", vertical: "craft" },
  { id: "carpet", name: "تابلوفرش و گلیم", vertical: "craft" },
  {
    id: "enamel",
    name: "محصولات میناکاری‌شده",
    vertical: "craft",
    items: [
      { id: "sugar-bowl", name: "قندان" },
      { id: "vase", name: "گلدان" },
      { id: "rosewater-sprinkler", name: "گلاب‌پاش" },
      { id: "fruit-bowl", name: "میوه‌خوری" },
      { id: "tea-set", name: "چای‌خوری" },
    ],
  },
];

export const craftCategory = (id: string) => craftCategories.find((c) => c.id === id);

/** True when the chosen technique and item belong to the chosen category. */
export function validCraftPath(category: string, technique: string, item: string) {
  if (!category) return !technique && !item;
  const c = craftCategory(category);
  if (!c) return false;
  if (technique && !c.techniques?.some((t) => t.id === technique)) return false;
  const found = c.items?.find((i) => i.id === item);
  if (item && !found) return false;
  if (found?.onlyWith && !(technique && found.onlyWith.includes(technique))) return false;
  return true;
}

/** Shop link for a node of the tree. */
export function craftShopHref(category: string, technique = "", item = "") {
  const params = new URLSearchParams({ vertical: "craft", cat: category });
  if (technique) params.set("tech", technique);
  if (item) params.set("item", item);
  return "/shop?" + params.toString();
}
