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

## Rate limiting: single-instance only

**The limiter holds its counters in the app process's memory** (`src/lib/rate-limit.ts`).

This is acceptable for the current deployment and only for it: one `next start`
process bound to loopback behind Caddy, as configured in
`deploy/pocketpm-web.service`. In that shape there is exactly one counter per
user and the quota means what it says.

It stops being correct as soon as there is more than one instance:

- **Two or more app processes** — a load-balanced pair, a blue/green overlap
  during a deploy, `next start` run twice by mistake — each keep their own
  counters, so the effective quota is the configured limit multiplied by the
  number of instances. Nothing warns you; the limit silently loosens.
- **Serverless or per-request isolates** — counters would not survive between
  requests at all, and the limiter would effectively be off.
- **Restarts** — counters reset, so a deploy grants everyone a fresh quota. A
  small free-credit gift rather than a security problem, but worth knowing when
  reading usage figures.

**Before running a second instance, this must move to shared state.** PocketBase
can hold the counters with no new dependency, at the cost of a write per AI
request; Redis would be the better fit and is a dependency decision. Neither is
built, deliberately — a distributed limiter that is never deployed distributed
is complexity with no payer.

The same warning is on the module itself, so it is in front of whoever edits it.

## Tasks

`chat`, `rfi-draft`, `co-pricing`, `safety-analysis`, `contract-review`,
`toolbox-talk`, `daily-log`, `estimate`, `notice-draft`, `prequalification`,
`punch-list` — the eleven the PDF lists, behind one route.

None has a UI yet: the seven AI modules are waiting on credits. `daily-log`
ships as CRUD-only, with no generate button, because the log is useful without
generation. The task is registered so that module can gain a button without the
handler changing.

## Transport

`src/lib/ai/anthropic.ts` uses `@anthropic-ai/sdk`, which gives typed error
classes, `retry-after`-aware backoff, and connection reuse. The client is built
once and memoised; the key is read at first use, so importing the module with no
key set is harmless.

Retries are capped at 2 on top of the original attempt. The SDK retries
connection errors, 408, 409, 429, and 5xx, and deliberately does not retry 400
or 401 — a malformed request and a bad key do not improve on a second try. The
cap is low because this runs inside a user's request and the hourly quota has
already counted the attempt.

Not streaming: these are single-shot drafting calls of 2k–8k tokens, well inside
the timeout. Streaming earns its complexity once a module renders tokens as they
arrive.

## Retiring the Express route

Once this app is serving, revoke the key held by `pocketpm-proxy.service` and
disable its `/api/claude` route. Until then that endpoint remains spendable by
anyone who knows the URL.
