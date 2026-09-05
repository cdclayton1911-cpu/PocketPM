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
| Schedule | `schedule_relationships` (typed, with lag, cycle guard) + `schedule_baselines` and variance. Pure logic, 25 tests. |
| Project roles | `project_roles`, additive to `projects.members` — a role grants no access on its own. |
| Workflows | Schema only — 4 collections, no UI or engine yet. `workflow_actions` is append-only (null update/delete rules). |
| Tenancy | `npm run verify:tenancy`, 9 sections. `npm run verify:schema` checks the snapshot matches live. |
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

## Known gap — workflow status forgery

Nothing in the database stops a project member PATCHing a `workflow_instances`
`status` to `approved` without a corresponding `workflow_actions` entry. SQL
cannot express "this transition must be accompanied by an audit entry", and the
app has no admin client to funnel writes through.

Today the append-only action log is a **detection** backstop, not prevention. For
construction approvals — where the question later is "who approved this and when"
— that may not be enough. Two follow-ups agreed, neither started:

1. A section 9 assertion that every instance's `status` and `current_step_order`
   are reconstructible from its `workflow_actions` history, turning detection
   from theoretical into something that runs.
2. Investigate whether a PocketBase hook can enforce the invariant server-side —
   the only layer below the app that sees writes regardless of origin. If it can,
   the gap closes properly instead of being monitored.

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
