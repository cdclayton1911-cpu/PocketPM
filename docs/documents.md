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

### File fields are protected — an unguessable URL is a bearer credential

All 11 file fields are now `protected: true` (`scripts/protect-files.mjs`,
prior state backed up in `scripts/file-fields-backup-*.json`).

The reasoning is worth stating plainly, because "the id is random" reads like
security and is not: **an unprotected PocketBase file URL is a bearer
credential, not an authorization check.** Possession is access. Such a URL
cannot be revoked once forwarded, carries no identity so access leaves no audit
trail, keeps working after a subcontractor relationship ends, survives
indefinitely in email and chat and browser history, and accumulates — every link
ever minted stays live.

Proven before and after the flip, on the same uploaded PDF:

```
before   GET https://pb.pocketpm.fyi/api/files/<col>/<rec>/<file>   200  (bytes)
after    GET https://pb.pocketpm.fyi/api/files/<col>/<rec>/<file>   404
after    GET /api/files/drawings/<rec>/<file>   (signed in)         200  %PDF-1.4
```

## Token lifecycle

The design keeps transient access material out of application state entirely,
which removes the class of bug rather than handling it.

**The page never holds a token.** A download link is the stable app route
`/api/files/<collection>/<record>/<filename>`. Verified: rendering the drawings
page yields **zero** occurrences of `token=` in the HTML. The token is minted
server-side when the user clicks, and is consumed immediately by the redirect —
it never reaches the client as data, so it cannot be persisted, cached, logged
in analytics, or copied out of the DOM.

This is deliberately *not* the common `{ url, expiresAt }` shape. Returning a
signed URL to the client makes the token durable application data — the exact
thing that is dangerous — and then requires expiry plumbing to compensate. Here
there is nothing to expire on the client.

**So the stale-page problem does not arise.** Verified: a redirect URL captured
and retried after its token expired returns **404**, while the app link on a
page that was never reloaded still returns **200**. A tab left open for an hour
works, because the href it holds is not time-bound.

Tokens are also **identity-bound**: the JWT payload names the requesting user's
record, so PocketBase sees who is fetching rather than only that someone had a
link. TTL is 120s (PocketBase default; `fileToken.duration` is unset).

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

## Enum casing

`drawings.discipline` stored `Architectural` and `Fire Protection` while every
status enum stored lowercase. Normalised by `scripts/normalize-enums.mjs`
(schema options, existing records, and the committed schema export), so a filter
for `fire_protection` cannot miss a record spelled `Fire Protection`.

The rule now: **stored values are canonical lowercase snake_case; capitalisation
is presentation and lives in `src/lib/enum-labels.ts`.**

Scope was narrower than it first appeared — 25 of 30 select fields were already
canonical. Three were fixed: `drawings.discipline`, `projects.status`
(`on hold` → `on_hold`), `tasks.status` (`in progress` → `in_progress`).

**Two were deliberately left alone**, and a blanket `toLowerCase()` would have
corrupted them:

- `change_orders.type` — `PCO`, `CO`, `CCD`, `ASI` are industry acronyms
- `projects.contract_type` — `A101`, `A102`, `A103`, `A133` are AIA form numbers

`a101` is not a normalised `A101`; it is wrong. Canonical means one consistent
representation, not lowercase for its own sake.

The migration runs widen → migrate → narrow so no record is ever invalid against
its own field, and backs up to `scripts/enum-backup-*.json` first.
