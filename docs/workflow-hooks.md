# Can a PocketBase hook close the status-forgery gap?

**Short answer: yes, and it is the only layer that can.** Not implemented — this
is the investigation asked for alongside the engine work.

## The gap

`workflow_instances.updateRule` must permit project members to write `status`
and `current_step_order`, because the app has no admin client and the engine
runs as the calling user. So a member can PATCH `status: "approved"` directly
against `pb.pocketpm.fyi`, with no `workflow_actions` row behind it. Nothing in
SQL or in PocketBase's rule language can express "this write must be accompanied
by an append to another collection".

`verify:tenancy` section 9 now *detects* this — it replays the action log
through `reconstructState` and compares. Detection is not prevention.

## What was actually tested

Not reasoned about — run, on PocketBase 0.40.1, on a throwaway instance:

```js
// pb_hooks/main.pb.js
onRecordUpdateRequest((e) => {
  throw new BadRequestError("hook refused this write")
}, "projects")
```

Result: the update was rejected with `Hook refused this write.` The hook fired
for a **superuser** request made directly against the API — not through Next.js,
and not subject to collection rules. That is exactly the traffic the gap is
about.

## Why this closes it properly

The engine already writes the `workflow_actions` row **before** the state
change (`src/lib/workflow/engine.ts`). That ordering was chosen so an orphaned
action is recoverable while a state change with no action is not — and it has a
second payoff: by the time a status PATCH arrives, the justifying action is
already committed and visible to a hook. So the hook can be a lookup, not a
rewrite of the engine:

> On update of `workflow_instances`, if `status` or `current_step_order` is
> changing, require a `workflow_actions` row for this instance at the instance's
> current step, by the requesting user, within the last few seconds. Otherwise
> reject.

## Costs, before anyone commits to it

- **Logic duplicated in Goja.** Hooks run in PocketBase's own JS runtime, not
  Node — no imports from `src/`. A full `reconstructState` port would drift from
  the TypeScript one, which is why the sketch above is a *presence* check rather
  than a replay. Cheap to keep honest; a full replay would not be.
- **Deployment surface.** `pb_hooks/` must exist on the droplet and PocketBase
  must be restarted to load it. The E2E harness would need `--hooksDir` too, or
  tests would exercise a PocketBase that behaves differently from production —
  the same class of divergence the schema snapshot check exists to prevent.
- **Hooks do not see everything.** They intercept API requests. Direct SQLite
  writes on the box, and `app.save()` from a migration, bypass them. That is
  acceptable: both require shell access, which is a larger compromise than this
  control is meant to address.
- **A rejected write is a 400 the app must handle.** The engine's own path would
  satisfy the hook, but any future code path that updates an instance without
  logging an action would start failing — loudly, which is the point.

## Recommendation

Worth doing, and cheap in the presence-check form. It should not block UI work:
detection already runs in `verify:tenancy`, and the engine is the only writer
today.
