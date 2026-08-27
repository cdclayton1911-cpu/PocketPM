#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Pocket PM — verify PocketBase authorization empirically
//
//   node scripts/verify-tenancy.mjs
//
// Creates two throwaway users, a project and one subcontractor record each,
// then compares what each can actually read and write. Cleans up in a finally.
//
// No credentials needed: users.createRule is "" (public signup), and each user
// can delete its own project and account. It does write to the target instance,
// so point PB_URL at a non-production server if that matters.
//
// WHY THIS EXISTS
// ---------------
// Reading API rules is not enough to know whether authorization works, and an
// empty result set is not evidence of a leak. PocketBase applies a non-null
// list rule as a FILTER: an unauthenticated list of a properly-scoped
// collection returns 200 with zero items, not 403. Only `listRule: null`
// returns 403, and that is superusers-only.
//
// So this script tests the two axes separately:
//   1. unauthenticated  — should see nothing (200 + empty, and 404 on view)
//   2. cross-tenant     — user B, authenticated, must not read or write A's data
//
// Axis 2 is the one that catches a bare `@request.auth.id != ""` rule, which
// every authenticated user satisfies regardless of which project they belong to.
//
// Baseline recorded 2026-08-27, before scripts/apply-rules.mjs was applied:
//   axis 1: all PASS
//   axis 2: all FAIL — B listed A's record, fetched it (200, body returned),
//           and PATCHed it (200)
// ═══════════════════════════════════════════════════════════════════════════

const PB = process.env.PB_URL || "https://pb.pocketpm.fyi";
const STAMP = Date.now();

async function api(method, path, body, token) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

const made = { users: [], projects: [], tokens: {} };

async function mkUser(label) {
  const email = `probe-${STAMP}-${label}@example.invalid`;
  const password = `Probe-${STAMP}-${label}-Aa1!`;
  const c = await api("POST", "/api/collections/users/records", {
    email, password, passwordConfirm: password, name: `probe ${label}`,
  });
  if (!c.ok) throw new Error(`create user ${label} failed (${c.status}): ${JSON.stringify(c.data).slice(0, 200)}`);
  const a = await api("POST", "/api/collections/users/auth-with-password", { identity: email, password });
  if (!a.ok) throw new Error(`auth user ${label} failed (${a.status}): ${JSON.stringify(a.data).slice(0, 200)}`);
  made.users.push({ id: c.data.id, token: a.data.token });
  return { id: c.data.id, token: a.data.token, email };
}

async function mkProjectAndRecord(user, label) {
  const p = await api("POST", "/api/collections/projects/records", {
    name: `probe project ${label} ${STAMP}`, owner: user.id, status: "active",
  }, user.token);
  if (!p.ok) throw new Error(`create project ${label} failed (${p.status}): ${JSON.stringify(p.data).slice(0, 200)}`);
  made.projects.push({ id: p.data.id, token: user.token });

  const s = await api("POST", "/api/collections/subcontractors/records", {
    project: p.data.id, company_name: `probe co ${label}`, trade: "probe trade",
  }, user.token);
  if (!s.ok) throw new Error(`create subcontractor ${label} failed (${s.status}): ${JSON.stringify(s.data).slice(0, 200)}`);
  return { project: p.data.id, record: s.data.id };
}

const line = (s) => console.log(s);
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  line(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (detail) line(`        ${detail}`);
}

