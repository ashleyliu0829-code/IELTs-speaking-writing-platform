#!/usr/bin/env node
//
// Mirrors the recordings bucket onto this machine's disk.
//
//   node scripts/backup-recordings.mjs [--dest DIR] [--dry-run] [--verify]
//
// Supabase holds the only copy of every student recording, and the free plan
// takes no backups at all. This pulls each object down once and leaves it
// there, so a deleted bucket or a closed project is recoverable.
//
// Incremental: an object is downloaded only when it is new, or when its size or
// updated_at no longer matches what was fetched last time. State lives in
// manifest.json beside the files, so losing it costs a re-download, not data.
//
// It never deletes. A recording removed upstream stays in the backup, which is
// the point — accidental deletion is the case this exists for. --verify also
// re-hashes local files rather than trusting the manifest.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    })
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verify = args.includes("--verify");
const destArg = args.indexOf("--dest");
const dest = resolve(
  destArg !== -1 && args[destArg + 1]
    ? args[destArg + 1]
    : env.BACKUP_DIR || join(homedir(), "backups", "recordings")
);

const bucket = env.SUPABASE_RECORDINGS_BUCKET || "speaking-recordings";
const manifestPath = join(dest, "manifest.json");
const concurrency = 4;

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
}

// Storage is reached over plain HTTP rather than through supabase-js: the
// client library builds a realtime connection on construction, which needs a
// native WebSocket and so refuses to start on the Node 20 the server runs.
// Listing and downloading are two REST calls; the dependency bought nothing.
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL.endsWith("/")
  ? env.NEXT_PUBLIC_SUPABASE_URL.slice(0, -1)
  : env.NEXT_PUBLIC_SUPABASE_URL;
const storageUrl = `${projectUrl}/storage/v1`;
const authHeaders = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
};

const startedAt = Date.now();
log(`Backing up ${bucket} -> ${dest}${dryRun ? " (dry run)" : ""}`);

const manifest = await loadManifest();
const objects = await listBucket();
log(`Bucket holds ${objects.length} objects, ${mb(objects.reduce((sum, o) => sum + o.size, 0))}`);

// Runs before the fetch, so one --verify pass both finds the damage and
// repairs it: a file dropped here is simply missing from the manifest when
// the loop below decides what to pull.
if (verify) await verifyLocalCopies(objects);

const pending = [];
let unchanged = 0;
for (const object of objects) {
  if (await isCurrent(object)) unchanged += 1;
  else pending.push(object);
}

log(`${unchanged} already backed up, ${pending.length} to fetch`);

if (dryRun) {
  for (const object of pending.slice(0, 20)) log(`  would fetch ${object.path} (${mb(object.size)})`);
  if (pending.length > 20) log(`  ... and ${pending.length - 20} more`);
  finish(0, 0, []);
}

let downloaded = 0;
let bytes = 0;
const failures = [];

// Downloads run a few at a time: the bucket is happy to serve more, but the
// connection pool is shared with the running app on this same host.
const queue = [...pending];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let object = queue.shift(); object; object = queue.shift()) {
      try {
        const size = await download(object);
        downloaded += 1;
        bytes += size;
      } catch (error) {
        failures.push({ path: object.path, error: error.message });
        console.error(`  failed ${object.path}: ${error.message}`);
      }
    }
  })
);

manifest.lastRunAt = new Date().toISOString();
manifest.bucket = bucket;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

finish(downloaded, bytes, failures);

// ---------------------------------------------------------------------------

/**
 * Whether the local copy can be trusted without fetching it again.
 *
 * The size on disk is checked, not just the file's existence: a run killed
 * mid-write, or a disk that filled up, leaves a short file that would
 * otherwise be skipped forever. Content is only re-hashed under --verify,
 * which is too slow for every nightly run.
 */
async function isCurrent(object) {
  const known = manifest.files[object.path];
  if (!known || known.size !== object.size || known.updatedAt !== object.updatedAt) return false;

  try {
    const local = await stat(join(dest, object.path));
    return local.size === object.size;
  } catch {
    return false;
  }
}

