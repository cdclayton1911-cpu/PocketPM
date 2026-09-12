# Development checklist

Ordered by what unblocks the most, not by size. `docs/STATUS.md` carries the
narrative state and the reasoning behind each decision; this is the queue.

**State:** `main` and the droplet both at `5f39910`, deployed 2026-09-11 and verified: verify:routes 22/22, verify:hooks 15/15, verify:tenancy all sections.

Workflow engine complete, schema through UI. Schedule phases 1-5 and 7 complete.
259 unit tests, 10 tenancy sections, E2E green — **all against fixtures.**

## Tier 0 — not a build task, gates everything below it

- [ ] **Get 2-3 real XER exports from actual GCs.** *One received and inventoried 2026-09-10 (see STATUS.md). One file cannot say whether multi-calendar schedules are common, so two more are still needed.*

  A customer conversation, not development. It resolves four open questions at
  once: parser ordering (XER vs PMXML), the P6 per-activity calendar decision,
  whether multi-calendar schedules are common, and the real activity count.

  More importantly it is the only thing that turns "259 green tests" into
  evidence that the CPM engine, divergence report, and Gantt are correct.
  Nothing else in this list moves that. See the note in `docs/STATUS.md` on the
  schedule work never having met a real schedule.

  The divergence report was built for this moment: it says *how* the first real
  import disagrees rather than leaving it to be guessed at.

## Tier 1 — systemic exposure, before more feature work

- [ ] **Strict validation audit across the 25 `crud-route.ts` routes.**
  Every write path validates with a plain `z.object`, which strips unknown keys
  and returns 200. Two instances found (`revisionUpdateSchema`,
  `projectSchema`), both by accident, neither by a test. **Two is a floor, not a
  count** — nobody has looked at the other 23.

  Per-route, not a global find-and-replace: strict turns today's silent
  successes into 400s, so each route's real request bodies need checking. Its
  own commit.

- [x] **`pb_hooks` request hook for the status-forgery gap — DONE, installed
      and verified in production 2026-09-08.** `npm run verify:hooks` reports
      15/15 against `pb.pocketpm.fyi`. Installed at `/opt/pocketbase/pb_hooks`;
      install and rollback in `deploy/HOOKS.md`. Migrations and direct SQLite
      writes remain uncovered by design.
  Proven open in production, not theorized — section 9 reports `stored
  approved, replayed pending — the PATCH succeeded`. Closes the
  credentialed-tool vector; migrations stay uncovered, as measured in
  `docs/workflow-hooks.md`. The engine writes the action before the state
  change, so the hook is a presence check rather than a logic port.

## Tier 2 — making shipped work reachable

- [ ] **Submittal and RFI list rows should link to their detail pages.**
  The pages exist but are reachable only through the approvals inbox, which
  shows just what awaits *you*. A PM cannot open a submittal mid-workflow they
  are not approving — the common case.

- [ ] **`docs/workflows-plan.md` rewrite.** Still describes the rejected
  polymorphic model and a phase list predating the shipped schema. A stale plan
  read as current is worse than none.

## Tier 3 — known limitations, fix when they bite

- [ ] **Non-transactional import commit.** Delete-then-recreate; an interruption
  leaves a partial schedule. PocketBase has no REST transactions, and the
  workaround is a staging table and a swap. Failure is visible, not silent.
- [ ] **Non-transactional workflow template save.** Same class, same constraint.
- [ ] **Schedule phase 6, the XER parser.** Blocked on Tier 0. The mapping seam
  from `cf6defe` is ready; XER needs only to produce headers and rows.

## Tier 4 — email

- [x] **SMTP live, verified end to end 2026-09-12.** Resend on port 2587.
  `meta.appURL` is `https://app.pocketpm.fyi`; sender `no-reply@pocketpm.fyi`.
  A real reset through the app: SPF pass (via `send.pocketpm.fyi`), DKIM pass
  (`d=pocketpm.fyi`, selector `resend`), DMARC pass. The link opened
  `/reset-password` and the new password worked at login.
- [x] **DMARC at `p=none`**, reports to Cloudflare. Tighten after watching reports.
- [ ] **Reset email, plain-text part:** the link is raw markdown and renders as
  literal brackets in text-only mail clients.
- [ ] **Reset email, HTML:** PocketBase's stock styling rather than PocketPM
  branding.
- [ ] **Send from a subdomain** (`notifications@mail.pocketpm.fyi`). Needs its own
  domain verification in Resend and its own DNS records before switching.

## Tier 5 — housekeeping

- [ ] **Droplet restart and 7 pending security updates.** `*** System restart
  required ***`. One change at a time, after a verified deploy.
- [ ] **Stray dotfiles in `/opt/pocketpm-web`** — `.bashrc`, `.profile`,
  `.npm/`, `.config/`, `.lesshst`. Something ran with `HOME` set to the repo.
  **Check `.config/` for credentials.**
- [ ] **Delete the older DO snapshot.** Two identical pre-deploy snapshots.
- [ ] **Node 22 engine floor.** `EBADENGINE` on test-only devDeps. A note, not a
  fix, until a runtime dependency crosses it.
- [ ] **Route reachability check** (`1aa57c6`). Assert every non-dynamic route
  under `app/` is in `nav.ts` or an allowlist with a stated reason. Would have
  caught three of the four reachability gaps this build produced. Unit-test
  shaped, no crawler.

## Standing constraints — do not relitigate

- systemd (`pocketpm-web.service`); deploy with `deploy/deploy.sh`
- PocketBase local file storage, no R2
- No error tracking. `journalctl -u pocketpm-web` is the whole story
- E2E is a local pre-deploy gate against a throwaway instance, **never**
  production
- `verify:schema` and `verify:tenancy` run from the dev machine, not the
  droplet — credentials live in `.env.local`
- Run E2E **twice**; a single green run cannot detect leaked state
- Construction abbreviations (`A101`, `PCO`, `CCD`, `ASI`) are never lowercased
- The design principle in `6bd2fba`: for any new gap, ask **what comparison
  would have failed?** If the answer is none, that is the gap.
