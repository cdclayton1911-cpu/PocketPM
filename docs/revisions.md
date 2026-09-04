# Document revisions

The `document_revisions` collection exists (`scripts/create-document-revisions.mjs`).
No submittal or RFI UI is built on it yet.

The problem: a submittal goes Rev 0 → rejected → Rev 1 → approved, each revision
its own stamped document with its own review cycle. PocketBase file fields do
not version — a replacement overwrites. So the parent record cannot own a
mutable `file` field; it owns a revision history.

## Decisions

**1. Immutable on issue, not on supersession.**

A revision is frozen when it is *issued*, not later when a newer one replaces
it. A current Rev 0 that has gone out is already evidence — someone has acted on
it, and it may already be attached to a claim. Corrections are a new revision,
never an edit.

The practical consequence: editability is a function of `status`, not of whether
a successor exists. A draft revision is mutable; once issued, the file, the
stamp, and the issue date are fixed for the life of the record.

**2. Parent deletion does not cascade to revisions.**

Every other child collection cascades from `projects`. Revisions must not
cascade from their parent record. Deleting a submittal soft-deletes it — status
becomes inactive, the row stays — because the revision history is precisely what
survives a dispute. A cascade delete would let one careless click destroy the
evidence that a rejected Rev 0 was ever issued.

This mirrors the soft-delete pattern already used in the Registry, where five
collections reference `subcontractors` with `cascadeDelete: false`.

**3. "Current revision only" is a query-time filter, not a schema constraint.**

Retrieval should default to current, non-superseded revisions so the assistant
never answers from a rejected drawing. But that is a default on the *query*, not
a rule about what may exist or be reachable.

Delay and differing-site-conditions claims are argued precisely from superseded
revisions: what was issued, when, what changed, and what the contractor had in
hand on the day. A schema that discards or hides superseded revisions destroys
the record that makes those claims provable. Never delete a rejected or
superseded revision because a newer one exists.

So: `is_current` and `status` are retrieval metadata, and the historical
material stays queryable behind an explicit option.

## How each decision is enforced

In PocketBase rules, not in application code, wherever it was possible.

| Decision | Enforced by |
|---|---|
| Immutable on issue | `updateRule`: a `draft` is freely editable; otherwise `file`, `revision_number`, `issued_at`, `stamped_by`, `stamped_at` must not be `:isset`. Bookkeeping (`is_current`, `status`, `notes`) stays writable so a revision can be superseded without rewriting history. |
| No deletion of issued history | `deleteRule`: `status = "draft"` only. |
| No cascade from parent | `submittal` and `rfi` relations both have `cascadeDelete: false`. |
| Current-only is a filter | `is_current` and `status` are plain fields. Nothing hides or removes superseded rows. |
| Tenancy agreement | `createRule`/`updateRule`: `(submittal = "" \|\| submittal.project = project) && (rfi = "" \|\| rfi.project = project)` plus `(submittal != "" \|\| rfi != "")`. |

### Typed parents, not `parent_type` + `parent_id`

The generic shape — a `parent_type` string beside a loose `parent_id` — is the
one that **cannot** be secured. PocketBase cannot follow an untyped id, so
nothing in a rule stops a caller naming their own project (create rule passes)
while pointing `parent_id` at a record in another tenant's. The invariant would
have to live in application code.

Two nullable relations instead — `submittal` and `rfi` — let the rule say
`submittal.project = project`. The database enforces the agreement, which is why
the check below can be a genuine PASS rather than a promise about app code.

### Uniqueness

Partial unique indexes give one revision number per parent and at most one
current revision per parent. Verified: a duplicate `revision_number` and a
second `is_current` revision on the same submittal are both refused (400), while
`revision_number: 1, is_current: false` is accepted.

## The cross-table invariant

A revision carries two tenancy claims — its own `project`, and a pointer to a
parent record that also has one. They can disagree, and each field is
individually legitimate, so no per-collection rule catches it: a caller can name
their **own** project (create rule passes) while pointing `parent_id` at a record
in someone else's.

Tenant ownership therefore goes on both the parent and the revision, and the two
must be verified to agree.

`scripts/verify-tenancy.mjs` section 4 now **passes**, having been written while
the collection did not yet exist (it reported `SKIP`, listed separately so a
green run never implied it had been tested). Eleven checks:

```
PASS  setup: both parent submittals were created
PASS  A cannot create a revision whose parent belongs to B's project
PASS  A CAN create a revision on A's own submittal
PASS  a revision with no parent is refused
PASS  a DRAFT revision can still be edited
PASS  a draft can be issued
PASS  an ISSUED revision cannot have its revision_number changed
PASS  an issued revision CAN still be marked superseded
PASS  a superseded revision cannot be deleted
PASS  user B's revision list does NOT contain A's revision
PASS  user B cannot fetch A's revision by id
```

Three of those exist to stop the suite passing for the wrong reason:

- **the setup check.** The first run reported the forged write as blocked when
  in fact both submittals had failed to create, so the "attack" was a malformed
  request. A false green. The suite now fails loudly if the parents are missing.
- **"A CAN create a revision on A's own submittal".** A rule denying everything
  would pass every security assertion while breaking the feature.
- **"a DRAFT revision can still be edited"** — the decision is immutable *on
  issue*, not on creation.

The two refusal checks assert the **stored data**, not the status code:
PocketBase answers a rule-excluded write with `404`, the same behaviour the CRUD
route factory relies on, so a narrow `403`-only assertion reported a false FAIL.
What proves the refusal is that `revision_number` is still `2` afterwards and
the record is still readable — not which code came back.

## Retrieval metadata

When ingestion is built, each chunk should carry at least: `project`,
`parent_type`, `parent_id`, `revision_id`, `revision_number`, `revision_status`,
`is_current`, `document_type` — with retrieval scoped to the requesting user's
project first, then defaulting to current and non-superseded.

Ingestion is downstream of this model, not a parallel track.
