/** Handicraft catalogue structure: category → technique (copper only) → item.
 * Slugs are stored on products (details.craftCategory/craftTechnique/craftItem)
 * and used in shop links, so they must stay stable once products use them. */
/** `onlyWith` limits an item to some copper techniques; absent means all. */
export type CraftNode = { id: string; name: string; onlyWith?: string[] };
export type CraftCategory = CraftNode & {
  /** Label for the compact category bar; `name` stays the full title. */
  short: string;
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
    short: "مس",
    vertical: "craft",
    techniques: [
      { id: "turquoise", name: "فیروزه‌کاری" },
      { id: "khatam", name: "خاتم‌کاری" },
      { id: "diamond-cut", name: "الماس‌تراش" },
      { id: "pardaz", name: "پرداز" },
      { id: "engraving", name: "قلم‌زنی" },
    ],
    items: copperItems,
  },
  {
    id: "leather",
    name: "محصولات چرمی",
    short: "چرم",
    vertical: "leather",
    items: [
      { id: "bag", name: "کیف" },
      { id: "belt", name: "کمربند" },
    ],
  },
  { id: "backgammon", name: "محصولات تخته‌نرد", short: "تخته‌نرد", vertical: "craft" },
  { id: "carpet", name: "تابلوفرش و گلیم", short: "فرش و گلیم", vertical: "craft" },
  {
    id: "enamel",
    name: "محصولات میناکاری‌شده",
    short: "میناکاری",
    vertical: "craft",
    items: [
      { id: "sugar-bowl", name: "قندان" },
      { id: "vase", name: "گلدان" },
      { id: "rosewater-sprinkler", name: "گلاب‌پاش" },
      { id: "fruit-bowl", name: "میوه‌خوری" },
      { id: "tea-set", name: "چای‌خوری" },
    ],
  },
  {
    id: "silver-inlay",
    name: "محصولات نقره‌کوب",
    short: "نقره‌کوب",
    vertical: "craft",
    items: copperItems.filter((i) => !i.onlyWith),
  },
  { id: "wood", name: "محصولات چوبی، منبت و جعبه", short: "چوب و منبت", vertical: "craft" },
];

export const craftCategory = (id: string) => craftCategories.find((c) => c.id === id);

/** Keyword rules for products saved without a category: the product's type
 * (subtype) and title say what it is. Order matters — enamel on wood with
 * khatam is enamel; silver work is its own category. */
const categoryRules: [string, RegExp][] = [
  ["enamel", /مینا/],
  ["silver-inlay", /نقره/],
  ["leather", /چرم|کیف|کمربند/],
  ["backgammon", /تخته[\s\u200c]?نرد/],
  ["carpet", /فرش|گلیم/],
  ["wood", /منبت|جعبه|چوب/],
  ["copper", /مس|پرداز|خاتم|الماس[\s\u200c]?تراش|فیروزه|قلم[\s\u200c]?زنی/],
];
const techniqueRules: [string, RegExp][] = [
  ["turquoise", /فیروزه/],
  ["khatam", /خاتم/],
  ["diamond-cut", /الماس/],
  ["pardaz", /پرداز/],
  ["engraving", /قلم[\s\u200c]?زنی/],
];
const itemRules: [string, RegExp][] = [
  ["samovar-tea-set", /سماور.*چای|چای.*سماور/],
  ["samovar-set", /سماور/],
  ["sugar-bowl", /قندان/],
  ["chocolate-dish", /شکلات[\s\u200c]?خوری/],
  ["sherbet-set", /شربت[\s\u200c]?خوری/],
  ["nut-bowl", /آجیل[\s\u200c]?خوری/],
  ["sweets-dish", /شیرینی[\s\u200c]?خوری/],
  ["tea-set", /چای[\s\u200c]?خوری/],
  ["hyacinth-holder", /سنبل[\s\u200c]?دان/],
  ["laleh", /لاله/],
  ["rosewater-sprinkler", /گلاب[\s\u200c]?پاش/],
  ["fruit-bowl", /میوه[\s\u200c]?خوری/],
  ["vase", /گلدان/],
  ["bag", /کیف(?![\s\u200c]*پول)/],
  ["belt", /کمربند/],
];
const pick = (rules: [string, RegExp][], text: string) => rules.find(([, re]) => re.test(text))?.[0] || "";

/** The category, technique and item a product belongs to in the shop. Values
 * set by staff win; anything missing is inferred from the product's type and
 * title. Old copper products marked "silver-inlay" move to that category. */
export function effectiveCraft(
  p: { vertical: string; subtype?: string; title?: string },
  details: { craftCategory?: string; craftTechnique?: string; craftItem?: string } = {},
) {
  if (p.vertical !== "craft" && p.vertical !== "leather") return { category: "", technique: "", item: "" };
  const text = `${p.subtype || ""} ${p.title || ""}`;
  let category = details.craftCategory || "";
  let technique = details.craftTechnique || "";
  if (category === "copper" && technique === "silver-inlay") (category = "silver-inlay"), (technique = "");
  if (!category) category = p.vertical === "leather" ? "leather" : pick(categoryRules, text);
  if (category === "copper" && !technique) technique = pick(techniqueRules, text);
  if (category !== "copper") technique = "";
  const c = craftCategory(category);
  let item = details.craftItem || pick(itemRules, text);
  if (!c?.items?.some((i) => i.id === item)) item = "";
  return { category, technique, item };
}

/** True when the chosen technique and item belong to the chosen category. */
export function validCraftPath(category: string, technique: string, item: string) {
  if (!category) return !technique && !item;
  const c = craftCategory(category);
  if (!c) return false;
  // Older copper products marked silver-inlay stay valid; the shop lists them under silver-inlay.
  const legacy = category === "copper" && technique === "silver-inlay";
  if (technique && !legacy && !c.techniques?.some((t) => t.id === technique)) return false;
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
