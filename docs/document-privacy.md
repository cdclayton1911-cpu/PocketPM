# Document privacy — the unanswered question blocking stage 2

**Status: needs a policy answer, not an engineering one. Stage 2 is blocked on
it and should stay blocked.**

## Where documents live today

Everything a customer uploads stays on infrastructure they are already
contracting for:

- files are stored by PocketBase on the DigitalOcean droplet;
- every file field is `protected: true`, so PocketBase serves bytes only against
  a short-lived, identity-bound token;
- downloads go through `GET /api/files/...`, which requires a session and reads
  the record as that user so the project rules decide visibility;
- **no document has ever been sent to Anthropic.** The AI modules send typed
  text inputs and project metadata — never an attachment.

That last line is the current, defensible position: *your documents do not leave
your server.*

## What stage 2 would change

Stage 2 of retrieval means attaching PDFs to a Claude request — either inline as
base64 or, more practically, uploaded once to the **Files API** and referenced
by `file_id`. Both send the document itself to Anthropic. The Files API also
means the document is **stored** there, not merely passed through.

The documents in question are not incidental. They include audited financial
statements (`subcontractors.documents`), executed subcontracts, stamped shop
drawings, and contract correspondence that may later be evidence in a dispute.

## The questions to answer before any code

1. **What have customers been told?** Is there a privacy policy, MSA, or DPA
   term that states where their documents are processed and stored? If it says
   or implies "our servers", stage 2 contradicts it until that changes.
2. **Sub-processor disclosure.** Adding Anthropic as a processor of customer
   documents is normally a disclosable event, and some customer contracts
   require notice or consent. General contractors working for public agencies
   and healthcare owners frequently carry such terms downstream.
3. **Retention.** Files uploaded to the Files API persist until deleted. Who
   deletes them, on what trigger, and does that satisfy any contractual
   retention or deletion obligation? A revision is immutable once issued, but
   that is a promise about *our* store.
4. **Per-customer choice.** Is this opt-in per company, or a product-wide
   default? Opt-in is slower to build and much easier to defend.
5. **Data residency.** Some owners require US-only processing.
   `inference_geo` exists for the Messages API, but it is a separate question
   from where an uploaded file is stored.

## Why this is not a blocker to be engineered around

There is no technical mitigation that makes the question go away. Encrypting
before upload defeats the purpose — the model has to read the document.
Redaction is not reliable on scanned drawings. The choice is genuinely: send the
documents, or do not.

Stage 1 (`/api/retrieval/revisions`) is built and deliberately does **not**
touch document contents. It answers *which* documents match, using metadata
only, and everything stays on the droplet. It is useful on its own and it is the
selection layer stage 2 would call — so none of that work is wasted while this
question is open.

## What metadata-only stage 2 actually sends

`POST /api/retrieval/ask` is built and is deliberately narrower than stage 2
proper. It sends **no file contents** — no PDF, no extracted text, no page
image. The Files API is not used and nothing is uploaded or stored at Anthropic.

But "metadata only" is not "nothing". `renderTable` in
`src/app/api/retrieval/ask/route.ts` is the single place that decides what
crosses the boundary, and it currently sends, per matching revision:

| Field | Example | Disclosive? |
|---|---|---|
| parent label | `RFI 017 — Beam/duct conflict at grid C` | **yes — a title can say a lot** |
| parent type | `rfi` | no |
| revision number | `Rev 1` | no |
| status | `superseded` | no |
| current flag | `CURRENT` | no |
| issue date | `2026-08-15` | no |
| spec section | `05 12 00` | mildly |
| file present | `attached` / `MISSING` | no |

The first row is the one to think about. *"RFI 017 — Beam/duct conflict at grid
C"* tells a reader there is a coordination problem at a specific location, and a
submittal description can name a subcontractor.

This is the same **kind** of disclosure the other AI modules already make — they
send project name, contract value, city, owner, and architect — at larger
volume. It is a smaller disclosure than the document itself by a wide margin.

### Decided (2026-09-04): keep the labels

`parent_label` and `spec_section` stay. Two reasons:

1. *"Rev 1 of 05120-001"* is useless to a project manager. An answer that cannot
   say **which** submittal it means does not answer the question, and a feature
   that does not answer the question is not worth its privacy cost at all.
2. It is not a new category of disclosure. Every AI module already sends project
   name, contract value, city, owner, and architect on every call
   (`projectContext` in `src/app/api/ai/[task]/route.ts`). Titles are more of the
   same kind, not a different kind.

**Document contents is the line**, and it is not crossed. Narrowing to
identifiers-only remains a one-line change in `renderTable` if a specific
customer contract ever requires it — but it is not the default and should not be
adopted speculatively.

## If the answer is yes

Then the ordering is: update the customer-facing terms first, add the sub-
processor disclosure, decide opt-in vs default, and only then build the upload.
Record the decision here with a date and who made it.

## If the answer is no, or not yet

Stage 1 still delivers document search. A narrower stage 2 is also possible
without sending anything: the model can answer from *metadata* — "these four
revisions match, Rev 1 is current, Rev 0 was superseded on 15 August" — which is
genuinely useful for status and chronology questions and reads no file content.
That is worth building before the policy question resolves.
