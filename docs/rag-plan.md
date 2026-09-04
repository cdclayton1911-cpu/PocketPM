# Retrieval over project documents

**Stage 1 is built** (`/api/retrieval/revisions`, `src/lib/retrieval/`).
**Stage 2 is blocked** on the privacy question in `docs/document-privacy.md` —
it would send customer documents to Anthropic, and that needs a policy answer
rather than an engineering one.

The design reasoning below was written before any code, because the first
decision changes everything downstream.

## The finding that changes the shape

**Anthropic has no embeddings endpoint.** The Messages API's supporting
endpoints are Batches, Files, Token Counting, and Models — there is no
embeddings surface. So "vector RAG" here does not mean "add a feature", it means:

- a **second AI vendor** (Voyage or similar), with its own key, billing, and
  status page;
- a **second data processor** for confidential construction documents — audited
  financial statements, executed subcontracts, contract correspondence;
- a **vector store outside PocketBase**, which is the same architectural mistake
  rejected for file storage: PocketBase's project-scoped rules are what enforce
  tenancy in this app, and a vector index has none. Every retrieval would
  re-implement authorization by hand.

That is a real amount of new surface. Before accepting it, the alternative
deserves a fair look.

## The alternative: the model reads the documents

Three capabilities, all GA and all already reachable with the key we deployed:

| Capability | Detail |
|---|---|
| **PDF input** | `{type: "document", source: {type: "base64", media_type: "application/pdf"}}`. Limits: **32 MB per request, 600 pages** (100 on 200K-context models; Opus 5 is 1M). |
| **Files API** | `client.files.upload(...)` returns a `file_id`; reference it as `{type: "document", source: {type: "file", file_id}}`. Upload once, cite across many requests. Out of beta — no header. |
| **Citations** | `citations: {enabled: true}` per document block. The response splits into text blocks carrying `cited_text`, `document_title`, and **`page_location` with 1-indexed start/end page numbers**. |

The third one matters more than it first appears. Page-level citation is exactly
the grounding a construction argument needs — not "the spec says", but *"A-201
sheet 4, and here is the sentence"*. A chunk-and-embed pipeline has to
reconstruct that; this gives it directly.

### Scanned drawings — the decisive point

**Claude reads PDF pages visually, not just as extracted text.** A stamped shop
drawing, a marked-up sketch, a scanned notarised G702 — all of them are raster
images in a PDF wrapper, and a text-extraction pipeline (`pdf-parse`, `pdfjs`)
returns *nothing* for them. That failure is silent: ingestion "succeeds",
embeddings get built over empty strings, and retrieval quietly never finds the
document.

This is not an edge case in commercial construction; it is a large share of the
corpus. Any embedding pipeline would need OCR in front of it to reach parity
with what the model already does natively.

## Recommended: two-stage, metadata-first

**Stage 1 — select, with SQL.** Narrow to a handful of documents using the
metadata `document_revisions` already carries: `project`, parent
(`submittal`/`rfi`), `revision_number`, `status`, `is_current`, `issued_at`, plus
the parent's own `spec_section` / `sheet_number` / `discipline`. This is a
PocketBase filter, subject to the project rules already verified by
`npm run verify:tenancy`. No new store, no new vendor, no new tenancy boundary.

**Stage 2 — read, with citations.** Attach the selected revisions' PDFs by
`file_id` and answer with `citations: {enabled: true}`.

The reason this is likely sufficient: a real question is almost always already
scoped. *"What did the EOR say about the grid C beam conflict?"* is one RFI and
its revisions. *"Which submittals are still open past their review date?"* is a
metadata query with no document reading at all. Semantic search earns its cost
when you cannot name the neighbourhood — and in a system where every document
hangs off a numbered submittal, RFI, or sheet, you usually can.

### Where this runs out

Be honest about the ceiling. Metadata-first fails when:

- the question is genuinely cross-cutting — *"has any sub ever flagged this
  detail?"* across hundreds of documents;
- the useful selector is a **phrase**, not a field — *"find the clause that
  looks like this one"*;
- a single stage-1 result set exceeds 600 pages or 32 MB and cannot be narrowed
  further by metadata.

Those are the conditions under which embeddings stop being premature. Measure
first: instrument stage 1 and record how often it returns more than a handful of
documents. That number, not intuition, is what should trigger the vendor
decision.

## If embeddings do become necessary

Three requirements, decided now so the later work is not improvised:

1. **Tenancy is a server-side filter, never a client argument.** Every vector
   must carry `project`, and the query must apply that filter in code the client
   cannot influence — the same discipline as `crud-route.ts`'s
   always-first project clause.
2. **`verify:tenancy` gets a section.** A cross-tenant retrieval is a silent
   breach — no error, just another company's contract in an answer. It needs the
   same empirical two-user test as every other collection, with a positive
   control so a broken index cannot pass by returning nothing.
