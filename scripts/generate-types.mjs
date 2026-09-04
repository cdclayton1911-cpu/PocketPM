#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Pocket PM — generate TypeScript types from the PocketBase schema export
//
//   npm run generate:types
//
// Reads docs/pb_schema.json (exported from the PocketBase admin UI) and writes:
//   src/types/enums.ts        — every select field as a const tuple + union
//   src/types/collections.ts  — one interface per application collection
//
// src/types/pocketbase.ts (base records, helpers) and src/types/index.ts (the
// barrel) are hand-written and never touched.
//
// Re-run after any schema change and commit the diff — that diff is the
// review surface for "what changed in the data model".
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(ROOT, "docs/pb_schema.json");
const OUT_ENUMS = join(ROOT, "src/types/enums.ts");
const OUT_COLLECTIONS = join(ROOT, "src/types/collections.ts");
const OUT_FILE_FIELDS = join(ROOT, "src/types/file-fields.ts");

// Interface name per collection. Explicit rather than inferred — irregular
// plurals and the naming of `punch_list` are not worth guessing at.
const MODEL_NAMES = {
  users: "User",
  projects: "Project",
  invitations: "Invitation",
  tasks: "Task",
  subcontractors: "Subcontractor",
  rfis: "Rfi",
  submittals: "Submittal",
  punch_list: "PunchListItem",
  change_orders: "ChangeOrder",
  pay_applications: "PayApplication",
  schedule_items: "ScheduleItem",
  dfow: "Dfow",
  deficiencies: "Deficiency",
  daily_logs: "DailyLog",
  safety_observations: "SafetyObservation",
  drawings: "Drawing",
  aia_notices: "AiaNotice",
  budget_items: "BudgetItem",
  ai_sessions: "AiSession",
};

// Fields PocketBase manages and that live on BaseRecord / AuthRecord instead.
const BASE_FIELDS = new Set(["id", "created", "updated"]);
const AUTH_FIELDS = new Set(["email", "emailVisibility", "verified"]);

const SCREAMING = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
const PASCAL = (s) => s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());

const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
const collections = schema
  .filter((c) => !c.system && !c.name.startsWith("_"))
  .sort((a, b) => a.name.localeCompare(b.name));

const unknownNames = collections.map((c) => c.name).filter((n) => !MODEL_NAMES[n]);
if (unknownNames.length) {
  console.error(`Unmapped collection(s): ${unknownNames.join(", ")}`);
  console.error("Add them to MODEL_NAMES in scripts/generate-types.mjs.");
  process.exit(1);
}

// ── enums ────────────────────────────────────────────────────────────────────
const enums = [];
for (const col of collections) {
  const model = MODEL_NAMES[col.name];
  for (const f of col.fields) {
    if (f.type !== "select") continue;
    enums.push({
      collection: col.name,
      field: f.name,
      constName: `${SCREAMING(model)}_${SCREAMING(f.name)}`,
      typeName: `${model}${PASCAL(f.name)}`,
      values: f.values,
      multi: (f.maxSelect ?? 1) > 1,
    });
  }
}

const enumsOut = [
  "// GENERATED — do not edit by hand.",
  "// Source: docs/pb_schema.json  ·  Regenerate: npm run generate:types",
  "//",
  "// Every `select` field in the schema, as a const tuple plus a derived union.",
  "// One definition drives type checking, <Select> option lists, and Zod enums.",
  "//",
  "// Values are verbatim from the schema. Some contain spaces (\"on hold\",",
  '// "in progress") while most are snake_case — that is the schema, not a typo.',
  "",
  ...enums.flatMap((e) => [
    `/** \`${e.collection}.${e.field}\` */`,
    `export const ${e.constName} = [`,
    ...e.values.map((v) => `  ${JSON.stringify(v)},`),
    "] as const;",
    `export type ${e.typeName} = (typeof ${e.constName})[number];`,
    "",
  ]),
].join("\n");

writeFileSync(OUT_ENUMS, enumsOut);

// ── field -> TS type ─────────────────────────────────────────────────────────
function tsType(col, f) {
  const many = (f.maxSelect ?? 1) > 1;
  switch (f.type) {
    case "text":
    case "editor":
    case "url":
    case "date":
      return "string";
    case "email":
      return "string";
    case "autodate":
      return "string";
    case "number":
      return "number";
    case "bool":
      return "boolean";
    case "json":
      return "unknown";
    case "select": {
      const e = enums.find((x) => x.collection === col.name && x.field === f.name);
      return many ? `${e.typeName}[]` : e.typeName;
    }
    case "relation":
      return many ? "RelationIds" : "RelationId";
    case "file":
      return many ? "FileName[]" : "FileName";
    default:
      throw new Error(`Unhandled field type "${f.type}" on ${col.name}.${f.name}`);
  }
}

function comment(col, f) {
  const bits = [];
  if (f.required) bits.push("required");
  if (f.type === "relation") {
    const target = schema.find((c) => c.id === f.collectionId);
    bits.push(`-> ${target ? target.name : f.collectionId}`);
    if (f.cascadeDelete) bits.push("cascade delete");
  }
  if (f.type === "file") bits.push(`max ${f.maxSelect}, ${Math.round(f.maxSize / 1048576)}MB`);
  if (f.type === "number" && (f.min != null || f.max != null)) {
    bits.push(`${f.min ?? "*"}..${f.max ?? "*"}`);
  }
  return bits.length ? ` // ${bits.join(", ")}` : "";
}

// ── collections ──────────────────────────────────────────────────────────────
const usedEnumTypes = new Set();
const bodies = [];

