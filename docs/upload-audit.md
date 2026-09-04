# Upload path audit

Prompted by a finding from the deployed app: the New Submittal dialog had no
attach control, so a PM logging a submittal could not attach the shop drawing at
the moment they were logging it.

## Every file field, and how a user reaches it

"Clicks" counts from the module's own page to the file picker being on screen.

| Module | Field | Limit | Path to the control | Clicks |
|---|---|---|---|---|
| Drawings | `drawings.file` | 1 × 100 MB | Add sheet → dialog | 1 |
| Daily Log | `daily_logs.attachments` | 10 × 10 MB | New log → dialog | 1 |
| Punch List | `punch_list.photos` | 5 × 10 MB | Add item → dialog | 1 |
| Deficiency | `deficiencies.photos` | 5 × 10 MB | Add → dialog | 1 |
| OSHA Safety | `safety_observations.photos` | 5 × 10 MB | Add → dialog | 1 |
| Change Orders | `change_orders.attachments` | 5 × 50 MB | Add → dialog | 1 |
| AIA Notices | `aia_notices.attachments` | 5 × 50 MB | Add → dialog | 1 |
| Registry | `subcontractors.documents` | 10 × 50 MB | Add → dialog | 1 |
| **Submittals** | `document_revisions.file` | 1 × 100 MB | **was: save → find row → History → Add Rev 0 → dialog** | **was 4, now 1** |
| **RFIs** | `document_revisions.file` | 1 × 100 MB | **was: save → find row → History → Add Rev 0 → dialog** | **was 4, now 1** |
| — | `submittals.attachments` | 10 × 50 MB | **no UI, and none planned** | — |
| — | `rfis.attachments` | 5 × 50 MB | **no UI, and none planned** | — |
| — | `users.avatar` | 1 × 5 MB | no UI | — |

### The submittal/RFI problem

Requiring save → find → History → create revision was correct data modelling and
unusable. The document is the reason the submittal exists; making it a
second, separate act guarantees it does not happen, and a submittal register
with no drawings attached is a to-do list.

**Fixed:** the create dialog now takes a file, and on save it becomes **Rev 0**
automatically. The file still lands on a revision, never on the parent — so the
history is right from the first upload instead of being reconstructed later.

Two requests rather than a bespoke endpoint: create the parent, then create the
revision with its id. If the second fails the parent still exists and the user
is told to add the file from History — a benign, visible, recoverable failure,
and a better trade than a second write path around the revision rules.

The control appears **only when creating**. On edit, the document belongs to a
revision, and an attach box there would imply it replaces the current revision —
which is exactly what immutability forbids.

### Two dead fields

`submittals.attachments` and `rfis.attachments` exist on the schema and now have
no purpose: the document belongs to a revision, and supporting material can be
another revision or a project document (below). They are deliberately left
unused rather than wired up, because a second place to put a submittal's file is
how two sources of truth start. Worth dropping from the schema once nothing has
ever written to them.

`users.avatar` has no UI because nothing renders an avatar.

## Discoverability

Also raised: the sidebar shows both **Document Finder** and **Document Library**,
which sound like the same thing and are not.

- **Document Finder** (`/documents`) — searches *this project's* submittal and
  RFI revisions.
- **Document Library** (`/aia/library`) — reference briefings on *standard AIA
  forms*. It holds no files at all.

Two entries whose names collide, one of which does not do what its name
suggests. Renaming "Document Library" to **"AIA Forms Guide"** would resolve it,
and is a one-line change in `src/lib/nav.ts` — not made yet because it is a
product naming decision.
