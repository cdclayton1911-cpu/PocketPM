#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Pocket PM — exercise the Next.js API routes over real HTTP
//
//   npm run verify:routes
//
// Runs from the DEV MACHINE against the deployed app. Signs up a throwaway
// account, writes through the actual route handlers, and cleans up.
//
// WHY THIS EXISTS
// ---------------
// verify:tenancy and verify:hooks both talk to PocketBase DIRECTLY. Neither
// touches a Next.js route, so neither covers the Zod schemas the routes
// validate with — the layer where two silent-drop bugs were found
// (docs/strict-validation-audit.md).
//
// The gap was only obvious once the strict-validation audit landed and there
// was nothing able to prove it worked in production.
//
// POSITIVE CONTROLS
// -----------------
// Denials alone would pass against an app that rejects everything. Every
// refusal here is paired with the legitimate write it must not affect.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.APP_URL || "https://app.pocketpm.fyi";
const STAMP = Date.now();
const EMAIL = `routeprobe-${STAMP}@example.invalid`;
const PASSWORD = `Route-${STAMP}-Aa1!`;

const jar = new Map();
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
}

async function call(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  // Accumulate cookies rather than replacing: the active-project cookie must
  // not evict the session cookie, which silently 401s everything after it.
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body is fine */ }
  return { ok: res.ok, status: res.status, data };
}

/** Multipart variant: FormData must not carry a JSON content-type. */
async function upload(route, form) {
  const res = await fetch(BASE + route, {
    method: "POST",
    headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    body: form,
    redirect: "manual",
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body is fine */ }
  return { ok: res.ok, status: res.status, data };
}

/** A second signed-in account, for the cross-account file check. */
async function secondAccount() {
  const email = `routeprobe-${STAMP}-b@example.invalid`;
  const password = `Route-${STAMP}-B-Aa1!`;
  const res = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Route probe B", email, password, passwordConfirm: password }),
    redirect: "manual",
  });
  const cookies = new Map();
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return { email, header: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") };
}

let projectId = null;

