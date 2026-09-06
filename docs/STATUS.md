# Status

Living document. Updated as work lands — if it disagrees with the code, the code wins
and this file is stale, so fix it.

Last updated: 2026-09-05 · `d6a549d`

## Where things stand

**Deployed:** droplet at `app.pocketpm.fyi`, PocketBase 0.40.1 behind it.
The droplet is on **`d6a549d`**, deployed 2026-09-05 via `deploy/deploy.sh`.
`ed83cee` is on `origin/main` but not released — it is docs and the E2E harness
only, nothing under `src/`, so the running app is identical to a redeploy.

Post-deploy verification: `verify:tenancy` all 8 sections PASS against live,
including the section 8 positive control. New routes present and gated.

`/opt/pocketpm-web` is also the `pocketpm` user's home directory, so `.bashrc`,
`.profile`, `.npm/` and `.config/` sit untracked inside the repo. Harmless — but a
`git clean -fdx` there would take the npm cache and shell config with it.

Production has **no error tracking**. `journalctl -u pocketpm-web` is the whole
story after a deploy.

**Built and working:**

| Area | State |
|---|---|
| Shell, auth, project switching | Done. 27 nav routes. |
| Modules (CRUD) | Done via `src/lib/crud-route.ts`; every module is ~4 lines of route. |
| AI (7 modules, 14 tasks) | Live in production. Auth gate + 20/hr per-user rate limit. |
| Documents + revisions | `project_documents`, `document_revisions`, revision UI, `protected: true` on every file field. |
| Retrieval | Stage 1 (metadata selection) and stage 2 (metadata-only answers). Nothing leaves the droplet. |
| Schedule | Relationships, baselines, variance, working calendar, and CPM with the divergence report (phases 1–3). Pure logic, 100 tests. Import (5–6) and Gantt (7) next. |
| Project roles | `project_roles`, additive to `projects.members` — a role grants no access on its own. |
| Workflows | Schema, engine, API routes, and UI: template builder at `/settings/workflows`, approval panel on submittal/RFI detail pages, inbox at `/approvals`. Submittal/RFI creation starts a workflow when a template is active. `workflow_actions` is append-only (null update/delete rules). |
| Tenancy | `npm run verify:tenancy`, 10 sections. `npm run verify:schema` checks the snapshot matches live. |
| E2E | Playwright against an **ephemeral local PocketBase per run**. Never production. |

**Password reset** is code-complete and unverifiable: `requestPasswordReset()`
resolves successfully with SMTP off, so success proves nothing. See
`docs/password-reset.md`.

## In flight

**SMTP.** The split is settled and the ball is with you:

- *You:* pick a transactional provider (not Gmail), add SPF/DKIM on `pocketpm.fyi`,
  enter host/port/username/password in PocketBase admin → Settings → Mail, send the
  test email. I don't take the SMTP password — same line as the Anthropic key.
- *Me:* `node scripts/apply-mail-settings.mjs --apply` sets `meta.appURL` (still
  `http://localhost:8090`, so every emailed link currently points at your laptop),
  sender address/name, and the reset template.
- Order: your part, then mine, then a real end-to-end reset.

Nothing else is blocked on this. Option 4 for external reviewers — record the party,
an internal user acts on their behalf — needs no email and is already built.

## Queued, unstarted

Roughly in priority order. Only the first has a hard deadline.

1. **Staleness marker on the computed CPM columns — before phase 7.**
   `early_start`, `total_float`, `is_critical` and the rest are a cache with no
   invalidation signal. Edit a duration and the stored `total_float` is silently
   wrong, with nothing to say so. Today's screens are safe because they compute
   fresh on read — but the Gantt is exactly the consumer that will be tempted to
   read the columns instead of recomputing per row.

   Cheapest fix: a `computed_at` on the project or the analysis run, compared
   against the latest `updated` on any `schedule_item` or `schedule_relationship`.
   Newer schedule than computation means the stored values are marked stale
   rather than displayed. **This must exist before phase 7 reads those fields.**

2. **Strict validation across the 25 `crud-route.ts` module routes.** Plain
   `z.object` silently drops unknown keys; two instances found, both by
   accident, neither by a test, because the failure returns 200. Per-route, not
   mechanical — flipping to strict turns today's silent successes into 400s, so
   each route's real request bodies need checking.

3. **`docs/workflows-plan.md` rewrite** — still describes the rejected
   polymorphic model. A stale plan read as current is worse than none.

4. **Submittal and RFI list rows should link to their detail pages.** The only
   route in today is the approvals inbox, which shows just what awaits *you* —
   so a PM cannot open a submittal mid-workflow they are not approving.

5. **The `pb_hooks` request hook** (`docs/workflow-hooks.md`). Closes the
   credentialed-tool vector; does not cover migrations. Leaning build.

6. **SMTP** — provider first, then `meta.appURL`, `meta.senderAddress`,
   `meta.senderName`.

7. **Real XER exports from GCs.** Resolves two open questions at once: whether
   XER or PMXML should come second, and what import does with P6 per-activity
   calendars. Neither is answerable from here — both need actual files.

## Next

1. **Workflow engine** — 6 phases, `docs/workflows-plan.md`. One engine over
   submittals, RFIs, change orders, punch list, deficiencies.
2. **Member picker** for internal role assignment. Unblocked by the listRule fix;
   small.
3. **Deploy** the 8 unreleased commits.
4. **Schedule** phases 2 (project calendar), 3 (CPM engine), 5–7 (Excel/XER import,
   SVG Gantt). Schedule is *mirrored* from P6/MSP, not authored here.
