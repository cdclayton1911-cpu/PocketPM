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
// History:
//   2026-08-27, before scripts/apply-rules.mjs — axis 1 all PASS, axis 2 all
//     FAIL: B listed A's record, fetched it (200, body returned), PATCHed it
//     (200). The rule was a bare `@request.auth.id != ""`, which every
//     authenticated user satisfies regardless of project.
//   2026-08-28, after the rules were applied — all PASS. B sees only its own
//     record; fetch and PATCH of A's record both 404.
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

/**
 * A superuser token, when .env.local happens to carry the credentials.
 *
 * The script's no-credentials property is deliberate and preserved: every
 * section works without this. Section 9 alone needs it, because
 * workflow_templates is admin-only to write and an instance requires a
 * template — so without an admin the POSITIVE control cannot run, and a
 * section that only proves denial proves nothing.
 */
async function adminToken() {
  const fs = await import("node:fs");
  const env = {};
  try {
    for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch { return null; }
  if (!env.PB_ADMIN_EMAIL || !env.PB_ADMIN_PASS) return null;
  const r = await api("POST", "/api/collections/_superusers/auth-with-password",
    { identity: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASS });
  return r.ok ? r.data.token : null;
}

const made = { users: [], projects: [], tokens: {}, templates: [] };

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
/** Checks that could not run. Reported separately so SKIP never reads as PASS. */
const skipped = [];
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
  line("    the axis that catches an unscoped rule; see the header note");

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

  /**
   * Section 4 — the cross-table invariant.
   *
   * `document_revisions` will hold a revision's project alongside a pointer to
   * its parent record. That is two tenancy claims for one row, and they can
   * disagree: a caller can name their OWN project (so the create rule passes)
   * while pointing `parent_id` at a record in someone else's. Nothing in a
   * per-collection rule catches that, because each field is individually
   * legitimate.
   *
   * This check exists BEFORE the collection does, deliberately. It reports SKIP
   * rather than PASS while absent, so a green run never implies the invariant
   * was tested — and it starts failing the moment the collection appears
   * without the rule that enforces agreement.
   */
  line("\n=== 4. cross-table invariant — document_revisions ===");
  line("    a revision carries two tenancy claims: its own project, and a parent");
  line("    that has one. Each is individually legitimate, so no single-field");
  line("    rule catches them disagreeing.");

  const revProbe = await api("GET", "/api/collections/document_revisions/records?perPage=1", null, A.token);

  if (revProbe.status === 404) {
    line("  SKIP  document_revisions does not exist yet");
    line("        This check must pass before that collection holds anything.");
    skipped.push("document_revisions cross-table invariant");
  } else {
    // A parent in each tenant's own project.
    const subA = await api("POST", "/api/collections/submittals/records",
      { project: dataA.project, submittal_number: "S-A-001", description: "A's submittal" }, A.token);
    const subB = await api("POST", "/api/collections/submittals/records",
      { project: dataB.project, submittal_number: "S-B-001", description: "B's submittal" }, B.token);
    line(`  A submittal ${subA.data.id}  B submittal ${subB.data.id}`);
    // Without both parents the forged-write check would "pass" on a malformed
    // request rather than on the rule, which is a false green.
    check(
      "setup: both parent submittals were created",
      Boolean(subA.data.id && subB.data.id),
      `A ${subA.status}, B ${subB.status}`,
    );

    // THE forged write: A names A's own project (so the membership clause
    // passes) while pointing the parent at B's submittal.
    const forged = await api("POST", "/api/collections/document_revisions/records",
      { project: dataA.project, submittal: subB.data.id, revision_number: 0, status: "draft" }, A.token);
    check(
      "A cannot create a revision whose parent belongs to B's project",
      forged.status === 400 || forged.status === 403,
      `status ${forged.status} — a 2xx means project and parent are trusted independently`,
    );

    // A rule that denies everything would pass the check above while breaking
    // the feature, so prove the legitimate write still works.
    const legit = await api("POST", "/api/collections/document_revisions/records",
      { project: dataA.project, submittal: subA.data.id, revision_number: 0, status: "draft" }, A.token);
    check(
      "A CAN create a revision on A's own submittal",
      legit.status === 200 || legit.status === 201,
      `status ${legit.status}${legit.ok ? "" : ` — ${JSON.stringify(legit.data).slice(0, 160)}`}`,
    );

    // A revision must hang off a parent at all.
    const orphan = await api("POST", "/api/collections/document_revisions/records",
      { project: dataA.project, revision_number: 1, status: "draft" }, A.token);
    check(
      "a revision with no parent is refused",
      orphan.status === 400 || orphan.status === 403,
      `status ${orphan.status}`,
    );

    if (legit.ok) {
      const revId = legit.data.id;

      // Immutable ON ISSUE, not on supersession: a draft is still editable.
      const editDraft = await api("PATCH", `/api/collections/document_revisions/records/${revId}`,
        { revision_number: 2 }, A.token);
      check(
        "a DRAFT revision can still be edited",
        editDraft.ok,
        `status ${editDraft.status}`,
      );

      const issue = await api("PATCH", `/api/collections/document_revisions/records/${revId}`,
        { status: "submitted", issued_at: "2026-09-04" }, A.token);
      check("a draft can be issued", issue.ok, `status ${issue.status}`);

      // Once issued the evidence is frozen.
      const tamper = await api("PATCH", `/api/collections/document_revisions/records/${revId}`,
        { revision_number: 99 }, A.token);
      // PocketBase answers a rule-excluded write with 404, not 403 — the same
      // behaviour the CRUD route factory relies on. What proves the refusal is
      // that the stored value did not move, so check that rather than the code.
      const afterTamper = await api("GET", `/api/collections/document_revisions/records/${revId}`, null, A.token);
      check(
        "an ISSUED revision cannot have its revision_number changed",
        !tamper.ok && afterTamper.data.revision_number === 2,
        `write status ${tamper.status}; stored revision_number is still ${afterTamper.data.revision_number}`,
      );

      // But lifecycle bookkeeping continues, or nothing could be superseded.
      const supersede = await api("PATCH", `/api/collections/document_revisions/records/${revId}`,
        { status: "superseded", is_current: false }, A.token);
      check(
        "an issued revision CAN still be marked superseded",
        supersede.ok,
        `status ${supersede.status}`,
      );

      // Never delete a superseded revision because a newer one exists.
      const del = await api("DELETE", `/api/collections/document_revisions/records/${revId}`, null, A.token);
      const afterDel = await api("GET", `/api/collections/document_revisions/records/${revId}`, null, A.token);
      check(
        "a superseded revision cannot be deleted",
        !del.ok && afterDel.ok,
        `delete status ${del.status}; record still readable: ${afterDel.ok} — the history is what survives a dispute`,
      );

      // And the ordinary cross-tenant axis.
      const bRevs = await api("GET", "/api/collections/document_revisions/records?perPage=100", null, B.token);
      const bRevIds = (bRevs.data.items || []).map((r) => r.id);
      check(
        "user B's revision list does NOT contain A's revision",
        !bRevIds.includes(revId),
        `B sees ${bRevIds.length} revision(s)`,
      );

      const bView = await api("GET", `/api/collections/document_revisions/records/${revId}`, null, B.token);
      check(
        "user B cannot fetch A's revision by id",
        bView.status === 403 || bView.status === 404,
        `status ${bView.status}`,
      );
    }
  }

  /**
   * Section 5 — schedule relationships.
   *
   * Both endpoints are typed relations, so PocketBase can enforce that an edge
   * never spans two projects. This proves it does, and — as elsewhere — proves
   * the legitimate write still works, since a rule that refuses everything
   * would pass the security assertion while breaking the feature.
   */
  line("\n=== 5. schedule relationships — endpoints cannot span projects ===");

  const relProbe = await api("GET", "/api/collections/schedule_relationships/records?perPage=1", null, A.token);

  if (relProbe.status === 404) {
    line("  SKIP  schedule_relationships does not exist yet");
    skipped.push("schedule_relationships cross-project endpoints");
  } else {
    const actA1 = await api("POST", "/api/collections/schedule_items/records",
      { project: dataA.project, activity_id: "A-1", activity: "A one", duration_days: 5 }, A.token);
    const actA2 = await api("POST", "/api/collections/schedule_items/records",
      { project: dataA.project, activity_id: "A-2", activity: "A two", duration_days: 5 }, A.token);
    const actB1 = await api("POST", "/api/collections/schedule_items/records",
      { project: dataB.project, activity_id: "B-1", activity: "B one", duration_days: 5 }, B.token);
    check(
      "setup: activities created in both projects",
      Boolean(actA1.data.id && actA2.data.id && actB1.data.id),
      `A ${actA1.status}/${actA2.status}, B ${actB1.status}`,
    );

    const crossed = await api("POST", "/api/collections/schedule_relationships/records",
      { project: dataA.project, predecessor: actA1.data.id, successor: actB1.data.id, type: "FS" }, A.token);
    check(
      "A cannot link one of A's activities to one of B's",
      !crossed.ok,
      `status ${crossed.status} — a 2xx means the endpoints are trusted independently of project`,
    );

    const withinA = await api("POST", "/api/collections/schedule_relationships/records",
      { project: dataA.project, predecessor: actA1.data.id, successor: actA2.data.id, type: "FS" }, A.token);
    check(
      "A CAN link two of A's own activities",
      withinA.ok,
      `status ${withinA.status}${withinA.ok ? "" : ` — ${JSON.stringify(withinA.data).slice(0, 140)}`}`,
    );

    const bList = await api("GET", "/api/collections/schedule_relationships/records?perPage=100", null, B.token);
    const bIds = (bList.data.items || []).map((r) => r.id);
    check(
      "user B's relationship list does not contain A's edge",
      !bIds.includes(withinA.data?.id),
      `B sees ${bIds.length} relationship(s)`,
    );
  }

  /**
   * Section 6 — baselines.
   *
   * A baseline item names its activity by business key rather than by relation,
   * so it survives the re-import that replaces schedule_items. That means the
   * only thing standing between a baseline row and another tenant's project is
   * the `baseline.project = project` agreement clause — worth proving.
   */
  line("\n=== 6. schedule baselines — items cannot be filed under another project ===");

  const blProbe = await api("GET", "/api/collections/schedule_baselines/records?perPage=1", null, A.token);

  if (blProbe.status === 404) {
    line("  SKIP  schedule_baselines does not exist yet");
    skipped.push("schedule_baselines cross-project items");
  } else {
    const blA = await api("POST", "/api/collections/schedule_baselines/records",
      { project: dataA.project, name: "A original", taken_at: "2026-01-01" }, A.token);
    const blB = await api("POST", "/api/collections/schedule_baselines/records",
      { project: dataB.project, name: "B original", taken_at: "2026-01-01" }, B.token);
    check(
      "setup: a baseline in each project",
      Boolean(blA.data.id && blB.data.id),
      `A ${blA.status}, B ${blB.status}`,
    );

    // A names its own project but B's baseline — each field individually valid.
    const crossed = await api("POST", "/api/collections/schedule_baseline_items/records",
      { project: dataA.project, baseline: blB.data.id, activity_id: "A1010" }, A.token);
    check(
      "A cannot file a baseline item against B's baseline",
      !crossed.ok,
      `status ${crossed.status} — a 2xx means project and baseline are trusted independently`,
    );

    const own = await api("POST", "/api/collections/schedule_baseline_items/records",
      { project: dataA.project, baseline: blA.data.id, activity_id: "A1010", start: "2026-03-02", finish: "2026-03-06" }, A.token);
    check(
      "A CAN file an item against A's own baseline",
      own.ok,
      `status ${own.status}${own.ok ? "" : ` — ${JSON.stringify(own.data).slice(0, 140)}`}`,
    );

    const dupe = await api("POST", "/api/collections/schedule_baseline_items/records",
      { project: dataA.project, baseline: blA.data.id, activity_id: "A1010" }, A.token);
    check(
      "the same activity cannot appear twice in one baseline",
      !dupe.ok,
      `status ${dupe.status} — a duplicate would make variance ambiguous with no error to notice`,
    );

    const bSees = await api("GET", "/api/collections/schedule_baseline_items/records?perPage=100", null, B.token);
    check(
      "user B's baseline items do not include A's",
      !(bSees.data.items || []).some((r) => r.id === own.data?.id),
      `B sees ${(bSees.data.items || []).length} item(s)`,
    );
  }

  /**
   * Section 7 — project roles.
   *
   * The property worth proving is a negative: **a role row grants nothing.**
   * Recording an external architect must not let them read the project, or the
   * distinction between "who is on this job" and "who can see this job" has
   * collapsed and every one of the 108 membership rules is moot.
   */
  line("\n=== 7. project roles — recording a party grants no access ===");

  const roleProbe = await api("GET", "/api/collections/project_roles/records?perPage=1", null, A.token);

  if (roleProbe.status === 404) {
    line("  SKIP  project_roles does not exist yet");
    skipped.push("project_roles access separation");
  } else {
    // A records B as an outside consultant on A's project — name only, no link.
    const external = await api("POST", "/api/collections/project_roles/records",
      { project: dataA.project, role: "architect", contact_name: "Outside Architect", company: "AE Partners", is_external: true }, A.token);
    check("A can record an external party by name", external.ok, `status ${external.status}`);

    // And A records B's ACCOUNT in a role, which is the dangerous case: if a
    // role row granted access, this would hand B the project.
    const linked = await api("POST", "/api/collections/project_roles/records",
      { project: dataA.project, role: "consultant", user: B.id }, A.token);
    check("A can name another account in a role", linked.ok, `status ${linked.status}`);

    const bProjects = await api("GET", "/api/collections/projects/records?perPage=100", null, B.token);
    const bIds = (bProjects.data.items || []).map((r) => r.id);
    check(
      "being named in a role does NOT give B access to A's project",
      !bIds.includes(dataA.project),
      `B sees ${bIds.length} project(s) — a role is not a membership`,
    );

    const bSubs = await api("GET", "/api/collections/subcontractors/records?perPage=100", null, B.token);
    check(
      "nor to A's records",
      !(bSubs.data.items || []).some((r) => r.id === dataA.record),
      `B sees ${(bSubs.data.items || []).length} subcontractor(s)`,
    );

    const nobody = await api("POST", "/api/collections/project_roles/records",
      { project: dataA.project, role: "engineer" }, A.token);
    check(
      "a role with neither a user nor a contact name is refused",
      !nobody.ok,
      `status ${nobody.status} — a row that names nobody cannot be routed to`,
    );
  }

  /**
   * Section 8 — the users directory.
   *
   * users.listRule was `@request.auth.id != ""` for a long time, which let any
   * authenticated account enumerate every user across every company. This is
   * the check that keeps it narrowed: A and B share no project, so neither
   * should be able to see the other, while both must still see themselves — a
   * rule that hid a user from themselves would break their own profile.
   */
  line("\n=== 8. users directory — no cross-company enumeration ===");

  const aSeesUsers = await api("GET", "/api/collections/users/records?perPage=200", null, A.token);
  const aIds = (aSeesUsers.data.items || []).map((r) => r.id);
  check(
    "user A cannot see user B (they share no project)",
    !aIds.includes(B.id),
    `A sees ${aIds.length} user(s)`,
  );
  check(
    "user A can still see themselves",
    aIds.includes(A.id),
    `A ${aIds.includes(A.id) ? "is" : "is NOT"} in their own list — a rule that hides you from yourself breaks your profile`,
  );

  const bViewUserA = await api("GET", `/api/collections/users/records/${A.id}`, null, B.token);
  check(
    "user B cannot fetch user A by id",
    bViewUserA.status === 403 || bViewUserA.status === 404,
    `status ${bViewUserA.status}`,
  );

  // The positive control: once they share a project, they must see each other,
  // or the user picker that motivated this narrowing cannot work.
  const share = await api("PATCH", `/api/collections/projects/records/${dataA.project}`,
    { members: [B.id] }, A.token);
  if (share.ok) {
    const aAgain = await api("GET", "/api/collections/users/records?perPage=200", null, A.token);
    check(
      "once B is a member of A's project, A CAN see B",
      (aAgain.data.items || []).map((r) => r.id).includes(B.id),
      `A now sees ${(aAgain.data.items || []).length} user(s) — without this the member picker cannot work`,
    );
  } else {
    check("setup: could add B to A's project", false, `status ${share.status}`);
  }

  /**
   * Section 9 — the workflow engine.
   *
   * Deliberately its own section: a failure here must name workflows rather
   * than surfacing as an unexplained regression somewhere else.
   *
   * Two of the invariants originally specified for this section are absent on
   * purpose, because they became unrepresentable rather than untested. The
   * instance points at its entity through typed `submittal` / `rfi` relations,
   * so "entity_id resolves to a real record" is a foreign key the database
   * enforces on every write, and "entity_type matches the entity" has no
   * discriminator left to disagree with. What IS checked here is what SQL
   * cannot express on its own.
   *
   * Note the state this section inherits: section 8 added B to A's project, so
   * B is a member here. A third user, C, provides the outsider.
   */
  line("\n=== 9. workflows — instances cannot cross a project boundary ===");

  const wfProbe = await api("GET", "/api/collections/workflow_instances/records?perPage=1", null, A.token);

  if (wfProbe.status === 404) {
    line("  SKIP  workflow collections do not exist yet");
    skipped.push("workflow instance scoping");
  } else {
    const C = await mkUser("c");
    const dataC = await mkProjectAndRecord(C, "c");

    // An org-wide template (no project) fits any project, so one serves both.
    const admin = await adminToken();
    let templateId = null;
    if (admin) {
      const tpl = await api("POST", "/api/collections/workflow_templates/records",
        { name: `probe template ${STAMP}`, entity_type: "submittal", description: "verify:tenancy fixture" }, admin);
      if (tpl.ok) {
        templateId = tpl.data.id;
        made.templates.push(templateId);
      }
    }

    // A template with no project is the org-wide default and fits any project.
    // Only a superuser can create one, so the fixture uses an instance whose
    // template is absent instead — which is itself the first assertion.
    const noTemplate = await api("POST", "/api/collections/workflow_instances/records",
      { project: dataA.project, submittal: "", rfi: "", template_snapshot: {}, status: "pending",
        current_step_order: 1, started_by: A.id, started_at: new Date().toISOString() }, A.token);
    check(
      "an instance with no entity is refused",
      !noTemplate.ok,
      `status ${noTemplate.status} — a workflow approving nothing has no meaning`,
    );

    // Build a real submittal in each project to hang instances off.
    const subA = await api("POST", "/api/collections/submittals/records",
      { project: dataA.project, submittal_number: `PROBE-A-${STAMP}`, description: "probe" }, A.token);
    const subC = await api("POST", "/api/collections/submittals/records",
      { project: dataC.project, submittal_number: `PROBE-C-${STAMP}`, description: "probe" }, C.token);

    if (!subA.ok || !subC.ok) {
      // Explicit, because a fixture that failed to build makes every later
      // "was refused" look like a pass for the wrong reason. Section 4 shipped
      // exactly that false green once.
      check("setup: a submittal in each project", false,
        `A ${subA.status}, C ${subC.status} — later checks would pass vacuously`);
    } else {
      const base = {
        template: templateId,
        template_snapshot: { steps: [{ step_order: 1, name: "Review" }] },
        status: "pending", current_step_order: 1,
        started_by: A.id, started_at: new Date().toISOString(),
      };

      if (!templateId) {
        line("  SKIP  no superuser credentials in .env.local — instance checks need a template");
        skipped.push("workflow instance scoping (needs PB_ADMIN_* in .env.local)");
      } else {
      // The cross-tenancy case: A owns the project named, but the submittal
      // belongs to C. A 2xx here means project and entity are trusted
      // independently, which is the whole hole this rule exists to close.
      const crossed = await api("POST", "/api/collections/workflow_instances/records",
        { ...base, project: dataA.project, submittal: subC.data.id }, A.token);
      check(
        "an instance cannot point at a submittal in another project",
        !crossed.ok,
        `status ${crossed.status} — a 2xx means project and entity are trusted separately`,
      );

      // A real RFI, so "both entities set" is actually testable. An earlier
      // version passed rfi: "" here, which is a VALID single-entity create —
      // it silently succeeded and consumed the one-open-workflow index, making
      // the legitimate create below fail as a duplicate.
      const rfiA = await api("POST", "/api/collections/rfis/records",
        { project: dataA.project, rfi_number: `PROBE-A-${STAMP}`, subject: "probe", question: "probe" }, A.token);
      if (!rfiA.ok) {
        check("setup: an RFI in A's project", false, `status ${rfiA.status}`);
      } else {
        const bothSet = await api("POST", "/api/collections/workflow_instances/records",
          { ...base, project: dataA.project, submittal: subA.data.id, rfi: rfiA.data.id }, A.token);
        check("an instance cannot name both a submittal and an RFI", !bothSet.ok,
          `status ${bothSet.status} — two entities makes "what is being approved" ambiguous`);
      }

      const good = await api("POST", "/api/collections/workflow_instances/records",
        { ...base, project: dataA.project, submittal: subA.data.id }, A.token);
      check("A CAN start a workflow on A's own submittal", good.ok,
        `status ${good.status} ${good.ok ? "" : JSON.stringify(good.data?.data ?? good.data)} — without this the rule is merely denying everything`);

      if (good.ok) {
        // One in-flight workflow per entity. Two pending instances on one
        // submittal would make "the current approver" ambiguous with nothing
        // to notice it.
        const second = await api("POST", "/api/collections/workflow_instances/records",
          { ...base, project: dataA.project, submittal: subA.data.id }, A.token);
        check("a second open workflow on the same submittal is refused", !second.ok,
          `status ${second.status} — two pending instances make the current approver ambiguous`);

        // The frozen snapshot. If this succeeds, an in-flight workflow can be
        // rewritten mid-approval and the audit log describes steps that no
        // longer exist.
        const rewrite = await api("PATCH", `/api/collections/workflow_instances/records/${good.data.id}`,
          { template_snapshot: { steps: [] } }, A.token);
        check("the template snapshot cannot be edited after the fact", !rewrite.ok,
          `status ${rewrite.status} — a mutable snapshot defeats the point of taking one`);

        const moved = await api("PATCH", `/api/collections/workflow_instances/records/${good.data.id}`,
          { submittal: subC.data.id }, A.token);
        check("an instance cannot be moved to another entity", !moved.ok, `status ${moved.status}`);

        // Append-only, the one that is unrecoverable if wrong.
        const act = await api("POST", "/api/collections/workflow_actions/records",
          { instance: good.data.id, step_order: 1, actor: A.id, action: "approve",
            comment: "probe", acted_at: new Date().toISOString() }, A.token);
        check("A can record an action on their own instance", act.ok, `status ${act.status}`);

        if (act.ok) {
          const edited = await api("PATCH", `/api/collections/workflow_actions/records/${act.data.id}`,
            { comment: "rewritten" }, A.token);
          check("an action cannot be edited", !edited.ok,
            `status ${edited.status} — append-only is the audit trail's only guarantee`);

          const removed = await api("DELETE", `/api/collections/workflow_actions/records/${act.data.id}`, null, A.token);
          check("an action cannot be deleted", !removed.ok, `status ${removed.status}`);
        }

        // Forging authorship: an action attributed to someone else would make
        // "who approved this" unanswerable.
        const forged = await api("POST", "/api/collections/workflow_actions/records",
          { instance: good.data.id, step_order: 1, actor: B.id, action: "approve",
            comment: "forged", acted_at: new Date().toISOString() }, A.token);
        check("an action cannot be attributed to another user", !forged.ok, `status ${forged.status}`);

        // C is in neither A's project nor its membership.
        const cSees = await api("GET", "/api/collections/workflow_instances/records?perPage=100", null, C.token);
        check(
          "an outsider cannot see A's workflow instance",
          !(cSees.data.items || []).some((r) => r.id === good.data.id),
          `C sees ${(cSees.data.items || []).length} instance(s)`,
        );

        const cActions = await api("GET", "/api/collections/workflow_actions/records?perPage=100", null, C.token);
        check(
          "nor its action history",
          (cActions.data.items || []).length === 0,
          `C sees ${(cActions.data.items || []).length} action(s)`,
        );

        // The positive control, in section 8's style. B was added to A's
        // project there, so B is a member and MUST see this. A suite that only
        // proves denial passes trivially against a rule that denies everything.
        const bSees = await api("GET", "/api/collections/workflow_instances/records?perPage=100", null, B.token);
        check(
          "a member of the project CAN see the instance",
          (bSees.data.items || []).some((r) => r.id === good.data.id),
          `B sees ${(bSees.data.items || []).length} instance(s) — without this the section proves nothing`,
        );
      }
      }
    }
  }

  line("\n=== summary ===");
  const failed = results.filter((r) => !r.pass);
  if (failed.length === 0) {
    line("  all checks passed — scoping holds for both unauthenticated and cross-tenant access");
    for (const name of skipped) line(`  SKIPPED (not tested): ${name}`);
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
  // The section 9 fixture template is org-wide, so no project cascade reaches
  // it. Left behind, it would become an active org-wide default on the live
  // instance — configuration invented by a test.
  if (made.templates.length) {
    const admin = await adminToken();
    for (const id of made.templates) {
      const r = admin
        ? await api("DELETE", `/api/collections/workflow_templates/records/${id}`, null, admin)
        : { ok: false, status: "no admin token" };
      line(`  template ${id}: ${r.ok ? "deleted" : `FAILED ${r.status} — delete it by hand`}`);
    }
  }

  const leftProjects = await api("GET", "/api/collections/projects/records?perPage=100");
  line(`  residual unauthenticated project count: ${(leftProjects.data.items || []).length}`);
}