try {
  line("\n=== setup ===");
  const A = await mkUser("a");
  const B = await mkUser("b");
  line(`  user A ${A.id}`);
  line(`  user B ${B.id}`);

  const dataA = await mkProjectAndRecord(A, "a");
  const dataB = await mkProjectAndRecord(B, "b");
  line(`  A: project ${dataA.project} subcontractor ${dataA.record}`);
  line(`  B: project ${dataB.project} subcontractor ${dataB.record}`);

  // ---- 1. the check the user asked for: unauthenticated vs authenticated ----
  line("\n=== 1. unauthenticated vs authenticated (projects) ===");

  const anonProjects = await api("GET", "/api/collections/projects/records?perPage=100");
  const anonIds = (anonProjects.data.items || []).map((r) => r.id);
  check(
    "unauthenticated projects read excludes A's project",
    anonProjects.status === 200 && !anonIds.includes(dataA.project),
    `status ${anonProjects.status}, ${anonIds.length} item(s) visible`,
  );

  const authProjects = await api("GET", "/api/collections/projects/records?perPage=100", null, A.token);
  const authIds = (authProjects.data.items || []).map((r) => r.id);
  check(
    "authenticated A sees its own project",
    authIds.includes(dataA.project),
    `status ${authProjects.status}, ${authIds.length} item(s) visible`,
  );
  check(
    "authenticated A does NOT see B's project",
    !authIds.includes(dataB.project),
    `A sees: ${authIds.join(", ") || "(none)"}`,
  );

  // ---- 2. unauthenticated read of subcontractors ----
  line("\n=== 2. unauthenticated read (subcontractors) ===");
  const anonSubs = await api("GET", "/api/collections/subcontractors/records?perPage=100");
  const anonSubIds = (anonSubs.data.items || []).map((r) => r.id);
  check(
    "unauthenticated subcontractors read exposes nothing",
    anonSubs.status === 200 && anonSubIds.length === 0,
    `status ${anonSubs.status}, ${anonSubIds.length} item(s) visible`,
  );

  const anonView = await api("GET", `/api/collections/subcontractors/records/${dataA.record}`);
  check(
    "unauthenticated direct fetch of A's record is denied",
    anonView.status === 403 || anonView.status === 404,
    `status ${anonView.status}`,
  );

  // ---- 3. THE DISCRIMINATING TEST: cross-tenant, both authenticated ----
  line("\n=== 3. cross-tenant (both authenticated) — subcontractors ===");
  line("    rule is `@request.auth.id != \"\"` with no project reference");

  const bList = await api("GET", "/api/collections/subcontractors/records?perPage=100", null, B.token);
  const bIds = (bList.data.items || []).map((r) => r.id);
  check(
    "user B's list does NOT contain user A's subcontractor",
    !bIds.includes(dataA.record),
    `B sees ${bIds.length} record(s): ${bIds.join(", ") || "(none)"}`,
  );

  const bViewA = await api("GET", `/api/collections/subcontractors/records/${dataA.record}`, null, B.token);
  check(
    "user B cannot fetch user A's subcontractor by id",
    bViewA.status === 403 || bViewA.status === 404,
    `status ${bViewA.status}${bViewA.ok ? ` — company_name: ${bViewA.data.company_name}` : ""}`,
  );

  const bPatchA = await api("PATCH", `/api/collections/subcontractors/records/${dataA.record}`,
    { company_name: "MUTATED BY USER B" }, B.token);
  check(
    "user B cannot modify user A's subcontractor",
    bPatchA.status === 403 || bPatchA.status === 404,
    `status ${bPatchA.status}`,
  );

  line("\n=== summary ===");
  const failed = results.filter((r) => !r.pass);
  if (failed.length === 0) {
    line("  all checks passed — scoping holds for both unauthenticated and cross-tenant access");
  } else {
    line(`  ${failed.length} FAILED:`);
    for (const f of failed) line(`    - ${f.name} (${f.detail})`);
  }
} catch (err) {
  line(`\nERROR: ${err.message}`);
} finally {
  line("\n=== cleanup ===");
  for (const p of made.projects) {
    const r = await api("DELETE", `/api/collections/projects/records/${p.id}`, null, p.token);
    line(`  project ${p.id}: ${r.ok ? "deleted (children cascade)" : `FAILED ${r.status}`}`);
  }
  for (const u of made.users) {
    const r = await api("DELETE", `/api/collections/users/records/${u.id}`, null, u.token);
    line(`  user ${u.id}: ${r.ok ? "deleted" : `FAILED ${r.status}`}`);
  }
  const leftProjects = await api("GET", "/api/collections/projects/records?perPage=100");
  line(`  residual unauthenticated project count: ${(leftProjects.data.items || []).length}`);
}
