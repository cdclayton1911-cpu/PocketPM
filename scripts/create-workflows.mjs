#!/usr/bin/env node
/**
 * Create the four workflow collections.
 *
 * ## Typed relations, not a polymorphic id
 *
 * An instance points at its entity through nullable `submittal` / `rfi`
 * relations plus a required `project` — the `document_revisions` shape. A text
 * `entity_id` was specified first and dropped: PocketBase cannot dereference a
 * text field, so "read scoped to the entity's project" would have been
 * unwritable, and tenancy for the collection gating every approval would have
 * rested on route discipline with no database backstop.
 *
 * There is no `entity_type` on an instance. `document_revisions` keeps no
 * discriminator beside its relations and neither does this — a stored copy can
 * disagree with the relation, and then two sources of truth need reconciling.
 * Templates DO keep `entity_type`, because a template has no entity to derive
 * it from.
 *
 * ## Why the write rules are not `null`
 *
 * The brief asked for no client-side writes, with instances created only
 * through API routes. That cannot be spelled `null`:
 *
 *   - The app has NO admin PocketBase client. Every server path acts with the
 *     user's token (see src/lib/crud-route.ts, src/lib/module-page.ts). A null
 *     rule is superuser-only, so the app itself could not write.
 *   - PocketBase is publicly reachable at pb.pocketpm.fyi. Sending writes
 *     through Next.js does not stop anyone holding a session token from
 *     calling PocketBase directly.
 *
 * So the rules are written to be safe under a user's own token, like the other
 * 30 collections: project-scoped, cross-tenancy checked, with the fields that
 * must never move frozen via `@request.body.<field>:isset = false`.
 *
 * ## Append-only really is append-only
 *
 * `workflow_actions` has updateRule and deleteRule of `null`, so no client and
 * no API route can alter or remove an entry — only a superuser with the admin
 * password. `actor = @request.auth.id` on create means an entry cannot be
 * attributed to someone else. This is the one part that is unrecoverable if
 * wrong, so it is the strictest.
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
// Overridable so the definitions can be proved against a throwaway instance
// before they touch production. A dry run does not validate rule syntax —
// only collections.create() does, and PocketBase rejects a bad rule there.
const env = {
  NEXT_PUBLIC_PB_URL: process.env.PB_URL || fileEnv.NEXT_PUBLIC_PB_URL,
  PB_ADMIN_EMAIL: process.env.PB_EMAIL || fileEnv.PB_ADMIN_EMAIL,
  PB_ADMIN_PASS: process.env.PB_PASS || fileEnv.PB_ADMIN_PASS,
};
const pb = new PocketBase(env.NEXT_PUBLIC_PB_URL);
await pb.collection("_superusers").authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASS);

const all = await pb.collections.getFullList();
const byName = Object.fromEntries(all.map((c) => [c.name, c]));

const WANTED = ["workflow_templates", "workflow_steps", "workflow_instances", "workflow_actions"];
const existing = WANTED.filter((n) => byName[n]);
if (existing.length === WANTED.length) {
  console.log("All four workflow collections already exist. Nothing to do.");
  process.exit(0);
}
if (existing.length > 0) {
  // Partial state is worse than none: the later definitions reference the
  // earlier ones by id, so a half-applied run cannot simply be re-run.
  console.error(`Refusing to run: ${existing.join(", ")} already exist but others do not.`);
  console.error("Delete the partial collections in the admin UI, then re-run.");
  process.exit(1);
}

/** The project tenancy rule used verbatim by submittals and 21 other collections. */
const SCOPE =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

/** A template with no project is an org-wide default and readable by anyone. */
const TEMPLATE_SCOPE =
  '@request.auth.id != "" && (project = "" || project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

/** Steps inherit their template's visibility. */
const STEP_SCOPE =
  '@request.auth.id != "" && (template.project = "" || template.project.owner = @request.auth.id || template.project.members.id ?= @request.auth.id)';

/** Actions inherit their instance's project. */
const ACTION_SCOPE =
  '@request.auth.id != "" && (instance.project.owner = @request.auth.id || instance.project.members.id ?= @request.auth.id)';