5. `.github/workflows/ci.yml` is written but gitignored — needs
   `gh auth refresh -s workflow` before it can be pushed.

## Submittal and RFI detail pages are new and thin

There were none — both modules were list-plus-dialog — so the approval panel had
no host and the inbox had nothing to link to. `/submittals/[id]` and `/rfis/[id]`
exist now, showing enough identity to know what you are approving plus the
panel. They are not a replacement for the edit dialog, and no list currently
links to them except through the inbox.

## Template authoring

Org-wide templates (`project = ""`) are superuser-only — the only path to one is
the PocketBase admin UI. A **project owner** may create, update and delete
templates scoped to a project they own; membership alone is not enough.

`project` is frozen after creation (`@request.body.project:isset = false`). An
ownership predicate alone does not close reparenting, because PocketBase
evaluates `updateRule` against the stored record: "owner of A" passes while the
body moves the template to B.

`workflow_steps` inherit their template's writability, which is an addition
beyond the original decision — an owner who can create a template but not its
steps gets an empty one, and `startWorkflow` refuses it.

Superusers bypass all of this. `verify:tenancy` asserts that explicitly rather
than leaving it unstated; see `docs/workflow-hooks.md` for why a hook only
partially covers it.

## The first workflow still needs an admin for org-wide defaults

`workflow_templates.createRule` is `null` (superuser only) and
`workflow_instances.template` is required. So **no user can start any workflow
until someone seeds a template through the PocketBase admin UI.**

That is correct as access control and awkward as a product: the template builder
is not polish deferred to the end, it is the only path to the feature being
usable at all. It should shape how much of the UI work can be pushed back.

`verify:tenancy` section 9 hits the same wall — it needs superuser credentials
from `.env.local` to seed a fixture template, and skips its instance checks with
an explicit message when they are absent.

## Known gap — template saves are not transactional

PocketBase has no multi-record transaction over the REST API, so writing a
template and its steps is several calls. A failure partway leaves a template
with only some of its steps.

Handled rather than hidden: the error surfaces to the user, and `startWorkflow`
refuses a template with no steps outright, so a partial write cannot silently
produce a broken workflow. The bad state is visible and re-saving fixes it.

## Known gap — workflow status forgery

Nothing in the database stops a project member PATCHing a `workflow_instances`
`status` to `approved` without a corresponding `workflow_actions` entry. SQL
cannot express "this transition must be accompanied by an audit entry", and the
app has no admin client to funnel writes through.

`verify:tenancy` section 9 now detects it: the stored state is compared against
`reconstructState(actions, snapshot)`, and a deliberately forged status proves
the check can fail rather than merely reporting green.

A PocketBase hook **can** close it properly — tested, not assumed; see
`docs/workflow-hooks.md`. Not implemented.

Today the append-only action log is a **detection** backstop, not prevention. For
construction approvals — where the question later is "who approved this and when"
— that may not be enough. Two follow-ups agreed, neither started:

1. A section 9 assertion that every instance's `status` and `current_step_order`
   are reconstructible from its `workflow_actions` history, turning detection
   from theoretical into something that runs.
2. Investigate whether a PocketBase hook can enforce the invariant server-side —
   the only layer below the app that sees writes regardless of origin. If it can,
   the gap closes properly instead of being monitored.

## Open question — is reachability checkable?

This build produced four bugs of one kind: a surface that exists but cannot be
got to. Missing nav entries for `/approvals` and `/settings/workflows`,
pointer-only step reordering, and templates needing an admin with no UI. Each
layer was individually correct — rules in PocketBase, routing in Next.js,
navigation in a component tree — and nothing sits where it could notice the gap
between them.

A cheap check is possible: routes are file-based under `app/` and nav is a plain
array in `src/lib/nav.ts`, so a unit test could assert every non-dynamic route is
either in nav or in an allowlist with a stated reason. No crawler, milliseconds
to run. It would have caught the two missing nav entries.

What it would NOT catch: reachability *within* a page (the reorder), and routes
reached by a computed `href` — those are only visible to a real crawl. The
suggestion is that dynamic routes just take an allowlist line saying how you get
to them, which forces the thinking the check exists to provoke.

Not decided, and possibly not worth the maintenance.

## Open decisions

- **Files API privacy.** Sending document *contents* to Anthropic needs a policy
  answer before retrieval stage 3. Titles and metadata were decided as acceptable
  (`dea5c88`); contents are the line that matters. Blocked on customer terms.
  See `docs/document-privacy.md`.
- **External reviewers beyond option 4.** Option 2 (real invited accounts) becomes
  buildable once SMTP is live. Not committed to.
- **Sender address.** Suggest `no-reply@pocketpm.fyi`, name "Pocket PM". Must be on
  a domain you control or DKIM can't sign it.
- **`quality_score` can't represent a real zero.** PocketBase returns `0` for unset.
  UI shows `—`. Fixing it is a schema change; not worth it yet.
- **MPP import: skipped**, decided. XER / P6 XML / Excel only.

## Standing constraints

- Read the real docs in `node_modules/next/dist/docs/` before writing Next.js code.
  This caught the `middleware.ts` → `proxy.ts` rename.
- Anthropic has **no embeddings endpoint**. Retrieval is metadata-first by necessity.
- Don't ingest AIA or IBC — licensed. OSHA is public domain and fine.
- The rate limiter is in-memory and single-instance only (`docs/ai.md`).
- Schema snapshot is the source of truth; one-off `scripts/create-*.mjs` are kept as
  the record of how the instance got there.
