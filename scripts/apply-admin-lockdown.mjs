#!/usr/bin/env node
/**
 * Restrict superuser access to the SSH tunnel.
 *
 * Run THROUGH the tunnel (deploy/ADMIN-ACCESS.md, step 2):
 *
 *   PB_URL=http://127.0.0.1:8090 node scripts/apply-admin-lockdown.mjs            # dry run
 *   PB_URL=http://127.0.0.1:8090 node scripts/apply-admin-lockdown.mjs --apply
 *   PB_URL=http://127.0.0.1:8090 node scripts/apply-admin-lockdown.mjs --rollback
 *
 * Sets two PocketBase settings:
 *   - trustedProxy.headers = ["X-Real-Client-IP"]: the client address comes
 *     from the header Caddy sets (and overwrites) on every proxied request.
 *   - superuserIPs = ["127.0.0.1"]: superuser sign-in and superuser tokens work
 *     only from loopback, which is the tunnel. Tested on 0.40.1: a token used
 *     from any other address gets 403, and so does a sign-in, with no token
 *     issued.
 *
 * Until Caddy sets the header (step 4), proxied requests still arrive as
 * 127.0.0.1, so this step alone locks nobody out. That is the point of the
 * order.
 *
 * Refuses to run unless PB_URL is loopback: applied through the public host,
 * this is the one change that could lock you out.
 *
 * After applying, it proves both halves and rolls itself back if either fails:
 *   - the tunnel still has superuser access;
 *   - a request carrying a public client address is refused, which is what
 *     every request through Caddy will look like after step 4.
 *
 * If you are ever locked out with no tunnel, see "Locked out" in
 * deploy/ADMIN-ACCESS.md: one edit to a stopped database restores access.
 */
import fs from "node:fs";
import path from "node:path";
import PocketBase from "pocketbase";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const HEADER = "X-Real-Client-IP";
const TARGET = { trustedProxy: { headers: [HEADER], useLeftmostIP: false }, superuserIPs: ["127.0.0.1"] };
const CLEARED = { trustedProxy: { headers: [], useLeftmostIP: false }, superuserIPs: [] };

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
const url = process.env.PB_URL || "";
const email = process.env.PB_EMAIL || fileEnv.PB_ADMIN_EMAIL;
const pass = process.env.PB_PASS || fileEnv.PB_ADMIN_PASS;

let host = "";
try {
  host = new URL(url).hostname;
} catch {}
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing: PB_URL must be the SSH tunnel (http://127.0.0.1:8090), got "${url || "(unset)"}".`);
  console.error("Applying this through the public host is the one way it could lock you out.");
  process.exit(1);
}

const pb = new PocketBase(url);
await pb.collection("_superusers").authWithPassword(email, pass);
const token = pb.authStore.token;

const current = await pb.settings.getAll();
const show = (s) => JSON.stringify({ trustedProxy: s.trustedProxy, superuserIPs: s.superuserIPs });
console.log(`PocketBase: ${url}`);
console.log(`Now:    ${show(current)}`);
console.log(`Target: ${show(ROLLBACK ? CLEARED : TARGET)}`);

if (!APPLY && !ROLLBACK) {
  console.log("\nDry run. Nothing written. Re-run with --apply (or --rollback).");
  process.exit(0);
}

async function status(headers = {}) {
  const res = await fetch(`${url}/api/settings`, { headers: { Authorization: token, ...headers } });
  return res.status;
}

const previous = { trustedProxy: current.trustedProxy, superuserIPs: current.superuserIPs };
await pb.settings.update(ROLLBACK ? CLEARED : TARGET);
console.log(`\n${ROLLBACK ? "Rolled back" : "Applied"}. Checking...`);

const tunnel = await status();
console.log(`  superuser access through the tunnel: ${tunnel} ${tunnel === 200 ? "(still in)" : "(LOST)"}`);

if (ROLLBACK) process.exit(tunnel === 200 ? 0 : 1);

const publicLike = await status({ [HEADER]: "203.0.113.9" });
console.log(`  superuser access from a public address: ${publicLike} ${publicLike === 403 ? "(refused, as intended)" : "(NOT refused)"}`);

if (tunnel !== 200 || publicLike !== 403) {
  console.log("\nA check failed. Restoring the previous settings...");
  await pb.settings.update(previous);
  console.log(`  restored: ${show(await pb.settings.getAll())}`);
  process.exit(1);
}
console.log("\nDone. Superuser access now works only through the tunnel once Caddy sets the header (step 4).");
