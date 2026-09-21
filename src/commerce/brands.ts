export const brands = {
  tourism: {
    name: "همای سعادت",
    latin: "Homay Saadat",
    label: "گردشگری ایران",
    image: "/assets/tourism-wide.jpg",
    tone: "#155b5b",
    tagline: "ایران را زندگی کن؛ آرام، عمیق، به‌یادماندنی.",
  },
  craft: {
    name: "هما تمدن",
    latin: "Homa Tamaddon",
    label: "صنایع‌دستی ایران",
    image: "/assets/craft-wide.jpg",
    tone: "#814f31",
    tagline: "هنری که از دست‌ها می‌گذرد و در خانه می‌ماند.",
  },
  beauty: {
    name: "هما زیبا",
    latin: "Homa Ziba",
    label: "زیبایی و مراقبت",
    image: "/assets/collections/beauty-cream.webp",
    tone: "#895766",
    tagline: "مراقبت آگاهانه؛ زیبایی در اندازه زندگی.",
  },
  ai: {
    name: "هما هوشمند",
    latin: "Homa Intelligence",
    label: "هوش مصنوعی و رشد",
    image: "/assets/collections/ai-human.webp",
    tone: "#343f68",
    tagline: "فناوری در خدمت انسان، خلاقیت و کسب‌وکار.",
  },
  leather: {
    name: "هما چرم",
    latin: "Homa Leather",
    label: "چرم و طراحی ایرانی",
    image: "/assets/collections/leather-bag.webp",
    tone: "#663f2a",
    tagline: "خوش‌ساخت، ماندگار، همراه روزهای تو.",
  },
} as const;
export type Sector = keyof typeof brands;
export const sectorKeys: Sector[] = ["tourism", "craft", "leather", "beauty", "ai"];
export const isSector = (s: string): s is Sector => Object.prototype.hasOwnProperty.call(brands, s);
