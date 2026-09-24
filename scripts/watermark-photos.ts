// Stamps the Homanet logo on every site photograph, and with `--uploads` on
// images already uploaded through the admin panel (new uploads are stamped
// automatically). Stamped files are recorded in a ledger next to them, so a
// file never gets the logo twice. Originals of site photos stay in git history.
//   node --import tsx scripts/watermark-photos.ts [--uploads]
import fs from "node:fs";
import path from "node:path";
import { stampLogo } from "../src/platform/watermark";
import { mediaDirectory } from "../src/platform/media";

const uploads = process.argv.includes("--uploads");
const root = uploads ? mediaDirectory() : "public/assets";
const ledgerPath = path.join(root, ".watermarked.json");
const skipDirs = new Set(["brand", "licenses", "variants"]);

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return skipDirs.has(e.name) ? [] : walk(p);
    return /\.(jpe?g|webp)$/i.test(e.name) ? [p] : [];
  });

async function main() {
  if (!fs.existsSync(root)) {
    console.log("nothing to stamp in", root);
    return;
  }
  const ledger: string[] = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : [];
  let stamped = 0;
  for (const file of walk(root)) {
    const key = path.relative(root, file).split(path.sep).join("/");
    if (ledger.includes(key)) continue;
    const out = await stampLogo(fs.readFileSync(file));
    const bytes = /\.webp$/i.test(file)
      ? await out.webp({ quality: 86 }).toBuffer()
      : await out.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    fs.writeFileSync(file, bytes);
    ledger.push(key);
    stamped++;
    console.log("stamped", key);
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger.sort(), null, 2) + "\n");
  // Resized copies of uploads were made from the unstamped files.
  if (uploads && stamped) fs.rmSync(path.join(root, "variants"), { recursive: true, force: true });
  console.log(stamped, "file(s) stamped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
