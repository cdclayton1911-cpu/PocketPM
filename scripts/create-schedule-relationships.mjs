#!/usr/bin/env node
/**
 * Create `schedule_relationships` and drop `schedule_items.predecessors`.
 *
 * `predecessors` was a text field, which cannot express what CPM needs: which
 * activity, what relationship type, and how much lag. See docs/schedule-plan.md.
 *
 * Doing this now is deliberate — `schedule_items` holds zero records, so there
 * is no text to parse, no format to reverse engineer, and no backfill. After
 * the first import this becomes a migration with real data in it.
 *
 * Both endpoints are typed relations, so PocketBase itself enforces that a
 * relationship cannot span two projects. That is the same technique that made
 * the document_revisions cross-table invariant a real PASS rather than a
 * promise about application code.
 *
 * Cycle prevention is NOT here: it cannot be expressed as an API rule and lives
 * in the write path (src/lib/schedule/graph.ts). A cycle makes CPM
 * non-terminating rather than merely wrong, so it is rejected on write.
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
const items = byName.schedule_items;
if (!items) throw new Error("schedule_items not found");

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

/** Both ends must sit in the same project as the relationship, and differ. */
const ENDPOINTS_AGREE =
  "predecessor.project = project && successor.project = project && predecessor != successor";

const definition = {
  name: "schedule_relationships",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && ${ENDPOINTS_AGREE}`,
  updateRule: `${SCOPE} && ${ENDPOINTS_AGREE}`,
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    // cascadeDelete true on both: an edge to a deleted activity is meaningless,
    // and leaving orphans would make the graph unwalkable.
    { name: "predecessor", type: "relation", required: true, collectionId: items.id, cascadeDelete: true, maxSelect: 1 },
    { name: "successor", type: "relation", required: true, collectionId: items.id, cascadeDelete: true, maxSelect: 1 },
    { name: "type", type: "select", required: false, maxSelect: 1, values: ["FS", "SS", "FF", "SF"] },
    // Negative is a lead, which is ordinary in a real schedule.
    { name: "lag_days", type: "number", required: false, onlyInt: true },
    { name: "notes", type: "text", required: false, max: 500 },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    // One edge per ordered pair. Two activities can be related once; a second
    // edge would double-count in the forward pass.
    "CREATE UNIQUE INDEX idx_schedrel_pair ON schedule_relationships (predecessor, successor)",
    "CREATE INDEX idx_schedrel_project ON schedule_relationships (project)",
  ],
};

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);

const existing = byName.schedule_relationships;
console.log(`schedule_relationships: ${existing ? "already exists" : "will be created"}`);
console.log(`  createRule: ${definition.createRule}\n`);

const predecessorField = items.fields.find((f) => f.name === "predecessors");
const records = await pb.collection("schedule_items").getList(1, 1);
console.log(`schedule_items.predecessors: ${predecessorField ? "present" : "already removed"}`);
console.log(`  schedule_items holds ${records.totalItems} record(s) — dropping is ${records.totalItems === 0 ? "lossless" : "DATA LOSS"}\n`);

if (records.totalItems > 0 && predecessorField) {
  console.error("REFUSING: schedule_items has records. Export predecessors before dropping the field.");
  process.exit(1);
}

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

if (!existing) {
  const created = await pb.collections.create(definition);
  console.log(`Created schedule_relationships (${created.id})`);
}

if (predecessorField) {
  const fresh = await pb.collections.getOne("schedule_items");
  await pb.collections.update(fresh.id, {
    fields: fresh.fields.filter((f) => f.name !== "predecessors"),
  });
  console.log("Dropped schedule_items.predecessors");
}

const rel = await pb.collections.getOne("schedule_relationships");
const after = await pb.collections.getOne("schedule_items");
console.log("\nVerifying:");
console.log(`  relationship fields : ${rel.fields.length}`);
console.log(`  indexes             : ${rel.indexes.length}`);
console.log(`  autodate            : ${rel.fields.filter((f) => f.type === "autodate").map((f) => f.name).join(", ") || "MISSING"}`);
console.log(`  predecessors gone   : ${!after.fields.some((f) => f.name === "predecessors")}`);