for (const col of collections) {
  const model = MODEL_NAMES[col.name];
  const isAuth = col.type === "auth";
  const base = isAuth ? "AuthRecord" : "BaseRecord";

  const fields = col.fields.filter((f) => {
    if (f.hidden) return false; // password, tokenKey — never returned
    if (BASE_FIELDS.has(f.name)) return false;
    if (isAuth && AUTH_FIELDS.has(f.name)) return false;
    return true;
  });

  const lines = fields.map((f) => {
    const t = tsType(col, f);
    if (f.type === "select") usedEnumTypes.add(t.replace(/\[\]$/, ""));
    return `  ${f.name}: ${t};${comment(col, f)}`;
  });

  const required = col.fields.filter((f) => f.required && !f.system && !f.hidden).map((f) => f.name);

  bodies.push(
    [
      "/**",
      ` * \`${col.name}\`${isAuth ? " — auth collection" : ""}`,
      required.length ? ` * Required on create: ${required.join(", ")}` : null,
      " *",
      ` * listRule: ${col.listRule === null ? "null (superusers only)" : col.listRule}`,
      " */",
      `export interface ${model} extends ${base} {`,
      ...lines,
      "}",
      "",
    ]
      .filter((l) => l !== null)
      .join("\n"),
  );
}

const registry = [
  "/**",
  " * Maps each collection name to its record type, so API helpers can infer a",
  " * return type from the collection name alone.",
  " */",
  "export interface Collections {",
  ...collections.map((c) => `  ${c.name}: ${MODEL_NAMES[c.name]};`),
  "}",
  "",
  "/** Every valid collection name. */",
  "export type CollectionName = keyof Collections;",
  "",
  "/** The record type for a given collection name. */",
  "export type RecordOf<K extends CollectionName> = Collections[K];",
].join("\n");

const collectionsOut = [
  "// GENERATED — do not edit by hand.",
  "// Source: docs/pb_schema.json  ·  Regenerate: npm run generate:types",
  "//",
  `// ${collections.length} application collections. The architecture PDF lists 21 and names`,
  "// closeout_items and contract_notices; neither exists on the deployed instance.",
  "// See docs/schema-notes.md.",
  "//",
  "// Optionality: PocketBase returns every schema field on every record, using",
  "// zero values (\"\" / 0 / []) rather than omitting them, so read types mark all",
  "// fields present. `required` constrains writes and is noted in comments;",
  "// enforce it with Zod at the form/API boundary.",
  "//",
  "// Every date field is `text` in the schema, so dates are strings, never Date.",
  "",
  "import type {",
  "  AuthRecord,",
  "  BaseRecord,",
  "  FileName,",
  "  RelationId,",
  "  RelationIds,",
  '} from "./pocketbase";',
  ...(usedEnumTypes.size
    ? ["import type {", ...[...usedEnumTypes].sort().map((t) => `  ${t},`), '} from "./enums";']
    : []),
  "",
  ...bodies,
  registry,
  "",
].join("\n");

writeFileSync(OUT_COLLECTIONS, collectionsOut);

// ── File fields ──────────────────────────────────────────────────────────────
//
// Emitted as data, not just as types, because the upload path has to enforce
// per-field limits at runtime: how many files, how large, and which MIME types.
// Hand-maintaining that list would let it drift from the schema silently, and
// the failure mode is a 100 MB shop drawing rejected — or accepted — for the
// wrong reason.
const fileFieldEntries = [];
for (const col of collections) {
  const files = col.fields.filter((f) => f.type === "file" && !f.hidden);
  if (!files.length) continue;
  fileFieldEntries.push(
    `  ${JSON.stringify(col.name)}: {`,
    ...files.flatMap((f) => [
      `    ${JSON.stringify(f.name)}: {`,
      `      maxSelect: ${f.maxSelect ?? 1},`,
      `      maxSize: ${f.maxSize ?? 0},`,
      `      mimeTypes: ${JSON.stringify(f.mimeTypes ?? [])},`,
      `      required: ${Boolean(f.required)},`,
      "    },",
    ]),
    "  },",
  );
}

const fileFieldsOut = [
  "// GENERATED by scripts/generate-types.mjs — do not edit.",
  "// Source: docs/pb_schema.json",
  "//",
  "// Every file field on the deployed schema, with the limits PocketBase will",
  "// enforce. The upload path checks against these first so a rejection is a",
  "// clear message rather than a 400 from PocketBase after the bytes are sent.",
  "//",
  "// `mimeTypes: []` means the schema places no type restriction on that field.",
  "",
  "export interface FileFieldSpec {",
  "  /** 1 means a single file; more means a list. */",
  "  maxSelect: number;",
  "  /** Bytes. 0 means PocketBase's own default applies. */",
  "  maxSize: number;",
  "  /** Empty means any type is accepted. */",
  "  mimeTypes: string[];",
  "  required: boolean;",
  "}",
  "",
  "export const FILE_FIELDS = {",
  ...fileFieldEntries,
  "} as const satisfies Record<string, Record<string, FileFieldSpec>>;",
  "",
  "/** Collections that have at least one file field. */",
  "export type FileCollection = keyof typeof FILE_FIELDS;",
  "",
  "export function fileFieldsFor(collection: string): Record<string, FileFieldSpec> {",
  "  return (FILE_FIELDS as Record<string, Record<string, FileFieldSpec>>)[collection] ?? {};",
  "}",
  "",
].join("\n");

writeFileSync(OUT_FILE_FIELDS, fileFieldsOut);

console.log(`✓ ${collections.length} collections, ${enums.length} enums`);
console.log(`  ${OUT_ENUMS.replace(ROOT + "/", "")}`);
console.log(`  ${OUT_COLLECTIONS.replace(ROOT + "/", "")}`);
console.log(`  ${OUT_FILE_FIELDS.replace(ROOT + "/", "")}`);
