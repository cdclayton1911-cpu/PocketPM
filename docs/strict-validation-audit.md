# Strict-validation audit

Completed 2026-09-08. All 20 crud-route schema pairs now use `z.strictObject`,
so an unlisted key is **rejected with a 400** rather than silently stripped and
answered with a 200.

## The finding worth carrying forward: the caller taxonomy

The flip is the smaller half of this. The useful result is **where to look
first next time**, and it is not where the audit started.

The starting hypothesis was that hand-built payloads are where silent drops
live. That is not quite it. Three callers post without going through a route's
schema:

| Caller | Route | Payload shape | Bug? |
|---|---|---|---|
| `CalendarSettingsClient` | `PATCH /api/projects/[id]` | inline object literal | **yes** |
| `useRevisions.ts` | `POST /api/document-revisions` | hand-built `FormData` | **yes** |
| `useSaveAiSession` (`useAiTask.ts`) | `POST /api/ai-sessions` | typed mutation input | **no** |

Two of three, not three of three. The one that came back clean is the worked
example, because it shows what the real discriminator is:

> **Does anything constrain the key set before it reaches the wire?**

`useSaveAiSession` builds its body by hand, but its mutation input is typed
`{ title: string; messages: string; tokens_used?: number }`, so the keys are
fixed at compile time. `CalendarSettingsClient` sends `{ work_days, holidays }`
as an object literal — nothing constrains it, and those two fields were dropped
silently until the calendar work added them to the schema.

**Check payload construction, not payload origin.** "Hand-built" was the wrong
predictor; "unconstrained" is the right one.

### Why the 16 dialog routes were never at risk

Every module dialog does the same thing: `scalarEntries(form)` → validate with
**the same schema the server uses** → send `parsed.data` through `buildPayload`.
Zod strips client-side, so an unlisted key cannot reach the server.

That was true by coincidence, not by construction. Nothing enforced it. A future
dialog that skips client validation, or a change to `buildPayload`, would have
reopened the silent drop with nothing to notice. The flip makes it structural.

Also checked and cleared, since each is a place a payload could diverge:

- `buildPayload` appends only validated keys, plus `File`s and `field-` removal
  keys — and `parseBody` routes both away from the schema, so the multipart path
  lands on the same key set as JSON
- `createDefaults` are merged **before** `safeParse`; all are declared in their
  schemas
- `ownerField` is injected **after** validation and never reaches the schema

## What the guard does and does not prove

`src/lib/validation/strict-schemas.test.ts` asserts every crud schema refuses an
unknown key.

The question the audit actually asked — *does the client posting to route X
validate with route X's schema?* — **is not testable.** A client is a React
component, its payload is assembled at run time, and a test claiming otherwise
would pattern-match over source and keep passing while the behaviour changed.

So the guard is turned around: rather than proving callers are well-behaved, the
server refuses what it does not recognise. A misbehaving caller now fails
**loudly**. That is weaker than the question and stronger than a convention.

`src/lib/validation/partial-safety.test.ts` covers the adjacent hazard: Zod
throws on `.partial()` over an object-level refinement, which killed
`ProjectRoleDialog` in `fc704da`. A grep cannot answer it — a **field**-level
`.refine()` is fine and common here — and during this audit my first scan
reported `PayApplicationDialog` as a live crash on exactly that mistake. It was
not. The test executes the call instead of pattern-matching for it.

## The verification gap this exposed

`verify:tenancy` and `verify:hooks` both talk to PocketBase **directly**. Neither
touches a Next.js route, so neither covered the Zod schemas the routes validate
with — the layer both known bugs lived in. Nothing could have proved the flip
worked in production.

`npm run verify:routes` closes that. It signs up a throwaway account, writes
through the real route handlers over HTTPS, and cleans up through PocketBase
(the app has no delete route for a project or an account). 8 assertions, with
the calendar PATCH and an unlisted key as the two that matter, each paired with
a legitimate write that must still succeed.

Worth noting the gap existed before this audit and nobody had reason to see it.
It only became visible when there was a change that no existing check could
verify.

## Deliberately not flipped

`auth.ts` — `loginSchema`, `signupSchema`, `passwordResetRequestSchema`,
`passwordResetConfirmSchema`. Outside the crud-route audit, and the auth paths
have failure modes worth their own pass rather than a bulk change. Worth doing;
not done here.

## Consequence

Strict turns a silent success into a 400. Nothing in the app sends an unlisted
key today — that is what the per-route checks established — but a caller written
against a stale schema will now fail visibly rather than appear to work.

That is the intended trade, and it is the whole point: the failure this closes
returned **200**, so neither a test nor a user would ever have reported it.
