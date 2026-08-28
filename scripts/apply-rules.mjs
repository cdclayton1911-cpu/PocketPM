#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Pocket PM — apply PocketBase API rules
//
// Adds project-scoped authorization to the child collections that currently
// use a bare `@request.auth.id != ""`, which lets ANY authenticated user read
// and write EVERY record across ALL projects.
//
//   node scripts/apply-rules.mjs --dry-run
//   PB_EMAIL=you@example.com PB_PASS=... node scripts/apply-rules.mjs
//   PB_EMAIL=... PB_PASS=... node scripts/apply-rules.mjs --verify-tenancy
//
// Requires PocketBase >= 0.23 (uses the _superusers auth endpoint; the legacy
// /api/admins endpoint was removed).
//
// Safe to re-run: collections already matching their target are left untouched.
// Every current rule is snapshotted to scripts/rules-backup-<ts>.json first.
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const PB_URL = process.env.PB_URL || "https://pb.pocketpm.fyi";
const PB_EMAIL = process.env.PB_EMAIL || "";
const PB_PASS = process.env.PB_PASS || "";

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY_TENANCY = process.argv.includes("--verify-tenancy");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ── output ───────────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", green: "\x1b[32m", yellow: "\x1b[33m",
  red: "\x1b[31m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
};
const ok = (m) => console.log(`${C.green}  ✓${C.reset}  ${m}`);
const skip = (m) => console.log(`${C.yellow}  –${C.reset}  ${m}`);
const fail = (m) => console.log(`${C.red}  ✗${C.reset}  ${m}`);
const info = (m) => console.log(`${C.dim}     ${m}${C.reset}`);
const head = (m) => console.log(`\n${C.bold}${m}${C.reset}`);

// ── the rule we are applying ────────────────────────────────────────────────
//
// Identical to the rule `tasks` already uses, which is the one child collection
// that was scoped correctly. Reads as: you must be signed in, AND the parent
// project must either be owned by you or list you as a member.
const PROJECT_SCOPED =
  '@request.auth.id != "" && (project.owner = @request.auth.id || project.members.id ?= @request.auth.id)';

// The 15 child collections carrying a `project` relation. Every rule
// (list/view/create/update/delete) becomes PROJECT_SCOPED.
const TARGETS = [
  "aia_notices",
  "budget_items",
  "change_orders",
  "daily_logs",
  "deficiencies",
  "dfow",
  "drawings",
  // invitations is locked to project members with NO token path in the rules.
  // See the note below the EXCLUDED block for why.
  "invitations",
  "pay_applications",
  "punch_list",
  "rfis",
  "safety_observations",
  "schedule_items",
  "subcontractors",
  "submittals",
];

// Deliberately NOT touched. Documented so nobody "fixes" these later by mistake.
const EXCLUDED = {
  projects:
    "already correct — owner/members scoped, delete restricted to the owner",
  tasks:
    "already correct — this is the pattern being copied to the others",
  ai_sessions:
    "user = @request.auth.id is STRICTER than project scoping; narrowing it further would be a behaviour change, not a fix",
  users:
    'auth collection. createRule is "" = public self-serve signup. Intended.',
};

// ── invitations ──────────────────────────────────────────────────────────────
//
// Locked to project members on all five rules, exactly like the other child
// collections. There is deliberately NO token path in the rules.
//
// What was wrong before:
//   listRule  `@request.auth.id != ""`
//             any authenticated user could list EVERY invitation, token included
//   viewRule  `@request.auth.id != "" || token != ""`
//             `token` is the RECORD's field and is required, so `token != ""`
//             is true for every record — effectively public
//
// A rejected fix was `@request.query.token = token`, which would let the link
// holder view their own invitation. It was rejected because it puts a bearer
// credential in a URL, where it leaks into server access logs, browser history,
// and Referer headers.
//
// Instead, invite acceptance will go through a POST route handler that reads
// the token from the REQUEST BODY and validates it server-side with an admin
// client. The collection stays closed to non-members; the handler is the only
// way in. To be designed when team invites are built.

const RULE_KEYS = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

// ── http ─────────────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

// ── auth ─────────────────────────────────────────────────────────────────────

/**
 * Prompt for the password with echo suppressed.
 *
 * Preferred over passing PB_PASS on the command line: it keeps the secret out
 * of shell history and the process list, and avoids shell quoting mangling
 * characters like $, !, or backticks.
 */
function promptPassword(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("no TTY available — set PB_PASS instead"));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Suppress echo: swallow everything except the prompt itself.
    const onWrite = (chunk, encoding, callback) => {
      if (chunk.toString() !== promptText) {
        rl.output.write("", encoding, callback);
        return;
      }
      process.stdout.constructor.prototype.write.call(rl.output, chunk, encoding, callback);
    };
    rl.output.write = onWrite;
    process.stdout.write(promptText);
    rl.question("", (answer) => {
      rl.output.write = process.stdout.constructor.prototype.write.bind(rl.output);
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function authenticate() {
  if (!PB_EMAIL) {
    fail("PB_EMAIL is required.");
    info("PB_EMAIL=you@example.com node scripts/apply-rules.mjs");
    info("This must be the SUPERUSER account (the pb.pocketpm.fyi/_/ login),");
    info("not an app user in the `users` collection — they are separate on 0.23+.");
    process.exit(1);
  }

  // Prefer an interactive prompt; fall back to PB_PASS for CI.
  let password = PB_PASS;
  if (!password) {
    try {
      password = await promptPassword(`Password for ${PB_EMAIL}: `);
    } catch (err) {
      fail(err.message);
      process.exit(1);
    }
  }
  if (!password) {
    fail("no password entered");
    process.exit(1);
  }

  const endpoint = "/api/collections/_superusers/auth-with-password";
  const res = await api("POST", endpoint, { identity: PB_EMAIL, password });

  if (res.ok && res.data.token) {
    ok(`authenticated as ${PB_EMAIL} (${res.data.record?.collectionName ?? "_superusers"})`);
    return res.data.token;
  }

  if (res.status === 404) {
    fail(`${endpoint} returned 404.`);
    info("That endpoint requires PocketBase >= 0.23, where admins became the");
    info("_superusers collection. This server looks older than that.");
    process.exit(1);
  }

  // Enough detail to spot a typo or a truncated value without printing the secret.
  fail(`authentication failed (${res.status}): ${JSON.stringify(res.data).slice(0, 200)}`);
  info(`endpoint: POST ${PB_URL}${endpoint}`);
  info(`identity: ${PB_EMAIL}`);
  info(`password: ${password.length} characters received`);
  info("");
  info("PocketBase returns the same error for an unknown account and a wrong");
  info("password, so check both:");
  info(`  - can you log in at ${PB_URL}/_/ with exactly these?`);
  info("  - is this the superuser account, not an app user?");
  process.exit(1);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}Pocket PM — apply PocketBase API rules${C.reset}`);
  console.log(`${C.dim}Target: ${PB_URL}${C.reset}`);
  if (DRY_RUN) console.log(`${C.yellow}DRY RUN — nothing will be written${C.reset}`);

  const token = await authenticate();

  head("Fetching current rules");
  const list = await api("GET", "/api/collections?perPage=200", null, token);
  if (!list.ok) {
    fail(`could not list collections (${list.status})`);
    process.exit(1);
  }
  const collections = list.data.items || [];
  const byName = Object.fromEntries(collections.map((c) => [c.name, c]));
  ok(`${collections.length} collections`);

  // Snapshot before touching anything.
  const backup = collections.map((c) => ({
    name: c.name,
    id: c.id,
    ...Object.fromEntries(RULE_KEYS.map((k) => [k, c[k]])),
  }));
  if (!DRY_RUN) {
    const path = join(SCRIPT_DIR, `rules-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(path, JSON.stringify(backup, null, 2));
    ok(`backup written to ${path}`);
  } else {
    info("(dry run — no backup written)");
  }

  head(`Applying project scoping to ${TARGETS.length} collections`);

  let changed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const name of TARGETS) {
    const col = byName[name];
    if (!col) {
      fail(`${name} — not found on this server`);
      failed++;
      continue;
    }

    const alreadyCorrect = RULE_KEYS.every((k) => col[k] === PROJECT_SCOPED);
    if (alreadyCorrect) {
      skip(`${name} — already scoped, no change`);
      unchanged++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`${C.cyan}  →${C.reset}  ${name}`);
      for (const k of RULE_KEYS) {
        if (col[k] !== PROJECT_SCOPED) {
          info(`${k}:`);
          info(`  ${C.red}- ${col[k] === null ? "null (admin only)" : col[k]}${C.reset}`);
          info(`  ${C.green}+ ${PROJECT_SCOPED}${C.reset}`);
        }
      }
      changed++;
      continue;
    }

    const patch = Object.fromEntries(RULE_KEYS.map((k) => [k, PROJECT_SCOPED]));
    const res = await api("PATCH", `/api/collections/${col.id}`, patch, token);
    if (res.ok) {
      ok(`${name} — all 5 rules project-scoped`);
      changed++;
    } else {
      fail(`${name} — PATCH failed (${res.status}): ${JSON.stringify(res.data).slice(0, 160)}`);
      failed++;
    }
  }

  head("Deliberately not modified");
  for (const [name, why] of Object.entries(EXCLUDED)) {
    console.log(`${C.dim}  ${name.padEnd(14)}${C.reset} ${why}`);
  }

  if (DRY_RUN) {
    console.log(`\n${C.yellow}Dry run: ${changed} would change, ${unchanged} already correct.${C.reset}\n`);
    return;
  }

  // ── verification: read back ────────────────────────────────────────────────
  //
  // This is the check that actually proves the write landed. Note what is NOT
  // asserted: that an unauthenticated read returns 403. It cannot. PocketBase
  // applies a non-null list rule as a FILTER, so an unauthenticated list of a
  // properly-scoped collection returns 200 with an empty result set. Only
  // `listRule: null` yields 403, and that is admin-only — it would break the
  // app for every real user. Do not add such a check.
  head("Verification — reading rules back");

  const after = await api("GET", "/api/collections?perPage=200", null, token);
  const afterByName = Object.fromEntries((after.data.items || []).map((c) => [c.name, c]));

  let verified = 0;
  let mismatched = 0;
  for (const name of TARGETS) {
    const col = afterByName[name];
    if (!col) {
      fail(`${name} — missing on read-back`);
      mismatched++;
      continue;
    }
    const bad = RULE_KEYS.filter((k) => col[k] !== PROJECT_SCOPED);
    if (bad.length === 0) {
      verified++;
    } else {
      fail(`${name} — still wrong: ${bad.join(", ")}`);
      mismatched++;
    }
  }
  if (mismatched === 0) ok(`all ${verified} collections verified project-scoped`);

  if (VERIFY_TENANCY) await verifyTenancy(token);

  console.log(
    `\n${mismatched || failed ? C.red : C.green}Done — ${changed} changed, ${unchanged} unchanged, ${failed} failed, ${mismatched} mismatched.${C.reset}\n`,
  );
  if (mismatched || failed) process.exit(1);
}

