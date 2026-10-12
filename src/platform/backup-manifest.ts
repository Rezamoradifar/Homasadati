import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

type Fingerprint = { bytes: number; sha256: string };
type Inventory = Record<string, Fingerprint>;

// Hash in bounded chunks so a large database does not need to fit in memory.
export function backupFingerprint(file: string): Fingerprint {
  if (!lstatSync(file).isFile()) throw Error("Backup file is not regular");
  const fd = openSync(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (!fstatSync(fd).isFile()) throw Error("Backup file is not regular");
    const hash = createHash("sha256"),
      buffer = Buffer.alloc(1024 * 1024);
    let bytes = 0,
      length: number;
    while ((length = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, length));
      bytes += length;
    }
    return { bytes, sha256: hash.digest("hex") };
  } finally {
    closeSync(fd);
  }
}

function present(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function backupInventory(root: string): Inventory {
  const inventory: Inventory = Object.create(null);
  for (const file of ["homay.sqlite", "master-key.private"])
    inventory[file] = backupFingerprint(join(root, file));
  if (present(join(root, "environment.private")))
    inventory["environment.private"] = backupFingerprint(
      join(root, "environment.private"),
    );
  function walk(relative: string) {
    const path = join(root, relative),
      info = lstatSync(path);
    if (info.isSymbolicLink()) throw Error("Backup links are not supported");
    if (info.isDirectory()) {
      for (const name of readdirSync(path).sort()) walk(relative + "/" + name);
    } else if (info.isFile()) inventory[relative] = backupFingerprint(path);
    else throw Error("Backup contains a non-regular file");
  }
  if (present(join(root, "media"))) {
    if (!lstatSync(join(root, "media")).isDirectory())
      throw Error("Invalid media directory");
    walk("media");
  }
  return inventory;
}

export function verifyBackupFiles(directory: string) {
  const root = resolve(directory);
  if (!lstatSync(root).isDirectory()) throw Error("Invalid backup directory");
  if (!lstatSync(join(root, "manifest.json")).isFile())
    throw Error("Invalid manifest file");
  const manifest = JSON.parse(
    readFileSync(join(root, "manifest.json"), "utf8"),
  );
  if (
    ![1, 2].includes(manifest.version) ||
    manifest.database !== "homay.sqlite"
  )
    throw Error("Invalid backup manifest");
  const database = join(root, "homay.sqlite");
  if (backupFingerprint(database).sha256 !== manifest.databaseSha256)
    throw Error("Backup checksum mismatch");
  // Validate fixed file names only; never read paths supplied by a manifest.
  backupFingerprint(join(root, "master-key.private"));
  const masterKey = readFileSync(
    join(root, "master-key.private"),
    "utf8",
  ).trim();
  if (!/^[a-f0-9]{64}$/i.test(masterKey)) throw Error("Invalid backup key");
  if (manifest.version === 2) {
    if (
      manifest.masterKeyCaptured !== true ||
      typeof manifest.mediaIncluded !== "boolean" ||
      typeof manifest.environmentIncluded !== "boolean" ||
      !manifest.files ||
      typeof manifest.files !== "object" ||
      Array.isArray(manifest.files)
    )
      throw Error("Invalid backup inventory");
    if (
      manifest.mediaIncluded !== present(join(root, "media")) ||
      manifest.environmentIncluded !==
        present(join(root, "environment.private"))
    )
      throw Error("Backup contents are incomplete");
    const actual = backupInventory(root),
      paths = Object.keys(actual).sort();
    if (
      JSON.stringify(paths) !==
      JSON.stringify(Object.keys(manifest.files).sort())
    )
      throw Error("Backup file list mismatch");
    for (const path of paths) {
      const expected = manifest.files[path];
      if (
        !expected ||
        expected.bytes !== actual[path].bytes ||
        expected.sha256 !== actual[path].sha256
      )
        throw Error("Backup file checksum mismatch");
    }
  }
  return {
    database,
    masterKey,
    version: manifest.version as 1 | 2,
    assets: manifest.version === 2 ? "verified" : "legacy-unverified",
  };
}
