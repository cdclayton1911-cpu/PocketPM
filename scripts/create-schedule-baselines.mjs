#!/usr/bin/env node
/**
 * Create `schedule_baselines` and `schedule_baseline_items`.
 *
 * Variance reporting needs two schedules: what was planned, and what is
 * happening. `schedule_items` is the second one — a mirror of the current P6 or
 * MSP file, replaced wholesale on each import. A baseline is the first.
 *
 * ## Why baseline items key on activity_id, not a relation
 *
 * The decisive constraint: **a baseline must outlive the schedule it was taken
 * from.** Schedules here are mirrored, so a re-import deletes and recreates
 * `schedule_items`. A relation from a baseline row to an activity would either
 * cascade-delete the baseline on the next import, or leave a dangling id — and
 * losing the as-planned schedule is losing the only thing a delay claim is
 * argued against.
 *
 * So a baseline row stores `activity_id`, the P6 activity code, as a business
 * key. Variance is computed by joining on it. The cost is no referential
 * integrity: an activity renamed or renumbered between imports will not match,
 * and that shows up as an unmatched row rather than a silent wrong number —
 * which is why the reporting layer must surface unmatched activities rather
 * than dropping them.
 *
 * ## Multiple baselines
 *
 * Construction contracts reference a specific schedule: the original as-planned,
 * and often approved rebaselines after that. One `is_default` per project is
 * what variance compares against unless told otherwise; the others stay
 * queryable, because an argument about delay usually needs more than one.
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

const env = loadEnv(path.join(process.cwd(), ".env.local"));
const pb = new PocketBase(env.NEXT_PUBLIC_PB_URL);
await pb.collection("_superusers").authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASS);

const all = await pb.collections.getFullList();
const byName = Object.fromEntries(all.map((c) => [c.name, c]));

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

const baselines = {
  name: "schedule_baselines",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: SCOPE,
  updateRule: SCOPE,
  // Deleting a baseline destroys the as-planned record. Left deletable, but
  // the UI should make it deliberate; there is no undo.
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "name", type: "text", required: true, max: 200 },
    { name: "taken_at", type: "text", required: false, max: 10 },
    /** Which import produced it — provenance for an argument years later. */
    { name: "source_file", type: "text", required: false, max: 255 },
    { name: "is_default", type: "bool", required: false },
    { name: "notes", type: "text", required: false, max: 4000 },
    { name: "created_by", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    // At most one default per project — variance needs one answer to "compared
    // against what?" unless a comparison names another explicitly.
    "CREATE UNIQUE INDEX idx_baseline_default ON schedule_baselines (project) WHERE is_default = true",
    "CREATE INDEX idx_baseline_project ON schedule_baselines (project)",
  ],
};

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log(`schedule_baselines      : ${byName.schedule_baselines ? "exists" : "will be created"}`);
console.log(`schedule_baseline_items : ${byName.schedule_baseline_items ? "exists" : "will be created"}`);
const itemCount = await pb.collection("schedule_items").getList(1, 1);
console.log(`\nschedule_items holds ${itemCount.totalItems} record(s) — adding baselines now is additive either way,`);
console.log("but deciding the shape before imports exist is the point.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

const createdBaselines = byName.schedule_baselines ?? (await pb.collections.create(baselines));
console.log(`schedule_baselines ready (${createdBaselines.id})`);

const items = {
  name: "schedule_baseline_items",
  type: "base",
  // Scoped by the item's own project, with an agreement clause tying it to the
  // baseline's — the same shape as schedule_relationships, and enforceable for
  // the same reason: both are typed relations.
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && baseline.project = project`,
  updateRule: `${SCOPE} && baseline.project = project`,
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "baseline", type: "relation", required: true, collectionId: createdBaselines.id, cascadeDelete: true, maxSelect: 1 },
    /**
     * The business key. Deliberately NOT a relation to schedule_items — see the
     * header. This is what lets a baseline survive a re-import.
     */
    { name: "activity_id", type: "text", required: true, max: 60 },
    { name: "activity", type: "text", required: false, max: 300 },
    { name: "start", type: "text", required: false, max: 10 },
    { name: "finish", type: "text", required: false, max: 10 },
    { name: "duration_days", type: "number", required: false },
    { name: "is_milestone", type: "bool", required: false },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    // One row per activity per baseline. A duplicate would make variance
    // ambiguous with no error to notice.
    "CREATE UNIQUE INDEX idx_baseline_item_activity ON schedule_baseline_items (baseline, activity_id)",
    "CREATE INDEX idx_baseline_item_project ON schedule_baseline_items (project)",
  ],
};

if (!byName.schedule_baseline_items) {
  const made = await pb.collections.create(items);
  console.log(`schedule_baseline_items ready (${made.id})`);
}

console.log("\nVerifying:");
for (const n of ["schedule_baselines", "schedule_baseline_items"]) {
  const c = await pb.collections.getOne(n);
  console.log(`  ${n}: ${c.fields.length} fields, ${c.indexes.length} indexes, autodate ${c.fields.filter((f) => f.type === "autodate").map((f) => f.name).join("+") || "MISSING"}`);
}