// ── cross-tenant probe ───────────────────────────────────────────────────────
//
// Creates two throwaway users, a project each, and one subcontractor record
// each, then asserts user A cannot see or fetch user B's record. Cleans up
// after itself. This is what genuinely proves the scoping works — the
// read-back above only proves the rule strings were stored.
async function verifyTenancy(adminToken) {
  head("Verification — cross-tenant probe");
  info("creates two throwaway users and removes them afterwards");

  const stamp = Date.now();
  const made = { users: [], projects: [] };

  const mkUser = async (n) => {
    const email = `__tenancy-probe-${stamp}-${n}@example.invalid`;
    const password = `probe-${stamp}-${n}-Aa1!`;
    const create = await api("POST", "/api/collections/users/records", {
      email, password, passwordConfirm: password, name: `probe ${n}`,
    }, adminToken);
    if (!create.ok) throw new Error(`could not create probe user ${n}: ${JSON.stringify(create.data).slice(0, 160)}`);
    made.users.push(create.data.id);

    const auth = await api("POST", "/api/collections/users/auth-with-password", {
      identity: email, password,
    });
    if (!auth.ok) throw new Error(`could not authenticate probe user ${n}`);
    return { id: create.data.id, token: auth.data.token };
  };

  try {
    const a = await mkUser("a");
    const b = await mkUser("b");
    ok("two probe users created");

    const mkProjectWithRecord = async (user, label) => {
      const proj = await api("POST", "/api/collections/projects/records", {
        name: `probe ${label} ${stamp}`, owner: user.id,
      }, user.token);
      if (!proj.ok) throw new Error(`could not create project ${label}: ${JSON.stringify(proj.data).slice(0, 160)}`);
      made.projects.push(proj.data.id);

      const sub = await api("POST", "/api/collections/subcontractors/records", {
        project: proj.data.id, company_name: `probe co ${label}`, trade: "probe",
      }, user.token);
      if (!sub.ok) throw new Error(`could not create subcontractor ${label}: ${JSON.stringify(sub.data).slice(0, 160)}`);
      return { project: proj.data.id, record: sub.data.id };
    };

    const aData = await mkProjectWithRecord(a, "a");
    const bData = await mkProjectWithRecord(b, "b");
    ok("one project + one subcontractor per user");

    let pass = true;

    // A lists subcontractors — must see exactly its own.
    const aList = await api("GET", "/api/collections/subcontractors/records?perPage=100", null, a.token);
    const ids = (aList.data.items || []).map((r) => r.id);
    if (ids.length === 1 && ids[0] === aData.record) {
      ok(`user A lists exactly its own record (1 of 2)`);
    } else {
      fail(`user A sees ${ids.length} record(s) — expected exactly 1 (its own)`);
      if (ids.includes(bData.record)) fail("  user A can see user B's record — SCOPING IS NOT WORKING");
      pass = false;
    }

    // A fetches B's record directly by id — must be denied.
    const aViewB = await api("GET", `/api/collections/subcontractors/records/${bData.record}`, null, a.token);
    if (aViewB.status === 404 || aViewB.status === 403) {
      ok(`user A cannot fetch user B's record directly (${aViewB.status})`);
    } else {
      fail(`user A fetched user B's record (${aViewB.status}) — SCOPING IS NOT WORKING`);
      pass = false;
    }

    if (pass) ok("cross-tenant isolation confirmed");
    else fail("cross-tenant isolation FAILED");
  } catch (err) {
    fail(`probe error: ${err.message}`);
  } finally {
    head("Cleaning up probe data");
    for (const id of made.projects) {
      // Child records cascade-delete with the project.
      await api("DELETE", `/api/collections/projects/records/${id}`, null, adminToken);
    }
    for (const id of made.users) {
      await api("DELETE", `/api/collections/users/records/${id}`, null, adminToken);
    }
    ok(`removed ${made.projects.length} project(s) and ${made.users.length} user(s)`);
  }
}

main().catch((err) => {
  fail(`error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
