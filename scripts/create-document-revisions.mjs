#!/usr/bin/env node
/**
 * Create the `document_revisions` collection.
 *
 * Design decisions and their reasons are in docs/revisions.md. What matters
 * here is how each one is *enforced*, and the answer is: in PocketBase rules
 * wherever possible, not in application code.
 *
 * ## Typed parents, not parent_type + parent_id
 *
 * The obvious shape is a generic `parent_type` string plus a `parent_id`
 * string. It is also the shape that cannot be secured: PocketBase cannot follow
 * a loose id, so nothing stops a caller naming their own project (create rule
 * passes) while pointing `parent_id` at a record in someone else's. The
 * invariant would live in app code, in the one place a mistake crosses tenants.
 *
 * Two nullable relations — `submittal` and `rfi` — let the rule itself say
 * `submittal.project = project`. The database enforces the agreement.
 *
 * ## cascadeDelete: false on both parents
 *
 * Deleting a submittal must not delete its revision history; that history is
 * what survives a dispute. Parents are soft-deleted instead.
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
const projects = byName.projects.id;
const submittals = byName.submittals.id;
const rfis = byName.rfis.id;
const users = byName.users.id;

/** Membership of the project — identical to every other child collection. */
const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

/**
 * The cross-table invariant.
 *
 * A revision must hang off exactly one parent, and that parent must belong to
 * the same project the revision claims. Both halves matter: without the second,
 * `project` and the parent are trusted independently.
 */
const PARENT_AGREES =
  '(submittal = "" || submittal.project = project) && (rfi = "" || rfi.project = project)';
const EXACTLY_ONE_PARENT = '(submittal != "" || rfi != "")';

/**
 * Immutable on issue.
 *
 * A draft may be edited freely. Once issued, the evidence is frozen — file,
 * revision number, issue date, and stamp can never change — while lifecycle
 * bookkeeping (is_current, status, notes) stays writable so a revision can be
 * marked superseded without rewriting history.
 */
const FROZEN_FIELDS = ["file", "revision_number", "issued_at", "stamped_by", "stamped_at"];
const IMMUTABLE_ON_ISSUE =
  '(status = "draft" || (' +
  FROZEN_FIELDS.map((f) => `@request.body.${f}:isset = false`).join(" && ") +
  "))";

const definition = {
  name: "document_revisions",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && ${PARENT_AGREES} && ${EXACTLY_ONE_PARENT}`,
  updateRule: `${SCOPE} && ${PARENT_AGREES} && ${IMMUTABLE_ON_ISSUE}`,
  // Only a draft can be deleted. A rejected or superseded revision is the
  // record of what was issued and must not be removable because a newer one
  // exists.
  deleteRule: `${SCOPE} && status = "draft"`,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: projects, cascadeDelete: true, maxSelect: 1 },
    // cascadeDelete false on both: the history outlives its parent.
    { name: "submittal", type: "relation", required: false, collectionId: submittals, cascadeDelete: false, maxSelect: 1 },
    { name: "rfi", type: "relation", required: false, collectionId: rfis, cascadeDelete: false, maxSelect: 1 },
    { name: "revision_number", type: "number", required: false, onlyInt: true, min: 0 },
    { name: "status", type: "select", required: false, maxSelect: 1,
      values: ["draft", "submitted", "approved", "rejected", "superseded"] },
    // Retrieval metadata, not a schema constraint: superseded revisions stay
    // queryable because delay claims are argued from them.
    { name: "is_current", type: "bool", required: false },
    { name: "file", type: "file", required: false, maxSelect: 1, maxSize: 104857600, protected: true, mimeTypes: [] },
    { name: "issued_at", type: "text", required: false },
    { name: "issued_by", type: "text", required: false },
    { name: "stamped_by", type: "text", required: false },
    { name: "stamped_at", type: "text", required: false },
    { name: "review_due_at", type: "text", required: false },
    { name: "notes", type: "text", required: false },
    { name: "created_by", type: "relation", required: false, collectionId: users, cascadeDelete: false, maxSelect: 1 },
  ],
  indexes: [
    // One revision number per parent, and only one current revision per parent.
    "CREATE UNIQUE INDEX idx_rev_submittal_number ON document_revisions (submittal, revision_number) WHERE submittal != ''",
    "CREATE UNIQUE INDEX idx_rev_rfi_number ON document_revisions (rfi, revision_number) WHERE rfi != ''",
    "CREATE UNIQUE INDEX idx_rev_submittal_current ON document_revisions (submittal) WHERE submittal != '' AND is_current = true",
    "CREATE UNIQUE INDEX idx_rev_rfi_current ON document_revisions (rfi) WHERE rfi != '' AND is_current = true",
  ],
};

if (byName.document_revisions) {
  console.log("document_revisions already exists. Nothing to do.");
  console.log("  (delete it in the admin UI first if you mean to recreate it)");
  process.exit(0);
}

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("document_revisions");
for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
  console.log(`  ${k}:\n    ${definition[k]}`);
}
console.log(`\n  ${definition.fields.length} fields, ${definition.indexes.length} indexes`);

if (!APPLY) {
  console.log("\nNothing written. Re-run with --apply.");
  process.exit(0);
}

const created = await pb.collections.create(definition);
console.log(`\nCreated ${created.name} (${created.id})`);
console.log("Now run: npm run verify:tenancy  — section 4 must PASS, not SKIP.");
