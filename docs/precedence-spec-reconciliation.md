# Precedence spec v1.0 — reconciliation

What the implementation and the spec agree on, where they differ, and which side
should change for each. **No code changed in this pass.**

Implementation as of `6d3ae42`: `src/lib/precedence/`, `precedence_provisions`
(35th collection, **zero records**), and the paste-and-confirm editor.

## Matches

| Spec | Implementation |
|---|---|
| 5 precedence classes | Exact, all five |
| 4 provision scopes | Exact, all four |
| Provision record: scope, scope_target, rules, external_instrument, source_text | Present |
| Rules as an ordered procedure | `PrecedenceRule[]`, applied top to bottom |
| Three independent axes | Scope and precedence class are independent enums |

Two cosmetic differences, called out so they are chosen rather than inherited:

- **Casing.** The spec writes values lower_snake (`precedence_resolvable`); the
  implementation uses UPPER_SNAKE in TypeScript and in the PocketBase select.
  Recommend the spec adopt UPPER_SNAKE for stored values and keep lower_snake
  for prose. Free to change either way at zero records.
- **`location`.** The spec has one field; the implementation splits `section`
  and `page`. Recommend the spec adopt the split — page is required for research
  traceability and parsing it back out of a combined string is lossy.

## Mismatches

### 1. `resolves_drawing_vs_spec` is too narrow — SPEC SHOULD CHANGE

Confirmed. WCU sub-ranks drawings (large-scale detail over small-scale), so it
resolves an **E2** conflict while the boolean only asks about **E1**. A single
boolean cannot record a provision that settles one class and not another.

**Proposal:** replace with a set of conflict classes the provision can settle.

```
resolves: ["E1", "E2"]        // WCU: ranks spec over drawings, and detail over plan
resolves: []                  // UCCS: tied tier settles neither
resolves: []                  // Rees: stringency settles nothing on its own
```

A set of *classes* rather than *document pairs*: pairs would need every named
document type enumerated per provision, and manuals name documents in their own
words. Classes are the axis already being coded.

**Cost:** the field is already recorded rather than derived, so this is a type
change, not new information. Schema: `bool` → `json`, free at zero records. Code:
one field in `types.ts`, the validation schema, one checkbox in the editor
becomes a class multi-select. Roughly an hour, and it does not touch the
classifier — `resolves` is descriptive metadata, not an input to classification.

**Worth noting it is checkable.** Once it is a set, a test can assert that a
provision claiming to resolve E2 actually classifies an E2 conflict as
resolvable. As a boolean it is an unverifiable assertion by whoever typed it.

### 2. `spec_locus` / `dwg_locus` cannot express E2 or E3 — SPEC SHOULD CHANGE

Confirmed, and it is the same fault as (1): the field names encode an assumption
that every conflict has one specification side and one drawing side. E2 is
drawing-drawing and E3 is spec-spec.

The implementation already models this as `between: [ConflictLocus,
ConflictLocus]` and has a passing test for the WCU detail-versus-plan case,
which has no specification side at all.

**Proposal:** the per-conflict record uses `loci: [locus, locus]`. Order carries
no meaning; the classifier is symmetric and there is a test asserting that
swapping the sides does not change the answer.

**Cost:** none to the implementation. For the spec, it invalidates any coding
already done in the two-named-field format — worth knowing before more is coded,
which is the argument for changing it now.

### 3. `DEFER` is missing from the implementation — IMPLEMENTATION SHOULD CHANGE

The spec lists five rule types; the implementation has four. `DEFER` is absent,
and it is needed: Rees 22 00 00 defers conditionally to Division 01 "when
available", which none of the other four expresses.

**Cost:** a variant in the `PrecedenceRule` union, a branch in `applyRule`, a
case in the editor. `rules` is a json column, so **no schema change**. Half an
hour.

The interesting part is what `DEFER` should return when the deferred-to document
is absent. "When available" is a condition the classifier cannot evaluate, so
the honest answer is `REQUIRES_CLARIFICATION` with an explanation naming what it
defers to — not a silent fall-through to the next rule.

### 4. Conflict class is not an input to classification — BOTH SHOULD CHANGE

The spec says conflict class is determined **first**, from the documents alone,
and that this ordering is a coding-bias control. Nothing enforces it. The
implementation's `DetectedConflict` carries no `conflict_class`, so precedence
can be classified for a conflict whose class was never decided — exactly the
ordering the control exists to prevent.

**Proposal:** make `conflict_class` a required field on `DetectedConflict`, so
`classifyConflict` cannot be called without one. The ordering stops being a
procedure people follow and becomes a thing the type system requires.