/** Exactly one entity. Both or neither is meaningless and must not be storable. */
const EXACTLY_ONE = '((submittal != "" && rfi = "") || (submittal = "" && rfi != ""))';

/** The entity must live in the same project as the instance. */
const SAME_PROJECT = '(submittal = "" || submittal.project = project) && (rfi = "" || rfi.project = project)';

/** An org-wide template fits any project; a project-scoped one fits only its own. */
const TEMPLATE_FITS = '(template.project = "" || template.project = project)';

/**
 * Fields frozen after creation. The snapshot is the whole point of the design —
 * if it could be edited, an in-flight workflow could be rewritten mid-approval
 * and the audit log would describe steps that no longer exist.
 */
const FROZEN = [
  "project",
  "submittal",
  "rfi",
  "template",
  "template_snapshot",
  "started_by",
  "started_at",
]
  .map((f) => `@request.body.${f}:isset = false`)
  .join(" && ");

const templates = {
  name: "workflow_templates",
  type: "base",
  listRule: TEMPLATE_SCOPE,
  viewRule: TEMPLATE_SCOPE,
  // Admin only, as specified. Templates are configuration, not project data,
  // and nothing in the app writes them yet.
  createRule: null,
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: "name", type: "text", required: true, max: 200 },
    { name: "entity_type", type: "select", required: true, maxSelect: 1, values: ["submittal", "rfi"] },
    // Null means org-wide. cascadeDelete: deleting a project takes its
    // project-specific templates with it; org-wide ones have no project to lose.
    { name: "project", type: "relation", required: false, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "active", type: "bool", required: false },
    { name: "description", type: "text", required: false, max: 2000 },
    { name: "created_by", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    // One active default per entity type, at each scope. Two active defaults
    // would make "which template applies" a coin flip.
    "CREATE UNIQUE INDEX idx_wf_tpl_org_default ON workflow_templates (entity_type) WHERE project = '' AND active = true",
    "CREATE UNIQUE INDEX idx_wf_tpl_project_default ON workflow_templates (project, entity_type) WHERE project != '' AND active = true",
  ],
};

const steps = {
  name: "workflow_steps",
  type: "base",
  listRule: STEP_SCOPE,
  viewRule: STEP_SCOPE,
  createRule: null,
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: "template", type: "relation", required: true, collectionId: null, cascadeDelete: true, maxSelect: 1 },
    { name: "step_order", type: "number", required: true, min: 1, onlyInt: true },
    { name: "name", type: "text", required: true, max: 200 },
    { name: "approver_mode", type: "select", required: true, maxSelect: 1, values: ["role", "specific_users", "any_of_users"] },
    // Free text rather than a relation to project_roles: a template can be
    // org-wide, and an org-wide template cannot point at one project's roles.
    { name: "approver_role", type: "text", required: false, max: 60 },
    { name: "approver_users", type: "relation", required: false, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 20 },
    { name: "sla_days", type: "number", required: false, min: 0, onlyInt: true },
    { name: "on_reject", type: "select", required: true, maxSelect: 1, values: ["return_to_previous", "return_to_start", "terminate"] },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: ["CREATE UNIQUE INDEX idx_wf_step_order ON workflow_steps (template, step_order)"],
};

