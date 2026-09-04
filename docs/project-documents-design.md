# Project documents

**Built.** `/project-documents`, collection `project_documents`
(`scripts/create-project-documents.mjs`).

Decisions taken: nine categories including `geotech` and `submittal_package`
(`correspondence` dropped), and `is_current` / `superseded_by` kept — a PM
building off a superseded spec is the expensive failure they prevent.

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

## How supersession reads

The register makes an out-of-date document *look* out of date rather than
merely recording it in a field:

- superseded rows are struck through, tinted, and carry "Superseded by
  <title>" inline
- the default filter is **Current only**, so the stale spec is not the first
  thing a PM sees
- a **Superseded** stat card says "Do not build from these" when the count is
  non-zero
- a **Missing file** card counts register entries with no document — a row that
  promises a document and has none is worse than no row

`superseded_by` is offered only when editing, since a document cannot be
replaced by one that does not exist yet.

## Verified

- multipart create with a file; `is_current` defaults true; `uploaded_by`
  stamped server-side
- filing Addendum 2 and pointing the conformed spec at it: `is_current` false,
  `superseded_by` set
- category filter (`specification` 2, `geotech` 0)
- protected download 200 signed in, **401 signed out**
- cross-tenant: account B forging A's project cookie gets `{"items":[]}` and
  **404** on A's document
- `npm run verify:tenancy` passes

## Not connected to retrieval

Stage 1 selects over `document_revisions` only, so project documents are
invisible to the Document Finder. Left that way deliberately — the finder is a
submittal/RFI history search, and the stage-1 instrumentation will show whether
people are searching for things it cannot see before the selector is made to
span two collections with different shapes.
