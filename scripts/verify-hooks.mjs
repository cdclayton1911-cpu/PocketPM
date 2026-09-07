#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Pocket PM — verify the PocketBase hooks are installed and enforcing
//
//   npm run verify:hooks
//
// Runs from the DEV MACHINE against production, like verify:tenancy. Never
// from the droplet: credentials live in .env.local.
//
// WHY THIS EXISTS
// ---------------
// A syntax error in a hook file does NOT stop PocketBase from starting. It logs
// and carries on with the hook unregistered, so `systemctl is-active` and
// /api/health are both green on an instance with no guard at all. A healthy
// service is not evidence the hook loaded.
//
// This asserts the behaviour instead.
//
// POSITIVE CONTROLS ARE NOT OPTIONAL
// ----------------------------------
// A denial-only suite passes trivially against a hook that rejects everything,
// which would be a broken app rather than a secure one. Every guard here is
// paired with a legitimate operation that must still succeed.
//
// It also asserts on the error MESSAGE, not just the 400. During development a
// ReferenceError inside the hook produced a generic 400 that made a denial
// assertion pass for the wrong reason — the hook had crashed, not refused.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const PB = process.env.PB_URL || "https://pb.pocketpm.fyi";
const STAMP = Date.now();

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

async function api(method, p, body, token) {
  const res = await fetch(`${PB}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data, message: data.message ?? "" };
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
}

const made = { users: [], projects: [] };

async function mkUser(label) {
  const email = `hookprobe-${STAMP}-${label}@example.invalid`;
  const password = `Hook-${STAMP}-${label}-Aa1!`;
  const created = await api("POST", "/api/collections/users/records", {
    email, password, passwordConfirm: password, name: `hook probe ${label}`,
  });
  const auth = await api("POST", "/api/collections/users/auth-with-password", {
    identity: email, password,
  });
  const user = { id: created.data.id, token: auth.data.token };
  made.users.push(user);
  return user;
}

async function main() {
  console.log(`PocketBase: ${PB}\n`);
  console.log("=== 1. workflow creation lands in the defined initial state ===");

  const A = await mkUser("a");
  if (!A.token) {
    check("setup: probe account", false, "could not sign in");
    return;
  }

  const project = await api("POST", "/api/collections/projects/records",
    { name: `Hook probe ${STAMP}`, owner: A.id }, A.token);
  check("setup: project", project.ok, `status ${project.status}`);
  if (!project.ok) return;
  made.projects.push({ id: project.data.id, token: A.token });

  // Uppercase preserved deliberately: A101 is a document number, not prose.
  const submittal = await api("POST", "/api/collections/submittals/records",
    { project: project.data.id, submittal_number: `A101-HOOK-${STAMP}`, description: "hook probe" }, A.token);
  check("setup: submittal", submittal.ok, `status ${submittal.status}`);

  const template = await api("POST", "/api/collections/workflow_templates/records",
    { name: `hook probe tpl ${STAMP}`, entity_type: "submittal", project: project.data.id }, A.token);
  check("setup: template", template.ok, `status ${template.status}`);

  // Fixtures asserted non-4xx BEFORE anything depends on them: a suite that
  // passes because its fixture 400'd is a failure of the suite, not a pass.
  if (!submittal.ok || !template.ok) {
    check("setup: fixtures usable", false, "later assertions would pass vacuously");
    return;
  }

  const snapshot = {
    template: { id: template.data.id, name: "hook probe tpl", entity_type: "submittal", project: project.data.id },
    steps: [{ step_order: 1, name: "Review", approver_mode: "any_of_users", approver_role: "",
              approver_users: [A.id], sla_days: null, on_reject: "return_to_start" }],
  };
  const base = {
    project: project.data.id, submittal: submittal.data.id, template: template.data.id,
    template_snapshot: snapshot, started_by: A.id, started_at: new Date().toISOString(),
  };

  const forgedCreate = await api("POST", "/api/collections/workflow_instances/records",
    { ...base, status: "approved" }, A.token);
  check("a workflow cannot be created already approved",
    forgedCreate.status === 400 && /always begins as/i.test(forgedCreate.message),
    `status ${forgedCreate.status} — ${forgedCreate.message || "(no message: the hook may be absent or crashing)"}`);

  const forgedStep = await api("POST", "/api/collections/workflow_instances/records",
    { ...base, current_step_order: 5 }, A.token);
  check("a workflow cannot be created at an arbitrary step",
    forgedStep.status === 400 && /starts at step/i.test(forgedStep.message),
    `status ${forgedStep.status} — ${forgedStep.message}`);

  // POSITIVE CONTROL.
  const legit = await api("POST", "/api/collections/workflow_instances/records", base, A.token);
  check("a legitimate create SUCCEEDS", legit.ok,
    `status ${legit.status} ${legit.ok ? "" : JSON.stringify(legit.data?.data ?? legit.message)}`);
  check("and lands in the initial state",
    legit.ok && legit.data.status === "pending" && legit.data.current_step_order === 1,
    `status=${legit.data?.status} step=${legit.data?.current_step_order}`);

  if (!legit.ok) return;
  const id = legit.data.id;

  console.log("\n=== 2. a state change requires a logged action ===");

  const forgedPatch = await api("PATCH", `/api/collections/workflow_instances/records/${id}`,
    { status: "approved" }, A.token);
  check("status cannot be changed directly",
    forgedPatch.status === 400 && /attributable to a logged action/i.test(forgedPatch.message),
    `status ${forgedPatch.status} — ${forgedPatch.message || "(no message: the hook may be absent or crashing)"}`);

  const afterForge = await api("GET", `/api/collections/workflow_instances/records/${id}`, null, A.token);
  check("and the record is unchanged", afterForge.data.status === "pending",
    `stored status is ${afterForge.data.status}`);

  await api("POST", "/api/collections/workflow_actions/records",
    { instance: id, step_order: 1, actor: A.id, action: "comment", comment: "probe",
      acted_at: new Date().toISOString() }, A.token);
  const afterComment = await api("PATCH", `/api/collections/workflow_instances/records/${id}`,
    { status: "approved" }, A.token);
  check("a comment does not justify a state change", afterComment.status === 400,
    `status ${afterComment.status} — a note is not an approval`);

  const approve = await api("POST", "/api/collections/workflow_actions/records",
    { instance: id, step_order: 1, actor: A.id, action: "approve", comment: "probe approval",
      acted_at: new Date().toISOString() }, A.token);
  check("setup: approval logged", approve.ok, `status ${approve.status}`);

  // POSITIVE CONTROL — the engine's own path must still work.
  const transition = await api("PATCH", `/api/collections/workflow_instances/records/${id}`,
    { status: "approved", current_step_order: 1, completed_at: new Date().toISOString() }, A.token);
  check("a legitimate transition SUCCEEDS", transition.ok,
    `status ${transition.status} ${transition.ok ? "" : transition.message}`);

  const replay = await api("PATCH", `/api/collections/workflow_instances/records/${id}`,
    { status: "rejected" }, A.token);
  check("the same action cannot be replayed for a second transition", replay.status === 400,
    `status ${replay.status} — the action predates the last state change`);

  // POSITIVE CONTROL — non-lifecycle writes must be untouched.
  const unrelated = await api("PATCH", `/api/collections/workflow_instances/records/${id}`, {}, A.token);
  check("an update touching no lifecycle field is unaffected", unrelated.ok, `status ${unrelated.status}`);

  console.log("\n=== 3. the section 9 regression ===");
  // verify:tenancy section 9 records "stored approved, replayed pending — the
  // PATCH succeeded". That specific PATCH is what this closes.
  const fresh = await api("POST", "/api/collections/workflow_instances/records", base, A.token);
  if (fresh.ok) {
    const forge = await api("PATCH", `/api/collections/workflow_instances/records/${fresh.data.id}`,
      { status: "approved" }, A.token);
    check("the forgery verify:tenancy section 9 records now FAILS", forge.status === 400,
      `status ${forge.status} — this is the regression the hook closes`);
  } else {
    // Expected: the unique partial index allows one open workflow per entity.
    check("second open workflow refused by the unique index (index still holds)",
      fresh.status === 400, `status ${fresh.status}`);
  }
}

try {
  await main();
} finally {
  console.log("\n=== cleanup ===");
  for (const p of made.projects) {
    const r = await api("DELETE", `/api/collections/projects/records/${p.id}`, null, p.token);
    console.log(`  project ${p.id}: ${r.ok || r.status === 404 ? "deleted (children cascade)" : `FAILED ${r.status}`}`);
  }
  for (const u of made.users) {
    const r = await api("DELETE", `/api/collections/users/records/${u.id}`, null, u.token);
    console.log(`  user ${u.id}: ${r.ok || r.status === 404 ? "deleted" : `FAILED ${r.status}`}`);
  }
  if (env.PB_ADMIN_EMAIL && env.PB_ADMIN_PASS) {
    const auth = await api("POST", "/api/collections/_superusers/auth-with-password",
      { identity: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASS });
    if (auth.ok) {
      const left = await api("GET",
        `/api/collections/workflow_templates/records?perPage=200&filter=${encodeURIComponent(`name~"hook probe tpl"`)}`,
        null, auth.data.token);
      for (const t of left.data.items ?? []) {
        await api("DELETE", `/api/collections/workflow_templates/records/${t.id}`, null, auth.data.token);
        console.log(`  template ${t.id}: deleted`);
      }
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== summary ===`);
  console.log(`  ${results.length} assertions, ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.log(`    - ${f.name}`);
    console.log("\n  If the denial assertions failed with no message, the hooks are probably");
    console.log("  not installed. See deploy/HOOKS.md.");
    process.exitCode = 1;
  }
}
