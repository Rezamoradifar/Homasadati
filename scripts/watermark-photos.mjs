// Stamps the Homanet logo at the bottom of every site photograph.
// Run once per new photo: `node scripts/watermark-photos.mjs`. Files already
// stamped are listed in public/assets/.watermarked.json and skipped, so the
// logo is never applied twice. Originals stay in git history.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = "public/assets";
const ledgerPath = path.join(root, ".watermarked.json");
const logoPath = path.join(root, "brand/homanet-horizontal-white.png");
const skipDirs = new Set(["brand", "licenses"]);
const minWidth = 400; // thumbnails are too small to carry a logo

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return skipDirs.has(e.name) ? [] : walk(p);
    return /\.(jpe?g|webp)$/i.test(e.name) ? [p] : [];
  });

const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : [];

/** Pages crop photos with object-fit: cover (landscape down to 2:1, portrait
 * down to 4:3), so the logo sits just above what a crop removes. */
function bottomOffset(width, height) {
  const narrowest = width >= height ? 2 : 4 / 3;
  const cropped = Math.max(0, (height - width / narrowest) / 2);
  return Math.round(cropped + height * 0.05);
}

for (const file of walk(root)) {
  const key = path.relative(root, file).split(path.sep).join("/");
  if (ledger.includes(key)) continue;
  const { width, height } = await sharp(file).metadata();
  if (width < minWidth) continue;

  const logoWidth = Math.round(Math.max(110, Math.min(300, width * 0.17)));
  const logo = await sharp(logoPath).resize({ width: logoWidth }).ensureAlpha(0.9).png().toBuffer();
  const { height: logoHeight } = await sharp(logo).metadata();
  // Soft dark halo so the white logo reads on bright skies and stone.
  const pad = Math.round(logoHeight * 0.6);
  const halo = await sharp({
    create: { width: logoWidth + pad * 2, height: logoHeight + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await sharp(logo).tint("#000000").linear(0.55, 0).png().toBuffer(), top: pad, left: pad }])
    .blur(Math.max(4, pad / 2.5))
    .png()
    .toBuffer();

  const left = Math.round((width - logoWidth) / 2);
  const top = height - bottomOffset(width, height) - logoHeight;
  const format = /\.webp$/i.test(file) ? { id: "webp", opts: { quality: 86 } } : { id: "jpeg", opts: { quality: 86, mozjpeg: true } };
  const out = await sharp(file)
    .composite([
      { input: halo, top: top - pad, left: left - pad, blend: "over" },
      { input: logo, top, left },
    ])
    .toFormat(format.id, format.opts)
    .toBuffer();
  fs.writeFileSync(file, out);
  ledger.push(key);
  console.log("stamped", key);
}

fs.writeFileSync(ledgerPath, JSON.stringify(ledger.sort(), null, 2) + "\n");
