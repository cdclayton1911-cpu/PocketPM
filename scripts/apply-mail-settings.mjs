#!/usr/bin/env node
/**
 * Point PocketBase's password-reset email at this app.
 *
 * Two settings, neither of which is a credential:
 *
 *   1. `meta.appURL` — the base every emailed link is built from. It is
 *      currently the install default (http://localhost:8090), so every reset
 *      link would send the user to their own machine.
 *   2. `users.passwordResetTemplate` — unset, so PocketBase's built-in default
 *      applies, which links to PocketBase's own admin UI rather than to this
 *      app's /reset-password page.
 *
 * SMTP is deliberately NOT touched. Its host, username, and password are the
 * operator's to enter in the PocketBase admin UI; a script is the wrong place
 * for mail credentials and this repo is the wrong place to keep them.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/apply-mail-settings.mjs            # show what would change
 *   node scripts/apply-mail-settings.mjs --apply    # write it
 */
import fs from "node:fs";
import path from "node:path";
import PocketBase from "pocketbase";

const APPLY = process.argv.includes("--apply");

/**
 * Hand-rolled .env.local parser.
 *
 * Not `process.loadEnvFile` (Node 20.12+ only, and this must run wherever the
 * repo does) and not `dotenv` (a dependency for four lines of parsing).
 */
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv(path.join(process.cwd(), ".env.local"));
const PB_URL = env.NEXT_PUBLIC_PB_URL;
const EMAIL = env.PB_ADMIN_EMAIL;
const PASS = env.PB_ADMIN_PASS;

/** Where the app is served. The reset link is built from this. */
const APP_URL = env.APP_PUBLIC_URL || "https://app.pocketpm.fyi";

/**
 * The reset email.
 *
 * `{APP_URL}` and `{TOKEN}` are substituted by PocketBase. The link points at
 * this app's own page, so the user never sees PocketBase.
 */
const TEMPLATE = {
  subject: "Reset your Pocket PM password",
  body: `<p>Hello,</p>
<p>Click the link below to set a new password for your Pocket PM account.</p>
<p><a href="{APP_URL}/reset-password?token={TOKEN}">Set a new password</a></p>
<p>The link is valid for 30 minutes. If you did not ask for a password reset, you can ignore this email — nothing has changed.</p>
<p>— Pocket PM</p>`,
};

if (!PB_URL || !EMAIL || !PASS) {
  console.error("Missing NEXT_PUBLIC_PB_URL, PB_ADMIN_EMAIL, or PB_ADMIN_PASS in .env.local");
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
await pb.collection("_superusers").authWithPassword(EMAIL, PASS);

const settings = await pb.settings.getAll();
const users = await pb.collections.getOne("users");

console.log(`PocketBase: ${PB_URL}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);

console.log("meta.appURL");
console.log(`  current: ${settings.meta?.appURL ?? "(unset)"}`);
console.log(`  new    : ${APP_URL}\n`);

const current = users.passwordResetTemplate ?? {};
console.log("users.passwordResetTemplate");
console.log(`  current subject: ${current.subject ?? "(unset — PocketBase's built-in default applies)"}`);
console.log(`  new subject    : ${TEMPLATE.subject}`);
console.log(`  new link       : {APP_URL}/reset-password?token={TOKEN}\n`);

console.log("smtp.enabled");
console.log(`  current: ${settings.smtp?.enabled === true}`);
console.log("  NOT CHANGED — set host, username, and password in the admin UI yourself.\n");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply once the values above look right.");
  process.exit(0);
}

await pb.settings.update({ meta: { ...settings.meta, appURL: APP_URL } });
await pb.collections.update(users.id, { passwordResetTemplate: TEMPLATE });

const after = await pb.settings.getAll();
const usersAfter = await pb.collections.getOne("users");
console.log("Written. Verifying:");
console.log(`  meta.appURL                        : ${after.meta?.appURL}`);
console.log(`  passwordResetTemplate.subject      : ${usersAfter.passwordResetTemplate?.subject}`);
console.log(
  `  template links to /reset-password  : ${/\/reset-password\?token=\{TOKEN\}/.test(usersAfter.passwordResetTemplate?.body ?? "")}`,
);
console.log("\nMail still will not send until SMTP is enabled in the admin UI.");
