/**
 * Some older products were seeded with static promotional portraits.
 * Keep existing database records and shopping data unchanged, but resolve
 * these retired public art URLs to valid, person-free brand photographs.
 * Uploaded user media and external product images are never modified.
 */
const replacements: Record<string,string> = {
  "/assets/tourism.jpg": "/assets/backdrop/persepolis.webp",
  "/assets/tourism-wide.jpg": "/assets/heritage/isfahan.webp",
  "/assets/hero.jpg": "/assets/heritage/isfahan.webp",
  "/assets/beauty.jpg": "/assets/redesign/beauty.webp",
  "/assets/collections/beauty-portrait.webp": "/assets/collections/beauty-care.webp",
  "/assets/collections/ai-human.webp": "/assets/redesign/ai-studio.webp",
};

export function safeMediaSrc(src: string): string {
  return Object.prototype.hasOwnProperty.call(replacements,src) ? replacements[src] : src;
}
