# Documents

In commercial construction the document *is* the record: a submittal is a
stamped shop drawing, an RFI carries a marked-up sketch, a pay app is a
notarised G702. Until this milestone the app tracked the metadata and had
nowhere to put the paper — `type="file"` appeared zero times in `src/`, and the
CRUD layer was JSON-only, so a file could not physically pass through it.

## The storage layer already existed

Worth stating plainly, because the obvious plan is to add object storage and a
`documents` join table, and that would be a mistake here.

The deployed PocketBase has **11 file fields, sized per document type**:

| Field | Limit | Field | Limit |
|---|---|---|---|
| `drawings.file` | 1 × 100 MB | `submittals.attachments` | 10 × 50 MB |
| `rfis.attachments` | 5 × 50 MB | `subcontractors.documents` | 10 × 50 MB |
| `change_orders.attachments` | 5 × 50 MB | `aia_notices.attachments` | 5 × 50 MB |
| `daily_logs.attachments` | 10 × 10 MB | `deficiencies.photos` | 5 × 10 MB |
| `punch_list.photos` | 5 × 10 MB | `safety_observations.photos` | 5 × 10 MB |
| `users.avatar` | 1 × 5 MB | | |

Someone sized a shop drawing at 100 MB and a punch photo at 10 MB. The design
work was done; only the UI was missing.

Three reasons **not** to add R2 + presigned URLs + a `documents` table:

1. **There is no Railway service.** That tier exists in the architecture PDF and
   was never deployed — see `docs/schema-notes.md`. The real backend is
   PocketBase behind Caddy on one droplet.
2. **A join table sits outside the tenancy model.** Every collection's
   project-scoped rules were repaired and empirically verified, and
   `npm run verify:tenancy` guards them. A separate table keyed by a loose
   `parent_record_id` cannot inherit those rules, so authorization would be
   reimplemented by hand in the one place where a mistake shows one GC another
   GC's drawings. Per-collection file fields inherit it for free.
3. **Presigned URLs bypass the rules entirely** — possession of the URL is the
   authorization.

The one thing a join table buys, cross-module document search, can be added
later without giving up rule-backed isolation.

## How it works

**Files travel the normal write path.** `lib/crud-route.ts` detects
`multipart/form-data`, splits file parts from scalars, validates the scalars
with the same Zod schema as before, and hands PocketBase a `FormData`. So an
upload is subject to exactly the same project-scoping and ownership injection as
every other write — there is no second endpoint with its own idea of who may
write what.

**Limits are generated, not hand-written.** `scripts/generate-types.mjs` emits
`src/types/file-fields.ts` from the schema export, carrying `maxSelect`,
`maxSize`, and `mimeTypes` per field. The route checks against it before
forwarding, so an oversized file fails with a sentence instead of a bare 400
after the bytes have crossed the wire twice. Regenerating types is what keeps
the UI's stated limits true.

**One component.** `components/shared/FileField.tsx` handles all eleven fields:
existing files with download links, removal (PocketBase's `field-` syntax), a
picker, and limits read from the generated spec. Modules adopt it rather than
each growing their own.

**Uploads only when files change.** A dialog sends JSON for an ordinary metadata
edit and multipart only when a file is added or removed, so the common path
stays simple — and an edit that never mentions files leaves them untouched.

## Downloads go through an authenticated handler

`GET /api/files/[collection]/[record]/[filename]` requires a session, fetches
the record **as that user** so PocketBase's view rule decides visibility,
confirms the filename is actually attached to a declared file field on that
record, then redirects to PocketBase with a short-lived file token.

### KNOWN ISSUE — every file field is `protected: false`

**Verified on the deployed instance: all 11 file fields are unprotected**, which
means PocketBase serves them to anyone holding the URL, with no session. Record
ids are random so they are not enumerable, but a URL that leaks through a
forwarded email, a `Referer` header, or shared browser history grants permanent
unauthenticated access to that document. `subcontractors.documents` is specified
to hold audited financial statements.

The handler above controls who can *obtain* a link. It cannot control who can
use one until the fields are flipped to `protected: true`, at which point
PocketBase requires the file token the handler already sends — so the flip is a
settings change and needs no application change.

**This is worth doing before any real document is uploaded.** It is not done
here because changing the deployed schema is the operator's call, not a side
effect of a feature commit.

## Adopted so far

`drawings` only — the reference implementation, chosen because it is the most
document-shaped module and has the single 100 MB field. Nine modules still have
file fields with no UI: submittals, rfis, change_orders, aia_notices,
daily_logs, deficiencies, punch_list, safety_observations, subcontractors.

## Verified end to end

Against the running app, with a real PDF:

- create with a file → 201, PocketBase assigns a stored name
  (`s_201_a5gf9tibzc.pdf`), record scoped to the right project
- download signed in → 307 to PocketBase with a token
- **same URL signed out → 401**
- **same URL as a different account → 404** (the view rule, not a check of ours)
- filename not attached to the record → 404
- JSON-only edit → 200, file survives untouched
- 2 MB into a 10 MB field → 201; 12 MB → 400, *"huge.bin is 11 MB; the limit is
  10 MB"*
- a file aimed at `notes`, a text column → 400, *"notes does not accept a file"*
- removal via `file-` → file cleared, and the download 404s afterwards
- `npm run verify:tenancy` still passes

## Not built

**Versioning.** Submittals go Rev 0 → rejected → Rev 1, each revision with its
own stamp, date, and review cycle. PocketBase file fields do not version — a
replacement overwrites. This needs a schema change and is the workflow that
makes the product worth charging for.

**External parties.** Architects, subs, and consultants uploading means accounts
for people who are not the customer, per-project role scoping, and probably
tokenised links for one-off consultants. It connects to two things already
flagged in `docs/schema-notes.md`: `users.listRule` currently lets any
authenticated user enumerate every user across every company, and the invitation
acceptance handler is designed but unbuilt. It changes the auth model, the data
isolation story, and the pricing page at once, and deserves its own design pass.
