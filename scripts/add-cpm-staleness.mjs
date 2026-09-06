#!/usr/bin/env node
/**
 * Add `cpm_inputs_hash` and `cpm_computed_at` to `projects`.
 *
 * The persisted CPM columns on `schedule_items` are a cache; this is what lets
 * them say whether they are fresh. A hash of everything the computation
 * consumed, compared against the current inputs, is one comparison that can
 * fail - as against a timestamp convention someone has to remember to touch.
 * See src/lib/schedule/inputs-hash.ts.
 *
 * On `projects` rather than `schedule_items` because the analysis is a single
 * run over the whole network: a per-activity hash would be N copies of one
 * fact, and they could disagree.
 *
 * NOT owner-only. Unlike work_days and holidays, these say nothing about how
 * the schedule should be calculated - they record that a calculation happened.
 * Any member who can run the analysis can write them.
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

const projects = await pb.collections.getOne("projects");
const have = new Set(projects.fields.map((f) => f.name));

const FIELDS = [
  { name: "cpm_inputs_hash", type: "text", required: false, max: 64 },
  { name: "cpm_computed_at", type: "text", required: false, max: 32 },
];
const missing = FIELDS.filter((f) => !have.has(f.name));

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log(`projects - fields to add: ${missing.length ? missing.map((f) => f.name).join(", ") : "none"}`);
console.log("\n  updateRule is unchanged: these record that a calculation ran,");
console.log("  not how the schedule should be calculated.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}
if (missing.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

await pb.collections.update(projects.id, { fields: [...projects.fields, ...missing] });
const after = await pb.collections.getOne("projects");
console.log("Applied.");
console.log(`  ${after.fields.filter((f) => FIELDS.some((c) => c.name === f.name)).map((f) => f.name).join(", ")}`);
console.log(`  updateRule: ${after.updateRule}`);
