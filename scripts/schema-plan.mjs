#!/usr/bin/env node
/**
 * Show what the repo's PocketBase migrations would do, without touching
 * production. The "look first" step before a deploy that carries a schema
 * change.
 *
 *   npm run schema:plan
 *
 * Builds a throwaway PocketBase from docs/pb_schema.json (the verified copy of
 * production's schema), runs `pocketbase migrate up` with pb_migrations/*.js
 * exactly as deploy/pb-migrate.sh will, and prints the difference: collections
 * added or removed, fields added, removed or changed, rules changed. It uses
 * the pinned PocketBase version (deploy/POCKETBASE_VERSION).
 *
 * ## Why migrations must be idempotent
 *
 * The snapshot already reflects every migration production has applied, and
 * this script cannot see production's _migrations table without a stored
 * credential, which nothing here holds. So it runs EVERY repo migration
 * against the snapshot. A migration that guards its own precondition ("skip
 * if the field already exists") shows no change when it is already applied; a
 * migration that doesn't will fail here, loudly, which is the point.
 *
 * A failing migration here means deploy would stop and roll back: fix it
 * before deploying.
 *
 * Nothing is written anywhere but a temp directory, which is removed.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import PocketBase from "pocketbase";

const ROOT = process.cwd();
const VERSION = fs.readFileSync(path.join(ROOT, "deploy/POCKETBASE_VERSION"), "utf8").trim();
const BIN = path.join(ROOT, ".cache", "pocketbase", VERSION, "pocketbase");
const MIGRATIONS = process.env.PLAN_MIGRATIONS || path.join(ROOT, "pb_migrations");
const PORT = Number(process.env.PLAN_PORT ?? 8094);
const URL_ = `http://127.0.0.1:${PORT}`;
const SU = { email: "plan@local.test", password: "schema-plan-local-123" };

if (!fs.existsSync(BIN)) {
  console.error(`No PocketBase ${VERSION} at ${BIN}. Run the E2E suite once (it downloads the pinned binary).`);
  process.exit(1);
}

const files = fs.existsSync(MIGRATIONS)
  ? fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".js")).sort()
  : [];
if (files.length === 0) {
  console.log(`No migrations in ${path.relative(ROOT, MIGRATIONS) || MIGRATIONS}. Nothing to plan.`);
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "pb-plan-"));
const data = path.join(work, "pb_data");
const empty = path.join(work, "no_migrations");
const repoCopy = path.join(work, "migrations");
fs.mkdirSync(empty);
fs.mkdirSync(repoCopy);

function run(args) {
  return spawnSync(BIN, args, { encoding: "utf8" });
}

async function withServer(fn) {
  const proc = spawn(
    BIN,
    ["serve", `--http=127.0.0.1:${PORT}`, `--dir=${data}`, `--migrationsDir=${empty}`, "--automigrate=false"],
    { stdio: "ignore" },
  );
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${URL_}/api/health`)).ok) break;
      } catch {}
      if (i > 80) throw new Error("throwaway PocketBase did not start");
      await new Promise((r) => setTimeout(r, 250));
    }
    const pb = new PocketBase(URL_);
    await pb.collection("_superusers").authWithPassword(SU.email, SU.password);
    return await fn(pb);
  } finally {
    proc.kill("SIGTERM");
    await new Promise((r) => proc.once("exit", r));
  }
}

const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

/** The same shape verify:schema compares: what provisioning replays. */
function normalise(collections) {
  const out = {};
  for (const c of collections) {
    out[c.name] = {
      type: c.type,
      rules: Object.fromEntries(RULES.map((r) => [r, c[r] ?? null])),
      fields: Object.fromEntries(
        (c.fields ?? [])
          .filter((f) => !f.hidden)
          .map((f) => [
            f.name,
            {
              type: f.type,
              required: Boolean(f.required),
              ...(f.type === "select" ? { values: [...(f.values ?? [])] } : {}),
              ...(f.type === "relation" ? { cascadeDelete: Boolean(f.cascadeDelete), maxSelect: f.maxSelect } : {}),
              ...(f.type === "number" ? { min: f.min ?? null, max: f.max ?? null } : {}),
            },
          ]),
      ),
      indexes: [...(c.indexes ?? [])].sort(),
    };
  }
  return out;
}

