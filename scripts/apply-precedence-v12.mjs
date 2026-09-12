#!/usr/bin/env node
/**
 * Bring the precedence schema to taxonomy v1.2.
 *
 * ## precedence_provisions
 *
 * - The scope values become lowercase: project_wide, division_scoped, external, none_found.
 * - taxonomy_version is added (required, "1.2").
 * - source is added (required, human_supplied_and_confirmed).
 *
 * ## conflict_findings
 *
 * - loci is renamed to between.
 * - taxonomy_version is added.
 * - precedence_class becomes lowercase, and required.
 * - precedence_provision becomes required. It is never null: a conflict with no
 *   applicable provision cites the project's none_found record.
 * - precedence_reasoning becomes required.
 * - governing_index is added (0 or 1, set only when resolvable).
 * - severity (free text) becomes ai_severity_band: low, medium or high.
 * - provisional is renamed to provisional_construct_used.
 *
 * The rules that span more than one field are enforced in
 * src/lib/precedence/contract.ts, not here. Those are "E1 iff subtype",
 * "governing_index iff resolvable" and exactly two loci. A collection select
 * cannot express them.
 *
 * The script refuses to run if either collection holds records, because
 * lowercasing the select values would orphan any stored UPPER value.
 *
 * Dry run by default. Pass --apply to write.
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

const fileEnv = loadEnv(path.join(process.cwd(), ".env.local"));
const env = {
  url: process.env.PB_URL || fileEnv.NEXT_PUBLIC_PB_URL,
  email: process.env.PB_EMAIL || fileEnv.PB_ADMIN_EMAIL,
  pass: process.env.PB_PASS || fileEnv.PB_ADMIN_PASS,
};
const pb = new PocketBase(env.url);
await pb.collection("_superusers").authWithPassword(env.email, env.pass);

const TAXONOMY_VERSIONS = ["1.2"];
const SCOPES = ["project_wide", "division_scoped", "external", "none_found"];
const PRECEDENCE_CLASSES = [
  "precedence_resolvable", "precedence_ambiguous", "precedence_incorporated",
  "requires_clarification", "no_precedence_provision",
];
const SEVERITY_BANDS = ["low", "medium", "high"];

const provisions = await pb.collections.getOne("precedence_provisions");
const findings = await pb.collections.getOne("conflict_findings");

for (const name of ["precedence_provisions", "conflict_findings"]) {
  const { totalItems } = await pb.collection(name).getList(1, 1);
  if (totalItems > 0) {
    console.error(`Refusing to run: ${name} holds ${totalItems} record(s). Write a data migration instead.`);
    process.exit(1);
  }
}

const has = (c, n) => c.fields.some((f) => f.name === n);
const field = (c, n) => {
  const f = c.fields.find((x) => x.name === n);
  if (!f) throw new Error(`${c.name}.${n} not found; is this already applied?`);
  return f;
};

// ── precedence_provisions ──
const pFields = provisions.fields.map((f) => (f.name === "scope" ? { ...f, values: SCOPES } : f));
if (!has(provisions, "taxonomy_version")) {
  pFields.push({ name: "taxonomy_version", type: "select", required: true, maxSelect: 1, values: TAXONOMY_VERSIONS });
}
if (!has(provisions, "source")) {
  pFields.push({ name: "source", type: "select", required: true, maxSelect: 1, values: ["human_supplied_and_confirmed"] });
}

// ── conflict_findings ──
// Renames keep the field id, so PocketBase alters the column in place.
const alreadyApplied = has(findings, "between");
let fFields = findings.fields;
if (!alreadyApplied) {
  field(findings, "loci");
  field(findings, "severity");
  field(findings, "provisional");
  fFields = findings.fields
    .map((f) => {
      if (f.name === "loci") return { ...f, name: "between" };
      if (f.name === "precedence_class") return { ...f, values: PRECEDENCE_CLASSES, required: true };
      if (f.name === "precedence_provision") return { ...f, required: true };
      if (f.name === "precedence_reasoning") return { ...f, required: true };
      if (f.name === "provisional") return { ...f, name: "provisional_construct_used" };
      return f;
    })
    // Free-text severity goes; the band replaces it. No records, so nothing is lost.
    .filter((f) => f.name !== "severity")
    .concat([
      { name: "taxonomy_version", type: "select", required: true, maxSelect: 1, values: TAXONOMY_VERSIONS },
      { name: "governing_index", type: "number", required: false, min: 0, max: 1, onlyInt: true },
      { name: "ai_severity_band", type: "select", required: true, maxSelect: 1, values: SEVERITY_BANDS },
    ]);
}

console.log(`PocketBase: ${env.url}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run (pass --apply to write)"}\n`);
console.log("precedence_provisions");
console.log(`  scope: ${field(provisions, "scope").values.join(", ")} → ${SCOPES.join(", ")}`);
console.log(`  + taxonomy_version ${has(provisions, "taxonomy_version") ? "(exists)" : ""}`);
console.log(`  + source ${has(provisions, "source") ? "(exists)" : ""}`);
console.log("\nconflict_findings");
if (alreadyApplied) {
  console.log("  already at v1.2 (has `between`); unchanged");
} else {
  console.log("  loci → between; provisional → provisional_construct_used");
  console.log("  precedence_class lowercase + required; precedence_provision and precedence_reasoning required");
  console.log("  - severity (text)   + ai_severity_band (low|medium|high)");
  console.log("  + taxonomy_version  + governing_index (0|1)");
}
console.log("");

if (!APPLY) {
  console.log("Nothing written. Re-run with --apply.");
  process.exit(0);
}

await pb.collections.update(provisions.id, { fields: pFields });
if (!alreadyApplied) await pb.collections.update(findings.id, { fields: fFields });

const p2 = await pb.collections.getOne("precedence_provisions");
const f2 = await pb.collections.getOne("conflict_findings");
console.log("Applied.");
console.log(`  precedence_provisions.scope: ${field(p2, "scope").values.join(", ")}`);
console.log(`  conflict_findings: ${f2.fields.map((f) => f.name).join(", ")}`);
