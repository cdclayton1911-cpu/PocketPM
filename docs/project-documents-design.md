# Project documents — design proposal

**Not built. This is a proposal for a decision.**

## The gap

Contracts, specifications, geotechnical reports, permits, insurance
certificates, and reference drawings have nowhere to live. Every file field on
the schema hangs off something else — a submittal, an RFI, a change order, a
daily log. A document that belongs to *the project* has no home.

That is the second-most-common thing a PM opens after a drawing, and today they
would have to attach the executed A101 to an unrelated record to get it into the
system at all.

## Why this is not the join table I argued against

Earlier I rejected a generic `documents` table keyed by `parent_type` +
`parent_id`, because PocketBase cannot follow an untyped id and the tenancy
invariant would have to live in application code.

This is a different shape. `project_documents` has **one** relation — to
`projects` — exactly like `drawings`, `rfis`, and every other module. It
inherits the standard project-scoped rules verified by `npm run verify:tenancy`,
with no cross-table invariant to enforce. It is a peer of the existing
collections, not a polymorphic index over them.

## Proposed collection

```
project_documents
  project        relation -> projects, required, cascadeDelete: true
  title          text, required
  category       select: contract | specification | drawing_set | report |
                         permit | insurance | correspondence | other
  file           file, maxSelect 1, maxSize 104857600, protected: true
  doc_number     text            A101, 03 30 00, permit number
  revision       text            free text: "Conformed", "Addendum 2"
  issued_date    text (YYYY-MM-DD, per the schema's date convention)
  received_date  text
  issued_by      text            architect, owner, AHJ
  is_current     bool
  superseded_by  relation -> project_documents, cascadeDelete: false
  notes          text
  uploaded_by    relation -> users
  created/updated autodate       ← do not omit; see below
```

Rules identical to every other child collection:

```
@request.auth.id != "" && (project.owner = @request.auth.id
                           || project.members.id ?= @request.auth.id)
```

**`created` and `updated` must be declared explicitly.** PocketBase does not add
autodate fields when `fields` is supplied via the API — omitting them on
`document_revisions` produced a bare 400 on `sort=-created` that surfaced as an
unexplained page error. Do not repeat it.

## Deliberately simpler than document_revisions

No immutability rules, no revision-number index, no exactly-one-parent clause.
A conformed spec superseded by Addendum 2 is a *new document* that points back
via `superseded_by`, not a revision chain with a lifecycle.

The distinction that matters: a submittal revision is **evidence in a review
cycle** — who stamped it, when, and what the disposition was. A project document
is **reference material**. Applying the revision machinery to a spec would add
issue/approve/supersede states nobody needs and immutability that stops someone
fixing a wrong upload.

If contract *amendments* later need a real chain, `aia_notices` and
`change_orders` already track that, and they are the right place.

## Module shape

`/project-documents`, built on the existing scaffold — `createCollectionRoute` +
`createCollectionHooks` + `CollectionView` + `FileField`, one commit, no new
patterns. Filter by category, list newest first, download through the existing
protected `/api/files/...` handler.

Nav: **Pre-Construction**, above Submittal Registry — it is where the contract
and specs are, and they precede everything else.

## Retrieval

Stage 1 (`/api/retrieval/revisions`) selects over `document_revisions` only, so
project documents would be invisible to the Document Finder. Two options:

1. **Leave it.** The finder is explicitly a submittal/RFI history search.
2. **Extend selection to a union.** More useful — "find the geotech report" is a
   real question — but it means the selector spans two collections with
   different shapes, and the metadata-only answer prompt has to describe both.

Recommend (1) first and revisit once the stage-1 instrumentation shows whether
people are searching for things it cannot see. That data is already accruing.

## What this needs from you

- **Approve the collection**, and the category list — those eight values are a
  guess at what a commercial GC files, and it is much cheaper to change now than
  after records exist.
- **Decide `is_current` / `superseded_by`.** They cost little and answer "is this
  the conformed set?", which is a real question — but they are the beginning of a
  lifecycle, and lifecycles grow.
