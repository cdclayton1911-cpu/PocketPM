# PocketBase schema notes

Observations about the deployed PocketBase instance at `pb.pocketpm.fyi` that
are not obvious from the schema export itself.

## 19 collections, not 21

`docs/pocketpm_v9_architecture.pdf` (page 4) lists 21 collections:

> projects | users | subcontractors | submittals | rfis | dfow | deficiencies |
> daily_logs | change_orders | pay_applications | schedule_items | punch_list |
> drawings | aia_notices | budget_items | ai_sessions | safety_observations |
> invitations | tasks | **closeout_items** | **contract_notices**

The deployed instance has **19**. The last two do not exist:

```
GET /api/collections/closeout_items/records   -> 404
GET /api/collections/contract_notices/records -> 404
```

They are also absent from `migrate.js`, so they were never created rather than
created and dropped.

**Consequence:** the AIA Closeout module has no backing collection. Its tracker
(12 closeout document rows: G704, G706, G706A, G707, lien waivers, O&M manuals,
as-builts, …) has nowhere to persist. Either `closeout_items` needs adding to the
schema, or that module stays read-only.

`contract_notices` is plausibly just the PDF's name for `aia_notices`, which does
exist and covers formal notices and deadlines. No separate collection is needed
for it.

## The architecture PDF describes a system that was not deployed

Beyond the collection count, the PDF's "Railway API" tier does not match reality.
It documents `requireAuth()` on every route, a `makeCrudRouter()` factory, 11 AI
endpoints, helmet, rate limiting, and a PocketBase admin client. The deployed
Express service (`pocketpm-proxy.service`, running unchanged since 2026-04-23)
has five routes: `GET /health`, `POST /api/claude`, and three 503 stubs. It has
no auth, no CRUD, and no PocketBase client.

Treat the PDF as a design document, not a description of what is running.

## List rules filter; they do not gate

Worth recording because it is easy to misread as a security hole.

For **list** operations PocketBase applies a non-null API rule as a *filter*:
records not matching are excluded and the response is `200` with an empty set.
It does **not** return 403. Only `listRule: null` (admin-only) returns 403.

```
GET /api/collections/_superusers/records   -> 403   (listRule: null)
GET /api/collections/_authOrigins/records  -> 200 []  (restrictive rule, unmatched)
GET /api/collections/projects/records      -> 200 []  (owner/members rule, unmatched)
```

So an unauthenticated `200` with zero items against a properly-scoped collection
is correct behaviour, **not** evidence that the collection is public. Do not add
a test asserting unauthenticated reads return 403 — it can only pass by setting
`listRule: null`, which breaks the app for real users.

`view`/`update`/`delete` on a single record do reject with 403/404, which is the
behaviour to assert instead. See `scripts/apply-rules.mjs --verify-tenancy`.

## Dates are text, not date fields

Every date in the schema (`start_date`, `due_date`, `insurance_expiry`,
`log_date`, …) is `type: "text"`. They are strings in the types, never `Date`,
and PocketBase applies no format validation — so date parsing and validation is
the application's responsibility.

## Two export formats exist

PocketBase 0.23 changed the export format. Older exports use `schema` with
`options.noDecimal`; 0.23+ uses `fields` with `onlyInt`, and includes system
collections (`_superusers`, `_authOrigins`, `_mfas`, `_otps`).

The server is now 0.23+ (`/api/collections/_superusers/auth-with-password`
responds; the legacy `/api/admins/auth-with-password` returns 404). Any tooling
that reads the export must handle the newer format.

## invitations: no token path in the API rules

`invitations` is locked to project members on all five rules, identical to the
other child collections. There is deliberately **no token clause**.

What was wrong originally:

```
listRule  @request.auth.id != ""
          any authenticated user could list every invitation, token included
viewRule  @request.auth.id != "" || token != ""
          `token` is the record's own field and is required, so `token != ""`
          is true for every record — effectively public
```

A fix of `@request.query.token = token` was considered and **rejected**: an
invite token is a bearer credential, and a query string puts it into server
access logs, browser history, and `Referer` headers.

Invite acceptance will instead go through a `POST` route handler that reads the
token from the **request body** and validates it server-side with an admin
client. The collection stays closed to non-members; that handler is the only way
in. To be designed when team invites are built.

## users.createRule is intentionally open

`users.createRule` is `""` — public self-serve signup. This is deliberate, not
an oversight. Anyone can register an account; what they can then *see* is
governed by the project-scoped rules on every other collection.

## KNOWN ISSUE — users.listRule is too broad

**Fix this when team invites are built. Deliberately not changed before then.**

```
users.listRule  @request.auth.id != ""
users.viewRule  @request.auth.id != ""
```

Any authenticated user can enumerate **every user across every company**.
PocketBase hides `password` and `tokenKey`, and `emailVisibility` defaults to
`false` so addresses stay hidden, but `name`, `company_name`, `phone`, `role`,
and `avatar` are all readable. That is a cross-tenant user directory.

It is left alone for now because something has to be able to list candidate
users when assigning project members, and narrowing it before that feature
exists risks breaking it in a way nothing would catch.

**Target:** narrow to *users who share a project with me*, roughly:

```
@request.auth.id != "" && (
  id = @request.auth.id ||
  @collection.projects.members.id ?= @request.auth.id ||
  @collection.projects.owner = @request.auth.id
)
```

That expression is **untested** — PocketBase's `@collection` back-reference
syntax needs verifying against 0.40 before it is applied, and the self-view
clause (`id = @request.auth.id`) matters so a user can always read their own
record. Verify with `scripts/verify-tenancy.mjs` extended to cover `users`:
account B must not see account A when they share no project, and must see them
once they do.

## Two modules dropped from the navigation

`3-Phase Inspection` and `AIA Closeout Docs` are no longer listed in the
sidebar. Both were present in the prototype; neither has anywhere to store data.

**Closeout Docs** needs `closeout_items`, which does not exist on the deployed
PocketBase (see the 404 above). Its tracker is twelve document rows — G704,
G706, G706A, G707, lien waivers, O&M manuals, as-builts, and so on — and there
is no collection to hold them.

**3-Phase Inspection** has no collection either. In the prototype it was static
HTML checkboxes that persisted nothing. Its subject matter — the preparatory,
initial, and follow-up phases of a definable feature of work — is already
tracked by `dfow` (`phase`, `prep_date`, `init_date`, `complete_date`) and by
`deficiencies` for what those inspections find. Rebuilding it as its own module
would duplicate that state in two places that could disagree.

Both were dropped from the nav rather than shipped as empty shells, because a
menu entry that leads to a page which cannot save anything is worse than no
entry at all.

**To restore either**, add the collection and re-add the entry to
`src/lib/nav.ts`:

- Closeout: add a `closeout_items` collection (project relation, document name,
  AIA form number, responsible party, required-by date, status) and build the
  module on the existing CRUD scaffold.
- Inspection: decide first whether it is a genuine collection —
  `inspection_checklists` with per-phase items — or a richer view over `dfow`.
  The second is probably right, and would not need a schema change.

The placeholder route files remain at `src/app/(app)/inspection/` and
`src/app/(app)/aia/closeout/`. They are unreachable from the UI but still
resolve by direct URL, so restoring a module means replacing a page rather than
creating a route.