**Cost:** one required field; every existing test already knows its case's class.
Small, and it converts a documented convention into a structural guarantee —
which is the move this codebase keeps finding is the one that holds
(`docs/when-a-check-reports-clean.md`).

### 5. The REQUIRES_CLARIFICATION / NO_PRECEDENCE_PROVISION boundary is undefined — SPEC SHOULD RECORD IT

Both enums list both values; neither says which applies when a provision exists
but does not reach the conflict. The implementation resolves it as:

- **out of scope entirely** → `no_precedence_provision` (Rees Division 08: the
  plumbing rule does not reach a door schedule)
- **in scope but silent on these documents** → `requires_clarification` (WCU
  meeting a shop-drawing-versus-product-data conflict)

This is a coding decision that will move agreement statistics, so it belongs in
the spec rather than in an implementation comment.

## Three things the spec does not record

### Provisional constructs (§8)

§8 says four projects establish heterogeneity, not frequency, and that anything
resting on a single observation should be flagged provisional. Nothing does.
`DEFER` exists because one project has it, once.

**Proposal:** a registry in code — not a field on every row — naming each
construct, how many of the four projects it was observed in, and whether it is
provisional. Classification output then carries `provisional: true` when a
provisional construct decided the outcome, so the flag travels with the finding
instead of living in a document nobody re-reads.

```
DEFER          n=1  provisional
STRINGENCY     n=2  established
RANK_SEQUENCE  n=2  established
OVERRIDE       n=1  provisional        <- also single-observation
```

Worth noting `OVERRIDE` is single-observation too (UCCS Article 52). If the
marker applies to `DEFER` on the n=1 rule, consistency requires it here.

**Cost:** code-only, no schema. The registry is a constant and a test asserting
every rule type appears in it, so a new construct cannot be added without
declaring its evidence.

### E4/E5 agreement reported separately (§2.3)

§2.3 concedes that coder disagreement concentrates on E4/E5 while still asking
coders to judge "should reasonably show". A pooled kappa across E1–E5 would
average a reliable judgment together with an unreliable one and report a number
describing neither.

**Proposal:** report agreement per conflict class, never pooled. The schema
supports this already once (4) lands and `conflict_class` is on every record.
Separately, either bound the "should reasonably show" test or mark E4/E5
findings lower-confidence in their own right — but that is a research decision,
not a schema one.

### §6.1 and §7.3 describe a pipeline that was deliberately not built

§6.1 (search terms) and §7.3 (searched-nothing versus could-not-search) describe
automated extraction. **That was considered and rejected**: it would have bought
about ninety seconds once per project in exchange for a PDF dependency, a
reversal of the document-privacy line in `docs/document-privacy.md`, and a 55%
false-positive rate a person would have had to review anyway. The implementation
is paste-and-confirm.

**Proposal:** mark both sections FUTURE / NOT IMPLEMENTED, or a reader will
assume extraction exists and that a missing provision means the search found
nothing.

**But §7.3's distinction survives the change of method, and the implementation
currently gets it wrong.** In paste-and-confirm terms:

- nobody has recorded a provision yet
- a person searched the manual and there is none

Both currently produce `no_precedence_provision`, and they mean entirely
different things — the second is a finding, the first is an absence of work.
This is the same failure this codebase keeps producing: a clean-looking result
whose correctness is not observable from the result.

**The fix is already half-built.** `NONE_FOUND` is in the scope enum and nothing
writes it. Recommend an explicit "searched the full manual, no provision found"
record with `scope: NONE_FOUND` and its own `source_text` — the searcher's note
rather than a clause — and `classifyConflict` distinguishing "a NONE_FOUND
record exists" from "no records at all".

**Cost:** no schema change. One branch in the classifier, one action in the
editor, and a test that the two states do not collapse.

## Migration cost, in total

`precedence_provisions` holds **zero records**, so every schema change here is
free and gets expensive after the first project is coded.

| Change | Schema | Code |
|---|---|---|
| `resolves_drawing_vs_spec` → `resolves: ClassSet` | `bool` → `json` | ~1h |
| Add `DEFER` | none (`rules` is json) | ~30m |
| Require `conflict_class` on a conflict | none | ~30m |
| Provisional registry | none | ~30m |
| Explicit NONE_FOUND record | none | ~45m |
| Casing / `location` split | select values | minutes |

The per-conflict record — `conflict_id`, `conflict_class`, `conflict_subtype`,
`loci`, `precedence_class`, `precedence_provision_ref`, `precedence_reasoning`,
`severity` — **does not exist yet**. That is the next collection, and it should
be created before conflicts are coded rather than after, for the same reason.

## Recommendation

Change the spec on (1), (2), (5), and the three unrecorded items. Change the
implementation on (3) and (4). Do the schema half now while it is free; the code
half is about three hours and none of it is blocked.
