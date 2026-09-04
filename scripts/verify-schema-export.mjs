#!/usr/bin/env node
/**
 * Fail when docs/pb_schema.json no longer matches the live instance.
 *
 * The snapshot became load-bearing when E2E started provisioning from it: a
 * stale export means tests pass against a schema production does not have, and
 * nothing else would notice. This is the guard.
 *
 * Compares only what provisioning actually replays — collection names, field
 * names and types, and the five API rules. Ignores ids, timestamps, and
 * per-field cosmetics, which differ harmlessly between instances and would
 * otherwise make this cry wolf.
 *
 * Needs PB_ADMIN_EMAIL / PB_ADMIN_PASS. Skips with exit 0 when they are absent,
 * so a fork or a secretless CI run is not a hard failure — but says loudly that
 * it did not run, because a silent skip is how a guard stops guarding.
 */
import fs from "node:fs";
import path from "node:path";
import PocketBase from "pocketbase";

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

const fileEnv = loadEnv(path.join(process.cwd(), ".env.local"));
const env = { ...fileEnv, ...process.env };

const URL_ = env.NEXT_PUBLIC_PB_URL;
const EMAIL = env.PB_ADMIN_EMAIL;
const PASS = env.PB_ADMIN_PASS;

if (!URL_ || !EMAIL || !PASS) {
  console.log("SKIPPED: no PocketBase admin credentials available.");
  console.log("  The schema-export check did NOT run. Set PB_ADMIN_EMAIL and");
  console.log("  PB_ADMIN_PASS to enable it.");
  process.exit(0);
}

const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

/** The shape provisioning replays — everything else is noise for this purpose. */
function normalise(collections) {
  const out = {};
  for (const c of collections) {
    out[c.name] = {
      type: c.type,
      rules: Object.fromEntries(RULES.map((r) => [r, c[r] ?? null])),
      fields: Object.fromEntries(
        (c.fields ?? [])
          .filter((f) => !f.hidden)
          .map((f) => [
            f.name,
            {
              type: f.type,
              required: Boolean(f.required),
              ...(f.type === "select" ? { values: [...(f.values ?? [])].sort() } : {}),
              ...(f.type === "file" ? { maxSelect: f.maxSelect, maxSize: f.maxSize, protected: Boolean(f.protected) } : {}),
              ...(f.type === "relation" ? { cascadeDelete: Boolean(f.cascadeDelete), maxSelect: f.maxSelect } : {}),
            },
          ]),
      ),
    };
  }
  return out;
}

const pb = new PocketBase(URL_);
await pb.collection("_superusers").authWithPassword(EMAIL, PASS);

const live = normalise(await pb.collections.getFullList());
const snapshotRaw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/pb_schema.json"), "utf8"));
const snapshot = normalise(snapshotRaw);

const problems = [];

for (const name of Object.keys(live)) {
  if (!snapshot[name]) problems.push(`collection ${name} exists live but is MISSING from the snapshot`);
}
for (const name of Object.keys(snapshot)) {
  if (!live[name]) problems.push(`collection ${name} is in the snapshot but does NOT exist live`);
}

for (const name of Object.keys(live)) {
  if (!snapshot[name]) continue;
  const a = live[name];
  const b = snapshot[name];

  for (const rule of RULES) {
    if (a.rules[rule] !== b.rules[rule]) {
      problems.push(`${name}.${rule}: live ${JSON.stringify(a.rules[rule])} != snapshot ${JSON.stringify(b.rules[rule])}`);
    }
  }
  for (const f of Object.keys(a.fields)) {
    if (!b.fields[f]) problems.push(`${name}.${f} exists live but is MISSING from the snapshot`);
  }
  for (const f of Object.keys(b.fields)) {
    if (!a.fields[f]) problems.push(`${name}.${f} is in the snapshot but does NOT exist live`);
  }
  for (const f of Object.keys(a.fields)) {
    if (!b.fields[f]) continue;
    const x = JSON.stringify(a.fields[f]);
    const y = JSON.stringify(b.fields[f]);
    if (x !== y) problems.push(`${name}.${f} differs:\n      live     ${x}\n      snapshot ${y}`);
  }
}

console.log(`PocketBase: ${URL_}`);
console.log(`Collections: ${Object.keys(live).length} live, ${Object.keys(snapshot).length} in snapshot\n`);

if (problems.length === 0) {
  console.log("docs/pb_schema.json matches the live instance.");
  process.exit(0);
}

console.error(`${problems.length} difference(s):\n`);
for (const p of problems) console.error(`  - ${p}`);
console.error("\nRegenerate the snapshot in the same commit as the schema change:");
console.error("  node -e \"...collections.getFullList()...\" > docs/pb_schema.json && npm run generate:types");
process.exit(1);
