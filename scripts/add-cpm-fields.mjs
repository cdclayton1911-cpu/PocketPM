#!/usr/bin/env node
/**
 * Add the CPM result fields to `schedule_items`.
 *
 * ## They sit BESIDE the imported dates, never on top of them
 *
 * `planned_start` and `planned_finish` are the mirrored values from P6 or
 * Excel and stay exactly as imported. Overwriting them would destroy the only
 * thing the computation can be checked against — and silently, which on a
 * schedule feeding a delay claim is the worst available failure. The whole
 * divergence report depends on both numbers still existing.
 *
 * ## A note on storing computed results at all
 *
 * docs/schedule-plan.md says results are "computed, not stored — a stored
 * critical path drifts the moment someone edits a duration". That reasoning
 * still holds, so these fields are a CACHE written only by an explicit
 * recalculation, and the analysis screen computes fresh on read rather than
 * displaying them. They exist so a list view or a future Gantt can show float
 * without recomputing the network for every row.
 *
 * Dry run by default. Pass --apply.
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

const fileEnv = loadEnv(path.join(process.cwd(), ".env.local"));
const env = {
  url: process.env.PB_URL || fileEnv.NEXT_PUBLIC_PB_URL,
  email: process.env.PB_EMAIL || fileEnv.PB_ADMIN_EMAIL,
  pass: process.env.PB_PASS || fileEnv.PB_ADMIN_PASS,
};
const pb = new PocketBase(env.url);
await pb.collection("_superusers").authWithPassword(env.email, env.pass);

const items = await pb.collections.getOne("schedule_items");
const have = new Set(items.fields.map((f) => f.name));

/**
 * Dates are text, matching planned_start and the rest of this collection —
 * a mixed representation would mean two date formats in one table.
 *
 * Floats are plain numbers because PocketBase has no unit type. The basis is
 * carried in the TypeScript layer (lib/schedule/units.ts) and these are always
 * WORKING days — recorded here so nobody reads them as calendar days later.
 */
const CPM_FIELDS = [
  { name: "early_start", type: "text", required: false, max: 10 },
  { name: "early_finish", type: "text", required: false, max: 10 },
  { name: "late_start", type: "text", required: false, max: 10 },
  { name: "late_finish", type: "text", required: false, max: 10 },
  { name: "total_float", type: "number", required: false, onlyInt: true },
  { name: "free_float", type: "number", required: false, onlyInt: true },
  { name: "is_critical", type: "bool", required: false },
];

const missing = CPM_FIELDS.filter((f) => !have.has(f.name));

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log(`schedule_items — fields to add: ${missing.length ? missing.map((f) => f.name).join(", ") : "none"}`);
console.log("\n  planned_start / planned_finish are NOT touched. They stay as imported.");
console.log("  Floats are WORKING days; the basis lives in lib/schedule/units.ts.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

if (missing.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

await pb.collections.update(items.id, { fields: [...items.fields, ...missing] });
const after = await pb.collections.getOne("schedule_items");
console.log("Applied.");
console.log(`  ${after.fields.filter((f) => CPM_FIELDS.some((c) => c.name === f.name)).map((f) => f.name).join(", ")}`);
console.log(`  planned_start still present: ${after.fields.some((f) => f.name === "planned_start")}`);
