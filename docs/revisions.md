# Document revisions — design decisions

Not built. This records the decisions made before building, so the reasoning
survives the gap.

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

## The cross-table invariant

A revision carries two tenancy claims — its own `project`, and a pointer to a
parent record that also has one. They can disagree, and each field is
individually legitimate, so no per-collection rule catches it: a caller can name
their **own** project (create rule passes) while pointing `parent_id` at a record
in someone else's.

Tenant ownership therefore goes on both the parent and the revision, and the two
must be verified to agree.

`scripts/verify-tenancy.mjs` section 4 checks this **before the collection
exists**. While `document_revisions` is absent it reports `SKIP`, listed
separately in the summary so a green run never implies the invariant was tested.
Once the collection appears, the check exercises two axes:

- A cannot create a revision naming A's project while pointing at B's parent
- B's revision list contains nothing from A's project

This must pass before `document_revisions` holds anything.

## Retrieval metadata

When ingestion is built, each chunk should carry at least: `project`,
`parent_type`, `parent_id`, `revision_id`, `revision_number`, `revision_status`,
`is_current`, `document_type` — with retrieval scoped to the requesting user's
project first, then defaulting to current and non-superseded.

Ingestion is downstream of this model, not a parallel track.
