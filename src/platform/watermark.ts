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

/** The brand seal: a slim frosted-glass capsule — the photo beneath it
 * blurred and gently darkened, edged with a fine light hairline — carrying the
 * two-colour logo (orange bird, white wordmark). It reads on bright sky, dark
 * stone and warm leather alike without covering the photo with a flat block. */
async function glass(photo: Buffer, left: number, top: number, width: number, height: number) {
  const r = height / 2;
  const shape = (fill: string, extra = "") =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${r}" ry="${r}" fill="${fill}" ${extra}/></svg>`,
    );
  const frosted = await sharp(photo)
    .extract({ left, top, width, height })
    .blur(Math.max(4, height / 3))
    .modulate({ brightness: 0.62, saturation: 0.85 })
    .composite([{ input: shape("#fff"), blend: "dest-in" }])
    .png()
    .toBuffer();
  const sheen = shape(
    "url(#g)",
    "",
  ).toString().replace(
    "<rect",
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.03"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs><rect`,
  );
  const edge = shape("none", `stroke="#ffffff" stroke-opacity="0.42" stroke-width="${Math.max(1, height / 40)}"`);
  return [
    { input: frosted, left, top },
    { input: Buffer.from(sheen), left, top },
    { input: edge, left, top },
  ];
}

export async function stampLogo(input: Buffer): Promise<Sharp> {
  const photo = await sharp(input).rotate().toBuffer();
  const { width = 0, height = 0 } = await sharp(photo).metadata();
  // Icons and swatches are too small to carry any mark.
  if (Math.min(width, height) < 64) return sharp(photo);
  const small = width < 400;
  const logoWidth = small
    ? Math.max(16, Math.round(Math.min(width, height) * 0.16))
    : Math.round(Math.max(96, Math.min(240, width * 0.13)));
  const logo = await sharp(await logoFile(small ? "homanet-mark-orange.png" : "homanet-horizontal-duo.png"))
    .resize({ width: logoWidth })
    .png()
    .toBuffer();
  const { height: logoHeight = 0 } = await sharp(logo).metadata();
  const padY = Math.round(logoHeight * (small ? 0.35 : 0.42)),
    padX = small ? padY : Math.round(logoHeight * 0.75);
  const tagWidth = Math.min(width, logoWidth + padX * 2),
    tagHeight = Math.min(height, logoHeight + padY * 2);
  const tagLeft = Math.round((width - tagWidth) / 2);
  const tagTop = Math.max(0, height - (small ? Math.round(height * 0.06) : bottomOffset(width, height)) - tagHeight);
  return sharp(photo).composite([
    ...(await glass(photo, tagLeft, tagTop, tagWidth, tagHeight)),
    { input: logo, top: tagTop + Math.round((tagHeight - logoHeight) / 2), left: tagLeft + Math.round((tagWidth - logoWidth) / 2) },
  ]);
}
