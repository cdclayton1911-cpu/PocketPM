#!/usr/bin/env node
/**
 * Reconcile the precedence schema with spec v1.1, and create `conflict_findings`.
 *
 * Both are free today and expensive after the first project is coded, which is
 * the entire reason for doing them now.
 *
 * ## precedence_provisions
 *
 * `resolves_drawing_vs_spec` (bool) becomes `resolves` (json array of conflict
 * classes). WCU sub-ranks drawings, so it settles E2 as well as E1 — a
 * provision that settles one class and not another has no boolean form.
 *
 * ## conflict_findings
 *
 * The per-conflict record. `loci` is a json PAIR, not spec_locus/dwg_locus:
 * E2 is drawing-against-drawing and E3 is spec-against-spec, and neither has a
 * specification-and-drawing shape to name.
 *
 * `conflict_class` is REQUIRED. It is decided from the documents alone, before
 * precedence is assessed — a bias control, since knowing the contract resolves
 * something pulls a coder toward deciding no conflict existed.
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

const provisions = byName.precedence_provisions;
if (!provisions) {
  console.error("precedence_provisions does not exist. Run create-precedence-provisions.mjs first.");
  process.exit(1);
}

const existing = await pb.collection("precedence_provisions").getFullList();
if (existing.length > 0) {
  // The whole argument for doing this now is that there is nothing to migrate.
  console.error(`Refusing to run: precedence_provisions holds ${existing.length} record(s).`);
  console.error("Replacing resolves_drawing_vs_spec would discard them. Write a migration instead.");
  process.exit(1);
}

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

const CONFLICT_CLASSES = ["E1", "E2", "E3", "E4", "E5"];
const E1_SUBTYPES = [
  "material_type", "material_thickness", "system_type", "frame_material",
  "dimension_spacing", "grade_standard", "performance_rating", "method_sequence",
  "beneficial_exceedance",
];
const PRECEDENCE_CLASSES = [
  "PRECEDENCE_RESOLVABLE", "PRECEDENCE_AMBIGUOUS", "PRECEDENCE_INCORPORATED",
  "REQUIRES_CLARIFICATION", "NO_PRECEDENCE_PROVISION",
];

const provisionFields = provisions.fields
  .filter((f) => f.name !== "resolves_drawing_vs_spec")
  .concat([{ name: "resolves", type: "json", required: false, maxSize: 2000 }]);

const findings = {
  name: "conflict_findings",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: SCOPE,
  updateRule: SCOPE,
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    /** Decided from the documents alone, before precedence is assessed. */
    { name: "conflict_class", type: "select", required: true, maxSelect: 1, values: CONFLICT_CLASSES },
    /** Only E1 is sub-typed. */
    { name: "conflict_subtype", type: "select", required: false, maxSelect: 1, values: E1_SUBTYPES },
    /**
     * A PAIR, in a json column. Not spec_locus/dwg_locus: E2 has two drawings
     * and E3 has two specifications, and neither fits those names.
     */
    { name: "loci", type: "json", required: true, maxSize: 8000 },
    { name: "precedence_class", type: "select", required: false, maxSelect: 1, values: PRECEDENCE_CLASSES },
    { name: "precedence_provision", type: "relation", required: false, collectionId: provisions.id, cascadeDelete: false, maxSelect: 1 },
    /** Why. A reader needs to know why something was called ambiguous. */
    { name: "precedence_reasoning", type: "text", required: false, max: 4000 },
    /** True when a single-observation construct decided the precedence class. */
    { name: "provisional", type: "bool", required: false },
    /**
     * The spec names `severity` without defining a scale. Left as free text
     * rather than inventing enum values that would then be coded against.
     */
    { name: "severity", type: "text", required: false, max: 40 },
    { name: "notes", type: "text", required: false, max: 4000 },
    { name: "coded_by", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    "CREATE INDEX idx_finding_project ON conflict_findings (project)",
    "CREATE INDEX idx_finding_class ON conflict_findings (project, conflict_class)",
  ],
};

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("precedence_provisions");
console.log("  - resolves_drawing_vs_spec (bool)");
console.log("  + resolves (json: conflict classes this provision settles)");
console.log(`\nconflict_findings: ${byName.conflict_findings ? "already exists" : "create"}`);
console.log(`  conflict_class REQUIRED: ${CONFLICT_CLASSES.join(", ")}`);
console.log("  loci: a json PAIR — E2 and E3 have no spec/drawing shape\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

await pb.collections.update(provisions.id, { fields: provisionFields });
if (!byName.conflict_findings) await pb.collections.create(findings);

const afterProvisions = await pb.collections.getOne("precedence_provisions");
const afterFindings = await pb.collections.getOne("conflict_findings");
console.log("Applied.");
console.log(`  precedence_provisions: ${afterProvisions.fields.map((f) => f.name).filter((n) => n.startsWith("resolves")).join(", ") || "(none)"}`);
console.log(`  conflict_findings: ${afterFindings.fields.length} fields, ${afterFindings.indexes.length} indexes`);
