#!/usr/bin/env node
/**
 * Create `precedence_provisions`.
 *
 * One row per provision, MULTIPLE PER PROJECT - a manual can carry a
 * project-wide clause and a division-scoped one, and which governs depends on
 * where the conflict sits (see src/lib/precedence/classify.ts).
 *
 * Recorded by a person, not extracted. Automating discovery would have bought
 * a PM about ninety seconds once per job in exchange for a PDF dependency, a
 * reversal of the document-privacy line in docs/document-privacy.md, and a 55%
 * false-positive rate they would have had to review anyway.
 *
 * ## source_text is REQUIRED
 *
 * Traceability to the page is the point of the feature. A provision without its
 * verbatim passage cannot be checked against the manual, and a classification
 * that cannot be checked is not usable for a claim.
 *
 * ## rules is json, not a rank list
 *
 * An ordered decision procedure. UCCS has two overrides that fire BEFORE its
 * rank sequence and two further rules that fire after it ties. A rank column
 * could not express that, and a tie is exactly what makes the common case
 * ambiguous rather than resolvable.
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

if (byName.precedence_provisions) {
  console.log("precedence_provisions already exists. Nothing to do.");
  process.exit(0);
}

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

/** A provision without its verbatim text is not traceable, so it is not valid. */
const HAS_SOURCE = 'source_text != ""';

const definition = {
  name: "precedence_provisions",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && ${HAS_SOURCE}`,
  updateRule: `${SCOPE} && ${HAS_SOURCE}`,
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "section", type: "text", required: true, max: 60 },
    { name: "page", type: "number", required: false, min: 1, onlyInt: true },
    { name: "scope", type: "select", required: true, maxSelect: 1,
      values: ["PROJECT_WIDE", "DIVISION_SCOPED", "EXTERNAL", "NONE_FOUND"] },
    /** Which division or section, when DIVISION_SCOPED. e.g. "22". */
    { name: "scope_target", type: "text", required: false, max: 40 },
    { name: "rules", type: "json", required: false, maxSize: 200000 },
    /**
     * Recorded explicitly rather than derived. UCCS looks as though it settles
     * drawing-versus-spec and does not, and that fact is worth stating on the
     * record rather than recomputing from the rule list every time.
     */
    { name: "resolves_drawing_vs_spec", type: "bool", required: false },
    { name: "external_instrument_name", type: "text", required: false, max: 200 },
    { name: "external_instrument_edition", type: "text", required: false, max: 60 },
    { name: "source_text", type: "text", required: true, max: 20000 },
    { name: "recorded_by", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "notes", type: "text", required: false, max: 4000 },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    // One record per clause location. Recording the same clause twice would
    // make "which provision governs" depend on insertion order.
    "CREATE UNIQUE INDEX idx_precedence_section ON precedence_provisions (project, section)",
    "CREATE INDEX idx_precedence_project ON precedence_provisions (project)",
  ],
};

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("precedence_provisions");
console.log(`  scopes    : PROJECT_WIDE, DIVISION_SCOPED, EXTERNAL, NONE_FOUND`);
console.log(`  createRule: ${definition.createRule}`);
console.log("\n  source_text is REQUIRED at the database: a provision without its");
console.log("  verbatim passage cannot be checked against the manual.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

const created = await pb.collections.create(definition);
const after = await pb.collections.getOne("precedence_provisions");
console.log(`Created precedence_provisions (${created.id})`);
console.log(`  fields ${after.fields.length}, indexes ${after.indexes.length}`);
