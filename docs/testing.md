# Testing

## End-to-end

```bash
npm run test:e2e
```

**Nothing touches the real PocketBase.** Each run starts a throwaway instance,
provisions it, runs the suite, and deletes the data directory. There is no
cleanup code, because there is nothing to clean up — which is the point. The
previous arrangement ran against `pb.pocketpm.fyi` and left users and projects
behind whenever cleanup missed something, and cleanup did miss things.

### How a run is assembled

1. `e2e/global-setup.ts` downloads a pinned PocketBase (cached in `.cache/`),
   starts it on `127.0.0.1:8099` with a temp data dir, creates a superuser, and
   applies `docs/pb_schema.json` via `collections.import()`.
2. `webServer` builds the app into `.next-e2e` and serves it on port 3100 with
   `NEXT_PUBLIC_PB_URL` pointed at that instance.
3. Tests run. The teardown returned from `globalSetup` stops PocketBase and
   removes the data directory.

### Three things that are the way they are for a reason

**The version is pinned** (`PB_TEST_VERSION`, currently 0.40.1) to what
production runs. PocketBase's list-rule semantics — filtering rather than
gating, which this app's tenancy model depends on — have changed across
versions before. Testing against a different minor can pass on behaviour the
real server does not have.

**`next build` + `next start`, not `next dev`.** Next 16 refuses to run a second
dev server in the same directory, and the one on port 3000 is the one being
worked in. `NEXT_DIST_DIR=.next-e2e` keeps the test build from overwriting the
`.next` that dev server is serving from.

**`localhost`, never `127.0.0.1`.** A production build marks the session cookie
`Secure`, and Playwright's request context honours that strictly over plain
http: the cookie is stored and then never sent, so every authenticated call
returns 401 and the failure looks like broken auth rather than a URL choice.
Chrome's trustworthy-origin exception covers `localhost` but not the bare IP.
Verified both ways — `127.0.0.1` gave `/api/auth/me` 401, `localhost` gave 200.

## The snapshot is load-bearing

`docs/pb_schema.json` used to be documentation. Now E2E provisions from it, so a
stale export means green tests against a schema production does not have.

```bash
npm run verify:schema
```

Compares collection names, field names and types, and all five API rules against
the live instance; ignores ids and cosmetics that differ harmlessly between
instances. Exits 1 on drift, and prints what differs. Verified to actually
detect a weakened rule, a missing field, and a changed file limit — a check that
only ever passes is worth nothing.

Without admin credentials it **skips and says so loudly** rather than passing
quietly, because a silent skip is how a guard stops guarding.

**Regenerate the snapshot in the same commit as any schema change**, then
`npm run generate:types`. The one-off scripts
(`create-document-revisions.mjs`, `create-project-documents.mjs`,
`apply-rules.mjs`) remain the record of how the live schema reached its shape;
the snapshot is what gets replayed.

## CI

`.github/workflows/ci.yml`, three jobs:

| Job | Needs secrets? |
|---|---|
| Typecheck, lint, build | no |
| End-to-end | **no** — provisions its own PocketBase, so it runs on fork PRs |
| Schema export matches live | yes: `PB_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASS` |

Node is pinned to 20 to match the droplet; building on a newer major here than
production runs would let a failure hide until deploy.

**The schema job needs three repository secrets set before it can run.** Until
then it skips — visibly, not silently.

**The workflow file is not committed yet.** Pushing `.github/workflows/ci.yml`
requires a credential with GitHub's `workflow` scope, and the one in use does
not have it. The file exists locally; grant the scope and commit it:

```bash
gh auth refresh -s workflow
```

Nothing else in this setup depends on it — `npm run test:e2e` and
`npm run verify:schema` both work locally today.

## Not covered

`npm run verify:tenancy` still runs against the live instance and creates real
throwaway accounts. It is the one check that arguably *should*, since it is
verifying the rules as actually deployed — but it is worth revisiting whether a
second copy of it should run against the ephemeral instance in CI, where a
tenancy regression would be caught before merge rather than after.
