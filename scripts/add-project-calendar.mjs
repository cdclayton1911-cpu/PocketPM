#!/usr/bin/env node
/**
 * Add the project working calendar: `work_days` and `holidays` on `projects`.
 *
 * ## Why these fields, in this shape
 *
 * `work_days` is an array of integers 0-6 with Sunday = 0, matching
 * `Date.getUTCDay()`. Not a bitmask — unreadable in the PocketBase admin UI,
 * which is the only editor for some things on this instance — and not seven
 * booleans, which permit a record with a weekday missing entirely so every
 * reader needs its own default.
 *
 * ## Owner-only, via :isset
 *
 * projects.updateRule lets any MEMBER update the record. Left alone, that would
 * let any member change the calendar and thereby shift every computed date,
 * float value, and critical-path determination on the job — a much wider write
 * surface than workflow templates, which are already owner-only.
 *
 * So the rule keeps members' existing ability to edit a project, minus these
 * two fields, using the same `:isset` technique as workflow_instances and
 * workflow_templates. A separate collection was considered and rejected: one
 * calendar per project means there is nothing for a second collection to hold.
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

const CALENDAR_FIELDS = [
  // 64KB is far more than a work-week array or a decade of holidays needs, and
  // small enough that a runaway client cannot fill the row.
  { name: "work_days", type: "json", required: false, maxSize: 65536 },
  { name: "holidays", type: "json", required: false, maxSize: 65536 },
];

const UPDATE_RULE =
  '@request.auth.id != "" && (' +
  "owner = @request.auth.id" +
  " || (members.id ?= @request.auth.id" +
  ' && @request.body.work_days:isset = false' +
  ' && @request.body.holidays:isset = false)' +
  ")";

const missing = CALENDAR_FIELDS.filter((f) => !have.has(f.name));

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log(`fields to add: ${missing.length ? missing.map((f) => f.name).join(", ") : "none"}`);
console.log(`\nprojects.updateRule\n  from: ${projects.updateRule}\n  to:   ${UPDATE_RULE}`);
console.log("\n  Members keep every other edit they have today; only the two");
console.log("  calendar fields become owner-only.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

await pb.collections.update(projects.id, {
  fields: [...projects.fields, ...missing],
  updateRule: UPDATE_RULE,
});

const after = await pb.collections.getOne("projects");
console.log("Applied.");
console.log(`  fields: ${after.fields.filter((f) => f.name === "work_days" || f.name === "holidays").map((f) => `${f.name}:${f.type}`).join(", ")}`);
console.log(`  updateRule: ${after.updateRule}`);
