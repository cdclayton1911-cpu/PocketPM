# When a check reports clean

A note prompted by one afternoon in which **three separate detectors returned a
plausible answer with nothing to signal it was wrong**. All three were written to
find problems, and all three were themselves the problem.

## What happened

**A regex that matched the wrong `.refine()`.** Scanning for schemas that would
throw on `.partial()`, it matched a FIELD-level refinement inside an object
body. It reported `PayApplicationDialog` as a live production crash. It is not:
`payApplicationUpdateSchema` is built with `.partial()` at module import time, so
a throw would 500 every route importing it. The report was confident, specific,
and wrong.

**A coverage table built from substring matches.** It reported `verify:tenancy`
as covering `/api/rfis`. It does not — it calls `/api/collections/rfis` on
PocketBase and never touches a Next.js route. The collection name appears in
both, so the grep found it.

**An `ls` with two paths.** `ls a b` fails if EITHER is missing, so a check for
"does this module have a test beside it or in `__tests__`" reported every module
untested, including ones with tests sitting next to them.

## The pattern

This is the project's own recurring failure — well-formed output whose
correctness is not observable from the output alone — wearing the costume of the
tooling used to find it. A detector that reports "clean" and a detector that
cannot report anything else look identical from the outside.

## The question to ask

When a check reports clean, ask: **could it have reported dirty?**

Not "is the logic right" — run it against a case that should fail, and watch it
fail. If nothing can make it fail, it is measuring nothing.

Worked examples already in the repo:

| Check | How it was proved able to fail |
|---|---|
| `partial-safety.test.ts` | Replaced a grep with code that EXECUTES `.partial()`. A grep guesses at the AST; the call either throws or it does not. |
| `calendar.test.ts` timezone cases | Swapped `getUTCDay()` for `getDay()` and confirmed **7 tests fail** under `TZ=America/Los_Angeles`. |
| `verify:hooks` | Run against production BEFORE the hooks were installed, and confirmed it failed. |
| `verify:tenancy` positive controls | Every denial paired with the legitimate operation it must not break — twice this caught a rule that denied everything. |
| `verify:routes` staleness check | Edits a duration and asserts the cache flips to stale. A marker that never says stale is not a marker. |

## The cheap version

Before trusting a new detector, break the thing it watches and confirm it
notices. It costs a minute and it is the difference between a check and a
decoration.
