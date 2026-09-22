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
    latin: "Homa Tamaddon",
    label: "صنایع‌دستی ایران",
    image: "/assets/craft.jpg",
    tone: "#395679",
    tagline: "هنری که از دست‌ها می‌گذرد و در خانه می‌ماند.",
  },
  beauty: {
    name: "همای زیبا",
    latin: "Homa Ziba",
    label: "زیبایی و مراقبت",
    image: "/assets/collections/beauty-cream.webp",
    tone: "#895766",
    tagline: "مراقبت آگاهانه؛ زیبایی در اندازه زندگی.",
  },
  ai: {
    name: "همای هوشمند",
    latin: "Homa Intelligence",
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