async function main() {
  console.log(`App: ${BASE}\n`);
  console.log("=== routes accept what the app sends ===");

  const signup = await call("POST", "/api/auth/signup", {
    name: "Route probe", email: EMAIL, password: PASSWORD, passwordConfirm: PASSWORD,
  });
  check("signup", signup.status === 201, `status ${signup.status}`);
  if (signup.status !== 201) return;

  // A101 is a contract type, not prose — case preserved.
  const project = await call("POST", "/api/projects", {
    name: `Route probe ${STAMP}`, contract_type: "A101", status: "active",
  });
  projectId = project.data?.project?.id ?? null;
  check("create a project", project.status === 201 && Boolean(projectId), `status ${project.status}`);
  if (!projectId) return;

  check("set the active project",
    (await call("POST", "/api/projects/active", { projectId })).status === 200);

  const submittal = await call("POST", "/api/submittals", {
    submittal_number: `A101-PROBE-${STAMP}`, description: "route probe", type: "shop_drawing",
  });
  const submittalId = submittal.data?.record?.id ?? null;
  check("create a submittal", submittal.status === 201 && Boolean(submittalId),
    `status ${submittal.status} ${submittalId ? "" : JSON.stringify(submittal.data)}`);
  if (!submittalId) return;

  check("edit a submittal",
    (await call("PATCH", `/api/submittals/${submittalId}`, { description: "edited" })).status === 200);

  // The route where the calendar was silently discarded before the audit.
  const calendar = await call("PATCH", `/api/projects/${projectId}`, {
    work_days: [1, 2, 3, 4, 5], holidays: [{ date: "2026-12-25", label: "Christmas" }],
  });
  const stored = JSON.stringify(calendar.data?.project?.work_days ?? null);
  check("a calendar PATCH persists rather than being dropped",
    calendar.status === 200 && stored === "[1,2,3,4,5]",
    `status ${calendar.status}, stored work_days ${stored} — this returned 200 with the calendar discarded before the strict audit`);

  console.log("\n=== routes refuse what they do not recognise ===");

  const unknown = await call("PATCH", `/api/submittals/${submittalId}`, {
    description: "edited again", bogus_field: "x",
  });
  check("an unlisted key is refused, not silently dropped",
    unknown.status === 400 && /nrecognized key/.test(JSON.stringify(unknown.data)),
    `status ${unknown.status} — ${JSON.stringify(unknown.data?.errors ?? unknown.data).slice(0, 120)}`);

  const stillThere = await call("PATCH", `/api/submittals/${submittalId}`, { description: "final" });
  check("and a legitimate edit still works afterwards", stillThere.status === 200,
    `status ${stillThere.status} — the positive control against a route that refuses everything`);

  // ── the workflow engine's own HTTP path ─────────────────────────────────
  //
  // verify:hooks LOOKS like this is covered and is not: it drives PocketBase
  // directly, deliberately, to imitate an attacker. The engine's own path —
  // action written BEFORE the state change — has never been executed by
  // anything but a person clicking. That ordering is what the pb_hooks guard
  // depends on, and if it inverted the guard would start refusing legitimate
  // approvals while looking exactly like a guard that works.
  console.log("\n=== the workflow engine over HTTP ===");

  const template = await call("POST", "/api/workflow/templates", {
    name: `Route probe workflow ${STAMP}`,
    entity_type: "submittal",
    project: projectId,
    active: true,
    description: "",
    steps: [{
      step_order: 1, name: "Review", approver_mode: "any_of_users",
      approver_role: "", approver_users: [signup.data?.user?.id].filter(Boolean),
      sla_days: null, on_reject: "return_to_start",
    }],
  });
  check("create an active workflow template", template.status === 201,
    `status ${template.status} ${template.status === 201 ? "" : JSON.stringify(template.data?.errors ?? template.data).slice(0, 140)}`);

  if (template.status === 201) {
    // A new submittal starts a workflow via crud-route's afterCreate.
    const gated = await call("POST", "/api/submittals", {
      submittal_number: `A101-PROBE-WF-${STAMP}`, description: "workflow probe", type: "shop_drawing",
    });
    const gatedId = gated.data?.record?.id;
    check("creating a submittal starts a workflow", gated.status === 201 && Boolean(gatedId),
      `status ${gated.status}`);

    const loaded = await call("GET", `/api/workflow/instance?entityType=submittal&entityId=${gatedId}`);
    const instance = loaded.data?.instance ?? null;
    check("the instance is readable and pending at step 1",
      instance?.status === "pending" && instance?.current_step_order === 1,
      `status=${instance?.status} step=${instance?.current_step_order}`);

    if (instance) {
      // The concurrency guard: a step order that has already moved on.
      const stale = await call("POST", "/api/workflow/act", {
        instanceId: instance.id, action: "approve", comment: "stale", expectedStepOrder: 99,
      });
      check("a stale expectedStepOrder is refused with 409",
        stale.status === 409, `status ${stale.status} — not a generic error the UI cannot explain`);

      const acted = await call("POST", "/api/workflow/act", {
        instanceId: instance.id, action: "approve", comment: "route probe approval",
        expectedStepOrder: instance.current_step_order,
      });
      check("an approval through the engine SUCCEEDS", acted.status === 200,
        `status ${acted.status} ${acted.status === 200 ? "" : JSON.stringify(acted.data).slice(0, 140)} — the engine satisfies the pb_hooks guard by construction`);

      const after = await call("GET", `/api/workflow/instance?entityType=submittal&entityId=${gatedId}`);
      const actions = after.data?.actions ?? [];
      check("the state advanced AND an action row exists",
        after.data?.instance?.status === "approved" &&
          actions.some((a) => a.action === "approve"),
        `status=${after.data?.instance?.status}, ${actions.length} action(s) — a state change without an action is the forgery the hook refuses`);
    }
  }

  // ── the CPM cache round-trip ────────────────────────────────────────────
  console.log("\n=== the CPM cache says whether it is fresh ===");

  const activity = await call("POST", "/api/schedule-items", {
    activity: "Route probe activity", activity_id: "RP-001",
    target_start: "2026-10-05", target_finish: "2026-10-09", duration_days: 5,
  });
  check("create a schedule activity", activity.status === 201, `status ${activity.status}`);

  if (activity.status === 201) {
    const saved = await call("POST", "/api/schedule/analysis");
    check("saving the analysis writes the computed columns", saved.status === 200,
      `status ${saved.status}, ${saved.data?.written ?? 0} row(s) written`);

    const fresh = await call("GET", "/api/schedule/analysis");
    check("and the cache then reports FRESH",
      fresh.data?.analysis?.freshness?.state === "fresh",
      `freshness=${fresh.data?.analysis?.freshness?.state}`);

    // The comparison that has to be able to fail: change an input, and the
    // stored results must stop claiming to describe it.
    await call("PATCH", `/api/schedule-items/${activity.data.record.id}`, { duration_days: 9 });
    const stale = await call("GET", "/api/schedule/analysis");
    check("editing a duration makes the cache report STALE",
      stale.data?.analysis?.freshness?.state === "stale",
      `freshness=${stale.data?.analysis?.freshness?.state} — a marker that never says stale is not a marker`);
  }

  // ── the file download handler ───────────────────────────────────────────
  //
  // The ONLY place in this app where an authorization decision is made in
  // application code rather than a PocketBase rule.
  console.log("\n=== file downloads are scoped to the project ===");

  const form = new FormData();
  form.append("title", "Route probe document");
  form.append("category", "contract");
  form.append("file", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "probe.pdf",
    { type: "application/pdf" }));
  const doc = await upload("/api/project-documents", form);
  const docId = doc.data?.record?.id;
  const fileName = doc.data?.record?.file;
  check("upload a project document", doc.status === 201 && Boolean(fileName),
    `status ${doc.status} file=${fileName ?? "-"}`);

  if (docId && fileName) {
    const path = `/api/files/project_documents/${docId}/${encodeURIComponent(fileName)}`;
    const owner = await call("GET", path);
    check("the owner can download it", owner.status === 307 || owner.status === 302 || owner.status === 200,
      `status ${owner.status} — a redirect to PocketBase with a short-lived token`);

    const b = await secondAccount();
    const outsider = await fetch(BASE + path, { headers: { Cookie: b.header }, redirect: "manual" });
    // 404 SPECIFICALLY. A 500 is also non-200 and would mean something else
    // entirely — a handler crashing is not a handler refusing.
    check("an unrelated account gets 404, not merely non-200",
      outsider.status === 404, `status ${outsider.status}`);
  }

  // ── the AI auth gate ────────────────────────────────────────────────────
  //
  // Only the free half. Exercising a real generation costs money per run; the
  // gate is what stops an unauthenticated caller billing the Anthropic account,
  // and it must refuse BEFORE any upstream call.
  console.log("\n=== the AI gate refuses before it spends anything ===");
  const anon = await fetch(BASE + "/api/ai/daily-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "probe" }),
    redirect: "manual",
  });
  check("an unauthenticated AI request is refused with 401",
    anon.status === 401, `status ${anon.status} — anything else means an unauthenticated caller reached a paid endpoint`);
}

