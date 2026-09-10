# Precedence taxonomy — v1.1

Supersedes v1.0. Six changes, all agreed in
`docs/precedence-spec-reconciliation.md` and implemented as of this document.

This is the repo's copy of the taxonomy as BUILT. The external spec document
needs the same six edits; this records what the code does so the two can be
compared rather than assumed to agree.

## Changes from v1.0

### 1. `resolves_drawing_vs_spec` becomes `resolves`

A set of conflict classes, not a boolean. WCU sub-ranks drawings, so it settles
**E2** as well as **E1** — a provision that settles one class and not another
has no boolean representation.

```
WCU          resolves: ["E1", "E2"]
UCCS         resolves: []            // the tied tier settles neither
North Macon  resolves: []            // points elsewhere
Rees         resolves: []            // stringency settles nothing alone
```

The claim is **checkable**, which is the point. `classify.test.ts` asserts that
every class a provision claims has an exemplar conflict, and that the classifier
returns `PRECEDENCE_RESOLVABLE` for it. As a boolean this was an unverifiable
assertion by whoever typed it.

### 2. The per-conflict record uses `loci`, not `spec_locus` / `dwg_locus`

A pair, order-insignificant. **E2** is drawing-against-drawing and **E3** is
spec-against-spec; neither has a specification-and-drawing shape to name. The
classifier is symmetric and there is a test asserting swapping the sides does
not change the answer.

### 3. `DEFER` is implemented

Rees 22 00 00 defers to Division 01 "when available". Whether a document is
available is a fact about the SET, not the clause, so `DEFER` always ends in
`REQUIRES_CLARIFICATION` and NAMES what it defers to. Three wordings depending
on what the caller knows:

| Caller supplies | Outcome |
|---|---|
| target is present | "…is in this document set, so the governing requirement is there" |
| target is absent | "…is NOT in this document set. Nothing here resolves the conflict." |
| nothing | "…whether it is available is a fact this cannot determine — check it" |

Never a silent fall-through: that would report "no rule addressed this" when a
rule addressed it precisely and pointed elsewhere.

### 4. `conflict_class` is required before precedence is assessed

v1.0 said conflict class is determined first and relied on coders following
that. It is now a required field on `DetectedConflict` and a required column on
`conflict_findings`, so precedence cannot be classified for a conflict whose
class was never decided. The bias control is structural rather than procedural.

### 5. The `requires_clarification` / `no_precedence_provision` boundary

v1.0 listed both and defined neither. Resolved as:

- **out of scope entirely** → `no_precedence_provision`
  (Rees Division 22 rule meeting a Division 08 door schedule)
- **in scope, silent on these documents** → `requires_clarification`
  (WCU meeting shop-drawings-versus-product-data)

This moves agreement statistics, so it belongs in the spec rather than in an
implementation comment.

### 6. §6.1 and §7.3 are FUTURE / NOT IMPLEMENTED

Both describe automated extraction. It was considered and rejected: about ninety
seconds saved once per project, against a PDF dependency, a reversal of the
document-privacy line in `docs/document-privacy.md`, and a 55% false-positive
rate a person reviews anyway. The implementation is paste-and-confirm.

**§7.3's distinction survives the change of method**, and is implemented:

| State | `searchState` |
|---|---|
| Nobody has recorded anything | `NOT_SEARCHED` |
| Someone searched the manual and found none | `SEARCHED_NONE_FOUND` |
| A provision was applied | `PROVISION_APPLIED` |

Both of the first two classify as `no_precedence_provision` — the five classes
are unchanged — but one is a finding and the other is an absence of work, and
the difference is now visible beside the class. A `NONE_FOUND`-scoped record
carries the searcher's note as its `source_text`: what was searched, and by
whom, is the evidence.

## Provisional constructs (§8)

Four manuals establish heterogeneity, not frequency. `src/lib/precedence/provenance.ts`
records how many of the four each construct was observed in, and a
classification decided by a single-observation construct carries
`provisional: true` with the reason.

| Construct | Manuals | Provisional |
|---|---|---|
| `RANK_SEQUENCE` | WCU, UCCS | no |
| `STRINGENCY` | UCCS, Rees | no |
| `OVERRIDE` | UCCS | **yes** |
| `DISCRETION` | UCCS | **yes** |
| `DEFER` | Rees | **yes** |

`OVERRIDE` and `DISCRETION` rest on one manual exactly as `DEFER` does. Flagging
only `DEFER` would apply §8 inconsistently to identical evidence.

The flag lives in code rather than as a column so it travels with a
classification — a note in a specification is read once; a field on a finding is
read every time the finding is.

## Still undefined

**`severity` has no scale.** The spec names the field without defining values.
Stored as free text rather than inventing an enum that would then be coded
against. Needs a decision before conflicts are coded.

**E4/E5 agreement is not separated.** §2.3 concedes disagreement concentrates
there while still asking coders to judge "should reasonably show". Agreement
should be reported per conflict class, never pooled — a pooled kappa would
average a reliable judgment with an unreliable one and describe neither. The
schema supports this (`conflict_class` is on every finding); the analysis
convention is a research decision, not a schema one.

## Collections

`precedence_provisions` — one row per provision, multiple per project.
`conflict_findings` — one row per coded conflict. Both at zero records.
