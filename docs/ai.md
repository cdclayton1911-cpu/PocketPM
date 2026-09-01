# AI route handler

`POST /api/ai/<task>` is the app's only path to Anthropic. It replaces
`POST /api/claude` on the Express service at `api.pocketpm.fyi`.

## What was wrong with the endpoint it replaces

The deployed Express route is, in full, `app.use(cors())`, `express.json()`, and
a handler that forwards the request body to Anthropic with the service's API
key. That means:

- **No authentication.** An unauthenticated `POST` from any origin reached
  Anthropic and spent credits. This was verified against the live service, not
  inferred from the source.
- **No rate limit.** Nothing bounded how fast anyone could spend them.
- **The client chose the prompt.** The browser posted `messages` and `system`
  verbatim, so the endpoint was a general-purpose Anthropic proxy that happened
  to sit behind a construction app.

The architecture PDF describes `requireAuth()` and rate limiting on this tier.
Neither was ever deployed.

## What this handler does instead

| | |
|---|---|
| **Auth** | `getSession()` first. No session → `401`, before any upstream call. |
| **Rate limit** | 20 requests per user per rolling hour, keyed by PocketBase user id — not IP, so an office NAT is not one shared quota and a new address is not a new quota. `AI_RATE_LIMIT_PER_HOUR` overrides. |
| **Prompts** | Server-side, in `src/lib/ai/tasks.ts`. The client sends a task name plus typed inputs; it cannot send a prompt. |
| **Project context** | Read from the active-project cookie and fetched from PocketBase *as the user*, so the rule 404s a project they are not on. The prototype posted this from the browser, where a client could name any project. |
| **Validation** | Zod per task, on the input. |
| **Key** | `ANTHROPIC_API_KEY`, server env only. No `NEXT_PUBLIC_` prefix, so it cannot reach a bundle. |

### Status codes

| Code | Meaning |
|---|---|
| `401` | Not signed in. |
| `404` | No such task. |
| `400` | Input failed the task's schema. |
| `429` | Per-user quota exhausted (`Retry-After`), or Anthropic rate-limited the account. |
| `422` | Claude declined the request. |
| `503` | No API key set, or the Anthropic account cannot serve requests (e.g. no credit). |
| `502` | Upstream error, timeout, or empty response. |

Every response carries `RateLimit-Limit` / `-Remaining` / `-Reset`.

## Two things to know before relying on it

**The limiter is in-process memory.** Correct for the current deployment — one
`next start` behind Caddy — and wrong the moment there is a second instance,
because each would grant the full quota. It also resets on restart. See the note
at the top of `src/lib/rate-limit.ts`.

**A successful completion is unverified.** The Anthropic account is out of
credit, so no request in testing has reached the model. What *is* verified
empirically, against the running app: `401` unauthenticated, `404` on an unknown
task, `400` on bad input, `503` with no key configured, and `429` on the 21st
request in an hour with a correct `Retry-After`. The parsing of a successful
response is written from the API contract and has not been exercised.

## Tasks

`chat`, `rfi-draft`, `co-pricing`, `safety-analysis`, `contract-review`,
`toolbox-talk`, `daily-log`, `estimate`, `notice-draft`, `prequalification`,
`punch-list` — the eleven the PDF lists, behind one route.

None has a UI yet: the seven AI modules are waiting on credits. `daily-log`
ships as CRUD-only, with no generate button, because the log is useful without
generation. The task is registered so that module can gain a button without the
handler changing.

## Not the official SDK

`src/lib/ai/anthropic.ts` calls the Messages API with `fetch`.
`@anthropic-ai/sdk` would be better — typed errors, retries, streaming helpers —
but it is not in the brief's approved stack and adding it needs a decision.
Everything Anthropic-specific is in that one file so the swap is contained.

Not streaming, either: these are single-shot drafting calls of 2k–8k tokens, well
inside the timeout. Streaming earns its complexity once a module renders tokens
as they arrive.

## Retiring the Express route

Once this app is serving, revoke the key held by `pocketpm-proxy.service` and
disable its `/api/claude` route. Until then that endpoint remains spendable by
anyone who knows the URL.
