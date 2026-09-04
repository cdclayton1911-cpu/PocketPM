#!/usr/bin/env node
/**
 * Narrow `users.listRule` and `users.viewRule` to people you share a project with.
 *
 * The exposure, open since it was found and recorded in docs/schema-notes.md:
 * both rules were `@request.auth.id != ""`, so **any authenticated user could
 * enumerate every user across every company**. PocketBase hides `password` and
 * `tokenKey`, and `emailVisibility` defaults false, but `name`, `company_name`,
 * `phone`, `role`, and `avatar` were all readable. That is a cross-tenant user
 * directory.
 *
 * It was left alone because something has to list candidate users when
 * assigning project members, and narrowing before that feature existed risked
 * breaking it invisibly. Project roles now needs a user picker, which makes this
 * the prerequisite rather than a loose end.
 *
 * The rule reads back-relations from the user being listed: which projects they
 * are a member of, and which they own. Verified against PocketBase 0.40.1 on an
 * ephemeral instance first — owner sees member, member sees owner, an unrelated
 * user sees only themselves and gets 404 fetching anyone else, and self-access
 * survives.
 *
 * Dry run by default. Pass --apply. Backs up first.
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

/**
 * Visible if you are me, or we are both on some project together.
 *
 * `projects_via_members` — projects where the listed user is a member.
 * `projects_via_owner`   — projects the listed user owns.
 *
 * The self clause is not optional: without it a user with no projects cannot
 * read their own record.
 */
const RULE =
  '@request.auth.id != "" && (' +
  "id = @request.auth.id" +
  " || projects_via_members.owner = @request.auth.id" +
  " || projects_via_members.members.id ?= @request.auth.id" +
  " || projects_via_owner.members.id ?= @request.auth.id" +
  ")";

const users = await pb.collections.getOne("users");

console.log(`PocketBase: ${env.NEXT_PUBLIC_PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("users.listRule / users.viewRule");
console.log(`  from: ${JSON.stringify(users.listRule)}`);
console.log(`  to  : ${RULE}\n`);
console.log("  createRule, updateRule, deleteRule are NOT touched — public signup");
console.log("  is intended, and update/delete are already self-only.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join("scripts", `users-rules-backup-${stamp}.json`);
fs.writeFileSync(
  backup,
  JSON.stringify(
    { collection: "users", listRule: users.listRule, viewRule: users.viewRule },
    null,
    2,
  ),
);
console.log(`Backed up prior rules to ${backup}`);

await pb.collections.update(users.id, { listRule: RULE, viewRule: RULE });

const after = await pb.collections.getOne("users");
console.log("\nVerifying:");
console.log(`  listRule applied: ${after.listRule === RULE}`);
console.log(`  viewRule applied: ${after.viewRule === RULE}`);
console.log("\nRun `npm run verify:tenancy` — section 8 proves the narrowing empirically.");
