// Stamps the Homanet logo on site photographs, or with `--uploads` on images
// uploaded through the admin panel (new uploads are stamped automatically).
//   node --import tsx scripts/watermark-photos.ts                 site photos not yet stamped
//   node --import tsx scripts/watermark-photos.ts --uploads       uploads not yet stamped
//   node --import tsx scripts/watermark-photos.ts --uploads --restamp
//                                   re-stamp every upload from its kept original
// Site photos are recorded in public/assets/.watermarked.json so a photo never
// gets the logo twice; their originals stay in git history. Uploads keep an
// unstamped copy in <media>/originals, which is what gets stamped.
import fs from "node:fs";
import path from "node:path";
import { stampLogo } from "../src/platform/watermark";
import { mediaDirectory } from "../src/platform/media";

const uploads = process.argv.includes("--uploads");
const restamp = process.argv.includes("--restamp");
const skipDirs = new Set(["brand", "licenses", "variants", "originals"]);

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return skipDirs.has(e.name) ? [] : walk(p);
    return /\.(jpe?g|webp)$/i.test(e.name) ? [p] : [];
  });

async function encode(file: string, source: Buffer) {
  const out = await stampLogo(source);
  return /\.webp$/i.test(file) ? out.webp({ quality: 86 }).toBuffer() : out.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

async function sitePhotos() {
  const root = "public/assets";
  const ledgerPath = path.join(root, ".watermarked.json");
  const ledger: string[] = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : [];
  let stamped = 0;
  for (const file of walk(root)) {
    const key = path.relative(root, file).split(path.sep).join("/");
    if (ledger.includes(key)) continue;
    fs.writeFileSync(file, await encode(file, fs.readFileSync(file)));
    ledger.push(key);
    stamped++;
    console.log("stamped", key);
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger.sort(), null, 2) + "\n");
  console.log(stamped, "site photo(s) stamped");
  // Next's image optimizer keeps serving resized copies of the old files.
  if (stamped) console.log("then clear the resized copies: rm -rf .next/cache/images && restart the site");
}

async function uploadedImages() {
  const root = mediaDirectory();
  if (!fs.existsSync(root)) return console.log("no uploads in", root);
  const originals = path.join(root, "originals");
  fs.mkdirSync(originals, { recursive: true, mode: 0o700 });
  // Uploads stamped by an earlier version of this script (white logo, no kept original).
  const legacyPath = path.join(root, ".watermarked.json");
  const legacy: string[] = fs.existsSync(legacyPath) ? JSON.parse(fs.readFileSync(legacyPath, "utf8")) : [];
  let stamped = 0,
    skippedLegacy = 0;
  for (const file of walk(root)) {
    const name = path.basename(file);
    const original = path.join(originals, name);
    if (fs.existsSync(original)) {
      if (!restamp) continue;
    } else if (legacy.includes(name)) {
      skippedLegacy++;
      continue;
    } else fs.copyFileSync(file, original);
    fs.writeFileSync(file, await encode(file, fs.readFileSync(original)));
    stamped++;
    console.log("stamped", name);
  }
  // Resized copies were made from the previous files.
  if (stamped) fs.rmSync(path.join(root, "variants"), { recursive: true, force: true });
  console.log(stamped, "upload(s) stamped");
  if (skippedLegacy)
    console.log(skippedLegacy, "upload(s) already carry the earlier white logo and have no clean copy; re-upload them to get the new logo");
}

(uploads ? uploadedImages() : sitePhotos()).catch((e) => {
  console.error(e);
  process.exit(1);
});
