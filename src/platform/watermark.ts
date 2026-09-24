import { join } from "node:path";
import sharp, { type Sharp } from "sharp";

/** Brand stamp shared by the site-photo script and the upload pipeline: the
 * white Homanet logo, bottom-centre, over a soft dark halo so it reads on
 * bright skies and stone. Images too small for the wordmark get the bird. */
const brandDirectory = () => join(process.cwd(), "public/assets/brand");
const logos = new Map<string, Promise<Buffer>>();
const logoFile = (name: string) => {
  if (!logos.has(name)) logos.set(name, sharp(join(brandDirectory(), name)).toBuffer());
  return logos.get(name)!;
};

/** Pages crop photos with object-fit: cover (landscape down to 2:1, portrait
 * down to 4:3), so the logo sits just above what a crop removes. */
function bottomOffset(width: number, height: number) {
  const narrowest = width >= height ? 2 : 4 / 3;
  const cropped = Math.max(0, (height - width / narrowest) / 2);
  return Math.round(cropped + height * 0.05);
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
  const logo = await sharp(await logoFile(small ? "homanet-mark-white.png" : "homanet-horizontal-white.png"))
    .resize({ width: logoWidth })
    .ensureAlpha(0.9)
    .png()
    .toBuffer();
  const { height: logoHeight = 0 } = await sharp(logo).metadata();
  const pad = Math.round(logoHeight * 0.6);
  const halo = await sharp({
    create: { width: logoWidth + pad * 2, height: logoHeight + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await sharp(logo).tint("#000000").linear(0.55, 0).png().toBuffer(), top: pad, left: pad }])
    .blur(Math.max(2, pad / 2.5))
    .png()
    .toBuffer();
  const left = Math.round((width - logoWidth) / 2);
  const top = Math.max(0, height - (small ? Math.round(height * 0.08) : bottomOffset(width, height)) - logoHeight);
  // The halo may reach past the edges on tiny images; clip it to the canvas.
  const haloTop = top - pad,
    haloLeft = left - pad;
  const clipped = await sharp(halo)
    .extract({
      left: Math.max(0, -haloLeft),
      top: Math.max(0, -haloTop),
      width: Math.min(logoWidth + pad * 2 - Math.max(0, -haloLeft), width - Math.max(0, haloLeft)),
      height: Math.min(logoHeight + pad * 2 - Math.max(0, -haloTop), height - Math.max(0, haloTop)),
    })
    .toBuffer();
  return sharp(await image.toBuffer()).composite([
    { input: clipped, top: Math.max(0, haloTop), left: Math.max(0, haloLeft) },
    { input: logo, top, left },
  ]);
}