3. **Re-ingestion on revision.** A superseded Rev 0 must stay retrievable but be
   *marked*, per the decision in `docs/revisions.md`. Deleting its vectors would
   destroy exactly what a delay claim is argued from.

## Corpus decisions — settled

| Source | Decision |
|---|---|
| **AIA contract documents** | **Do not ingest.** Copyrighted and sold under licence. |
| **IBC / ICC codes** | **Do not ingest.** Copyrighted by the ICC. |
| **OSHA 29 CFR** | **Fine to ingest.** US government work, public domain. |
| **Customer uploads of their own executed documents** | **Fine.** It is their document and their project — subject to the privacy question in `docs/document-privacy.md` before any of it is *sent* anywhere. |

The distinction that matters: a customer pasting *their own executed* A401 into
the Clause Risk Scanner is fine, because it is their contract. Building a
searchable corpus of *blank AIA forms* is not, because that is redistributing a
licensed work. The `aia-brief` task in `lib/ai/tasks.ts` already respects this —
it refuses to recite article numbers and sends the user to the scanner with
their own text.

## Domain RAG is a separate, unblocked track

Reference text — OSHA 29 CFR 1926, the IBC, AIA standard forms — is not tenant
data, needs no upload path, and does not depend on any of the above.

**But it has a licensing problem, not a technical one.** AIA contract documents
are copyrighted and sold under licence; the IBC is copyrighted by the ICC.
Ingesting their full text into a searchable corpus that answers users' questions
is a rights question that should be answered before it is engineered. OSHA
regulations are US government works and are far safer ground.

This is worth saying plainly because it is the kind of thing that is cheap to
resolve now and expensive to unwind after it ships. The `aia-brief` task in
`lib/ai/tasks.ts` already dodges it deliberately — it refuses to recite article
numbers and points the user at the Clause Risk Scanner with their own executed
text instead.

## Constraints worth knowing before writing code

- **Citations are incompatible with `output_config.format`** — a request cannot
  both cite and return a schema-constrained object; it returns 400. An
  extraction pipeline and a cited answer are two different calls.
- **Prompt caching is what makes repeat questions affordable.** The same
  document as a cached prefix costs roughly a tenth on subsequent reads; a 1-hour
  TTL fits a working session. Cache reads only register if the prefix is
  byte-identical, so the document blocks must come first and the question last.
- **Batches run at 50%** and suit any bulk pre-processing (summarising every
  revision on upload, say) where latency does not matter.
- **Token cost is measurable before it is spent** — `client.messages.countTokens`
  on a representative submittal gives a real per-document figure. Do that before
  estimating anything.

## Reading the instrumentation

Every stage-1 query logs one JSON line tagged `[retrieval.stage1]`. It records
**shape, never content** — filter names, counts, and timing, but no question
text, filenames, parent titles, or spec sections, because a construction
document's subject is often the confidential part and journald is readable by
anyone with shell access.

The metric that decides the embeddings question is `within_limit`: how often
metadata filtering fails to narrow below what stage 2 could read.

```bash
journalctl -u pocketpm-web --since "7 days ago" -o cat \
  | grep -F '[retrieval.stage1]' | sed 's/^[^{]*//' \
  | jq -s '{queries: length,
            over_limit: [.[] | select(.within_limit == false)] | length,
            median_selected: (map(.selected) | sort | .[length/2|floor]),
            unfiltered: [.[] | select(.filter_count == 0)] | length}'
```

If `over_limit` stays near zero, metadata alone is sufficient and no vector
store, second vendor, or second data processor is ever needed. If it climbs,
these lines are the evidence that justifies them. Do not decide before there is
a few weeks of real usage.

## Proposed sequence

1. ~~**Instrument, don't build.**~~ **Done** — `/api/retrieval/revisions` with
   the logging above. Nothing calls it from the UI yet, which is the next small
   step.
2. **Files API upload on revision issue.** When a revision is issued, upload its
   PDF once and store the returned `file_id` on the record. Makes every later
   read cheap and is useful regardless of which retrieval design wins.
3. **A cited-answer endpoint.** `POST /api/ai/document-qa` — metadata selection,
   attach by `file_id`, `citations: {enabled: true}`, return the answer with its
   page anchors. Reuses the existing auth gate and per-user rate limit.
4. **Then, only if step 1's numbers justify it,** the embeddings decision — with
   the three requirements above as its acceptance criteria.

Step 2 needs a schema change: a `file_id` text field on `document_revisions`.
Everything else in steps 1–3 is application code.

## Open questions

- **Retention.** Uploading to the Files API means documents leave the droplet.
  What is the contractual position with customers on where their documents may
  be processed?
- **Corpus size.** How many documents does a real project accumulate? That single
  number decides steps 1 and 4.
- **Who asks the questions?** A PM querying their own project is the assumed
  case. A subcontractor querying a project they are only partly on is a different
  retrieval boundary, and it lands on the same unbuilt external-party access work
  flagged in `docs/documents.md`.
