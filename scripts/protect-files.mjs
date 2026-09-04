#!/usr/bin/env node
/**
 * Set `protected: true` on every file field.
 *
 * Why this matters more than "defence in depth": an unprotected PocketBase file
 * URL is a **bearer credential**, not an authorization check. Unguessable is not
 * the same as private. Such a URL:
 *
 *   - cannot be revoked once forwarded or accidentally disclosed,
 *   - carries no identity, so access leaves no audit trail,
 *   - does not stop working when a subcontractor relationship ends,
 *   - survives indefinitely in email, chat, browser history, exported
 *     documents, and ticket comments,
 *   - and accumulates: every link ever minted stays valid.
 *
 * `subcontractors.documents` is specified to hold audited financial statements.
 *
 * The migration profile is what makes this safe to do immediately: the app
 * already routes downloads through GET /api/files/... which mints a short-lived
 * file token per request. Flipping the fields costs no data migration, no
 * schema conversion, and no user-facing change — it only starts *enforcing*
 * what the app already sends.
 *
 * Dry run by default. Pass --apply to write. Backs up first.
 */
import fs from "node:fs";
import path from "node:path";
import PocketBase from "pocketbase";

const APPLY = process.argv.includes("--apply");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv(path.join(process.cwd(), ".env.local"));
if (!env.NEXT_PUBLIC_PB_URL || !env.PB_ADMIN_EMAIL || !env.PB_ADMIN_PASS) {
  console.error("Missing NEXT_PUBLIC_PB_URL / PB_ADMIN_EMAIL / PB_ADMIN_PASS in .env.local");
  process.exit(1);
}

const pb = new PocketBase(env.NEXT_PUBLIC_PB_URL);
await pb.collection("_superusers").authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASS);

const collections = await pb.collections.getFullList();
const targets = [];
for (const col of collections) {
  const files = (col.fields ?? []).filter((f) => f.type === "file");
  if (files.length) targets.push({ col, files });
}

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);

let toChange = 0;
for (const { col, files } of targets) {
  for (const f of files) {
    const state = f.protected === true ? "protected" : "PUBLIC";
    if (f.protected !== true) toChange += 1;
    console.log(`  ${col.name}.${f.name}  ${state}${f.protected === true ? "" : "  -> protected"}`);
  }
}
console.log(`\n${toChange} field(s) would change.`);

if (!APPLY) {
  console.log("\nNothing written. Re-run with --apply.");
  process.exit(0);
}

if (toChange === 0) {
  console.log("Already protected. Nothing to do.");
  process.exit(0);
}

// Backup before touching anything, same convention as apply-rules.mjs.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join("scripts", `file-fields-backup-${stamp}.json`);
fs.writeFileSync(
  backup,
  JSON.stringify(
    targets.map(({ col, files }) => ({
      collection: col.name,
      id: col.id,
      files: files.map((f) => ({ name: f.name, protected: f.protected === true })),
    })),
    null,
    2,
  ),
);
console.log(`\nBacked up prior state to ${backup}`);

for (const { col, files } of targets) {
  if (files.every((f) => f.protected === true)) continue;
  // Send the full field list back: a partial update would drop the others.
  const fields = (col.fields ?? []).map((f) =>
    f.type === "file" ? { ...f, protected: true } : f,
  );
  await pb.collections.update(col.id, { fields });
  console.log(`  updated ${col.name}`);
}

console.log("\nVerifying:");
let stillPublic = 0;
for (const col of await pb.collections.getFullList()) {
  for (const f of (col.fields ?? []).filter((x) => x.type === "file")) {
    const ok = f.protected === true;
    if (!ok) stillPublic += 1;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${col.name}.${f.name} protected=${f.protected === true}`);
  }
}
console.log(
  stillPublic === 0
    ? "\nAll file fields are protected. Downloads now require the token the app already sends."
    : `\n${stillPublic} field(s) still public — investigate before trusting this.`,
);
