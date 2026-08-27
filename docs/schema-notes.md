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
