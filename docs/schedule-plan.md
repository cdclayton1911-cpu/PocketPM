# Schedule: CPM, relationships, and import

**Phase 1 is built.** `schedule_relationships` exists, `schedule_items.predecessors`
is dropped, and the cycle guard is in the write path with unit tests.

Decisions taken: **one project calendar** (not per-activity), **no MPP support**,
and the schedule is **mirrored from P6/MSP rather than authored here** — so
phase 4 (schedule authoring UI) is dropped. Import plus visibility only.

## The migration is free — do it before there is data

`schedule_items` holds **zero records** on the live instance. `predecessors` has
never been written to, so there is no text to parse, no format to reverse
engineer, and no backfill.

This is the cheapest this change will ever be, and it gets more expensive the
moment one person imports a schedule. If schedules are wanted at all, the schema
change should go first regardless of when the CPM engine follows.

## Typed relationships

`predecessors` as text cannot express what CPM needs: which activity, what
relationship type, and how much lag. Replace it with a relation collection —
same shape as every other child collection, one relation to `projects`, standard
rules.

```
schedule_relationships
  project      relation -> projects, required, cascadeDelete: true
  predecessor  relation -> schedule_items, required, cascadeDelete: true
  successor    relation -> schedule_items, required, cascadeDelete: true
  type         select: FS | SS | FF | SF   (default FS)
  lag_days     number (may be negative — lead)
  created/updated autodate
```

Rules mirror the existing pattern, plus the agreement clause both ends need:

```
createRule/updateRule:
  <project scope>
  && predecessor.project = project
  && successor.project = project
  && predecessor != successor
```

Both endpoints are typed relations, so PocketBase enforces that a relationship
cannot span two projects — the same technique that made the
`document_revisions` cross-table invariant a real PASS rather than a promise
about application code.

A unique index on `(predecessor, successor)` prevents duplicate edges.
**Cycle prevention cannot be expressed in a rule** and has to live in the engine
— reject on write by walking the graph, because a cycle makes CPM
non-terminating rather than merely wrong.

`schedule_items.predecessors` should be **dropped**, not left alongside. Two
places to express a dependency is how they disagree.

## Calendars — the requirement that decides how real this is

CPM arithmetic is only as good as its notion of a working day. Without
calendars, a 10-day activity starting Friday finishes on a Sunday, every date is
wrong by roughly the number of weekends spanned, and float is wrong with it.

Three options, and this is the main scoping fork:

| | Effort | Honest result |
|---|---|---|
| **Calendar-days only** | none | Arithmetic is correct; the dates are wrong against any real project. Fine for a demo, misleading in the field. |
| **One project calendar** — working days + holiday list | small | Covers the large majority of commercial jobs. `projects` gains `work_days` and a `holidays` list. |
| **Per-activity calendars** (P6-style) | large | Needed to round-trip P6 faithfully; overkill until someone asks. |

Recommend the middle one. It is a small schema addition and it is the
difference between a schedule tool and a schedule-shaped table.

## The CPM engine

Pure functions over the graph, in `src/lib/schedule/`, with no I/O — which
makes it the first thing in this codebase that is genuinely unit-testable, and
Vitest is already installed and unused.

- Topological sort; reject cycles loudly.
- Forward pass → early start / early finish.
- Backward pass from project finish → late start / late finish.
- Total float = LS − ES. Free float from successors' ES.
- Critical path = zero-total-float chain (configurable threshold; some schedules
  treat ≤ 0 as critical because of constraints).
- All four relationship types with lag.

Deliberately **out** of the first pass: resource levelling, constraints
(Start-No-Earlier-Than and friends), retained logic vs progress override,
multiple calendars, and out-of-sequence progress. Each is a real P6 feature and
each is its own project. Saying so now is cheaper than discovering it mid-build.

Results are **computed, not stored** — a stored critical path drifts the moment
someone edits a duration. Cache in the client, recompute server-side on read.

## Import

