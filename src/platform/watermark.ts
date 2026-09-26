import { join } from "node:path";
import sharp, { type Sharp } from "sharp";

/** Brand stamp shared by the site-photo script and the upload pipeline: the
 * orange Homanet logo on a cream label, bottom-centre. Images too small for
 * the wordmark get the orange bird. */
const brandDirectory = () => join(process.cwd(), "public/assets/brand");
const logos = new Map<string, Promise<Buffer>>();
const logoFile = (name: string) => {
  if (!logos.has(name)) logos.set(name, sharp(join(brandDirectory(), name)).toBuffer());
  return logos.get(name)!;
};

/** Phone layouts crop photos with object-fit: cover — landscape photos down to
 * wide 2.4:1 banners, portrait ones down to 16:9 — so the logo sits just above
 * what such a crop removes and shows in thumbnails without opening the photo. */
function bottomOffset(width: number, height: number) {
  const narrowest = width >= height ? 2.4 : 16 / 9;
  const cropped = Math.max(0, (height - width / narrowest) / 2);
  return Math.round(cropped + height * 0.04);
}

/** A cream label with rounded ends that the orange logo sits on, so the
 * logo reads on dark stone, bright sky and warm leather or copper alike. */
async function label(width: number, height: number) {
  const r = Math.round(height / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fffaf3" fill-opacity="0.9"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function stampLogo(input: Buffer): Promise<Sharp> {
  const image = sharp(input).rotate();
  const { width = 0, height = 0 } = await sharp(await image.clone().toBuffer()).metadata();
  // Icons and swatches are too small to carry any mark.
  if (Math.min(width, height) < 64) return image;
  const small = width < 400;
  const logoWidth = small
    ? Math.max(18, Math.round(Math.min(width, height) * 0.22))
    : Math.round(Math.max(110, Math.min(300, width * 0.17)));
  const logo = await sharp(await logoFile(small ? "homanet-mark-orange.png" : "homanet-horizontal-orange.png"))
    .resize({ width: logoWidth })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { height: logoHeight = 0 } = await sharp(logo).metadata();
  const padY = Math.round(logoHeight * 0.32),
    padX = Math.round(logoHeight * 0.55);
  const tagWidth = Math.min(width, logoWidth + padX * 2),
    tagHeight = Math.min(height, logoHeight + padY * 2);
  const tagLeft = Math.round((width - tagWidth) / 2);
  const tagTop = Math.max(0, height - (small ? Math.round(height * 0.06) : bottomOffset(width, height)) - tagHeight);
  return sharp(await image.toBuffer()).composite([
    { input: await label(tagWidth, tagHeight), top: tagTop, left: tagLeft },
    { input: logo, top: tagTop + Math.round((tagHeight - logoHeight) / 2), left: Math.round((width - logoWidth) / 2) },
  ]);
}
