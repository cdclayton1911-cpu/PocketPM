#!/usr/bin/env node
/**
 * The public PocketBase must not serve the superuser surface.
 *
 * Probes every path form PocketBase itself accepts for it (tested on 0.40.1:
 * the collection name in any letter case, a percent-encoded underscore, the
 * collection id, and /_, /_/, /%5F/ for the admin UI), plus a superuser
 * sign-in attempt with deliberately wrong credentials. Anything that answers
 * as if it reached PocketBase fails.
 *
 * Also checks the ordinary API still works through the same host, so a block
 * that is too broad fails here too.
 *
 * Run against production before the Caddy block, this FAILS. That is its
 * positive control: a verifier that has never failed proves nothing.
 *
 *   npm run verify:admin            (PUBLIC_PB_URL to point elsewhere)
 */
const BASE = (process.env.PUBLIC_PB_URL || "https://pb.pocketpm.fyi").replace(/\/$/, "");
const ID = "pbc_3142635823";

const names = ["_superusers", "_SUPERUSERS", "_SuperUsers", "%5Fsuperusers", "%5fsuperusers", ID];
const probes = [
  "/_/",
  "/_",
  "/%5F/",
  "//_/",
  ...names.flatMap((n) => [`/api/collections/${n}/auth-methods`, `/api/collections/${n}/records`]),
  "/api//collections/_superusers/auth-methods",
];

const blocked = (status) => status === 404 || status === 403;
let failures = 0;
const line = (ok, text) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${text}`);
};

console.log(`Admin surface on ${BASE}\n`);
for (const p of probes) {
  const res = await fetch(BASE + p, { redirect: "manual" });
  line(blocked(res.status), `GET ${p} -> ${res.status}${blocked(res.status) ? "" : "  (reachable)"}`);
}

for (const n of ["_superusers", ID]) {
  const res = await fetch(`${BASE}/api/collections/${n}/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: "probe@invalid.example", password: "not-a-real-password" }),
    redirect: "manual",
  });
  // 400 means PocketBase received and checked the credentials: reachable.
  line(blocked(res.status), `superuser sign-in via ${n} -> ${res.status}${blocked(res.status) ? "" : "  (sign-in endpoint reachable)"}`);
}

console.log("\nOrdinary API through the same host (must still work):");
const health = await fetch(`${BASE}/api/health`);
line(health.status === 200, `GET /api/health -> ${health.status}`);
const list = await fetch(`${BASE}/api/collections/projects/records`);
line(list.status === 200, `GET /api/collections/projects/records (unauthenticated, empty list) -> ${list.status}`);

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