/** Every object in the bucket, walking the folder tree the API exposes. */
async function listBucket() {
  const objects = [];
  const seen = new Set();

  async function walk(prefix) {
    let offset = 0;
    for (;;) {
      const response = await fetch(`${storageUrl}/object/list/${encodeURIComponent(bucket)}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" }
        })
      });

      if (!response.ok) {
        fail(`Listing ${prefix || "/"} failed: HTTP ${response.status} ${await response.text()}`);
      }

      const data = await response.json();
      if (!Array.isArray(data) || !data.length) return;

      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        // A row with no id is a folder placeholder, not an object.
        if (item.id === null) {
          if (!seen.has(path)) {
            seen.add(path);
            await walk(path);
          }
          continue;
        }
        objects.push({
          path,
          size: item.metadata?.size ?? 0,
          updatedAt: item.updated_at || item.created_at || ""
        });
      }

      if (data.length < 100) return;
      offset += 100;
    }
  }

  await walk("");
  return objects;
}

/** Downloads one object to a temp file, then renames it into place. */
async function download(object) {
  // Each segment is encoded, but the slashes stay: they are the folder
  // separators the API expects, not part of a name.
  const encoded = object.path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${storageUrl}/object/${encodeURIComponent(bucket)}/${encoded}`, {
    headers: authHeaders
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());

  // A truncated body would otherwise be written and trusted for good.
  if (object.size && buffer.length !== object.size) {
    throw new Error(`expected ${object.size} bytes, received ${buffer.length}`);
  }
  const target = join(dest, object.path);
  await mkdir(dirname(target), { recursive: true });

  // Written aside and renamed, so a run killed mid-download never leaves a
  // truncated file that the next run would accept as complete.
  const temp = `${target}.part`;
  await writeFile(temp, buffer);
  await rename(temp, target);

  manifest.files[object.path] = {
    size: object.size,
    updatedAt: object.updatedAt,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    fetchedAt: new Date().toISOString()
  };

  return buffer.length;
}

/** Re-hashes what is on disk, in case the copy rotted after it was written. */
async function verifyLocalCopies(objects) {
  log("Verifying local copies");
  let checked = 0;
  let bad = 0;

  for (const object of objects) {
    const record = manifest.files[object.path];
    if (!record?.sha256) continue;
    const local = join(dest, object.path);
    if (!existsSync(local)) {
      console.error(`  missing ${object.path}`);
      bad += 1;
      continue;
    }
    const hash = createHash("sha256").update(await readFile(local)).digest("hex");
    checked += 1;
    if (hash !== record.sha256) {
      console.error(`  corrupt ${object.path}`);
      delete manifest.files[object.path];
      bad += 1;
    }
  }

  log(`Verified ${checked} files, ${bad} problem${bad === 1 ? "" : "s"}`);
  if (bad) log(`Re-fetching ${bad} damaged file${bad === 1 ? "" : "s"} in this run`);
}

async function loadManifest() {
  if (!existsSync(manifestPath)) {
    await mkdir(dest, { recursive: true });
    return { bucket, lastRunAt: null, files: {} };
  }
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    // A manifest from a different bucket describes files that are not these.
    if (parsed.bucket && parsed.bucket !== bucket) {
      fail(`${manifestPath} was written for bucket "${parsed.bucket}", not "${bucket}"`);
    }
    return { bucket, lastRunAt: parsed.lastRunAt || null, files: parsed.files || {} };
  } catch (error) {
    fail(`Could not read ${manifestPath}: ${error.message}`);
  }
}

function finish(downloaded, bytes, failures) {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`Fetched ${downloaded} file${downloaded === 1 ? "" : "s"}, ${mb(bytes)} in ${seconds}s`);

  if (failures.length) {
    console.error(`${failures.length} file${failures.length === 1 ? "" : "s"} failed; they will be retried next run`);
    process.exit(1);
  }

  log("Backup complete");
  process.exit(0);
}

function mb(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}
