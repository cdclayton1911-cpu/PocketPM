import { z } from "zod";

/**
 * The AI tasks the app can ask Claude to perform.
 *
 * One entry per endpoint the architecture PDF lists for the Railway tier
 * (`/api/rfi-draft`, `/api/co-pricing`, …). Those endpoints were never deployed
 * — the running Express service has `POST /api/claude` and three 503 stubs — so
 * rather than inventing ten route files this is a registry behind a single
 * `POST /api/ai/[task]` handler.
 *
 * Keeping the system prompts here rather than in the client matters: a prompt
 * shipped to the browser is a prompt the user can rewrite. The client sends
 * only the task name and its typed inputs.
 *
 * `maxTokens` is per task because a toolbox talk and a contract review are not
 * the same size of answer, and an unnecessarily large cap is spendable.
 */

/** Prepended to every task. States the constraints the whole product depends on. */
export const BASE_SYSTEM = `You assist a commercial construction project manager inside Pocket PM.

Ground rules:
- Base every statement on the project data provided. If the data does not
  support an answer, say what is missing rather than inventing it.
- Never invent contract clause numbers, AIA article references, code sections,
  dates, quantities, or dollar figures. Cite only what you were given.
- Your output is a draft for a human to review, not a decision. Do not present
  it as legal, engineering, or safety certification.
- Be concise and use the trade's vocabulary. No preamble.`;

