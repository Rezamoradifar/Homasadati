export const brands = {
  tourism: {
    name: "همای سعادت",
    latin: "Homay Saadat",
    label: "گردشگری ایران",
    image: "/assets/tourism-wide.jpg",
    tone: "#2d3543",
    tagline: "ایران را زندگی کن؛ آرام، عمیق، به‌یادماندنی.",
  },
  craft: {
    name: "همای تمدن",
    latin: "Homay Tamaddon",
    label: "صنایع‌دستی ایران",
    image: "/assets/craft.jpg",
    tone: "#395679",
    tagline: "هنری که از دست‌ها می‌گذرد و در خانه می‌ماند.",
  },
  beauty: {
    name: "همای زیبا",
    latin: "Homay Ziba",
    label: "زیبایی و مراقبت",
    image: "/assets/collections/beauty-cream.webp",
    tone: "#895766",
    tagline: "مراقبت آگاهانه؛ زیبایی در اندازه زندگی.",
  },
  ai: {
    name: "همای هوشمند",
    latin: "Homay Intelligence",
    label: "هوش مصنوعی و رشد",
    image: "/assets/collections/ai-human.webp",
    tone: "#344b68",
    tagline: "فناوری در خدمت انسان، خلاقیت و کسب‌وکار.",
  },
  leather: {
    name: "همای چرم",
    latin: "Homa Leather",
    label: "چرم و طراحی ایرانی",
    image: "/assets/collections/leather-bag.webp",
    tone: "#2e4562",
    tagline: "خوش‌ساخت، ماندگار، همراه روزهای تو.",
  },
} as const;
export type Sector = keyof typeof brands;
export const sectorKeys: Sector[] = ["tourism", "craft", "leather", "beauty", "ai"];
/** Sectors shown in menus; leather is presented inside handicrafts. */
export const menuSectors: Sector[] = sectorKeys.filter((k) => k !== "leather");
export const isSector = (s: string): s is Sector => Object.prototype.hasOwnProperty.call(brands, s);

/** The Homay Saadat name belongs to the tourism pages only; menus and lists
 * elsewhere call that world by what it offers. */
export const menuName = (k: Sector) => (k === "tourism" ? brands.tourism.label : brands[k].name);
export const menuLabel = (k: Sector) => (k === "tourism" ? "سفرهای فرهنگی و طبیعت‌گردی" : brands[k].label);
export const menuLine = (k: Sector) => (k === "tourism" ? brands.tourism.label : `${brands[k].name} · ${brands[k].label}`);