try {
  await main();
} finally {
  console.log("\n=== cleanup ===");
  const env = {};
  const file = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  // Cleanup goes through PocketBase: the app has no delete route for a project
  // or an account, and leaving probe fixtures on production is not acceptable.
  if (env.PB_ADMIN_EMAIL && env.PB_ADMIN_PASS && env.NEXT_PUBLIC_PB_URL) {
    const { default: PocketBase } = await import("pocketbase");
    const pb = new PocketBase(env.NEXT_PUBLIC_PB_URL);
    await pb.collection("_superusers").authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASS);
    if (projectId) {
      await pb.collection("projects").delete(projectId).catch(() => {});
      console.log(`  project ${projectId}: deleted (children cascade)`);
    }
    for (const t of await pb.collection("workflow_templates").getFullList()) {
      if (String(t.name ?? "").startsWith("Route probe workflow")) {
        await pb.collection("workflow_templates").delete(t.id).catch(() => {});
        console.log(`  template ${t.id}: deleted`);
      }
    }
    for (const u of await pb.collection("users").getFullList()) {
      if (String(u.email ?? "").startsWith("routeprobe-")) {
        await pb.collection("users").delete(u.id).catch(() => {});
        console.log(`  user ${u.email}: deleted`);
      }
    }
  } else {
    console.log("  SKIPPED — no PB_ADMIN_* in .env.local; delete the probe project by hand");
  }

  const failed = results.filter((r) => !r.pass);
  console.log("\n=== summary ===");
  console.log(`  ${results.length} assertions, ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log(`    - ${f.name}`);
  if (failed.length) process.exitCode = 1;
}
