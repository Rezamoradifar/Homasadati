/** Handicraft catalogue structure: category → technique (copper only) → item.
 * Slugs are stored on products (details.craftCategory/craftTechnique/craftItem)
 * and used in shop links, so they must stay stable once products use them. */
export type CraftNode = { id: string; name: string };
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
  { id: "hyacinth-holder", name: "سنبل‌دان" },
  { id: "laleh", name: "لاله" },
];

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
  { id: "enamel", name: "محصولات میناکاری‌شده", vertical: "craft" },
];

export const craftCategory = (id: string) => craftCategories.find((c) => c.id === id);

/** True when the chosen technique and item belong to the chosen category. */
export function validCraftPath(category: string, technique: string, item: string) {
  if (!category) return !technique && !item;
  const c = craftCategory(category);
  if (!c) return false;
  if (technique && !c.techniques?.some((t) => t.id === technique)) return false;
  if (item && !c.items?.some((i) => i.id === item)) return false;
  return true;
}

/** Shop link for a node of the tree. */
export function craftShopHref(category: string, technique = "", item = "") {
  const c = craftCategory(category);
  const params = new URLSearchParams({ vertical: c?.vertical || "craft", cat: category });
  if (technique) params.set("tech", technique);
  if (item) params.set("item", item);
  return "/shop?" + params.toString();
}