| Format | Verdict | Notes |
|---|---|---|
| **Excel / CSV** | Do first | We define the template, so it always parses. Also the only path for people who do not run P6. Needs a column mapper and a dry-run preview. |
| **P6 XER** | Do second | Tab-delimited text with `%T`/`%F`/`%R` record markers. Ugly but fully parseable in TypeScript, no dependency. The tables that matter: `TASK`, `TASKPRED`, `PROJECT`, `CALENDAR`. |
| **P6 XML (PMXML)** | Do third | Schema-defined XML; cleaner than XER but needs an XML parser — a dependency conversation, since none is installed. |
| **MPP** | **Skip** | See below. |

### MPP, honestly

`.mpp` is an undocumented binary format. There is no viable pure-JavaScript
reader. The realistic options are all bad for this codebase:

- **MPXJ** — the actual answer, and it is Java. Running it means a JVM on the
  droplet or a separate service. It is also LGPL/commercial dual-licensed.
- **A commercial .NET/Java library** — cost, plus a runtime we do not have.
- **Reimplementing it** — not credible.

**Recommendation: do not support MPP.** Microsoft Project exports both XML and
CSV natively, and "File → Save As → XML" is one sentence of documentation. That
converts a multi-week integration with a new runtime into a support note.

If MPP import later turns out to be a deal-breaker in sales, the right shape is
a small MPXJ-based conversion service, kept off this droplet — not a library
inside the Next.js app.

## Gantt rendering

No charting library is installed, and the brief requires asking before adding
one. Three options:

1. **Hand-rolled SVG.** Full control, no dependency, theme-aware for free, and
   this codebase already renders SVG-free progress bars. A read-only Gantt with
   dependency arrows and a critical-path highlight is a few hundred lines. Drag
   to reschedule is what makes it expensive.
2. **A Gantt library** (`frappe-gantt` and similar). Fast to a demo, but they
   bring their own DOM and styling conventions and fight a Tailwind design
   system; most also assume they own the data model.
3. **A general chart library.** Wrong tool — a Gantt is a timeline with
   dependency edges, not a chart.

Recommend (1), read-only first: bars, today line, critical path, dependency
arrows. Editing by dragging can come later and is where the complexity is.

## Scope

| Phase | Contents | Size | State |
|---|---|---|---|
| 1 | `schedule_relationships`, drop `predecessors`, rules, cycle guard, tenancy check | 1 commit | **done** |
| 2 | Project calendar (work days + holidays) | 1 commit | next |
| 3 | CPM engine, pure, with Vitest unit tests | 2 commits | |
| ~~4~~ | ~~Schedule authoring UI~~ | — | **dropped** — mirrored, not authored |
| 5 | Excel/CSV import with mapping and dry-run preview | 2 commits | |
| 6 | XER import | 2 commits | |
| 7 | Read-only SVG Gantt | 2–3 commits | |
| — | PMXML | after 6, if wanted | |
| — | MPP | not supported, by decision | |

Dropping phase 4 also settles the "who owns updates" question below: a
re-import overwrites, because nothing here is authored.

## Still open

**Baseline vs current.** Variance reporting needs two schedules, not one.
`schedule_items` has `planned_*` and `actual_*` but no baseline concept, and
retrofitting one after imports exist is a schema change with data in it — the
same trap phase 1 just avoided. Worth deciding before phase 5, not after.

## Phase 1, as built

- Both endpoints are typed relations, so the rule
  `predecessor.project = project && successor.project = project` makes a
  cross-project edge impossible at the database. `verify:tenancy` section 5
  proves it, with a positive control so a rule that refused everything could
  not pass.
- A unique index on `(predecessor, successor)` prevents duplicate edges; a
  second edge between the same pair would double-count in the forward pass.
- Cycles are refused on write by `src/lib/schedule/graph.ts`, which is pure and
  unit-tested (11 tests). This is not ordinary validation: a cycle makes the
  forward pass non-terminating rather than merely wrong, and `topologicalOrder`
  returns null rather than looping so the CPM engine has a guard too.
- `cascadeDelete` is true on both endpoints — an edge to a deleted activity is
  meaningless, and orphans would make the graph unwalkable.
- Endpoints are not editable. Moving an edge is deleting one and drawing
  another, which avoids re-running the cycle check on update and is clearer than
  an edit that can be silently refused.