const show = (v) => JSON.stringify(v);

function describeDiff(before, after) {
  const lines = [];
  for (const name of Object.keys(after).filter((n) => !(n in before)).sort()) {
    lines.push(`+ collection ${name} (${after[name].type}, ${Object.keys(after[name].fields).length} fields)`);
  }
  for (const name of Object.keys(before).filter((n) => !(n in after)).sort()) {
    lines.push(`- collection ${name}   ← REMOVES a collection and every record in it`);
  }
  for (const name of Object.keys(after).filter((n) => n in before).sort()) {
    const a = before[name];
    const b = after[name];
    const sub = [];
    for (const f of Object.keys(b.fields).filter((f) => !(f in a.fields))) {
      sub.push(`  + ${f}: ${show(b.fields[f])}${b.fields[f].required ? "   ← required: existing records have no value" : ""}`);
    }
    for (const f of Object.keys(a.fields).filter((f) => !(f in b.fields))) {
      sub.push(`  - ${f}   ← drops this field's data`);
    }
    for (const f of Object.keys(b.fields).filter((f) => f in a.fields)) {
      if (show(a.fields[f]) !== show(b.fields[f])) sub.push(`  ~ ${f}: ${show(a.fields[f])} → ${show(b.fields[f])}`);
    }
    for (const r of RULES) {
      if (a.rules[r] !== b.rules[r]) sub.push(`  ~ ${r}: ${show(a.rules[r])} → ${show(b.rules[r])}`);
    }
    if (show(a.indexes) !== show(b.indexes)) sub.push("  ~ indexes changed");
    if (sub.length) lines.push(`~ collection ${name}`, ...sub);
  }
  return lines;
}

let exitCode = 0;
try {
  const su = run(["superuser", "upsert", SU.email, SU.password, `--dir=${data}`, `--migrationsDir=${empty}`]);
  if (su.status !== 0) throw new Error(`superuser upsert failed: ${su.stderr || su.stdout}`);

  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/pb_schema.json"), "utf8"));
  const before = await withServer(async (pb) => {
    await pb.collections.import(snapshot, true);
    return normalise(await pb.collections.getFullList());
  });

  console.log(`PocketBase ${VERSION}, starting from docs/pb_schema.json (${Object.keys(before).length} collections)\n`);
  console.log("Migrations:");
  for (const f of files) {
    const head = fs.readFileSync(path.join(MIGRATIONS, f), "utf8").split("\n").slice(0, 5);
    const additive = head.some((l) => l.trim() === "// compat: additive");
    console.log(`  ${f}  ${additive ? "(additive)" : "(NOT marked additive: deploy needs ALLOW_BREAKING=1)"}`);
    fs.copyFileSync(path.join(MIGRATIONS, f), path.join(repoCopy, f));
  }

  const up = run(["migrate", "up", `--dir=${data}`, `--migrationsDir=${repoCopy}`]);
  if (up.status !== 0) {
    console.log("\n✗ migrate up FAILED. On production, deploy would roll the whole batch back and stop.");
    console.log((up.stderr || up.stdout).trim().split("\n").map((l) => `    ${l}`).join("\n"));
    exitCode = 1;
  } else {
    const after = await withServer(async (pb) => normalise(await pb.collections.getFullList()));
    const diff = describeDiff(before, after);
    console.log("\nEffect on the schema:");
    console.log(diff.length ? diff.map((l) => `  ${l}`).join("\n") : "  none — every migration is already reflected in the snapshot");
  }
} catch (err) {
  console.error(`\nschema:plan could not run: ${err.message}`);
  exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(exitCode);
