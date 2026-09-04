# Configurable approval workflows — plan

**Not built.** Scope and shape for a decision.

## What exists today, and why it does not generalise

Five modules each carry a hand-written status enum, and the transitions between
them live in dialogs as `<select>` options a user picks by hand:

| Module | Field | Values |
|---|---|---|
| Submittals | `disposition` | pending, pending_ae, approved, approved_as_noted, revise_resubmit, rejected, void, overdue |
| RFIs | `status` | draft, open, answered, closed, void |
| Change orders | `status` | draft, submitted, under_review, approved, rejected, void |
| Punch list | `status` | open, in_progress, complete, void |
| Deficiencies | `status` | open, in_progress, closed, escalated, void |

Two consequences worth naming. **Ball-in-court is typed, not derived** —
`rfis.ball_in_court` is free text a user maintains by hand, so it is wrong the
moment anyone forgets. And **there is no record of who was asked, when, or what
they were allowed to do**: `disposition` says the outcome but not the route, so
a submittal that sat with the wrong reviewer for three weeks leaves no trace.

## The shape

Five collections. The design decision that makes it tractable is the direction
of the relation.

### Point the subject at the workflow, not the workflow at the subject

The obvious model gives a workflow instance a `subject_type` + `subject_id`.
That is the polymorphic shape already rejected twice in this codebase, for the
same reason: PocketBase cannot follow an untyped id, so the tenancy invariant
would live in application code.

Invert it. **A workflow instance knows only its project. The reviewable record
points at it.**

```
document_revisions.workflow  -> workflow_instances     (submittals, RFIs)
change_orders.workflow       -> workflow_instances
punch_list.workflow          -> workflow_instances
deficiencies.workflow        -> workflow_instances
```

Every one of those is a typed relation, so the agreement clause is expressible
in a rule, exactly as `document_revisions` does today:

```
updateRule: <project scope> && (workflow = "" || workflow.project = project)
```

No cross-table invariant to enforce in code, and `verify:tenancy` gains one
section per subject rather than a bespoke checker.

### Collections

```
workflow_templates
  project, name, subject_type (select), is_default (bool), notes
    subject_type: submittal | rfi | change_order | punch_item | deficiency

workflow_template_steps
  template, step_order (int), name, mode (select: sequential | parallel)
  assignee_role (select) | assignee (relation -> users)
  duration_days (int)                     -- drives the step due date
  allowed_actions (json or text: action keys)
  is_terminal_on (text: action keys that end the workflow)

workflow_instances
  project, template (relation, for provenance only)
  template_name (text)                    -- snapshot, see below
  status (select: open | complete | cancelled)
  started_at, completed_at, outcome (text: the terminal action key)

workflow_steps
  instance, step_order, name, mode
  assignee (relation -> users), assignee_role
  due_date, status (select: waiting | open | done | skipped)
  action (text: the action key taken), acted_by (relation), acted_at, comment
  created/updated
```

### The template is snapshotted into the instance

`workflow_steps` are **copied** from the template when a workflow starts, not
read through a relation. Editing a template must not rewrite the history of
reviews already completed under the old one — the same principle as
"immutable on issue" in `docs/revisions.md`, and for the same reason: these
records are evidence in a dispute.

`workflow_instances.template` is kept for provenance ("started from Standard
Submittal Review"), never for reading step definitions.

### Actions are a vocabulary, not an enum per module

One global action list, with each template step declaring which subset it
allows:

```
approved | approved_as_noted | revise_resubmit | rejected | for_record_only
| answered | forwarded | closed | reopened | void
```

A submittal A/E review step allows the first five; an RFI response step allows
`answered` and `forwarded`. This is what makes one engine serve five modules
instead of five engines.

### Ball-in-court is derived

`ball_in_court` becomes a computed read: the assignee of the lowest-ordered
step whose status is `open`. Parallel steps yield several — which is correct,
and a text field could never express it.

## Coexistence with document_revisions

**The workflow attaches to the reviewable unit, which is not always the record.**

- Submittals and RFIs: the unit is a **revision**. Rev 0 gets a workflow; a
  `revise_resubmit` terminates it, and Rev 1 starts a fresh one. This falls out
  of the existing model rather than fighting it — `document_revisions` already
  says a correction is a new revision, never an edit.
- Change orders, punch items, deficiencies: no revision chain, so the workflow
  attaches to the record.

That also resolves an overlap: `document_revisions.status`
(draft/submitted/approved/rejected/superseded) is today set by hand in
`RevisionsDialog`. It becomes **derived from the workflow** — `submitted` when
the workflow opens, `approved`/`rejected` from the terminal action,
`superseded` unchanged (it is a supersession fact, not a review outcome).

## What breaks

Measured, not estimated: **16 references to `disposition`, 4 to
`ball_in_court`**, and twelve files that write one of these statuses.

| Area | Files | What happens |
|---|---|---|
| Validation schemas | `submittal.ts`, `rfi.ts`, `change-order.ts`, `deficiency.ts` | status/disposition must stop being client-writable, or the engine is advisory |
| Dialogs | `SubmittalDialog`, `RfiDialog`, `ChangeOrderDialog`, `DeficiencyDialog` | the status `<select>` is removed; a workflow picker replaces it on create |
| Clients | `SubmittalsClient`, `RfisClient` | status column becomes derived; ball-in-court column reads from the open step |
| Revisions | `RevisionsDialog` | Approve/Reject buttons become workflow actions, not direct writes |
| Route | `api/submittals/route.ts` | `createDefaults: { disposition: "pending" }` moves into workflow start |
| Dashboards | `DashboardView`, `PdcaView`, `AiaDashboardView` | **no change, if the compatibility strategy below is taken** |

### Keep the status fields, write them from the engine

The cheap and safe path: the engine continues to write `disposition` /
`status` as a **derived, denormalised** value on the parent whenever a step
completes. Then every dashboard, filter, stat card, and the stage-1 retrieval
metadata keeps working untouched, and the three AI dashboards need no changes
at all.

The cost is one denormalisation that can drift if anything writes those fields
outside the engine — which is why they must also be dropped from the write
schemas in the same change. Doing one without the other is how two sources of
truth start.

**There is now a real user with a live submittal** (project "LowCountry
Grocers"). A migration that clears `disposition` or leaves records without a
workflow would be visible to them. Existing records need a backfill: either a
synthetic single-step completed workflow reflecting their current status, or
explicit "no workflow" handling in the UI. The former is cleaner and is what I
would do.

## Scope

| Phase | Contents | Rough size |
|---|---|---|
| 1 | Collections, rules, types, `verify:tenancy` sections | 1 commit |
| 2 | Engine: start, act on a step, advance, derive ball-in-court, write back status | 2–3 commits |
| 3 | Template CRUD module + per-project defaults | 1–2 commits |
| 4 | Wire submittals and RFIs (via revisions); backfill existing records | 2 commits |
| 5 | Wire change orders, punch list, deficiencies | 1 commit |
| 6 | "My open steps" inbox — the thing that makes it worth having | 1 commit |

Phases 1–2 are the risk; 3–6 are mechanical on the existing scaffold.

## Open questions

- **Roles or named users?** Assigning a step to "Architect" needs a project
  roles concept that does not exist. Named users need the external-party access
  work already deferred in `docs/documents.md`. Assigning to a **user on the
  project** is the only option available today, and it will not cover an
  architect who has no account.
- **Do due dates drive notifications?** A due date nobody is told about is a
  date in a table. There is no notification channel in this app.
- **Parallel steps: all, or any?** "All reviewers must act" and "any one may
  act" are both real; the model above assumes all, with `mode` reserved.
