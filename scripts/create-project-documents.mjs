#!/usr/bin/env node
/**
 * Create the `project_documents` collection.
 *
 * Contracts, specs, geotech reports, permits, and reference drawing sets have
 * nowhere to live today — every other file field hangs off a submittal, RFI,
 * change order, or daily log. See docs/project-documents-design.md.
 *
 * This is NOT the polymorphic join table rejected for attachments: it has one
 * relation, to `projects`, exactly like `drawings`. It inherits the standard
 * project-scoped rules with no cross-table invariant to enforce.
 *
 * Deliberately simpler than `document_revisions`: no immutability, no revision
 * numbering, no one-current-per-parent index. Many project documents are
 * current at once — a contract and a spec and a permit are all in force. A
 * superseded spec is a *new document* pointing back via `superseded_by`, not a
 * revision chain with a lifecycle.
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

if (byName.project_documents) {
  console.log("project_documents already exists. Nothing to do.");
  process.exit(0);
}

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

const CATEGORIES = [
  "contract",
  "specification",
  "drawing_set",
  "geotech",
  "report",
  "permit",
  "insurance",
  "submittal_package",
  "other",
];

const definition = {
  name: "project_documents",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: SCOPE,
  updateRule: SCOPE,
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "title", type: "text", required: true, max: 300 },
    { name: "category", type: "select", required: false, maxSelect: 1, values: CATEGORIES },
    { name: "file", type: "file", required: false, maxSelect: 1, maxSize: 104857600, protected: true, mimeTypes: [] },
    { name: "doc_number", type: "text", required: false, max: 60 },
    { name: "revision", type: "text", required: false, max: 60 },
    { name: "issued_date", type: "text", required: false, max: 10 },
    { name: "received_date", type: "text", required: false, max: 10 },
    { name: "issued_by", type: "text", required: false, max: 150 },
    /**
     * No unique index, unlike document_revisions. Many project documents are
     * current simultaneously — a contract, a spec, and a permit are all in
     * force at once. The flag answers "is this the conformed set?", which is
     * the question that stops a PM building off a superseded spec.
     */
    { name: "is_current", type: "bool", required: false },
    { name: "notes", type: "text", required: false, max: 4000 },
    { name: "uploaded_by", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    /**
     * PocketBase does not add these when `fields` is supplied via the API —
     * omitting them on document_revisions made `sort=-created` return a bare
     * 400 that surfaced as an unexplained page error. Do not repeat it.
     */
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
};

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("project_documents");
console.log(`  rules: ${SCOPE}`);
console.log(`  categories: ${CATEGORIES.join(", ")}`);
console.log(`  ${definition.fields.length} fields (+ superseded_by, added in a second step)\n`);

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

const created = await pb.collections.create(definition);
console.log(`Created ${created.name} (${created.id})`);

/**
 * `superseded_by` points at this same collection, so it cannot be declared in
 * the create call — the collection has no id until it exists. Added second.
 * cascadeDelete false: deleting the replacement must not delete the document it
 * replaced, which is the record of what was in force before.
 */
const fresh = await pb.collections.getOne(created.id);
await pb.collections.update(created.id, {
  fields: [
    ...fresh.fields,
    { name: "superseded_by", type: "relation", required: false, collectionId: created.id, cascadeDelete: false, maxSelect: 1 },
  ],
});

const after = await pb.collections.getOne("project_documents");
console.log("\nVerifying:");
console.log(`  fields    : ${after.fields.length}`);
console.log(`  self-ref  : ${after.fields.some((f) => f.name === "superseded_by") ? "superseded_by present" : "MISSING"}`);
console.log(`  autodate  : ${after.fields.filter((f) => f.type === "autodate").map((f) => f.name).join(", ") || "MISSING"}`);
console.log(`  file      : protected=${after.fields.find((f) => f.name === "file")?.protected}`);
console.log("\nNext: add project_documents to MODEL_NAMES in scripts/generate-types.mjs, then npm run generate:types");
