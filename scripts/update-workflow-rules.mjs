#!/usr/bin/env node
/**
 * Open workflow template authoring to project owners, and add `start` to the
 * action enum.
 *
 * ## Templates
 *
 *   - `project = ""` (org-wide) stays superuser-only, because `project != ""`
 *     is required by every rule below and a superuser bypasses rules entirely.
 *   - A project owner may create, update and delete templates scoped to a
 *     project they own.
 *   - `project` is FROZEN after creation. An ownership predicate alone does not
 *     close reparenting: PocketBase evaluates updateRule against the STORED
 *     record, so "owner of A" passes while the body moves the template to B.
 *     `@request.body.project:isset = false` is what actually closes it.
 *   - On create the predicate resolves against the INCOMING project relation,
 *     so it tests "owns this template's project", not "owns some project".
 *
 * ## Steps
 *
 * Not in the decision record, added because the feature does not work without
 * it: an owner who can create a template but not its steps gets an empty
 * template, and startWorkflow refuses it as invalid. Steps inherit their
 * template's writability exactly.
 *
 * ## The action enum
 *
 * `start` is added. The opening entry was being recorded as a `comment`, which
 * works only because comments are inert during replay — it made "the workflow
 * began" indistinguishable from someone leaving a note.
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

/** Owns the project this template is scoped to. Excludes org-wide by design. */
const OWNS = '@request.auth.id != "" && project != "" && project.owner = @request.auth.id';
const OWNS_VIA_TEMPLATE =
  '@request.auth.id != "" && template.project != "" && template.project.owner = @request.auth.id';

const templateRules = {
  createRule: OWNS,
  updateRule: `${OWNS} && @request.body.project:isset = false`,
  deleteRule: OWNS,
};

const stepRules = {
  createRule: OWNS_VIA_TEMPLATE,
  updateRule: `${OWNS_VIA_TEMPLATE} && @request.body.template:isset = false`,
  deleteRule: OWNS_VIA_TEMPLATE,
};

const actions = await pb.collections.getOne("workflow_actions");
const actionField = actions.fields.find((f) => f.name === "action");
const needsStart = !actionField.values.includes("start");

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("workflow_templates");
for (const [k, v] of Object.entries(templateRules)) console.log(`  ${k}: ${v}`);
console.log("\nworkflow_steps");
for (const [k, v] of Object.entries(stepRules)) console.log(`  ${k}: ${v}`);
console.log(`\nworkflow_actions.action: ${needsStart ? `add "start" to ${actionField.values.join(", ")}` : "already has start"}`);

if (!APPLY) {
  console.log("\nNothing written. Re-run with --apply.");
  process.exit(0);
}

const tpl = await pb.collections.getOne("workflow_templates");
await pb.collections.update(tpl.id, templateRules);
const steps = await pb.collections.getOne("workflow_steps");
await pb.collections.update(steps.id, stepRules);

if (needsStart) {
  // Additive only: existing values are preserved, so no stored row becomes
  // invalid. Removing a value would orphan rows that use it.
  actionField.values = [...actionField.values, "start"];
  await pb.collections.update(actions.id, { fields: actions.fields });
}

const after = await pb.collections.getOne("workflow_templates");
const afterActions = await pb.collections.getOne("workflow_actions");
console.log("\nApplied.");
console.log(`  templates.updateRule: ${after.updateRule}`);
console.log(`  action values: ${afterActions.fields.find((f) => f.name === "action").values.join(", ")}`);
