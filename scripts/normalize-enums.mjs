#!/usr/bin/env node
/**
 * Make select values canonical lowercase snake_case.
 *
 * The problem this fixes is real but narrow. Of 30 select fields on the schema,
 * 25 are already canonical. Three are not, and fixing them now is far cheaper
 * than after they spread into forms, filters, reports, and retrieval metadata —
 * a query for `status = "superseded"` silently misses `"Superseded"`.
 *
 *   drawings.discipline  Architectural, Fire Protection, …  (capitals + spaces)
 *   projects.status      "on hold"                          (space)
 *   tasks.status         "in progress", "in review"         (spaces)
 *
 * TWO FIELDS ARE DELIBERATELY LEFT ALONE. A blanket `toLowerCase()` would
 * corrupt them:
 *
 *   change_orders.type      PCO, CO, CCD, ASI    industry acronyms
 *   projects.contract_type  A101, A102, A133     AIA form numbers
 *
 * `a101` is not a normalised A101; it is wrong. Canonical means one consistent
 * representation, not lowercase for its own sake — these already have exactly
 * one correct spelling, and it is the one in use.
 *
 * Display capitalisation belongs in a label map (src/lib/enum-labels.ts), never
 * in the stored value.
 *
 * Runs in three phases so no record is ever invalid against its own field:
 *   1. widen  — options become old ∪ new
 *   2. migrate — records rewritten to the new value
 *   3. narrow — options become new only
 *
 * Dry run by default. Pass --apply.
 */
import fs from "node:fs";
import path from "node:path";
import PocketBase from "pocketbase";

const APPLY = process.argv.includes("--apply");

/** old value -> new value, per collection.field. Only what actually changes. */
const RENAMES = {
  "drawings.discipline": {
    Architectural: "architectural",
    Structural: "structural",
    Mechanical: "mechanical",
    Electrical: "electrical",
    Plumbing: "plumbing",
    "Fire Protection": "fire_protection",
    Civil: "civil",
    Landscape: "landscape",
    Other: "other",
  },
  "projects.status": { "on hold": "on_hold" },
  "tasks.status": { "in progress": "in_progress", "in review": "in_review" },
};

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
const pb = new PocketBase(env.NEXT_PUBLIC_PB_URL);
await pb.collection("_superusers").authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASS);

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);

const plan = [];
for (const [key, map] of Object.entries(RENAMES)) {
  const [colName, fieldName] = key.split(".");
  const col = await pb.collections.getOne(colName);
  const field = col.fields.find((f) => f.name === fieldName);
  if (!field) throw new Error(`${key} not found`);

  const rows = await pb.collection(colName).getFullList({ fields: `id,${fieldName}` });
  const affected = rows.filter((r) => Object.hasOwn(map, r[fieldName]));

  console.log(`${key}`);
  console.log(`  values : ${JSON.stringify(field.values)}`);
  // The full option list with renames applied — NOT just the renamed values.
  // Taking Object.values(map) here would delete every option the map does not
  // mention, which for projects.status is six of seven.
  const newValues = field.values.map((v) => map[v] ?? v);
  console.log(`  becomes: ${JSON.stringify(newValues)}`);
  console.log(`  records to rewrite: ${affected.length} of ${rows.length}\n`);
  plan.push({ col, field, fieldName, colName, map, affected, newValues });
}

console.log("Untouched on purpose: change_orders.type (PCO/CO/CCD/ASI),");
console.log("projects.contract_type (A101/A102/A103/A133) — acronyms and AIA form numbers.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join("scripts", `enum-backup-${stamp}.json`);
fs.writeFileSync(
  backup,
  JSON.stringify(
    plan.map((p) => ({
      field: `${p.colName}.${p.fieldName}`,
      values: p.field.values,
      records: p.affected.map((r) => ({ id: r.id, value: r[p.fieldName] })),
    })),
    null,
    2,
  ),
);
console.log(`Backed up to ${backup}\n`);

for (const p of plan) {
  const oldValues = p.field.values;
  const newValues = p.newValues;

  // 1. widen — both spellings valid, so no record is momentarily invalid.
  const widened = [...new Set([...oldValues, ...newValues])];
  await pb.collections.update(p.col.id, {
    fields: p.col.fields.map((f) => (f.name === p.fieldName ? { ...f, values: widened } : f)),
  });

  // 2. migrate
  for (const rec of p.affected) {
    await pb.collection(p.colName).update(rec.id, { [p.fieldName]: p.map[rec[p.fieldName]] });
  }

  // 3. narrow — re-read first, the collection changed under us in step 1.
  const fresh = await pb.collections.getOne(p.colName);
  await pb.collections.update(fresh.id, {
    fields: fresh.fields.map((f) => (f.name === p.fieldName ? { ...f, values: newValues } : f)),
  });

  console.log(`  ${p.colName}.${p.fieldName}: ${p.affected.length} record(s) rewritten`);
}

console.log("\nVerifying:");
for (const p of plan) {
  const col = await pb.collections.getOne(p.colName);
  const field = col.fields.find((f) => f.name === p.fieldName);
  const rows = await pb.collection(p.colName).getFullList({ fields: `id,${p.fieldName}` });
  const stale = rows.filter((r) => r[p.fieldName] && !field.values.includes(r[p.fieldName]));
  console.log(`  ${stale.length === 0 ? "OK  " : "FAIL"} ${p.colName}.${p.fieldName} -> ${JSON.stringify(field.values)}`);
  if (stale.length) console.log(`       ${stale.length} record(s) hold a value not in the option list`);
}
console.log("\nRe-run `npm run generate:types` to update src/types/enums.ts.");