export interface AiTask {
  /** System prompt appended to BASE_SYSTEM. */
  system: string;
  /** Validates the request body's `input`. */
  schema: z.ZodType;
  /** Builds the user turn from validated input. */
  prompt: (input: never) => string;
  /** Prior conversation turns, for the tasks that are conversations. */
  history?: (input: never) => { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
}

const text = (max: number) => z.string().trim().min(1).max(max);

function define<S extends z.ZodType>(task: {
  system: string;
  schema: S;
  prompt: (input: z.infer<S>) => string;
  history?: (input: z.infer<S>) => { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
}): AiTask {
  return task as unknown as AiTask;
}

export const AI_TASKS = {
  /**
   * Free-form assistant. The prototype's `callAI` with no specialisation, used
   * by the PM Assistant module.
   */
  chat: define({
    system:
      "Answer the project manager's question about this project. Where the " +
      "answer depends on project records you were not given, say so.",
    schema: z.object({
      message: text(8000),
      /**
       * Prior turns, oldest first. The Messages API is stateless, so the
       * client resends them. Capped at 40 so one long conversation cannot
       * quietly become an expensive request.
       */
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(20000),
          }),
        )
        .max(40)
        .optional(),
    }),
    prompt: (input) => input.message,
    history: (input) => input.history ?? [],
    maxTokens: 4000,
  }),

  "rfi-draft": define({
    system:
      "Draft an RFI. Return: a one-line subject, then the question stated as a " +
      "field condition with the specific information required to resolve it, " +
      "then the drawings/spec sections it concerns, then a suggested response " +
      "deadline in days with the reason for it.",
    schema: z.object({
      condition: text(4000),
      drawing: z.string().trim().max(120).optional(),
      spec_section: z.string().trim().max(40).optional(),
    }),
    prompt: (input) =>
      [
        `Field condition: ${input.condition}`,
        input.drawing ? `Drawings: ${input.drawing}` : null,
        input.spec_section ? `Spec section: ${input.spec_section}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 2000,
  }),

  "co-pricing": define({
    system:
      "Review a change order's proposed pricing. Break the scope into labour, " +
      "material, equipment, and subcontract components; flag any line that " +
      "looks inconsistent with the described scope; and state what backup " +
      "documentation should be requested. Do not produce a number you cannot " +
      "derive from the input — say what is needed to price it instead.",
    schema: z.object({
      scope: text(6000),
      proposed_amount: z.number().nonnegative().optional(),
      reason: z.string().trim().max(120).optional(),
    }),
    prompt: (input) =>
      [
        `Change order scope: ${input.scope}`,
        input.reason ? `Stated reason: ${input.reason}` : null,
        input.proposed_amount !== undefined
          ? `Proposed amount: $${input.proposed_amount.toLocaleString()}`
          : "No amount proposed yet.",
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 3000,
  }),

  "safety-analysis": define({
    system:
      "Perform an activity hazard analysis. For each step of the task: the " +
      "hazard, the control, and the OSHA 29 CFR 1926 subpart it falls under — " +
      "name the subpart only when you are certain of it, otherwise write " +
      "'verify applicable standard'. End with the required PPE and any " +
      "competent-person requirement.",
    schema: z.object({
      activity: text(4000),
      trade: z.string().trim().max(120).optional(),
    }),
    prompt: (input) =>
      [`Activity: ${input.activity}`, input.trade ? `Trade: ${input.trade}` : null]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 4000,
  }),

  "contract-review": define({
    system:
      "Review contract language for risk to the contractor. For each clause: " +
      "quote the operative words, state the risk in one sentence, rate it " +
      "high/medium/low, and propose alternative language. Quote only text that " +
      "appears in the input.",
    schema: z.object({
      clause_text: text(30000),
      document_type: z.string().trim().max(60).optional(),
      /** Narrows the review; "Full risk review" when absent. */
      focus: z.string().trim().max(60).optional(),
    }),
    prompt: (input) =>
      [
        input.document_type ? `Document: ${input.document_type}` : null,
        input.focus ? `Focus the review on: ${input.focus}` : null,
        "Clause text:",
        input.clause_text,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 8000,
  }),

  "toolbox-talk": define({
    system:
      "Write a toolbox talk to be read aloud at a morning huddle. Five minutes " +
      "of speech, plain language, one topic. End with three discussion " +
      "questions and a sign-off line.",
    schema: z.object({
      topic: text(500),
      conditions: z.string().trim().max(1000).optional(),
    }),
    prompt: (input) =>
      [`Topic: ${input.topic}`, input.conditions ? `Site conditions: ${input.conditions}` : null]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 2000,
  }),

  /**
   * Narrative for a daily log.
   *
   * The daily-log module ships without a button for this — it is CRUD-only for
   * now. The task is registered so the module can gain one without touching the
   * handler.
   */
  "daily-log": define({
    system:
      "Turn field notes into the work-performed narrative of a daily " +
      "construction report. Past tense, factual, no adjectives. Do not add " +
      "activities, crews, or quantities that are not in the notes.",
    schema: z.object({
      notes: text(6000),
      weather: z.string().trim().max(120).optional(),
      total_workers: z.number().int().nonnegative().optional(),
    }),
    prompt: (input) =>
      [
        `Field notes: ${input.notes}`,
        input.weather ? `Weather: ${input.weather}` : null,
        input.total_workers !== undefined ? `Workers on site: ${input.total_workers}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 2000,
  }),

  estimate: define({
    system:
      "Produce a conceptual estimate breakdown by CSI division for the scope " +
      "described. State the basis of every assumption. Where a quantity is not " +
      "given, list it as required information rather than assuming one. Label " +
      "the output an order-of-magnitude estimate, not a bid.",
    schema: z.object({
      scope: text(8000),
      square_feet: z.number().positive().optional(),
      location: z.string().trim().max(120).optional(),
    }),
    prompt: (input) =>
      [
        `Scope: ${input.scope}`,
        input.square_feet ? `Area: ${input.square_feet.toLocaleString()} sf` : null,
        input.location ? `Location: ${input.location}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 6000,
  }),

  "notice-draft": define({
    system:
      "Draft a formal contract notice. Include: addressee, date, the contract " +
      "article relied on ONLY if it was supplied to you, a factual statement of " +
      "the event, the relief sought, and a reservation of rights. Flag any " +
      "detail the drafter must fill in as [BRACKETED].",
    schema: z.object({
      notice_type: text(120),
      facts: text(6000),
      aia_article: z.string().trim().max(40).optional(),
      deadline: z.string().trim().max(40).optional(),
    }),
    prompt: (input) =>
      [
        `Notice type: ${input.notice_type}`,
        input.aia_article ? `Contract article: ${input.aia_article}` : null,
        input.deadline ? `Notice deadline: ${input.deadline}` : null,
        `Facts: ${input.facts}`,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 3000,
  }),

  prequalification: define({
    system:
      "Assess a subcontractor's prequalification package. Comment on bonding " +
      "capacity against the proposed award, EMR, insurance currency, licence " +
      "status, and financial capacity. State what is missing. Give a " +
      "recommendation of qualified / qualified with conditions / not qualified " +
      "and the conditions.",
    schema: z.object({
      company_name: text(200),
      details: text(6000),
      proposed_award: z.number().nonnegative().optional(),
    }),
    prompt: (input) =>
      [
        `Subcontractor: ${input.company_name}`,
        input.proposed_award !== undefined
          ? `Proposed award: $${input.proposed_award.toLocaleString()}`
          : null,
        `Package details: ${input.details}`,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 3000,
  }),

  /**
   * Three tasks below are NOT among the eleven the architecture PDF lists.
   * They are prompts in this app's own registry, not endpoints on someone
   * else's service, and each backs one of the seven AI modules that the PDF's
   * eleven do not cover. Flagged rather than slipped in.
   */

  /**
   * Backs the document finder's "ask" box — status and chronology answers over
   * a project's revision history.
   *
   * **Metadata only.** It is given a table of revision numbers, statuses,
   * dates, and parent identifiers, and never the contents of any document. The
   * prompt is written to make that limit visible in the answer rather than
   * papered over: the failure mode worth preventing is a confident summary of a
   * drawing nobody read. See docs/document-privacy.md.
   */
  "document-status": define({
    system:
      "You are given a table of document revisions from one construction " +
      "project: revision numbers, lifecycle status, issue dates, which " +
      "submittal or RFI each belongs to, and whether a file is attached. You " +
      "have NOT been given the contents of any document.\n\n" +
      "Answer questions about status, sequence, and chronology from that table " +
      "only. Say which revision is current, what was superseded and when, what " +
      "is still in draft, and what is missing a file.\n\n" +
      "If the question asks what a document SAYS — what the architect " +
      "responded, what a drawing shows, what a clause requires — say plainly " +
      "that you can see the revision history but not the document contents, " +
      "and name which revision they should open. Never infer content from a " +
      "title. A title is not a summary.\n\n" +
      "Cite revisions the way the trade does: 'Rev 1 of 05120-001', not 'row 3'.",
    schema: z.object({
      question: text(2000),
      /** Pre-rendered by the server from stage-1 results. Never client-supplied. */
      documents: text(20000),
    }),
    prompt: (input) =>
      `Revision table:\n${input.documents}\n\nQuestion: ${input.question}`,
    maxTokens: 2000,
  }),

  /** Backs /safety-plans. A written site plan, not the per-activity AHA above. */
  "safety-plan": define({
    system:
      "Write a site-specific written safety plan. Cover, in this order: scope " +
      "and site description, responsibilities by role, the hazard-specific " +
      "programmes for the activities listed, training and orientation " +
      "requirements, inspection frequency, and emergency response. Name a 29 " +
      "CFR 1926 subpart only for an activity you were actually given, and write " +
      "'verify applicable standard' where you are not certain. Mark anything " +
      "the contractor must supply as [BRACKETED].",
    schema: z.object({
      project_name: text(200),
      activities: z.array(z.string().trim().max(200)).min(1).max(20),
      square_feet: z.number().positive().optional(),
      peak_workforce: z.number().int().positive().optional(),
    }),
    prompt: (input) =>
      [
        `Project: ${input.project_name}`,
        input.square_feet ? `Size: ${input.square_feet.toLocaleString()} sf` : null,
        input.peak_workforce ? `Peak workforce: ${input.peak_workforce}` : null,
        `High-risk activities on this project:\n${input.activities.map((a) => `- ${a}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 8000,
  }),

  /**
   * Backs /aia/library.
   *
   * Deliberately narrow. A summary of a standard AIA form written from the
   * model's own memory is precisely the case where article numbers get
   * fabricated, which BASE_SYSTEM forbids. So this asks for what the form is
   * *for* and what to check in the executed copy — never a clause-by-clause
   * recital.
   */
  "aia-brief": define({
    system:
      "Brief a contractor on a standard AIA document. Cover what the form is " +
      "for, when it is used, what it obliges the contractor to do in general " +
      "terms, and the provisions most often modified to the contractor's " +
      "disadvantage. DO NOT quote or number articles: the executed contract is " +
      "the only authority and it is frequently amended. Instead, end with a " +
      "checklist of what to verify in the executed copy, and say that pasting " +
      "the actual clause into the Clause Risk Scanner is the way to get a " +
      "reading on the real language.",
    schema: z.object({
      document_code: text(20),
      document_title: text(200),
    }),
    prompt: (input) => `Document: ${input.document_code} — ${input.document_title}`,
    maxTokens: 3000,
  }),

  /**
   * Backs /aia/register. Distinct from the computed operational risks on the
   * AIA dashboard: this reads contract *language*, that one reads records.
   */
  "risk-register": define({
    system:
      "Build a contract risk register from the provisions supplied. One row " +
      "per provision: the subject, a high/medium/low rating, what the standard " +
      "AIA position on that subject generally is, how the supplied language " +
      "departs from it, and the action to take. Quote only language present in " +
      "the input, and give an article number only where the input gives one. " +
      "Where a jurisdiction-specific statute may apply, say it must be checked " +
      "with counsel rather than naming one.",
    schema: z.object({
      provisions: text(30000),
      contract_type: z.string().trim().max(120).optional(),
    }),
    prompt: (input) =>
      [
        input.contract_type ? `Contract: ${input.contract_type}` : null,
        "Provisions to review:",
        input.provisions,
      ]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 8000,
  }),

  "punch-list": define({
    system:
      "Turn a walkthrough description into discrete punch list items. One line " +
      "per item: location, the defect, and the responsible trade. Split " +
      "compound observations into separate items. Do not add items.",
    schema: z.object({
      observations: text(8000),
      location: z.string().trim().max(200).optional(),
    }),
    prompt: (input) =>
      [input.location ? `Area: ${input.location}` : null, `Observations: ${input.observations}`]
        .filter(Boolean)
        .join("\n"),
    maxTokens: 4000,
  }),
} satisfies Record<string, AiTask>;

export type AiTaskName = keyof typeof AI_TASKS;

export const AI_TASK_NAMES = Object.keys(AI_TASKS) as AiTaskName[];

export function isAiTaskName(value: string): value is AiTaskName {
  return Object.hasOwn(AI_TASKS, value);
}
