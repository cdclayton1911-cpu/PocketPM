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
