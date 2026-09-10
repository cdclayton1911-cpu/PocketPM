#!/usr/bin/env node
/**
 * Schedule schema v2: dates that say where they came from, activity types,
 * constraints, remaining duration, and a per-import record.
 *
 * Driven by the first real P6 export (docs/STATUS.md). Done while
 * schedule_items holds zero records, which the script CHECKS rather than
 * assumes — the last time "zero records" was stated, there were 38.
 *
 * ## Three date sets, named for their source
 *
 *   target_*        the plan dates in the source file (renamed from planned_*,
 *                   which could mean target OR early and was exactly the
 *                   ambiguity this removes)
 *   source_early_*  the early dates the SOURCE scheduler calculated — what the
 *                   divergence report compares against
 *   cpm_*           what OUR CPM calculated (renamed from early_* / late_*)
 *
 * ## activity_type replaces is_milestone
 *
 * task | start_milestone | finish_milestone | level_of_effort — one-to-one with
 * P6's task_type. A boolean could not say which end a milestone marks, and a
 * separate LOE flag could hold an impossible "LOE finish milestone".
 *
 * ## schedule_imports
 *
 * One row per import: data date, the calendar the activities used, warnings.
 * The calendar lives HERE, not on the project, because the project calendar is
 * owner-only — an import run by a member could not write it, and one run by the
 * owner would silently overwrite a calendar they maintain. Precedence for CPM:
 * the latest import's calendar, then the project's.
 *
 * Import records are history: update and delete are null.
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

const all = await pb.collections.getFullList();
const byName = Object.fromEntries(all.map((c) => [c.name, c]));
const items = byName.schedule_items;

for (const name of ["schedule_items", "schedule_relationships"]) {
  const n = (await pb.collection(name).getList(1, 1)).totalItems;
  if (n > 0) {
    console.error(`Refusing to run: ${name} holds ${n} record(s). Renames would reinterpret them.`);
    process.exit(1);
  }
}

const RENAMES = {
  planned_start: "target_start",
  planned_finish: "target_finish",
  early_start: "cpm_early_start",
  early_finish: "cpm_early_finish",
  late_start: "cpm_late_start",
  late_finish: "cpm_late_finish",
};

const CONSTRAINTS = [
  "start_on", "start_on_or_after", "start_on_or_before",
  "finish_on", "finish_on_or_after", "finish_on_or_before",
  "mandatory_start", "mandatory_finish", "as_late_as_possible",
];

const alreadyDone = items.fields.some((f) => f.name === "activity_type");

const nextFields = items.fields
  .filter((f) => f.name !== "is_milestone")
  // Renaming keeps each field's id, which is how PocketBase renames a column
  // rather than dropping and re-adding it.
  .map((f) => (RENAMES[f.name] ? { ...f, name: RENAMES[f.name] } : f))
  .concat(
    alreadyDone
      ? []
      : [
          { name: "source_early_start", type: "text", required: false, max: 10 },
          { name: "source_early_finish", type: "text", required: false, max: 10 },
          { name: "activity_type", type: "select", required: false, maxSelect: 1,
            values: ["task", "start_milestone", "finish_milestone", "level_of_effort"] },
          { name: "remaining_duration_days", type: "number", required: false, min: 0 },
          { name: "constraint_type", type: "select", required: false, maxSelect: 1, values: CONSTRAINTS },
          { name: "constraint_date", type: "text", required: false, max: 10 },
        ],
  );

const nextIndexes = items.indexes.map((idx) =>
  Object.entries(RENAMES).reduce((s, [from, to]) => s.replace(new RegExp(`\\b${from}\\b`, "g"), to), idx),
);

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

const imports = {
  name: "schedule_imports",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && imported_by = @request.auth.id`,
  // History. What was imported, when, and on which calendar is evidence the
  // schedule's dates depend on; it is not edited after the fact.
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "imported_by", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "source_format", type: "select", required: true, maxSelect: 1, values: ["csv", "xer"] },
    /** Null for CSV: a spreadsheet has none, and upload time is not one. */
    { name: "data_date", type: "text", required: false, max: 10 },
    { name: "calendar_name", type: "text", required: false, max: 200 },
    { name: "hours_per_day", type: "number", required: false, min: 0 },
    { name: "work_days", type: "json", required: false, maxSize: 2000 },
    { name: "holidays", type: "json", required: false, maxSize: 200000 },
    /** Per-calendar activity counts when activities use more than one. */
    { name: "calendar_warnings", type: "json", required: false, maxSize: 20000 },
    { name: "activity_count", type: "number", required: false, min: 0, onlyInt: true },
    { name: "relationship_count", type: "number", required: false, min: 0, onlyInt: true },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: ["CREATE INDEX idx_sched_import_project ON schedule_imports (project, created)"],
};

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("schedule_items");
for (const [from, to] of Object.entries(RENAMES)) console.log(`  rename ${from} -> ${to}`);
console.log("  drop   is_milestone  (replaced by activity_type)");
if (!alreadyDone) {
  console.log("  add    source_early_start, source_early_finish, activity_type,");
  console.log("         remaining_duration_days, constraint_type, constraint_date");
}
const changedIdx = nextIndexes.filter((x, i) => x !== items.indexes[i]);
console.log(`  indexes rewritten: ${changedIdx.length}`);
console.log(`\nschedule_imports: ${byName.schedule_imports ? "already exists" : "create"}`);
console.log(`  update/delete: null (history)\n`);

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

await pb.collections.update(items.id, { fields: nextFields, indexes: nextIndexes });
if (!byName.schedule_imports) await pb.collections.create(imports);

const after = await pb.collections.getOne("schedule_items");
const names = after.fields.map((f) => f.name);
const missing = [...Object.values(RENAMES), "activity_type", "source_early_start", "remaining_duration_days", "constraint_type"]
  .filter((n) => !names.includes(n));
const lingering = [...Object.keys(RENAMES), "is_milestone"].filter((n) => names.includes(n));
if (missing.length || lingering.length) {
  // A 200 is not evidence the schema changed — read it back.
  console.error(`FAILED: missing ${missing.join(", ") || "none"}; still present ${lingering.join(", ") || "none"}`);
  process.exit(1);
}
await pb.collections.getOne("schedule_imports");
console.log("Applied and verified.");
console.log(`  schedule_items: ${names.length} fields`);
