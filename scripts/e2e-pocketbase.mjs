/**
 * An ephemeral PocketBase for end-to-end tests.
 *
 * Starts a throwaway instance on a temporary data directory, provisions it from
 * the committed schema snapshot, and deletes everything afterwards. Nothing is
 * shared with the real instance, so there is no cleanup code that can silently
 * miss a record and no debris accumulating in a database that holds real
 * projects.
 *
 * ## The snapshot is the source of truth
 *
 * `docs/pb_schema.json` is applied with `collections.import()`, which takes the
 * whole configuration in one call. The one-off scripts
 * (`create-document-revisions.mjs`, `create-project-documents.mjs`,
 * `apply-rules.mjs`) remain the record of how the live schema got to its
 * current shape; this replays the result, not the history.
 *
 * That makes the export load-bearing: a stale snapshot means tests pass against
 * a schema production does not have. `scripts/verify-schema-export.mjs` is the
 * guard, and it runs in CI.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Pinned to what production runs. Tests against a different minor can pass on
 * behaviour the real server does not have — the list-rules-filter-not-gate
 * semantics this app depends on changed across versions before.
 */
const PB_VERSION = process.env.PB_TEST_VERSION ?? "0.40.1";

/** Fixed, so the Playwright webServer can name it without ordering games. */
export const PB_PORT = Number(process.env.PB_TEST_PORT ?? 8099);
export const PB_URL = `http://127.0.0.1:${PB_PORT}`;

export const SUPERUSER = { email: "e2e@local.test", password: "e2e-local-password-123" };

const CACHE_DIR = path.join(process.cwd(), ".cache", "pocketbase", PB_VERSION);
const BINARY = path.join(CACHE_DIR, "pocketbase");

function platformSlug() {
  const os_ = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `${os_}_${arch}`;
}

async function ensureBinary() {
  if (fs.existsSync(BINARY)) return BINARY;

  const slug = platformSlug();
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${slug}.zip`;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zip = path.join(CACHE_DIR, "pb.zip");

  process.stdout.write(`  downloading PocketBase ${PB_VERSION} (${slug})…\n`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`could not download ${url} — ${res.status}`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));

  const unzip = spawnSync("unzip", ["-o", "-q", zip, "pocketbase", "-d", CACHE_DIR]);
  if (unzip.status !== 0) throw new Error(`unzip failed: ${unzip.stderr?.toString()}`);
  fs.chmodSync(BINARY, 0o755);
  fs.rmSync(zip, { force: true });
  return BINARY;
}

async function waitForHealth(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${PB_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`PocketBase did not become healthy on ${PB_URL} within ${timeoutMs}ms`);
}

/** Refuse to start on an occupied port rather than talking to something else. */
async function assertPortFree() {
  try {
    const res = await fetch(`${PB_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      throw new Error(
        `Something is already serving ${PB_URL}. Stop it, or set PB_TEST_PORT to a free port.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Something is already")) throw error;
    // Anything else means nothing is listening, which is what we want.
  }
}

export async function startEphemeralPocketBase() {
  await assertPortFree();
  const binary = await ensureBinary();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-e2e-"));

  // Non-interactive superuser creation. `superuser upsert` is the 0.23+ form;
  // the older `admin create` was removed.
  const created = spawnSync(
    binary,
    ["superuser", "upsert", SUPERUSER.email, SUPERUSER.password, `--dir=${dataDir}`],
    { encoding: "utf8" },
  );
  if (created.status !== 0) {
    throw new Error(`could not create superuser: ${created.stderr || created.stdout}`);
  }

  const proc = spawn(binary, ["serve", `--http=127.0.0.1:${PB_PORT}`, `--dir=${dataDir}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", (d) => process.stderr.write(`  [pb] ${d}`));

  await waitForHealth();

  // Provision from the snapshot.
  const { default: PocketBase } = await import("pocketbase");
  const pb = new PocketBase(PB_URL);
  await pb.collection("_superusers").authWithPassword(SUPERUSER.email, SUPERUSER.password);

  const snapshot = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/pb_schema.json"), "utf8"));
  await pb.collections.import(snapshot, true);

  const applied = await pb.collections.getFullList();
  const appCollections = applied.filter((c) => !c.name.startsWith("_"));
  process.stdout.write(
    `  PocketBase ${PB_VERSION} on ${PB_URL} — ${appCollections.length} app collections imported\n`,
  );

  return {
    url: PB_URL,
    dataDir,
    async stop() {
      proc.kill("SIGTERM");
      await new Promise((r) => {
        proc.once("exit", r);
        setTimeout(r, 5000);
      });
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
