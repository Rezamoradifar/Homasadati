import {assertAccess} from "./access";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { mkdir, readFile, writeFile, unlink, rename } from "node:fs/promises";
import { ApiError, json, sameOrigin, limit } from "../server/http";
import { userOf, audit } from "./security";
import { stampLogo } from "./watermark";
const maxBytes = 8 * 1024 * 1024;
export const mediaDirectory = () =>
  join(
    dirname(resolve(process.env.DATABASE_PATH || "./data/homay.sqlite")),
    "media",
  );
export async function media(req: Request, path: string[]) {
  if (req.method === "GET") {
    if (path.length !== 2 || !/^[a-f0-9-]{36}\.webp$/.test(path[1]))
      throw new ApiError(404, "not_found");
    let bytes: Buffer;
    try {
      bytes = await readFile(join(mediaDirectory(), path[1]));
    } catch {
      throw new ApiError(404, "not_found");
    }
    const widthParam = new URL(req.url).searchParams.get("w");
    if (widthParam) {
      const width = Number(widthParam);
      if (![320, 640, 960, 1440].includes(width))
        throw new ApiError(400, "invalid_input");
      const directory = join(mediaDirectory(), "variants"),
        file = join(directory, path[1] + "-" + width + ".webp");
      try {
        bytes = await readFile(file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        bytes = await sharp(bytes)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = file + "." + randomUUID() + ".tmp";
        try {
          await writeFile(temporary, bytes, { mode: 0o600 });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(() => {});
        }
      }
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public,max-age=31536000,immutable",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
  if (req.method !== "POST" || path.length !== 1)
    throw new ApiError(405, "invalid_input");
  sameOrigin(req);
  const user = userOf(req);
  assertAccess(user,"media",true);
  limit("upload:" + user.id, 30, 300);
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      req.headers.get("content-type") || "",
    )
  )
    throw new ApiError(415, "invalid_image");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_image");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  let image: Buffer, original: Buffer;
  try {
    const input = sharp(Buffer.concat(chunks), {
      limitInputPixels: 25_000_000,
      failOn: "warning",
    });
    const metadata = await input.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1
    )
      throw new Error("format");
    const resized = await input
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
    // Every uploaded picture carries the site logo.
    original = resized;
    image = await (await stampLogo(resized)).webp({ quality: 88 }).toBuffer();
  } catch {
    throw new ApiError(400, "invalid_image");
  }
  const file = randomUUID() + ".webp";
  await mkdir(join(mediaDirectory(), "originals"), { recursive: true, mode: 0o700 });
  // The unstamped copy is never served; it lets the logo be re-applied later.
  await writeFile(join(mediaDirectory(), "originals", file), await sharp(original).webp({ quality: 88 }).toBuffer(), {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(join(mediaDirectory(), file), image, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    audit(user.id, "media.upload", file, null, {
      bytes: image.length,
      type: "image/webp",
    });
  } catch (e) {
    await unlink(join(mediaDirectory(), file));
    await unlink(join(mediaDirectory(), "originals", file)).catch(() => {});
    throw e;
  }
  return json({ url: "/api/platform/media/" + file, bytes: image.length }, 201);
}