const instances = {
  name: "workflow_instances",
  type: "base",
  listRule: SCOPE,
  viewRule: SCOPE,
  createRule: `${SCOPE} && ${EXACTLY_ONE} && ${SAME_PROJECT} && ${TEMPLATE_FITS} && started_by = @request.auth.id`,
  updateRule: `${SCOPE} && ${EXACTLY_ONE} && ${SAME_PROJECT} && ${FROZEN}`,
  // History. An instance that ran is a fact about the project; cancel it via
  // status instead.
  deleteRule: null,
  fields: [
    { name: "project", type: "relation", required: true, collectionId: byName.projects.id, cascadeDelete: true, maxSelect: 1 },
    { name: "submittal", type: "relation", required: false, collectionId: byName.submittals.id, cascadeDelete: false, maxSelect: 1 },
    { name: "rfi", type: "relation", required: false, collectionId: byName.rfis.id, cascadeDelete: false, maxSelect: 1 },
    // cascadeDelete false: deleting a template must not erase the workflows it
    // ran. The snapshot means those instances remain fully readable without it.
    { name: "template", type: "relation", required: true, collectionId: null, cascadeDelete: false, maxSelect: 1 },
    { name: "template_snapshot", type: "json", required: true, maxSize: 2000000 },
    { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "approved", "rejected", "cancelled"] },
    { name: "current_step_order", type: "number", required: true, min: 1, onlyInt: true },
    { name: "started_by", type: "relation", required: true, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "started_at", type: "date", required: true },
    { name: "completed_at", type: "date", required: false },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ],
  indexes: [
    "CREATE INDEX idx_wf_inst_submittal ON workflow_instances (submittal, status) WHERE submittal != ''",
    "CREATE INDEX idx_wf_inst_rfi ON workflow_instances (rfi, status) WHERE rfi != ''",
    // One in-flight workflow per entity — the same shape as document_revisions'
    // is_current uniqueness. Two pending instances on one submittal would make
    // "the current approver" ambiguous with nothing to notice it.
    "CREATE UNIQUE INDEX idx_wf_inst_submittal_open ON workflow_instances (submittal) WHERE submittal != '' AND status = 'pending'",
    "CREATE UNIQUE INDEX idx_wf_inst_rfi_open ON workflow_instances (rfi) WHERE rfi != '' AND status = 'pending'",
    "CREATE INDEX idx_wf_inst_project ON workflow_instances (project)",
  ],
};

const actions = {
  name: "workflow_actions",
  type: "base",
  listRule: ACTION_SCOPE,
  viewRule: ACTION_SCOPE,
  // An entry can only ever be added, only by the person it names.
  createRule: `${ACTION_SCOPE} && actor = @request.auth.id`,
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: "instance", type: "relation", required: true, collectionId: null, cascadeDelete: true, maxSelect: 1 },
    { name: "step_order", type: "number", required: true, min: 1, onlyInt: true },
    { name: "actor", type: "relation", required: true, collectionId: byName.users.id, cascadeDelete: false, maxSelect: 1 },
    { name: "action", type: "select", required: true, maxSelect: 1, values: ["approve", "reject", "comment", "reassign", "cancel"] },
    { name: "comment", type: "text", required: false, max: 5000 },
    { name: "attachments", type: "file", required: false, maxSelect: 5, maxSize: 52428800, mimeTypes: [], protected: true },
    { name: "acted_at", type: "date", required: true },
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  ],
  indexes: ["CREATE INDEX idx_wf_action_instance ON workflow_actions (instance, step_order)"],
};

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);

for (const def of [templates, steps, instances, actions]) {
  console.log(`${def.name}`);
  console.log(`  list  : ${def.listRule ?? "null (superuser only)"}`);
  console.log(`  create: ${def.createRule ?? "null (superuser only)"}`);
  console.log(`  update: ${def.updateRule ?? "null (superuser only)"}`);
  console.log(`  delete: ${def.deleteRule ?? "null (superuser only)"}`);
  const files = def.fields.filter((f) => f.type === "file");
  if (files.length) {
    console.log(`  files : ${files.map((f) => `${f.name} protected=${f.protected}`).join(", ")}`);
  }
  console.log("");
}

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

// Order matters: steps, instances and actions reference collections created
// above them, so ids are filled in as we go.
const madeTemplates = await pb.collections.create(templates);
steps.fields.find((f) => f.name === "template").collectionId = madeTemplates.id;
instances.fields.find((f) => f.name === "template").collectionId = madeTemplates.id;
const madeSteps = await pb.collections.create(steps);
const madeInstances = await pb.collections.create(instances);
actions.fields.find((f) => f.name === "instance").collectionId = madeInstances.id;
const madeActions = await pb.collections.create(actions);

for (const made of [madeTemplates, madeSteps, madeInstances, madeActions]) {
  const after = await pb.collections.getOne(made.name);
  console.log(
    `Created ${after.name} (${after.id}) — fields ${after.fields.length}, indexes ${after.indexes.length}, ` +
      `update ${after.updateRule === null ? "null" : "rule"}, delete ${after.deleteRule === null ? "null" : "rule"}`,
  );
}
