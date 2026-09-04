#!/usr/bin/env node
/**
 * Create `project_roles`.
 *
 * A prerequisite for workflows: routing a submittal to "Architect" needs a
 * project to know who its architect is.
 *
 * ## Additive, not a replacement for membership
 *
 * `projects.members` stays exactly as it is. **108 API rules across 22
 * collections** read `project.members.id ?= @request.auth.id` — that list is
 * the access-control mechanism this entire app's tenancy rests on, and
 * `verify:tenancy` guards it. Moving membership into a join table would mean
 * rewriting all 108.
 *
 * So the split is: **`projects.members` says who can see the project. This
 * table says what people are called and what they are responsible for.**
 *
 * ## Adding a role grants nothing
 *
 * A row here confers no access whatsoever. An external architect gets a role
 * row and no membership, so they cannot read the project — which is correct,
 * and is why the two must not be conflated. Granting access remains an explicit
 * act of adding someone to `members`.
 *
 * ## A party is a user OR a contact
 *
 * `user` is null for external parties, who are recorded by name, company, and
 * email. The rule requires one or the other, so a row can never be nobody. How
 * an external party actually *acts* on a workflow step is an open decision —
 * see docs/project-roles.md.
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

if (byName.project_roles) {
  console.log("project_roles already exists. Nothing to do.");
  process.exit(0);
}

const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

/** A party is somebody: either a linked account or a named contact. */
const IS_SOMEBODY = '(user != "" || contact_name != "")';

const ROLES = [
  "owner",
  "owner_rep",
  "architect",
  "engineer",
  "project_manager",
  "superintendent",
  "subcontractor",
  "consultant",
  "inspector",
  "other",
];

const definition = {
  name: "project_roles",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && ${IS_SOMEBODY}`,
  updateRule: `${SCOPE} && ${IS_SOMEBODY}`,
  deleteRule: SCOPE,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    /**
     * Null for an external party. cascadeDelete false: deleting a user must not
     * silently erase who reviewed what — the row stays, unlinked.
     */
    { name: "user", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "role", type: "select", required: true, maxSelect: 1, values: ROLES },
    { name: "company", type: "text", required: false, max: 200 },
    { name: "contact_name", type: "text", required: false, max: 150 },
    { name: "contact_email", type: "email", required: false },
    { name: "contact_phone", type: "text", required: false, max: 40 },
    /**
     * Explicit rather than derived from `user == ""`. An internal colleague
     * might have no account yet, and an external consultant might later get
     * one; the flag records intent, which is what routing decisions read.
     */
    { name: "is_external", type: "bool", required: false },
    { name: "status", type: "select", required: false, maxSelect: 1, values: ["active", "inactive"] },
    { name: "notes", type: "text", required: false, max: 2000 },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    // One person cannot hold the same role twice on a project. They CAN hold
    // two different roles — a PM who is also the safety officer is ordinary.
    "CREATE UNIQUE INDEX idx_project_role_user ON project_roles (project, user, role) WHERE user != ''",
    "CREATE INDEX idx_project_role_project ON project_roles (project)",
  ],
};

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("project_roles");
console.log(`  roles     : ${ROLES.join(", ")}`);
console.log(`  createRule: ${definition.createRule}`);
console.log(`\n  NOTE: this grants no access. projects.members is untouched, and all`);
console.log("  108 rules that read it keep working unchanged.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

const created = await pb.collections.create(definition);
const after = await pb.collections.getOne("project_roles");
console.log(`Created project_roles (${created.id})`);
console.log(`  fields ${after.fields.length}, indexes ${after.indexes.length}, autodate ${after.fields.filter((f) => f.type === "autodate").map((f) => f.name).join("+")}`);
